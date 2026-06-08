import { type Ref } from 'vue'
import { saveNode, deleteNode } from '@/api/node.api'
import { saveEdge, deleteEdge } from '@/api/edge.api'
import { ElMessageBox } from 'element-plus'

export function useCanvasInteractions(
  workspaceId: Ref<string>,
  nodes: Ref<any[]>,
  edges: Ref<any[]>,
  setVueFlowNodes: (nodes: any[]) => void,
  setVueFlowEdges: (edges: any[]) => void,
  loadGraph: () => Promise<any>,
  pushHistory: () => void,
  recomputeReferenceImages: (workspaceId: string) => Promise<boolean>,
  recomputeTemplatePrompts?: (workspaceId: string) => Promise<boolean>
) {
  async function handleNodeDragStop({ node }: any) {
    if (!workspaceId.value) return
    
    const localNode = nodes.value.find(n => n.id === node.id)
    if (!localNode) {
      // 节点在本地 nodes.value 中已经不存在（可能被删除了），直接拦截，不执行保存
      return
    }
    
    localNode.position.x = node.position.x
    localNode.position.y = node.position.y
    
    const payload = {
      id: node.id,
      type: node.type || 'image_node',
      x: node.position.x,
      y: node.position.y,
      data: node.data
    }
    
    try {
      await saveNode(workspaceId.value, payload)
      pushHistory()
    } catch (e) {
      console.error('保存节点位置失败:', e)
    }
  }

  async function handleConnect(connection: any) {
    if (!workspaceId.value) return
    
    const edgeId = `edge_${Math.random().toString(36).substring(2, 8)}`
    
    const payload = {
      id: edgeId,
      source: connection.source,
      target: connection.target,
      label: '' // 默认直接静默连线，不弹窗打断，用户双击连线可编辑演进描述
    }
    
    try {
      await saveEdge(workspaceId.value, payload)
      await loadGraph()
      if (recomputeTemplatePrompts) {
        await recomputeTemplatePrompts(workspaceId.value)
      }
      pushHistory()
    } catch (e) {
      console.error('保存连接线失败:', e)
    }
  }

  async function handleNodesDelete(deletedNodes: any[]) {
    if (!workspaceId.value) return
    
    const deletedIds = new Set(deletedNodes.map(n => n.id))
    nodes.value = nodes.value.filter(n => !deletedIds.has(n.id))
    edges.value = edges.value.filter(e => !deletedIds.has(e.source) && !deletedIds.has(e.target))
    
    setVueFlowNodes(nodes.value)
    setVueFlowEdges(edges.value)
    
    for (const node of deletedNodes) {
      try {
        await deleteNode(workspaceId.value, node.id)
      } catch (e) {
        console.error('Delete node failed:', e)
      }
    }
    await recomputeReferenceImages(workspaceId.value)
    if (recomputeTemplatePrompts) {
      await recomputeTemplatePrompts(workspaceId.value)
    }
    pushHistory()
  }

  async function handleEdgesDelete(deletedEdges: any[]) {
    if (!workspaceId.value) return
    
    const deletedIds = new Set(deletedEdges.map(e => e.id))
    edges.value = edges.value.filter(e => !deletedIds.has(e.id))
    
    setVueFlowEdges(edges.value)
    
    for (const edge of deletedEdges) {
      try {
        await deleteEdge(workspaceId.value, edge.id)
      } catch (e) {
        console.warn('Delete edge failed (might be cascaded):', e)
      }
    }
    await recomputeReferenceImages(workspaceId.value)
    if (recomputeTemplatePrompts) {
      await recomputeTemplatePrompts(workspaceId.value)
    }
    pushHistory()
  }

  return {
    handleNodeDragStop,
    handleConnect,
    handleNodesDelete,
    handleEdgesDelete
  }
}
