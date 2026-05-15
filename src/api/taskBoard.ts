const API_BASE = '/api'

export async function fetchImageHistoryForBoard() {
  const resp = await fetch(`${API_BASE}/image/history`)
  return resp.json()
}

export async function fetchVideoAnalysisHistoryForBoard(workspace?: string) {
  const q = workspace ? `?workspace=${encodeURIComponent(workspace)}` : ''
  const resp = await fetch(`${API_BASE}/video-analysis/history${q}`)
  return resp.json()
}

export async function fetchImageTaskDetail(id: string) {
  const resp = await fetch(`${API_BASE}/image/history/${encodeURIComponent(id)}/detail`)
  return resp.json()
}

export async function fetchVideoAnalysisTaskDetail(id: string) {
  const resp = await fetch(`${API_BASE}/video-analysis/history/${encodeURIComponent(id)}/detail`)
  return resp.json()
}

export async function fetchVideoMatchJobsForBoard(params?: {
  parse_status?: string
  workspace?: string
  limit?: number
}) {
  const sp = new URLSearchParams()
  if (params?.parse_status) sp.set('parse_status', params.parse_status)
  if (params?.workspace) sp.set('workspace', params.workspace)
  if (params?.limit != null) sp.set('limit', String(params.limit))
  const q = sp.toString()
  const resp = await fetch(`${API_BASE}/video-match/jobs${q ? `?${q}` : ''}`)
  return resp.json()
}

export async function fetchVideoMatchJobTaskDetail(jobId: string) {
  const resp = await fetch(`${API_BASE}/video-match/jobs/${encodeURIComponent(jobId)}/detail`)
  return resp.json()
}

export async function fetchMaterialMatchesForBoard(params?: {
  workspace?: string
  source?: string
  status?: string
  limit?: number
}) {
  const sp = new URLSearchParams()
  if (params?.workspace) sp.set('workspace', params.workspace)
  if (params?.source) sp.set('source', params.source)
  if (params?.status) sp.set('status', params.status)
  if (params?.limit != null) sp.set('limit', String(params.limit))
  const q = sp.toString()
  const resp = await fetch(`${API_BASE}/video-match/material-matches${q ? `?${q}` : ''}`)
  return resp.json()
}

export async function fetchMaterialMatchTaskDetail(matchId: string) {
  const resp = await fetch(
    `${API_BASE}/video-match/material-matches/${encodeURIComponent(matchId)}/detail`,
  )
  return resp.json()
}

export async function retryVideoAnalysisHistoryTask(historyId: string) {
  const resp = await fetch(
    `${API_BASE}/video-analysis/history/${encodeURIComponent(historyId)}/retry`,
    { method: 'POST' },
  )
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const msg =
      typeof (data as { detail?: string }).detail === 'string'
        ? (data as { detail: string }).detail
        : `HTTP ${resp.status}`
    return { success: false as const, error: msg, ...data }
  }
  return data
}

export async function retryImageHistoryTask(id: string) {
  const resp = await fetch(`${API_BASE}/image/history/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const msg =
      typeof (data as { detail?: string }).detail === 'string'
        ? (data as { detail: string }).detail
        : `HTTP ${resp.status}`
    return { success: false as const, error: msg, ...data }
  }
  return data
}

export async function retryVideoMatchJobTask(jobId: string) {
  const resp = await fetch(`${API_BASE}/video-match/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: 'POST',
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const msg =
      typeof (data as { detail?: string }).detail === 'string'
        ? (data as { detail: string }).detail
        : `HTTP ${resp.status}`
    return { success: false as const, error: msg, ...data }
  }
  return data
}
