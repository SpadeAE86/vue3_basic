<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import type { ChatEvent, SSEEventPayload } from '@/types/chat'
import { mapSSEtoChatEvent } from '@/types/chat'
import EventStream from '@/components/chat/EventStream.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import HistorySidebar from '@/components/chat/HistorySidebar.vue'
import type { MediaFile } from '@/components/image/MediaUploader.vue'

const events = ref<ChatEvent[]>([])
const loading = ref(false)
const sessionId = ref<string | null>(null)
const sidebarRef = ref<InstanceType<typeof HistorySidebar> | null>(null)
const activeRoleId = ref(localStorage.getItem('agent_debug_active_role_id') || 'default')

watch(activeRoleId, (newRole) => {
  localStorage.setItem('agent_debug_active_role_id', newRole)
  if (sessionId.value) {
    const currentSess = sidebarRef.value?.sessions?.find((s: any) => s.session_id === sessionId.value)
    if (currentSess && currentSess.role_id !== newRole) {
      sessionId.value = null
      events.value = []
      localStorage.removeItem('agent_debug_active_session_id')
    }
  }
})

// ─── 模式切换: Mock / 真实后端 ────────────────────────────────────
const useMock = ref(false)
const API_BASE = '/api'   // 你的后端地址

async function handleSend(text: string, referenceMedia: MediaFile[] = [], model: string = 'gpt-5.4') {
  if (useMock.value && !sessionId.value) {
    sessionId.value = 'mock_' + Math.random().toString(36).substring(2, 10)
    setTimeout(() => sidebarRef.value?.refresh(), 100)
  }

  // SSE 模式下的软创建：发送首条消息时，前端立即生成 UUID 级别的 session_id，并将其插入侧边栏
  if (!useMock.value && (!sessionId.value || sessionId.value === '')) {
    const newSid = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)
    sessionId.value = newSid
    localStorage.setItem('agent_debug_active_session_id', newSid)
    
    // 截取前15字做为临时标题
    let tempTitle = text
    if (tempTitle.length > 15) {
      tempTitle = tempTitle.slice(0, 15) + '...'
    }
    sidebarRef.value?.addTemporarySession(newSid, tempTitle)
  }

  pushEvent({ 
    event_type: 'user_message', 
    content: text,
    reference_image_list: referenceMedia.filter(m => m.type === 'image').map(m => m.url)
  })
  loading.value = true

  if (useMock.value) {
    await simulateAgentResponse(text)
  } else {
    await connectSSE(text, referenceMedia, model)
    // 延迟 300ms 刷新以避开 Windows 文件系统写入缓存延迟导致的列表不同步
    setTimeout(() => {
      sidebarRef.value?.refresh()
    }, 300)
  }

  loading.value = false
}

async function handleSelectSession(sid: string, roleId = 'default') {
  if (!sid) {
    sessionId.value = null
    events.value = []
    localStorage.removeItem('agent_debug_active_session_id')
    return
  }
  
  sessionId.value = sid
  localStorage.setItem('agent_debug_active_session_id', sid)
  if (activeRoleId.value !== roleId) {
    activeRoleId.value = roleId
    localStorage.setItem('agent_debug_active_role_id', roleId)
  }
  events.value = []
  loading.value = true
  
  if (sid.startsWith('mock_')) {
    events.value = [
      { id: 'mock_1', type: 'user', content: '加载了模拟历史会话: ' + sid, timestamp: Date.now() },
      { id: 'mock_2', type: 'assistant', content: '这是模拟会话 ' + sid + ' 的历史记录。', timestamp: Date.now() }
    ]
  } else {
    try {
      const res = await fetch(`${API_BASE}/chat/sessions/${sid}`)
      if (res.ok) {
        events.value = await res.json()
      }
    } catch (err) {
      console.error('Failed to load session history:', err)
      pushEvent({ event_type: 'error', message: `加载历史失败: ${err}` })
    }
  }
  loading.value = false
}

/** 推入一个后端事件 (一次到位, 非流式) */
function pushEvent(raw: SSEEventPayload) {
  const evt = mapSSEtoChatEvent(raw)
  if (evt) events.value.push(evt)
}

/** 清空对话 */
function clearEvents() {
  events.value = []
  sessionId.value = null
  localStorage.removeItem('agent_debug_active_session_id')
}

function handleDeleteSession(sid: string) {
  if (sessionId.value === sid) {
    clearEvents()
  }
}

onMounted(() => {
  const saved = localStorage.getItem('agent_debug_active_session_id')
  if (saved) {
    handleSelectSession(saved)
  }
})

// ═══════════════════════════════════════════════════════════════
//  流式文本输出工具函数
// ═══════════════════════════════════════════════════════════════

/** Mock 用: 逐字输出 */
async function streamText(
  type: 'assistant' | 'thinking',
  fullText: string,
  chunkSize = 3,
  chunkMs = 30,
): Promise<ChatEvent> {
  const eventType = type === 'assistant' ? 'text_chunk' : 'agent_thought'
  pushEvent({ event_type: eventType, content: '' })

  const evt = events.value[events.value.length - 1]
  if (evt) {
    evt.streaming = true

    let cursor = 0
    while (cursor < fullText.length) {
      const end = Math.min(cursor + chunkSize, fullText.length)
      evt.content += fullText.slice(cursor, end)
      cursor = end
      await new Promise(r => setTimeout(r, chunkMs))
    }

    evt.streaming = false
  }
  return evt as ChatEvent
}

