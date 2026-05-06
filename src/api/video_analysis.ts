const API_BASE = '/api'

export async function getVideoAnalysisWorkspacesApi() {
  const resp = await fetch(`${API_BASE}/video-analysis/workspaces`)
  return resp.json()
}

export async function getVideoAnalysisHistoryApi(workspace?: string) {
  const params = new URLSearchParams()
  if (workspace) params.set('workspace', workspace)
  const resp = await fetch(`${API_BASE}/video-analysis/history?${params.toString()}`)
  return resp.json()
}

export async function getVideoAnalysisHistoryItemApi(
  historyId: string,
  workspace = 'v1',
) {
  const q = new URLSearchParams({ shot_cards_version: workspace }).toString()
  const resp = await fetch(
    `${API_BASE}/video-analysis/history/${encodeURIComponent(historyId)}?${q}`,
  )
  return resp.json()
}

export async function analyzeVideoApi(
  file: File,
  opts?: {
    frameInterval?: number
    threshold?: number
    customPrompt?: string
    splitScenes?: boolean
    workspace?: string
    carModel?: string
  },
) {
  const form = new FormData()
  form.append('file', file)
  if (opts?.frameInterval != null) form.append('frame_interval', String(opts.frameInterval))
  if (opts?.threshold != null) form.append('threshold', String(opts.threshold))
  if (opts?.customPrompt) form.append('custom_prompt', opts.customPrompt)
  if (opts?.splitScenes != null) form.append('split_scenes', String(opts.splitScenes))
  if (opts?.workspace) form.append('workspace', opts.workspace)
  if (opts?.carModel) form.append('car_model', opts.carModel)

  const controller = new AbortController()
  const t = window.setTimeout(() => controller.abort(), 5 * 60_000)
  try {
    const resp = await fetch(`${API_BASE}/video-analysis`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    return await resp.json()
  } finally {
    window.clearTimeout(t)
  }
}

export async function getVideoAnalysisCardsApi(historyId?: string, workspace = 'v1') {
  const params = new URLSearchParams({ shot_cards_version: workspace, workspace })
  if (historyId) params.set('history_id', historyId)
  const resp = await fetch(`${API_BASE}/video-analysis/cards?${params.toString()}`)
  return resp.json()
}

export type VideoAnalysisSearchToken = {
  text: string
  join?: 'AND' | 'OR'
  not?: boolean
}

export async function searchVideoAnalysisCardsApi(
  payload: {
    tokens: VideoAnalysisSearchToken[]
    fuzzy?: boolean
    history_id?: string
    size?: number
    workspace?: string
  },
  opts?: { signal?: AbortSignal },
) {
  const resp = await fetch(`${API_BASE}/video-analysis/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: opts?.signal,
  })
  return resp.json()
}
