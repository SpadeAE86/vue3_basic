import type { GenerateMode } from '@/types/generate'

const API_BASE = 'http://127.0.0.1:8004'

export function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 12_000, ...rest } = init
  const controller = new AbortController()
  const t = window.setTimeout(() => controller.abort(), timeoutMs)
  return fetch(input, { ...rest, signal: controller.signal }).finally(() => window.clearTimeout(t))
}

export async function checkBackendStatusApi() {
  try {
    const resp = await fetchWithTimeout(`${API_BASE}/health`, { timeoutMs: 3000 })
    return resp.ok
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

export async function getVideoStatusApi(taskId: string) {
  const resp = await fetch(`${API_BASE}/video/status/${taskId}`)
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
    timeoutMs: 120_000,
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
