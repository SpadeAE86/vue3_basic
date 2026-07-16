<script setup lang="ts">
import { ref, onMounted, watch, computed, onActivated, onDeactivated, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import type { ChatEvent, SSEEventPayload } from '@/types/chat'
import { mapSSEtoChatEvent } from '@/types/chat'
import EventStream from '@/components/chat/EventStream.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import HistorySidebar from '@/components/chat/HistorySidebar.vue'
import type { MediaFile } from '@/components/image/MediaUploader.vue'
import { useCollectionsStore } from '@/stores/collections'

const collectionsStore = useCollectionsStore()

const route = useRoute()
const events = ref<ChatEvent[]>([])
const loading = ref(false)
const sessionId = ref<string | null>(null)
const sidebarRef = ref<InstanceType<typeof HistorySidebar> | null>(null)
const activeRoleId = ref(localStorage.getItem('agent_debug_active_role_id') || 'default')
const roles = ref<{ id: string; name: string; description?: string; avatar_emoji?: string; avatar_url?: string; voice_character?: string }[]>([])
const tokenInfo = ref<{ token_count: number; threshold: number; percent: number } | null>(null)
const autoTtsEnabled = ref(localStorage.getItem('agent_debug_auto_tts_enabled') !== 'false')
watch(autoTtsEnabled, (newVal) => {
  localStorage.setItem('agent_debug_auto_tts_enabled', newVal ? 'true' : 'false')
})

async function fetchTokenInfo() {
  if (!sessionId.value) {
    tokenInfo.value = null
    return
  }
  try {
    const res = await fetch(`${API_BASE}/chat/sessions/${sessionId.value}/tokens`)
    if (res.ok) {
      const data = await res.json()
      if (data.success) {
        tokenInfo.value = {
          token_count: data.token_count,
          threshold: data.threshold,
          percent: data.percent
        }
      }
    }
  } catch (err) {
    console.error('Failed to fetch token info:', err)
  }
}

watch(sessionId, (newSid) => {
  if (newSid) {
    fetchTokenInfo()
  } else {
    tokenInfo.value = null
  }
})

async function fetchRoles() {
  try {
    const res = await fetch(`${API_BASE}/chat/roles?t=${Date.now()}`)
    if (res.ok) {
      roles.value = await res.json()
    }
  } catch (err) {
    console.error('Failed to fetch roles:', err)
  }
}

const activeRole = computed(() => {
  return roles.value.find(r => r.id === activeRoleId.value) || { id: 'default', name: 'CC', avatar_emoji: '⚡' }
})

let skipAutoLoad = false

watch(activeRoleId, async (newRole) => {
  localStorage.setItem('agent_debug_active_role_id', newRole)
  
  if (!roles.value.some(r => r.id === newRole)) {
    await fetchRoles()
  }

  if (skipAutoLoad) {
    skipAutoLoad = false
    return
  }

  // 切换角色时，自动加载该角色最近的一个会话
  try {
    const res = await fetch(`${API_BASE}/chat/sessions?page=1&page_size=1&role_id=${newRole}`)
    if (res.ok) {
      const data = await res.json()
      if (data.sessions && data.sessions.length > 0) {
        const lastSession = data.sessions[0]
        if (sessionId.value !== lastSession.session_id) {
          handleSelectSession(lastSession.session_id, newRole)
        }
      } else {
        // 该角色暂无会话，清空当前聊天
        sessionId.value = null
        events.value = []
        localStorage.removeItem('agent_debug_active_session_id')
      }
    }
  } catch (err) {
    console.error('Failed to auto-load last session for role:', err)
  }
})

// ─── 模式切换: Mock / 真实后端 ────────────────────────────────────
const useMock = ref(false)
const API_BASE = '/api'   // 你的后端地址

async function handleSend(text: string, referenceMedia: MediaFile[] = [], model: string = 'gpt-5.4') {
  resetSseAudioPlayer()
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
    skipAutoLoad = true
    activeRoleId.value = roleId
    localStorage.setItem('agent_debug_active_role_id', roleId)
  }
  events.value = []
  
  const bgSession = collectionsStore.activeEvaluationSessions[sid]
  if (bgSession) {
    events.value = bgSession.events
    loading.value = false
    await fetchTokenInfo()
    return
  }
  
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
  await fetchTokenInfo()
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

onMounted(async () => {
  await fetchRoles()
  const queryRoleId = route.query.role_id as string
  const querySessionId = route.query.session_id as string
  
  if (querySessionId && queryRoleId) {
    await handleSelectSession(querySessionId, queryRoleId)
    const queryMsg = route.query.message as string
    if (queryMsg && events.value.length === 0 && !loading.value) {
      handleSend(queryMsg)
      router.replace({ path: '/chat', query: { ...route.query, message: undefined } })
    }
  } else if (queryRoleId) {
    if (activeRoleId.value !== queryRoleId) {
      activeRoleId.value = queryRoleId
    } else {
      const saved = localStorage.getItem('agent_debug_active_session_id')
      const savedRole = localStorage.getItem('agent_debug_active_role_id') || 'default'
      if (saved && savedRole === queryRoleId) {
        handleSelectSession(saved, queryRoleId)
      } else {
        watchActiveRoleOnce()
      }
    }
  } else {
    const saved = localStorage.getItem('agent_debug_active_session_id')
    if (saved) {
      const savedRole = localStorage.getItem('agent_debug_active_role_id') || 'default'
      handleSelectSession(saved, savedRole)
    } else {
      watchActiveRoleOnce()
    }
  }
})

watch(() => route.query, async (newQuery) => {
  const queryRoleId = newQuery.role_id as string
  const querySessionId = newQuery.session_id as string
  
  if (querySessionId && queryRoleId) {
    await handleSelectSession(querySessionId, queryRoleId)
    const queryMsg = newQuery.message as string
    if (queryMsg && events.value.length === 0 && !loading.value) {
      handleSend(queryMsg)
      router.replace({ path: '/chat', query: { ...newQuery, message: undefined } })
    }
  } else if (queryRoleId && typeof queryRoleId === 'string') {
    if (activeRoleId.value !== queryRoleId) {
      activeRoleId.value = queryRoleId
    }
  }
}, { deep: true })

watch(() => {
  if (!sessionId.value) return null
  return collectionsStore.activeEvaluationSessions[sessionId.value]?.events
}, (newEvts) => {
  if (newEvts) {
    events.value = [...newEvts]
  }
}, { deep: true })

const isFirstActivation = ref(true)

onActivated(async () => {
  if (isFirstActivation.value) {
    isFirstActivation.value = false
    return
  }
  // Subsequent activations:
  await fetchRoles()
  
  const queryRoleId = route.query.role_id as string
  const querySessionId = route.query.session_id as string
  
  if (querySessionId && queryRoleId) {
    await handleSelectSession(querySessionId, queryRoleId)
    const queryMsg = route.query.message as string
    if (queryMsg && events.value.length === 0 && !loading.value) {
      handleSend(queryMsg)
      router.replace({ path: '/chat', query: { ...route.query, message: undefined } })
    }
  } else {
    // Check if localStorage has been updated with a new background session!
    const saved = localStorage.getItem('agent_debug_active_session_id')
    if (saved && saved !== sessionId.value) {
      const savedRole = localStorage.getItem('agent_debug_active_role_id') || 'default'
      await handleSelectSession(saved, savedRole)
    }
    // Always refresh the sidebar on activation to ensure session list is up-to-date
    sidebarRef.value?.refresh()
  }
})

const sseAudioPlaylist = ref<{ url: string; index: number }[]>([])
let sseAudioExpectedIndex = 0
let sseActiveAudio: HTMLAudioElement | null = null
const sseIsPlayingAudio = ref(false)
const sseIsPausedAudio = ref(false)
const sseActiveBubbleId = ref<string | null>(null)

function playSseAudioQueue() {
  if (sseIsPlayingAudio.value) return
  
  const nextItem = sseAudioPlaylist.value.find(item => item.index === sseAudioExpectedIndex)
  if (!nextItem) {
    // 队列播放完成，重置状态
    sseIsPlayingAudio.value = false
    sseIsPausedAudio.value = false
    return
  }
  
  sseIsPlayingAudio.value = true
  sseIsPausedAudio.value = false
  const audio = new Audio(nextItem.url)
  sseActiveAudio = audio
  
  audio.onended = () => {
    sseIsPlayingAudio.value = false
    sseActiveAudio = null
    sseAudioExpectedIndex++
    playSseAudioQueue()
  }
  
  audio.onerror = () => {
    console.error('SSE audio play error')
    sseIsPlayingAudio.value = false
    sseActiveAudio = null
    sseAudioExpectedIndex++
    playSseAudioQueue()
  }
  
  audio.play().catch(err => {
    console.error('SSE audio play error:', err)
    sseIsPlayingAudio.value = false
    sseActiveAudio = null
    sseAudioExpectedIndex++
    playSseAudioQueue()
  })
}

function handleToggleSseAudio() {
  if (sseActiveAudio) {
    if (sseActiveAudio.paused) {
      sseActiveAudio.play().then(() => {
        sseIsPlayingAudio.value = true
        sseIsPausedAudio.value = false
      }).catch(err => {
        console.error('Failed to resume SSE audio:', err)
      })
    } else {
      sseActiveAudio.pause()
      sseIsPlayingAudio.value = false
      sseIsPausedAudio.value = true
    }
  }
}

function resetSseAudioPlayer() {
  if (sseActiveAudio) {
    sseActiveAudio.pause()
    sseActiveAudio = null
  }
  sseAudioPlaylist.value = []
  sseAudioExpectedIndex = 0
  sseIsPlayingAudio.value = false
  sseIsPausedAudio.value = false
  sseActiveBubbleId.value = null
}

onDeactivated(() => {
  resetSseAudioPlayer()
})

onBeforeUnmount(() => {
  resetSseAudioPlayer()
})

async function watchActiveRoleOnce() {
  try {
    const res = await fetch(`${API_BASE}/chat/sessions?page=1&page_size=1&role_id=${activeRoleId.value}`)
    if (res.ok) {
      const data = await res.json()
      if (data.sessions && data.sessions.length > 0) {
        const lastSession = data.sessions[0]
        handleSelectSession(lastSession.session_id, activeRoleId.value)
      }
    }
  } catch (err) {
    console.error('Failed to init last session:', err)
  }
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
    const isEvaluation = !!route.query.space_id
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
        disable_tts: (isEvaluation || !autoTtsEnabled.value) ? true : undefined,
        use_voice_tags: true,
        session_title: isEvaluation ? (route.query.session_title as string || '【灵感】脑暴规划') : undefined
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
            // If it is linked to a space, save the final AI reply to that space!
            const spaceId = route.query.space_id as string
            if (spaceId) {
              const lastAssistantMsg = events.value.slice().reverse().find(e => e.type === 'assistant')
              const textContent = lastAssistantMsg?.content || ''
              const alreadySaved = collectionsStore.items.some(i => i.space_id === spaceId && i.title.startsWith('💡 灵感脑暴规划'))
              if (!alreadySaved && textContent.trim()) {
                const sessionTitle = route.query.session_title as string || ''
                const cleanTitle = sessionTitle.replace('【灵感】', '')
                const titleStr = `💡 灵感脑暴规划 - ${cleanTitle}`
                collectionsStore.toggleFavorite(
                  'prompt',
                  titleStr,
                  undefined,
                  {
                    prompt: textContent,
                    chat_session_id: sessionId.value,
                    role_id: activeRoleId.value,
                    subtype: 'inspiration'
                  },
                  spaceId
                )
              }
            }
            return
          }

          try {
            const raw: SSEEventPayload = JSON.parse(dataStr)

            // 监听并记录会话 ID
            if (raw.event_type === 'session_id') {
              sessionId.value = raw.session_id
              localStorage.setItem('agent_debug_active_session_id', raw.session_id)
            } else if (raw.event_type === 'update_conversation_name') {
              if (raw.title) {
                if (sidebarRef.value && sidebarRef.value.sessions) {
                  const s = sidebarRef.value.sessions.find((x: any) => x.session_id === raw.session_id || x.session_id === sessionId.value)
                  if (s) {
                    s.title = raw.title
                  }
                }
                collectionsStore.loadThemeSpaces()
              }
            } else if (raw.event_type === 'text_chunk') {
              // text_chunk 和 agent_thought 用追加模式 (流式效果)
              appendToLast('assistant', raw.content ?? '')
            } else if (raw.event_type === 'agent_thought') {
              appendToLast('thinking', raw.content ?? '')
            } else if (raw.event_type === 'voice_chunk') {
              let audioUrl = raw.url || ''
              if (raw.data_type === 'base64' && raw.data) {
                try {
                  const binaryString = atob(raw.data)
                  const len = binaryString.length
                  const bytes = new Uint8Array(len)
                  for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i)
                  }
                  const blob = new Blob([bytes], { type: 'audio/mp3' })
                  audioUrl = URL.createObjectURL(blob)
                } catch (err) {
                  console.error('Failed to decode base64 voice chunk:', err)
                }
              }
              sseAudioPlaylist.value.push({ url: audioUrl, index: raw.index })
              playSseAudioQueue()
              // 将流式返回的语音分片 url 存储到当前对应的回复气泡事件中
              const assistantEvent = [...events.value].reverse().find(e => e.type === 'assistant')
              if (assistantEvent) {
                if (!assistantEvent.voiceChunks) {
                  assistantEvent.voiceChunks = []
                }
                assistantEvent.voiceChunks[raw.index] = audioUrl
                
                // 标记当前正在播放此气泡的流式音频
                sseActiveBubbleId.value = assistantEvent.id
                
                // 记录本次生成所使用的音色，供后续气泡点击朗读判断是否已变更
                const activeRole = roles.value.find(r => r.id === activeRoleId.value)
                assistantEvent.voiceCharacterUsed = activeRole?.voice_character || 'Vivi'
              }
            } else {
              finishStreaming()
              pushEvent(raw)
              if (raw.event_type === 'tool_result' && (raw.tool_name === 'schedule_heartbeat' || raw.tool_name === 'manage_scheduled_task' || raw.tool_name === 'manage_todo_list')) {
                window.dispatchEvent(new CustomEvent('scheduler:sync'))
              }
              if (raw.event_type === 'tool_result' && raw.tool_name === 'rename_role') {
                fetchRoles()
              }
            }

            // task_complete / error → 结束
            if (raw.event_type === 'task_complete') {
              finishStreaming()
              fetchRoles()
              fetchTokenInfo()
              // Do NOT return here, to allow trailing voice_chunk events to continue streaming and playing!
            } else if (raw.event_type === 'error') {
              finishStreaming()
              fetchRoles()
              fetchTokenInfo()
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

        <!-- TTS 自动播放开关 -->
        <div class="tts-switch-wrapper" v-if="activeRole && activeRole.voice_character">
          <el-switch
            v-model="autoTtsEnabled"
            active-text="自动朗读"
            inactive-text="静音"
            inline-prompt
            style="--el-switch-on-color: #6366f1; --el-switch-off-color: #94a3b8; margin-left: 12px;"
          />
        </div>

        <div class="toolbar-spacer" />
        <el-button text size="small" @click="clearEvents" :disabled="events.length === 0">
          <el-icon><i-ep-delete /></el-icon>
          清空
        </el-button>
      </div>

      <!-- 事件流 -->
      <EventStream 
        :events="events" 
        :active-role="activeRole" 
        :sse-active-bubble-id="sseActiveBubbleId"
        :sse-is-playing-audio="sseIsPlayingAudio"
        :sse-is-paused-audio="sseIsPausedAudio"
        @toggle-sse-audio="handleToggleSseAudio"
        @stop-sse-audio="resetSseAudioPlayer"
      />

      <!-- 输入框 -->
      <ChatInput :disabled="loading" v-model:role-id="activeRoleId" :token-info="tokenInfo" @send="handleSend" />
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
