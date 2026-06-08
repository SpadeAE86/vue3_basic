const API_BASE = '/api'

export interface GenerateImagePayload {
  prompt: string
  model: string
  size: string
  ratio: string
  reference_image_list?: string[]
  async_mode: boolean
}

export interface GenerateImageResponse {
  success: boolean
  image_url?: string
  error?: string
}

export async function saveNode(workspaceId: string, nodePayload: any): Promise<void> {
  const res = await fetch(`${API_BASE}/workspace/${workspaceId}/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nodePayload),
  })
  if (!res.ok) throw new Error(`Failed to save node: ${res.statusText}`)
}

export async function deleteNode(workspaceId: string, nodeId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/workspace/${workspaceId}/nodes/${nodeId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Failed to delete node: ${res.statusText}`)
}

export async function generateImage(payload: GenerateImagePayload): Promise<GenerateImageResponse> {
  const { async_mode, ...rest } = payload
  const res = await fetch(`${API_BASE}/image?async_mode=${async_mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rest),
  })
  if (!res.ok) throw new Error(`Image generation failed: ${res.statusText}`)
  return res.json()
}
