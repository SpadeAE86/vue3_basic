// src/utils/graphHelpers.ts — 力导关系图的数据处理与排版算法辅助工具

export interface GraphNode {
  id: string
  data: { label: string; group: string; _isCenter?: boolean }
  [key: string]: any
}

export interface GraphEdge {
  source: string
  target: string
  data: { label: string; _cluster?: boolean }
  [key: string]: any
}

// ============================================================
// 策略 A: Clique 全连接虚边
// O(n²) 边，但同组节点之间 every pair 都有直接拉力，聚合效果最好
// ============================================================
export function enrichClique(data: { nodes: GraphNode[], edges: GraphEdge[] }) {
  const groupMap = new Map<string, string[]>()
  for (const node of data.nodes) {
    const g = node.data?.group || 'default'
    if (!groupMap.has(g)) groupMap.set(g, [])
    groupMap.get(g)!.push(node.id)
  }

  const clusterEdges: GraphEdge[] = []
  for (const [, ids] of groupMap) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const exists = data.edges.some(
          (e) =>
            (e.source === ids[i] && e.target === ids[j]) ||
            (e.source === ids[j] && e.target === ids[i]),
        )
        if (!exists) {
          clusterEdges.push({
            source: ids[i] as string,
            target: ids[j] as string,
            data: { label: '', _cluster: true },
          })
        }
      }
    }
  }
  return { nodes: [...data.nodes], edges: [...data.edges, ...clusterEdges] }
}

// ============================================================
// 策略 B: 虚拟中心节点
// O(n) 边，可扩展性好，但 center 位置是被动平衡，聚合效果较弱
// ============================================================
export function enrichCenter(data: { nodes: GraphNode[], edges: GraphEdge[] }) {
  const groupMap = new Map<string, string[]>()
  for (const node of data.nodes) {
    const g = node.data?.group || 'default'
    if (!groupMap.has(g)) groupMap.set(g, [])
    groupMap.get(g)!.push(node.id)
  }

  const centerNodes: GraphNode[] = []
  const centerEdges: GraphEdge[] = []

  for (const [group, ids] of groupMap) {
    const centerId = `__center_${group}`
    centerNodes.push({
      id: centerId,
      data: { label: '', group, _isCenter: true },
    })
    for (const nodeId of ids) {
      centerEdges.push({
        source: centerId,
        target: nodeId,
        data: { label: '', _cluster: true },
      })
    }
  }

  return {
    nodes: [...data.nodes, ...centerNodes],
    edges: [...data.edges, ...centerEdges],
  }
}

// ============================================================
// 布局参数 —— 两种模式用不同的力参数
// ============================================================
export const layoutConfigs = {
  clique: {
    type: 'd3-force' as const,
    animated: true,
    preventOverlap: true,
    link: {
      distance: (edge: any) => (edge.data?._cluster ? 60 : 180),
      strength: (edge: any) => (edge.data?._cluster ? 0.4 : 0.15),
    },
    collide: { radius: 50, strength: 0.8 },
    manyBody: { strength: -300 },
    center: { strength: 0.05 },
  },
  center: {
    type: 'd3-force' as const,
    animated: true,
    preventOverlap: true,
    link: {
      distance: (edge: any) => (edge.data?._cluster ? 30 : 200),
      strength: (edge: any) => (edge.data?._cluster ? 1.2 : 0.05),
    },
    collide: { radius: 40, strength: 0.9 },
    manyBody: { strength: (d: any) => (d.data?._isCenter ? 0 : -250) },
    center: { strength: 0.05 },
  },
}

// ============================================================
// 默认命名算法：找度数（连接边数）最高的节点
// ============================================================
export function getMostCentralNodeLabel(nodes: GraphNode[], edges: GraphEdge[]): string {
  if (!nodes || nodes.length === 0) return '未命名力导图'
  
  const degreeMap: Record<string, number> = {}
  for (const node of nodes) {
    degreeMap[node.id] = 0
  }
  
  for (const edge of edges) {
    if (degreeMap[edge.source] !== undefined) {
      degreeMap[edge.source] = (degreeMap[edge.source] || 0) + 1
    }
    if (degreeMap[edge.target] !== undefined) {
      degreeMap[edge.target] = (degreeMap[edge.target] || 0) + 1
    }
  }
  
  let maxDegree = -1
  let centralNodeId = ''
  for (const node of nodes) {
    const deg = degreeMap[node.id] || 0
    if (deg > maxDegree) {
      maxDegree = deg
      centralNodeId = node.id
    }
  }
  
  const centralNode = nodes.find(n => n.id === centralNodeId)
  if (centralNode) {
    return centralNode.data?.label || centralNode.id
  }
  
  const firstNode = nodes[0]
  if (firstNode) {
    return firstNode.data?.label || firstNode.id
  }
  return '未命名力导图'
}
