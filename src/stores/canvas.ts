import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getWorkspaceGraph } from '@/api/workspace.api'
import { saveNode as apiSaveNode, deleteNode as apiDeleteNode } from '@/api/node.api'
import { saveEdge as apiSaveEdge, deleteEdge as apiDeleteEdge } from '@/api/edge.api'
import { useVueFlow } from '@vue-flow/core'

export const useCanvasStore = defineStore('canvas', () => {
  const nodes = ref<any[]>([])
  const edges = ref<any[]>([])
  const loading = ref(false)
  
  // 用于撤销的快照栈
  const historyStack = ref<Array<{ nodes: any[]; edges: any[] }>>([])
  // 用于重做的快照栈
  const redoStack = ref<Array<{ nodes: any[]; edges: any[] }>>([])

  // 连线中或刚刚完成连线的标志，用于阻止 outside click 引起的折叠
  const isConnectingOrJustConnected = ref(false)
  // 保存节点的展开状态，防止重载图时重新挂载丢失状态
  const expandedNodes = ref<Record<string, boolean>>({})
  // 是否显示节点 #id 的全局开关
  const showNodeId = ref(false)

  function pushHistory() {
    // 仅深拷贝核心干净属性，避免 VueFlow 内部复杂循环引用代理导致序列化失败
    const cleanNodes = nodes.value.map(n => ({
      id: n.id,
      type: n.type,
      position: { x: n.position.x, y: n.position.y },
      data: JSON.parse(JSON.stringify(n.data || {}))
    }))
    
    const cleanEdges = edges.value.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || ''
    }))

    const snapshot = {
      nodes: cleanNodes,
      edges: cleanEdges
    }
    
    if (historyStack.value.length > 0) {
      const last = historyStack.value[historyStack.value.length - 1]
      if (JSON.stringify(last) === JSON.stringify(snapshot)) {
        return
      }
    }
    
    historyStack.value.push(snapshot)
    redoStack.value = [] // 每次有新历史，清空重做栈
    if (historyStack.value.length > 50) {
      historyStack.value.shift()
    }
  }

  async function recomputeReferenceImages(workspaceId: string) {
    const genNodes = nodes.value.filter(n => n.type === 'gen_node')
    let hasChanged = false
    
    for (const genNode of genNodes) {
      const parentUrls: string[] = []
      edges.value.forEach(edge => {
        if (edge.target === genNode.id) {
          const parentNode = nodes.value.find(n => n.id === edge.source)
          if (parentNode && parentNode.data?.image_url) {
            parentUrls.push(parentNode.data.image_url)
          }
        }
      })
      
      const oldImages = genNode.data.reference_images || []
      if (JSON.stringify(oldImages) !== JSON.stringify(parentUrls)) {
        genNode.data.reference_images = parentUrls
        hasChanged = true
        await apiSaveNode(workspaceId, {
          id: genNode.id,
          type: genNode.type || 'gen_node',
          x: genNode.position.x,
          y: genNode.position.y,
          data: genNode.data
        })
      }
    }
    return hasChanged
  }

  async function loadGraph(workspaceId: string) {
    if (!workspaceId) return
    loading.value = true
    try {
      const { setNodes, setEdges } = useVueFlow()
      const data = await getWorkspaceGraph(workspaceId)
      
      // 转换节点格式为 Vue Flow 格式
      const rawNodes = data.nodes || []
      
      // 找出当前已有的最大 display_id
      let maxDisplayId = 0
      rawNodes.forEach((n: any) => {
        if (n.data?.display_id && n.data.display_id > maxDisplayId) {
          maxDisplayId = n.data.display_id
        }
      })
      
      const vueFlowNodes = []
      for (const n of rawNodes) {
        const nodeData = { ...(n.data || {}) }
        let needsSave = false
        if (!nodeData.display_id) {
          maxDisplayId++
          nodeData.display_id = maxDisplayId
          needsSave = true
        }
        
        const vueFlowNode = {
          id: n.id,
          type: n.type || 'image_node',
          position: { x: n.x, y: n.y },
          data: nodeData,
        }
        vueFlowNodes.push(vueFlowNode)
        
        if (needsSave) {
          apiSaveNode(workspaceId, {
            id: n.id,
            type: n.type || 'image_node',
            x: n.x,
            y: n.y,
            data: nodeData
          }).catch(err => console.error('补齐 display_id 失败:', err))
        }
      }
      
      // 转换连线格式为 Vue Flow 格式
      const rawEdges = data.edges || []
      const vueFlowEdges = rawEdges.map((e: any) => ({
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        label: e.label || '',
        animated: true,
        type: 'default',
        style: { stroke: '#6366f1', strokeWidth: 2 },
      }))
      
      nodes.value = vueFlowNodes
      edges.value = vueFlowEdges
      
      setNodes(vueFlowNodes)
      setEdges(vueFlowEdges)

      // 同步生图节点连线参考图关系
      await recomputeReferenceImages(workspaceId)
      
      if (historyStack.value.length === 0) {
        pushHistory()
      }
      return data.workspace.name
    } catch (e) {
      console.error('加载拓扑图失败:', e)
    } finally {
      loading.value = false
    }
  }

  async function addGenNode(workspaceId: string) {
    const nodeId = `gen_${Math.random().toString(36).substring(2, 8)}`
    const x = Math.random() * 100 + 150
    const y = Math.random() * 100 + 150
    
    const maxId = nodes.value.reduce((max, n) => {
      const did = n.data?.display_id || 0
      return did > max ? did : max
    }, 0)
    
    const payload = {
      id: nodeId,
      type: 'gen_node',
      x,
      y,
      data: {
        display_id: maxId + 1,
        status: undefined,
        prompt: '',
        model: 'Seedream 5.0',
        ratio: '9:16',
        sizeLevel: '2K',
        image_url: ''
      }
    }
    
    await apiSaveNode(workspaceId, payload)
    await loadGraph(workspaceId)
    pushHistory()
  }

  async function addImageCardNode(workspaceId: string) {
    const nodeId = `card_${Math.random().toString(36).substring(2, 8)}`
    const x = Math.random() * 100 + 150
    const y = Math.random() * 100 + 150
    
    const maxId = nodes.value.reduce((max, n) => {
      const did = n.data?.display_id || 0
      return did > max ? did : max
    }, 0)
    
    const payload = {
      id: nodeId,
      type: 'image_card',
      x,
      y,
      data: {
        display_id: maxId + 1,
        image_url: '',
        prompt: '',
        media_type: 'image'
      }
    }
    
    await apiSaveNode(workspaceId, payload)
    await loadGraph(workspaceId)
    pushHistory()
  }

  async function recomputeTemplatePrompts(workspaceId: string) {
    const genNodes = nodes.value.filter(n => n.type === 'gen_node')
    let hasChanged = false
    
    for (const genNode of genNodes) {
      const parentTemplates: any[] = []
      edges.value.forEach(edge => {
        if (edge.target === genNode.id) {
          const parentNode = nodes.value.find(n => n.id === edge.source)
          if (parentNode && parentNode.type === 'prompt_template') {
            parentTemplates.push(parentNode)
          }
        }
      })
      
      // 如果断开所有模板连线
      if (parentTemplates.length === 0) {
        if (genNode.data.original_prompt !== undefined) {
          genNode.data.prompt = genNode.data.original_prompt
          delete genNode.data.original_prompt
          hasChanged = true
          await apiSaveNode(workspaceId, {
            id: genNode.id,
            type: genNode.type || 'gen_node',
            x: genNode.position.x,
            y: genNode.position.y,
            data: genNode.data
          })
        }
        continue
      }
      
      // 如果有模板连入且尚未备份 original_prompt
      if (genNode.data.original_prompt === undefined) {
        genNode.data.original_prompt = genNode.data.prompt || ''
      }
      
      // 按 X 坐标从小到大排序
      parentTemplates.sort((a, b) => a.position.x - b.position.x)
      
      const templateValues = genNode.data.template_values || {}
      const mergedPromptParts: string[] = []
      
      parentTemplates.forEach(tplNode => {
        const tplText = tplNode.data.template_text || ''
        const resolvedText = tplText.replace(/\{([^:]+):\s*([^}]+)\}/g, (match: string, varName: string, defaultValue: string) => {
          const key = varName.trim()
          return templateValues[key] !== undefined ? templateValues[key] : defaultValue.trim()
        })
        if (resolvedText.trim()) {
          mergedPromptParts.push(resolvedText.trim())
        }
      })
      
      const newResolvedPrompt = mergedPromptParts.join(', ')
      if (genNode.data.prompt !== newResolvedPrompt) {
        genNode.data.prompt = newResolvedPrompt
        hasChanged = true
        await apiSaveNode(workspaceId, {
          id: genNode.id,
          type: genNode.type || 'gen_node',
          x: genNode.position.x,
          y: genNode.position.y,
          data: genNode.data
        })
      }
    }
    return hasChanged
  }

  async function addPromptTemplateNode(workspaceId: string) {
    const nodeId = `template_${Math.random().toString(36).substring(2, 8)}`
    const x = Math.random() * 100 + 150
    const y = Math.random() * 100 + 150
    
    const maxId = nodes.value.reduce((max, n) => {
      const did = n.data?.display_id || 0
      return did > max ? did : max
    }, 0)
    
    const payload = {
      id: nodeId,
      type: 'prompt_template',
      x,
      y,
      data: {
        display_id: maxId + 1,
        name: '未命名模板',
        template_text: 'generate a Japanese animation {角色: girl}, who has beautiful {发色: brown} hair and {瞳色: brown} eyes like Yuki Asuna, add some {节日: Christmas} element to her such as {物品: present} or {风格: magical style}'
      }
    }
    
    await apiSaveNode(workspaceId, payload)
    await loadGraph(workspaceId)
    pushHistory()
  }

  async function saveNode(workspaceId: string, node: any) {
    await apiSaveNode(workspaceId, node)
  }

  async function deleteNode(workspaceId: string, nodeId: string) {
    await apiDeleteNode(workspaceId, nodeId)
  }

  async function saveEdge(workspaceId: string, edge: any) {
    await apiSaveEdge(workspaceId, edge)
  }

  async function deleteEdge(workspaceId: string, edgeId: string) {
    await apiDeleteEdge(workspaceId, edgeId)
  }

  return {
    nodes,
    edges,
    loading,
    historyStack,
    redoStack,
    isConnectingOrJustConnected,
    expandedNodes,
    showNodeId,
    pushHistory,
    recomputeReferenceImages,
    recomputeTemplatePrompts,
    loadGraph,
    addGenNode,
    addImageCardNode,
    addPromptTemplateNode,
    saveNode,
    deleteNode,
    saveEdge,
    deleteEdge
  }
})
