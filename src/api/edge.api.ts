const API_BASE = '/api'

export async function saveEdge(workspaceId: string, edgePayload: any): Promise<void> {
  const res = await fetch(`${API_BASE}/workspace/${workspaceId}/edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(edgePayload),
  })
  if (!res.ok) throw new Error(`Failed to save edge: ${res.statusText}`)
}

export async function deleteEdge(workspaceId: string, edgeId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/workspace/${workspaceId}/edges/${edgeId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Failed to delete edge: ${res.statusText}`)
}
