const API_BASE = '/api'

export async function getSessionHistory(workspaceId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/chat/sessions/${workspaceId}`)
  if (!res.ok) throw new Error(`Failed to fetch chat history: ${res.statusText}`)
  return res.json()
}

export async function getChatSessions(page = 1, pageSize = 50): Promise<{ sessions: any[]; has_more: boolean }> {
  const res = await fetch(`${API_BASE}/chat/sessions?page=${page}&page_size=${pageSize}`)
  if (!res.ok) throw new Error(`Failed to fetch chat sessions: ${res.statusText}`)
  return res.json()
}

export async function deleteChatSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Failed to delete chat session: ${res.statusText}`)
  return res.json()
}

