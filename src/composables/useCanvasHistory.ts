import { type Ref } from 'vue'
import { saveNode, deleteNode } from '@/api/node.api'
import { saveEdge, deleteEdge } from '@/api/edge.api'
import { ElMessage } from 'element-plus'

export function useCanvasHistory(
  nodes: Ref<any[]>,
  edges: Ref<any[]>,
  workspaceId: Ref<string>,
  historyStack: Ref<Array<{ nodes: any[]; edges: any[] }>>,
  redoStack: Ref<Array<{ nodes: any[]; edges: any[] }>>,
  loadGraph: (workspaceId: string) => Promise<any>
) {
  async function applyState(prevState: { nodes: any[]; edges: any[] }) {
    try {
      const prevNodeIds = new Set(prevState.nodes.map((n: any) => n.id))
      const prevEdgeIds = new Set(prevState.edges.map((e: any) => e.id))
      
      // 1. 删除数据库中多出来的节点
      const currentNodes = [...nodes.value]
      for (const node of currentNodes) {
        if (!prevNodeIds.has(node.id)) {
          await deleteNode(workspaceId.value, node.id)
        }
      }
      
      // 2. 保存/更新剩下的节点
      for (const node of prevState.nodes) {
        const payload = {
          id: node.id,
          type: node.type,
          x: node.position.x,
          y: node.position.y,
          data: node.data
        }
        await saveNode(workspaceId.value, payload)
      }
      
      // 3. 删除数据库中多出来的边
      const currentEdges = [...edges.value]
      for (const edge of currentEdges) {
        if (!prevEdgeIds.has(edge.id)) {
          await deleteEdge(workspaceId.value, edge.id)
        }
      }
      
      // 4. 保存剩下的边
      for (const edge of prevState.edges) {
        const payload = {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label
        }
        await saveEdge(workspaceId.value, payload)
      }
      
      // 5. 调用 loadGraph 重新加载图，以完全同步前端视图和关系
      await loadGraph(workspaceId.value)
    } catch (e) {
      console.error('Apply state sync failed:', e)
      throw e
    }
  }

  async function undo() {
    if (!workspaceId.value) return
    if (historyStack.value.length <= 1) {
      ElMessage.info('没有更多可以撤销的操作了')
      return
    }
    
    const current = historyStack.value.pop()
    if (current) {
      redoStack.value.push(current)
    }
    
    const prevState = historyStack.value[historyStack.value.length - 1]
    if (!prevState) return
    
    try {
      await applyState(prevState)
      ElMessage.success('已撤销上一步操作')
    } catch (e) {
      ElMessage.error('撤销数据库同步失败')
    }
  }

  async function redo() {
    if (!workspaceId.value) return
    if (redoStack.value.length === 0) {
      ElMessage.info('没有可以重做的操作了')
      return
    }
    
    const nextState = redoStack.value.pop()
    if (!nextState) return
    
    historyStack.value.push(nextState)
    
    try {
      await applyState(nextState)
      ElMessage.success('已重做上一步操作')
    } catch (e) {
      ElMessage.error('重做数据库同步失败')
    }
  }

  return {
    undo,
    redo
  }
}