function appendToLast(type: ChatEvent['type'], delta: string) {
  const last = events.value[events.value.length - 1]
  if (last && last.type === type && last.streaming) {
    last.content += delta
  } else {
    if (last && last.streaming) {
      last.streaming = false
    }
    pushEvent({
      event_type: type === 'assistant' ? 'text_chunk' : 'agent_thought',
      content: delta,
    })
    const newLast = events.value[events.value.length - 1]
    if (newLast) newLast.streaming = true
  }
}

/** 结束最后一个流式事件 */
function finishStreaming() {
  const last = events.value[events.value.length - 1]
  if (last) last.streaming = false
}

// ─── Mock 模拟 ──────────────────────────────────────────────────
async function simulateAgentResponse(userText: string) {
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  pushEvent({ event_type: 'status_update', status: 'thinking', message: '正在分析请求...' })
  await delay(400)

  await streamText('thinking', `分析用户输入："${userText}"，判断是否需要工具调用...`, 2, 20)
  await delay(200)

  if (userText.includes('图') || userText.includes('graph')) {
    pushEvent({
      event_type: 'tool_call', tool_name: 'make_graph', call_id: 'call_mock_1',
      arguments: {
        file_name: 'demo_graph',
        nodes: [
          { id: 'A', data: { label: 'Node A', group: 'core' } },
          { id: 'B', data: { label: 'Node B', group: 'core' } },
        ],
        edges: [{ source: 'A', target: 'B', data: { label: '关系' } }],
      },
    })
    await delay(800)
    pushEvent({
      event_type: 'tool_result', tool_name: 'make_graph', call_id: 'call_mock_1',
      success: true, output: '成功生成力导向图并保存至 data/graphs/demo_graph.json',
    })
    await delay(300)
    await streamText('assistant', '已为你生成了关系图，你可以到 **力导图** 页面查看。')
  } else {
    await streamText(
      'assistant',
      `你好！你说的是：「${userText}」\n\n试试发送包含"图"或"写文件"的消息来触发工具调用！`,
      4, 25,
    )
  }

  pushEvent({ event_type: 'task_complete', summary: '请求处理完成' })
}

// ─── 真实 SSE 连接 ──────────────────────────────────────────────
async function connectSSE(userText: string, referenceMedia: MediaFile[] = [], model: string = 'gpt-5.4') {
  try {
    const resp = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userText,
        user_id: 'default_user',
        model: model,
        reference_image_list: referenceMedia.filter(m => m.type === 'image').map(m => m.url),
        session_id: sessionId.value || undefined,
        max_iterations: 10,
        role_id: activeRoleId.value,
      }),
    })

    if (!resp.ok) {
      pushEvent({ event_type: 'error', message: `HTTP ${resp.status}: ${resp.statusText}` })
      return
    }

    const reader = resp.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE 每条消息以 \n\n 分隔
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''   // 最后一段可能不完整, 留到下一轮

      for (const part of parts) {
        const lines = part.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const dataStr = line.slice(6)  // 去掉 "data: " 前缀

          // [DONE] 标记 = 流结束
          if (dataStr === '[DONE]') {
            finishStreaming()
            return
          }

          try {
            const raw: SSEEventPayload = JSON.parse(dataStr)

            // 监听并记录会话 ID
            if (raw.event_type === 'session_id') {
              sessionId.value = raw.session_id
              localStorage.setItem('agent_debug_active_session_id', raw.session_id)
            } else if (raw.event_type === 'text_chunk') {
              // text_chunk 和 agent_thought 用追加模式 (流式效果)
              appendToLast('assistant', raw.content ?? '')
            } else if (raw.event_type === 'agent_thought') {
              appendToLast('thinking', raw.content ?? '')
            } else {
              // 其他事件 (tool_call, tool_result, status_update 等) 直接 push
              finishStreaming()
              pushEvent(raw)
            }

            // task_complete / error → 结束
            if (raw.event_type === 'task_complete' || raw.event_type === 'error') {
              finishStreaming()
              return
            }
          } catch (e) {
            console.warn('SSE JSON 解析失败:', dataStr, e)
          }
        }
      }
    }
  } catch (e: any) {
    pushEvent({ event_type: 'error', message: `连接失败: ${e.message}` })
  }
}
</script>

<template>
  <div class="chat-debug-layout">
    <!-- 主聊天区域 -->
    <div class="chat-main-area">
      <!-- 顶部工具栏 -->
      <div class="chat-toolbar">
        <span class="toolbar-title">Agent 调试</span>

        <div class="toolbar-spacer" />
        <el-button text size="small" @click="clearEvents" :disabled="events.length === 0">
          <el-icon><i-ep-delete /></el-icon>
          清空
        </el-button>
      </div>

      <!-- 事件流 -->
      <EventStream :events="events" />

      <!-- 输入框 -->
      <ChatInput :disabled="loading" v-model:role-id="activeRoleId" @send="handleSend" />
    </div>

    <!-- 历史会话栏 (右侧) -->
    <HistorySidebar
      ref="sidebarRef"
      :current-session-id="sessionId"
      :role-id="activeRoleId"
      @select-session="handleSelectSession"
      @delete-session="handleDeleteSession"
    />
  </div>
</template>

<style scoped>
.chat-debug-layout {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: #fafafa;
  border-radius: 8px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
}

.chat-main-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fafafa;
  overflow: hidden;
}

.chat-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.toolbar-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.toolbar-spacer {
  flex: 1;
}

.mode-tag {
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
}
.mode-tag:hover {
  transform: scale(1.05);
}
</style>
