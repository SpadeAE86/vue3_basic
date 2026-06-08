const API_BASE = '/api'

export async function getSessionHistory(workspaceId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/chat/sessions/${workspaceId}`)
  if (!res.ok) throw new Error(`Failed to fetch chat history: ${res.statusText}`)
  return res.json()
}
