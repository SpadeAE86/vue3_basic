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
