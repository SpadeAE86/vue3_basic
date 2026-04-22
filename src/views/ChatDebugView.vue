<script setup lang="ts">
import { ref } from 'vue'
import type { ChatEvent, SSEEventPayload } from '@/types/chat'
import { mapSSEtoChatEvent } from '@/types/chat'
import EventStream from '@/components/chat/EventStream.vue'
import ChatInput from '@/components/chat/ChatInput.vue'

const events = ref<ChatEvent[]>([])
const loading = ref(false)

// ─── 模式切换: Mock / 真实后端 ────────────────────────────────────
const useMock = ref(true)
const API_BASE = '/api'   // 你的后端地址

async function handleSend(text: string) {
  pushEvent({ event_type: 'user_message', content: text })
  loading.value = true

  if (useMock.value) {
    await simulateAgentResponse(text)
  } else {
    await connectSSE(text)
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
}

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
  evt.streaming = true

  let cursor = 0
  while (cursor < fullText.length) {
    const end = Math.min(cursor + chunkSize, fullText.length)
    evt.content += fullText.slice(cursor, end)
    cursor = end
    await new Promise(r => setTimeout(r, chunkMs))
  }

  evt.streaming = false
  return evt
}

/** SSE 用: 往最后一个同类型事件追加文本 */
function appendToLast(type: ChatEvent['type'], delta: string) {
  const last = events.value[events.value.length - 1]
  if (last && last.type === type && last.streaming) {
    last.content += delta
  } else {
    pushEvent({
      event_type: type === 'assistant' ? 'text_chunk' : 'agent_thought',
      content: delta,
    })
    events.value[events.value.length - 1].streaming = true
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
async function connectSSE(userText: string) {
  try {
    const resp = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userText,
        user_id: 'default_user',
        model: 'gemini-3-pro',
        max_iterations: 10,
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

            // text_chunk 和 agent_thought 用追加模式 (流式效果)
            if (raw.event_type === 'text_chunk') {
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
  <div class="chat-debug-page">
    <!-- 顶部工具栏 -->
    <div class="chat-toolbar">
      <span class="toolbar-title">Agent 调试</span>
      <el-tag
        :type="useMock ? 'info' : 'success'"
        effect="dark"
        size="small"
        round
        class="mode-tag"
        @click="useMock = !useMock"
      >
        {{ useMock ? '🔬 Mock 模式' : '🔗 后端 SSE' }}
      </el-tag>
      <div class="toolbar-spacer" />
      <el-button text size="small" @click="clearEvents" :disabled="events.length === 0">
        <el-icon><i-ep-delete /></el-icon>
        清空
      </el-button>
    </div>

    <!-- 事件流 -->
    <EventStream :events="events" />

    <!-- 输入框 -->
    <ChatInput :disabled="loading" @send="handleSend" />
  </div>
</template>

<style scoped>
.chat-debug-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fafafa;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
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
