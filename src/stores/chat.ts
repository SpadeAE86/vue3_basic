import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getSessionHistory } from '@/api/chat.api'
import { useWorkspaceStore } from './workspace'
import type { ChatEvent, SSEEventPayload } from '@/types/chat'
import { mapSSEtoChatEvent } from '@/types/chat'
import type { MediaFile } from '@/components/image/MediaUploader.vue'

export const useChatStore = defineStore('chat', () => {
  const events = ref<ChatEvent[]>([])
  const chatLoading = ref(false)
  const debugMode = ref(false)
  const activeSessionId = ref<string | null>(null)
  const API_BASE = '/api'

  const workspaceStore = useWorkspaceStore()

  async function loadChatHistory(workspaceId: string) {
    try {
      const data = await getSessionHistory(workspaceId)
      events.value = data || []
    } catch (e) {
      console.error('加载会话历史失败:', e)
    }
  }

  function pushEvent(raw: SSEEventPayload) {
    const evt = mapSSEtoChatEvent(raw)
    if (evt) events.value.push(evt)
  }

  function appendToLast(type: ChatEvent['type'], delta: string) {
    const last = events.value[events.value.length - 1]
    if (last && last.type === type && last.streaming) {
      last.content += delta
    } else {
      if (last && last.streaming) last.streaming = false
      pushEvent({
        event_type: type === 'assistant' ? 'text_chunk' : 'agent_thought',
        content: delta,
      })
      const newLast = events.value[events.value.length - 1]
      if (newLast) newLast.streaming = true
    }
  }

  function finishStreaming() {
    const last = events.value[events.value.length - 1]
    if (last) last.streaming = false
  }

  async function handleSend(
    text: string, 
    referenceMedia: MediaFile[] = [], 
    model: string = 'gpt-5.4',
    customSessionId?: string,
    activeWorkspaceId?: string,
    activeGraphName?: string
  ) {
    const session_id = customSessionId || workspaceStore.selectedWorkspaceId
    if (!session_id) return

    pushEvent({ 
      event_type: 'user_message', 
      content: text,
      reference_image_list: referenceMedia.filter(m => m.type === 'image').map(m => m.url)
    })
    
    chatLoading.value = true
    try {
      await connectSSE(session_id, text, referenceMedia, model, activeWorkspaceId, activeGraphName)
    } finally {
      chatLoading.value = false
    }
  }

  async function connectSSE(
    workspaceId: string,
    userText: string, 
    referenceMedia: MediaFile[] = [], 
    model: string = 'gpt-5.4',
    activeWorkspaceId?: string,
    activeGraphName?: string
  ) {
    try {
      const resp = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          user_id: 'default_user',
          model: model,
          reference_image_list: referenceMedia.filter(m => m.type === 'image').map(m => m.url),
          session_id: workspaceId,
          max_iterations: 10,
          active_workspace_id: activeWorkspaceId,
          active_graph_name: activeGraphName
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
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const lines = part.split('\n').filter(l => l.startsWith('data: '))
          for (const line of lines) {
            const dataStr = line.slice(6)
            if (dataStr === '[DONE]') {
              finishStreaming()
              return
            }

            try {
              const raw: SSEEventPayload = JSON.parse(dataStr)
              
              if (raw.event_type === 'session_id') {
                activeSessionId.value = raw.session_id
              } else if (raw.event_type === 'text_chunk') {
                appendToLast('assistant', raw.content ?? '')
              } else if (raw.event_type === 'agent_thought') {
                appendToLast('thinking', raw.content ?? '')
              } else {
                finishStreaming()
                pushEvent(raw)
              }

              if (raw.event_type === 'task_complete' || raw.event_type === 'error') {
                finishStreaming()
                return
              }
            } catch (e) {
              console.warn('SSE JSON parse warning:', e)
            }
          }
        }
      }
    } catch (e: any) {
      pushEvent({ event_type: 'error', message: `连接失败: ${e.message}` })
    }
  }

  return {
    events,
    chatLoading,
    debugMode,
    activeSessionId,
    loadChatHistory,
    pushEvent,
    handleSend
  }
})
