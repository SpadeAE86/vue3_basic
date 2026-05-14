const API_BASE = '/api'

const VIDEO_ANALYSIS_POST_TIMEOUT_MS = 120_000
const VIDEO_ANALYSIS_POLL_INTERVAL_MS = 2000
const VIDEO_ANALYSIS_POLL_TIMEOUT_MS = 20 * 60_000

/** 轮询 ``GET /video-analysis/status/{taskId}`` 直至 SUCCESS / FAILED */
export async function pollVideoAnalysisStatusApi(
  taskId: string,
  opts?: { intervalMs?: number; timeoutMs?: number },
): Promise<Record<string, unknown>> {
  const interval = opts?.intervalMs ?? VIDEO_ANALYSIS_POLL_INTERVAL_MS
  const timeout = opts?.timeoutMs ?? VIDEO_ANALYSIS_POLL_TIMEOUT_MS
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const resp = await fetch(
      `${API_BASE}/video-analysis/status/${encodeURIComponent(taskId)}`,
    )
    const raw = await resp.text()
    let j: Record<string, unknown>
    try {
      j = JSON.parse(raw) as Record<string, unknown>
    } catch {
      await new Promise((r) => setTimeout(r, interval))
      continue
    }
    if (!j.success) {
      return { success: false, error: (j.error as string) || 'status 请求失败' }
    }
    const st = String(j.status ?? '')
    if (st === 'SUCCESS') {
      return { success: true, item: j.item }
    }
    if (st === 'FAILED') {
      const item = j.item as { error_msg?: string } | undefined
      const err =
        (j.error as string) ||
        (item && typeof item === 'object' && item.error_msg) ||
        '分析失败'
      return { success: false, error: String(err) }
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  return { success: false, error: '分析轮询超时，请在历史记录中查看是否仍在处理' }
}

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

/** 仅提交异步任务（POST + 收到 task_id 即返回，不轮询） */
const VIDEO_ANALYSIS_SUBMIT_TIMEOUT_MS = 600_000

export async function submitVideoAnalysisApi(
  file: File,
  opts?: {
    frameInterval?: number
    threshold?: number
    customPrompt?: string
    splitScenes?: boolean
    workspace?: string
    carModel?: string
  },
): Promise<{
  success: boolean
  task_id?: string
  status?: string
  error?: string
}> {
  const form = new FormData()
  form.append('file', file)
  form.append('async_mode', 'true')
  if (opts?.frameInterval != null) form.append('frame_interval', String(opts.frameInterval))
  if (opts?.threshold != null) form.append('threshold', String(opts.threshold))
  if (opts?.customPrompt) form.append('custom_prompt', opts.customPrompt)
  if (opts?.splitScenes != null) form.append('split_scenes', String(opts.splitScenes))
  if (opts?.workspace) form.append('workspace', opts.workspace)
  if (opts?.carModel) form.append('car_model', opts.carModel)

  const controller = new AbortController()
  const t = window.setTimeout(() => controller.abort(), VIDEO_ANALYSIS_SUBMIT_TIMEOUT_MS)
  try {
    const resp = await fetch(`${API_BASE}/video-analysis`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    const raw = await resp.text()
    if (!raw.trim()) {
      return { success: false, error: `上传无响应 (HTTP ${resp.status})` }
    }
    let data: Record<string, unknown>
    try {
      data = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return { success: false, error: `非 JSON 响应 HTTP ${resp.status}` }
    }
    if (!resp.ok) {
      const err =
        (data.detail as string) ||
        (data.message as string) ||
        (data.error as string) ||
        `HTTP ${resp.status}`
      return { success: false, error: String(err) }
    }
    if (data.success && data.task_id) {
      return {
        success: true,
        task_id: String(data.task_id),
        status: String(data.status ?? 'PENDING'),
      }
    }
    return { success: false, error: '服务器未返回 task_id' }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '提交失败' }
  } finally {
    window.clearTimeout(t)
  }
}

export async function getVideoAnalysisTaskBadgesApi(workspace?: string) {
  const params = new URLSearchParams()
  if (workspace) params.set('workspace', workspace)
  const resp = await fetch(`${API_BASE}/video-analysis/task-badges?${params.toString()}`)
  return resp.json() as Promise<{
    success: boolean
    counts?: { PENDING?: number; RUNNING?: number }
    active_total?: number
  }>
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
    /** 默认 true：与后端异步任务 + 轮询对齐，适合批量 */
    asyncMode?: boolean
    pollTimeoutMs?: number
  },
) {
  const form = new FormData()
  form.append('file', file)
  const asyncMode = opts?.asyncMode !== false
  form.append('async_mode', String(asyncMode))
  if (opts?.frameInterval != null) form.append('frame_interval', String(opts.frameInterval))
  if (opts?.threshold != null) form.append('threshold', String(opts.threshold))
  if (opts?.customPrompt) form.append('custom_prompt', opts.customPrompt)
  if (opts?.splitScenes != null) form.append('split_scenes', String(opts.splitScenes))
  if (opts?.workspace) form.append('workspace', opts.workspace)
  if (opts?.carModel) form.append('car_model', opts.carModel)

  const controller = new AbortController()
  const postTimer = window.setTimeout(() => controller.abort(), VIDEO_ANALYSIS_POST_TIMEOUT_MS)
  try {
    const resp = await fetch(`${API_BASE}/video-analysis`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    const raw = await resp.text()
    if (!raw.trim()) {
      throw new Error(
        `服务器忙或上传超时 (HTTP ${resp.status})。请检查视频是否过大或网络。`,
      )
    }
    let data: Record<string, unknown>
    try {
      data = JSON.parse(raw) as Record<string, unknown>
    } catch {
      throw new Error(
        `非 JSON 响应 HTTP ${resp.status}: ${raw.slice(0, 240).replace(/\s+/g, ' ')}`,
      )
    }
    if (asyncMode && data.success && data.task_id && !data.item) {
      return await pollVideoAnalysisStatusApi(String(data.task_id), {
        timeoutMs: opts?.pollTimeoutMs ?? VIDEO_ANALYSIS_POLL_TIMEOUT_MS,
      })
    }
    return data
  } finally {
    window.clearTimeout(postTimer)
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
    bm25_weight?: number
    vector_weight?: number
    text_weights?: Record<string, number>
    vector_weights?: Record<string, number>
    use_rrf?: boolean
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

// ---------------- 搜索策略 API ----------------

export type SearchStrategy = {
  id?: number
  name: string
  bm25_weight: number
  vector_weight: number
  text_weights?: Record<string, number>
  vector_weights?: Record<string, number>
  is_default: boolean
  /** 模糊检索使用 RRF；为 true 时宏观 BM25/向量滑杆不参与后端融合 */
  use_rrf?: boolean
}

export async function getSearchStrategiesApi() {
  const resp = await fetch(`${API_BASE}/video-analysis/search-strategies`)
  return resp.json()
}

export async function saveSearchStrategyApi(strategy: SearchStrategy) {
  const resp = await fetch(`${API_BASE}/video-analysis/search-strategies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(strategy),
  })
  return resp.json()
}

export async function deleteSearchStrategyApi(id: number) {
  const resp = await fetch(`${API_BASE}/video-analysis/search-strategies/${id}`, {
    method: 'DELETE',
  })
  return resp.json()
}
