import { type Ref } from 'vue'
import { saveNode, deleteNode } from '@/api/node.api'
import { saveEdge, deleteEdge } from '@/api/edge.api'
import { ElMessage } from 'element-plus'
import { useVueFlow } from '@vue-flow/core'

export function useCanvasHistory(
  nodes: Ref<any[]>,
  edges: Ref<any[]>,
  workspaceId: Ref<string>,
  historyStack: Ref<Array<{ nodes: any[]; edges: any[] }>>,
  redoStack: Ref<Array<{ nodes: any[]; edges: any[] }>>,
  loadGraph: (workspaceId: string) => Promise<any>
) {
  const { setNodes, setEdges } = useVueFlow()
  
  // 后台数据库同步串行 Promise 链，防止快速连续撤销时的竞态条件
  let syncQueue = Promise.resolve()

  // 辅助函数：将干净的连线数据格式化为带有自定义样式的 VueFlow 连线格式
  function formatEdges(edgesList: any[], nodesList: any[]) {
    return edgesList.map(e => {
      const sourceNode = nodesList.find(n => n.id === e.source)
      const isVideoNode = sourceNode?.data?.media_type === 'video'
      const isTemplate = sourceNode?.type === 'prompt_template'
      
      let strokeColor = '#cbd5e1'
      let edgeClass = 'edge-default-style'
      if (isTemplate) {
        strokeColor = '#8b5cf6'
        edgeClass = 'edge-template-style'
      } else if (isVideoNode) {
        strokeColor = 'url(#video-edge-gradient)'
        edgeClass = 'edge-video-style'
      } else {
        strokeColor = '#f59e0b'
        edgeClass = 'edge-image-style'
      }

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || '',
        animated: true,
        type: 'default',
        class: edgeClass,
        style: { 
          stroke: strokeColor, 
          strokeWidth: 2 
        },
      }
    })
  }

  // 差分同步历史状态到数据库，仅向后端发送发生了变动的节点和边
  async function applyState(
    prevState: { nodes: any[]; edges: any[] },
    currentNodes: any[],
    currentEdges: any[]
  ) {
    try {
      const prevNodeIds = new Set(prevState.nodes.map((n: any) => n.id))
      const prevEdgeIds = new Set(prevState.edges.map((e: any) => e.id))
      
      // 1. 删除数据库中多出来的节点（存在于当前状态但不存在于历史状态）
      const deleteNodePromises = currentNodes
        .filter(node => !prevNodeIds.has(node.id))
        .map(node => deleteNode(workspaceId.value, node.id))
      
      // 2. 保存/更新剩下的节点（仅当节点位置、类型或数据发生变化时才调用 API）
      const saveNodePromises = prevState.nodes
        .filter(node => {
          const currentNode = currentNodes.find(n => n.id === node.id)
          if (!currentNode) return true // 历史中有但当前没有，说明是被删除后需要恢复的节点，必须保存
          
          const posChanged = currentNode.position.x !== node.position.x || currentNode.position.y !== node.position.y
          const dataChanged = JSON.stringify(currentNode.data || {}) !== JSON.stringify(node.data || {})
          const typeChanged = currentNode.type !== node.type
          
          return posChanged || dataChanged || typeChanged
        })
        .map(node => {
          const payload = {
            id: node.id,
            type: node.type,
            x: node.position.x,
            y: node.position.y,
            data: node.data
          }
          return saveNode(workspaceId.value, payload)
        })
      
      // 3. 删除数据库中多出来的边（存在于当前状态但不存在于历史状态）
      const deleteEdgePromises = currentEdges
        .filter(edge => !prevEdgeIds.has(edge.id))
        .map(edge => deleteEdge(workspaceId.value, edge.id))
      
      // 4. 保存剩下的边（仅当边的源、目标或演进词变化时才调用 API）
      const saveEdgePromises = prevState.edges
        .filter(edge => {
          const currentEdge = currentEdges.find(e => e.id === edge.id)
          if (!currentEdge) return true // 历史中有但当前没有，说明是需要恢复的边，必须保存
          
          const changed = currentEdge.source !== edge.source || 
                          currentEdge.target !== edge.target || 
                          currentEdge.label !== edge.label
          return changed
        })
        .map(edge => {
          const payload = {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.label
          }
          return saveEdge(workspaceId.value, payload)
        })
      
      // 并行执行所有的差分数据库请求
      await Promise.all([
        ...deleteNodePromises,
        ...saveNodePromises,
        ...deleteEdgePromises,
        ...saveEdgePromises
      ])
    } catch (e) {
      console.error('Apply state sync failed:', e)
      throw e
    }
  }

  // 瞬间渲染历史状态并触发异步差分同步
  function restoreState(prevState: { nodes: any[]; edges: any[] }) {
    const currentNodes = [...nodes.value]
    const currentEdges = [...edges.value]

    // 1. 瞬间生成完全的本地视图状态
    const restoredNodes = prevState.nodes.map(n => ({
      id: n.id,
      type: n.type,
      position: { x: n.position.x, y: n.position.y },
      data: JSON.parse(JSON.stringify(n.data || {}))
    }))
    
    const restoredEdges = formatEdges(prevState.edges, restoredNodes)
    
    // 2. 同步更新 Pinia Store 以及 Vue Flow 画布，保证秒切无卡顿
    nodes.value = restoredNodes
    edges.value = restoredEdges
    setNodes(restoredNodes)
    setEdges(restoredEdges)
    
    // 3. 加入后台数据库串行序列，防止连续点击时的竞态
    syncQueue = syncQueue
      .then(() => applyState(prevState, currentNodes, currentEdges))
      .catch(err => {
        console.error('Background DB sync failed:', err)
        ElMessage.warning('本地历史已恢复，但后台同步数据库失败，请刷新检查。')
      })
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
      restoreState(prevState)
      ElMessage.success('已撤销上一步操作')
    } catch (e) {
      ElMessage.error('撤销执行异常')
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
      restoreState(nextState)
      ElMessage.success('已重做上一步操作')
    } catch (e) {
      ElMessage.error('重做执行异常')
    }
  }

  return {
    undo,
    redo
  }
}
