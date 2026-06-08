const API_BASE = '/api'

export interface Workspace {
  id: string
  name: string
}

export interface GraphData {
  workspace: Workspace
  nodes: any[]
  edges: any[]
}

export async function getWorkspaces(): Promise<{ workspaces: Workspace[] }> {
  const res = await fetch(`${API_BASE}/workspace`)
  if (!res.ok) throw new Error(`Failed to fetch workspaces: ${res.statusText}`)
  return res.json()
}

export async function createWorkspace(name: string): Promise<{ workspace: Workspace }> {
  const res = await fetch(`${API_BASE}/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(`Failed to create workspace: ${res.statusText}`)
  return res.json()
}

export async function deleteWorkspace(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/workspace/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Failed to delete workspace: ${res.statusText}`)
}

export async function getWorkspaceGraph(id: string): Promise<GraphData> {
  const res = await fetch(`${API_BASE}/workspace/${id}/graph`)
  if (!res.ok) throw new Error(`Failed to fetch graph data: ${res.statusText}`)
  return res.json()
}
