// types/chat.ts — Agent 调试界面的事件类型定义
// 和后端 event.py 的 AgentEvent 一一映射

export interface ChatEvent {
  id: string
  type: 'user' | 'assistant' | 'thinking' | 'tool_call' | 'tool_result' | 'status' | 'error' | 'compressed'
  content: string
  timestamp: number

  // tool 相关 (只有 tool_call / tool_result 才有)
  toolName?: string
  toolArgs?: Record<string, any>
  toolSuccess?: boolean

  // 流式相关 — Phase 2 用, 先留口子
  streaming?: boolean
  
  // 参考图片列表
  referenceImages?: string[]

  // 流式已生成的语音分片列表
  voiceChunks?: string[]
  // 生成该语音分片时所使用的音色角色名，用于当用户切换音色时让旧缓存失效
  voiceCharacterUsed?: string
}

// 后端 SSE 推过来的原始格式 (和 event.py 对齐)
export interface SSEEventPayload {
  event_type: string
  agent_id?: string
  content?: string
  tool_name?: string
  arguments?: Record<string, any>
  output?: string
  error?: string
  success?: boolean
  status?: string
  message?: string
  summary?: string
  call_id?: string
  reference_image_list?: string[]
  [key: string]: any
}

// 把后端事件转成前端 ChatEvent
let _eventCounter = 0
export function mapSSEtoChatEvent(raw: SSEEventPayload): ChatEvent | null {
  const id = `evt_${++_eventCounter}_${Date.now()}`
  const ts = Date.now()

  switch (raw.event_type) {
    case 'user_message':
      return { 
        id, 
        type: 'user', 
        content: raw.content ?? '', 
        timestamp: ts,
        referenceImages: raw.reference_image_list ?? []
      }

    case 'agent_thought':
      return { id, type: 'thinking', content: raw.content ?? '', timestamp: ts, streaming: true }

    case 'text_chunk':
      return { id, type: 'assistant', content: raw.content ?? '', timestamp: ts, streaming: true }

    case 'tool_call':
      return {
        id, type: 'tool_call', timestamp: ts,
        content: '',
        toolName: raw.tool_name ?? 'unknown',
        toolArgs: raw.arguments ?? {},
      }

    case 'tool_result':
      return {
        id, type: 'tool_result', timestamp: ts,
        content: raw.output ?? raw.error ?? '',
        toolName: raw.tool_name ?? 'unknown',
        toolSuccess: raw.success ?? false,
      }

    case 'status_update':
      return { id, type: 'status', content: raw.message ?? raw.status ?? '', timestamp: ts }

    case 'task_complete':
      return { id, type: 'status', content: '✅ 任务完成', timestamp: ts }

    case 'error':
      return { id, type: 'error', content: raw.message ?? '未知错误', timestamp: ts }

    case 'session_compacted':
      return {
        id,
        type: 'compressed',
        content: raw.summary ?? '',
        timestamp: ts
      }

    default:
      return null
  }
}
