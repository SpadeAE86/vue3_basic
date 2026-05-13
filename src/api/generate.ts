import type { GenerateMode } from '@/types/generate'

const API_BASE = '/api'

export function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 12_000, ...rest } = init
  const controller = new AbortController()
  const t = window.setTimeout(() => controller.abort(), timeoutMs)
  return fetch(input, { ...rest, signal: controller.signal }).finally(() => window.clearTimeout(t))
}

export async function checkBackendStatusApi() {
  try {
    const resp = await fetchWithTimeout(`${API_BASE}/health`, { timeoutMs: 3000 })
    if (!resp.ok) return false

    // 避免被前端 SPA/ELB 的 200 HTML 误判为“后端已连接”
    const contentType = resp.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) return false

    const data = await resp.json().catch(() => null)
    if (!data) return false
    return data.ok === true || data.status === 'ok' || data.healthy === true
  } catch (e) {
    return false
  }
}

export async function loadHistoryApi(mode: GenerateMode) {
  const resp = await fetch(`${API_BASE}/${mode}/history`)
  return resp.json()
}

export async function saveHistoryApi(mode: GenerateMode, history: any[]) {
  return fetch(`${API_BASE}/${mode}/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history })
  })
}

/** 图片模式：从 MySQL 删除一条历史（POST 全量不会删库，删除须调此接口） */
export async function deleteImageHistoryItemApi(itemId: string) {
  return fetch(`${API_BASE}/image/history/${encodeURIComponent(itemId)}`, {
    method: 'DELETE'
  })
}

export async function getVideoStatusApi(taskId: string) {
  const resp = await fetch(`${API_BASE}/video/status/${encodeURIComponent(taskId)}`)
  return resp.json()
}

/** 异步生图：轮询 DB 中的任务状态（与 POST /image 返回的 task_id 对应） */
export async function getImageStatusApi(taskId: string) {
  const resp = await fetch(`${API_BASE}/image/status/${encodeURIComponent(taskId)}`)
  if (!resp.ok) {
    return { success: false, error: `HTTP ${resp.status}`, status: 'unknown', url: null }
  }
  return resp.json()
}

export async function generateVideoApi(payload: any) {
  const resp = await fetchWithTimeout(`${API_BASE}/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: 30_000,
  })
  return resp.json()
}

export async function generateImageApi(payload: any) {
  const resp = await fetchWithTimeout(`${API_BASE}/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: 500_000,
  })
  return resp.json()
}

export async function beautifyPromptApi(prompt: string, systemPrompt: string, videoDuration?: number) {
  const resp = await fetchWithTimeout(`${API_BASE}/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      system_prompt: systemPrompt,
      model: 'Seed 2.0 Pro',
      video_duration: videoDuration,
    }),
    timeoutMs: 60_000, // 文本模型生成可能较慢，设置 60 秒超时
  })
  return resp.json()
}

export async function loadTemplatesApi() {
  const resp = await fetch(`${API_BASE}/prompt-templates`)
  return resp.json()
}

export async function getTemplateContentApi(name: string) {
  const resp = await fetch(`${API_BASE}/prompt-templates/${encodeURIComponent(name)}`)
  return resp.json()
}

export async function saveTemplateApi(name: string, content: string) {
  return fetch(`${API_BASE}/prompt-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content })
  })
}

export async function deleteTemplateApi(name: string) {
  return fetch(`${API_BASE}/prompt-templates/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  })
}
