<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Graph } from '@antv/g6'
import { ElMessage, ElMessageBox } from 'element-plus'
import { groupColor, buildGroupColorMap } from '@/utils/graphColors'
import { useWorkspaceStore } from '@/stores/workspace'
import { useChatStore } from '@/stores/chat'
import AgentSidebar from '@/components/canvas/AgentSidebar.vue'
import { 
  getForceGraphs, 
  saveForceGraph, 
  renameForceGraph, 
  deleteForceGraph, 
  type ForceGraphData 
} from '@/api/workspace.api'

const containerRef = ref<HTMLDivElement>()
let graph: Graph | null = null

// ============================================================
// 聚类模式切换
// ============================================================
const clusterMode = ref<'clique' | 'center' | 'static'>('clique')
const lastForceMode = ref<'clique' | 'center'>('clique')

function toggleForceLayout() {
  if (!hasPositions.value) {
    ElMessage.warning('当前图未指定节点初始坐标，只能使用力导布局')
    return
  }
  if (clusterMode.value !== 'static') {
    clusterMode.value = 'static'
  } else {
    clusterMode.value = lastForceMode.value
  }
}

// ============================================================
// 原始数据 —— Agent 生成的 JSON 格式
// ============================================================
interface GraphNode {
  id: string
  data: { label: string; group: string; _isCenter?: boolean }
  [key: string]: any
}

interface GraphEdge {
  source: string
  target: string
  data: { label: string; _cluster?: boolean }
  [key: string]: any
}

const graphData: { nodes: GraphNode[], edges: GraphEdge[] } = {
  nodes: [
    { id: 'vue3', data: { label: 'Vue 3', group: 'framework' } },
    { id: 'router', data: { label: 'Vue Router', group: 'framework' } },
    { id: 'pinia', data: { label: 'Pinia', group: 'framework' } },
    { id: 'vite', data: { label: 'Vite', group: 'tooling' } },
    { id: 'typescript', data: { label: 'TypeScript', group: 'tooling' } },
    { id: 'eslint', data: { label: 'ESLint', group: 'tooling' } },
    { id: 'electron', data: { label: 'Electron', group: 'platform' } },
    { id: 'chromium', data: { label: 'Chromium', group: 'platform' } },
    { id: 'nodejs', data: { label: 'Node.js', group: 'platform' } },
    { id: 'element', data: { label: 'Element Plus', group: 'ui' } },
    { id: 'g6', data: { label: 'AntV G6', group: 'visualization' } },
  ],
  edges: [
    { source: 'vue3', target: 'vite', data: { label: '构建工具' } },
    { source: 'vue3', target: 'pinia', data: { label: '状态管理' } },
    { source: 'vue3', target: 'router', data: { label: '路由系统' } },
    { source: 'vue3', target: 'element', data: { label: 'UI 组件库' } },
    { source: 'vue3', target: 'electron', data: { label: '桌面壳' } },
    { source: 'vue3', target: 'g6', data: { label: '可视化' } },
    { source: 'vue3', target: 'typescript', data: { label: '类型系统' } },
    { source: 'vite', target: 'typescript', data: { label: '编译支持' } },
    { source: 'vite', target: 'eslint', data: { label: '代码检查' } },
    { source: 'electron', target: 'chromium', data: { label: '渲染引擎' } },
    { source: 'electron', target: 'nodejs', data: { label: '运行时' } },
    { source: 'electron', target: 'vite', data: { label: 'HMR 集成' } },
  ],
}

// ============================================================
// 策略 A: Clique 全连接虚边
// O(n²) 边，但同组节点之间 every pair 都有直接拉力，聚合效果最好
// ============================================================
function enrichClique(data: { nodes: GraphNode[], edges: GraphEdge[] }) {
  const groupMap = new Map<string, string[]>()
  for (const node of data.nodes) {
    const g = node.data?.group || 'default'
    if (!groupMap.has(g)) groupMap.set(g, [])
    groupMap.get(g)!.push(node.id)
  }

  const clusterEdges: typeof data.edges = []
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
function enrichCenter(data: { nodes: GraphNode[], edges: GraphEdge[] }) {
  const groupMap = new Map<string, string[]>()
  for (const node of data.nodes) {
    const g = node.data?.group || 'default'
    if (!groupMap.has(g)) groupMap.set(g, [])
    groupMap.get(g)!.push(node.id)
  }

  const centerNodes: typeof data.nodes = []
  const centerEdges: typeof data.edges = []

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
const layoutConfigs = {
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
    manyBody: {
      strength: (d: any) => (d.data?._isCenter ? 0 : -250),
    },
    center: { strength: 0.05 },
  },
}

// 节点颜色映射 —— 动态根据当前图的 groups 生成，支持任意 group 名称
const groupColors = computed(() => buildGroupColorMap(selectedGraphData.value.nodes))

// 是否有自定义坐标（决定是否显示"原始结构"按钮）
const hasPositions = computed(() =>
  selectedGraphData.value.nodes.some((n: any) => n.x != null && n.y != null)
)

function createGraph(mode: 'clique' | 'center' | 'static') {
  if (!containerRef.value) return
  if (selectedGraphData.value.nodes.length === 0) return

  if (graph) {
    graph.destroy()
    graph = null
  }

  // ── 共用的节点/边样式 (力导模式) ──
  const sharedNodeStyle = {
    labelPlacement: 'bottom' as const,
    labelOffsetY: 8,
    labelFontSize: 13,
    labelFontWeight: 500,
    labelFill: '#555',
    fill: (d: any) => groupColor(d.data?.group),
    shadowColor: 'rgba(0,0,0,0.12)',
    shadowBlur: 8,
  }
  const sharedEdgeStyle = {
    labelFontSize: 11,
    labelFill: '#909399',
    labelBackground: true,
    labelBackgroundFill: '#fff',
    labelBackgroundRadius: 4,
    labelBackgroundOpacity: 0.9,
    labelPadding: [2, 6],
    labelAutoRotate: false,
  }

  if (mode === 'static') {
    // ── 原始结构模式: 按 AI 指定的 x/y 坐标静态渲染 ──
    const rawData = {
      nodes: selectedGraphData.value.nodes.map((n: any) => {
        const xVal = n.x ?? 400 + Math.random() * 100 - 50
        const yVal = n.y ?? 300 + Math.random() * 100 - 50
        return {
          ...n,
          style: {
            ...n.style,
            x: xVal,
            y: yVal,
          },
        }
      }),
      edges: selectedGraphData.value.edges,
    }
    graph = new Graph({
      container: containerRef.value,
      autoFit: 'view',
      data: rawData,
      layout: { type: 'preset' },
      node: {
        style: {
          ...sharedNodeStyle,
          size: 42,
          labelText: (d: any) => d.data?.label || d.id,
          stroke: '#fff',
          lineWidth: 2,
        },
      },
      edge: {
        style: {
          ...sharedEdgeStyle,
          stroke: '#c0c4cc',
          lineWidth: 1.5,
          endArrow: true,
          labelText: (d: any) => d.data?.label || '',
        },
      },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
    })
    graph.render()
    return
  }

  // ── 力导模式 (clique / center) ──
  const enrichedData = mode === 'clique' ? enrichClique(selectedGraphData.value) : enrichCenter(selectedGraphData.value)
  enrichedData.nodes = enrichedData.nodes.map((n: any) => {
    const xVal = n.x != null ? Number(n.x) : undefined
    const yVal = n.y != null ? Number(n.y) : undefined
    return {
      ...n,
      style: {
        ...n.style,
        x: xVal,
        y: yVal,
      },
    }
  })

  graph = new Graph({
    container: containerRef.value,
    autoFit: 'view',
    data: enrichedData,
    layout: layoutConfigs[mode],
    node: {
      style: {
        ...sharedNodeStyle,
        size: (d: any) => (d.data?._isCenter ? 0 : 42),
        labelText: (d: any) => (d.data?._isCenter ? '' : (d.data?.label || d.id)),
        stroke: (d: any) => (d.data?._isCenter ? 'transparent' : '#fff'),
        lineWidth: (d: any) => (d.data?._isCenter ? 0 : 2),
        opacity: (d: any) => (d.data?._isCenter ? 0 : 1),
      },
    },
    edge: {
      style: {
        ...sharedEdgeStyle,
        stroke: (d: any) => (d.data?._cluster ? 'transparent' : '#c0c4cc'),
        lineWidth: (d: any) => (d.data?._cluster ? 0 : 1.5),
        endArrow: (d: any) => !d.data?._cluster,
        labelText: (d: any) => d.data?.label || '',
      },
    },
    behaviors: [
      'drag-canvas',
      'zoom-canvas',
      { type: 'drag-element-force', fixed: false },
    ],
  })

  graph.render()
}

// 切换模式时重建图
watch(clusterMode, async (mode) => {
  if (mode !== 'static') {
    lastForceMode.value = mode
  }
  await nextTick()
  createGraph(mode)
})

// 统计虚边数量用于展示
function countClusterEdges(mode: 'clique' | 'center' | 'static') {
  if (mode === 'static') return 0
  const enriched = mode === 'clique' ? enrichClique(selectedGraphData.value) : enrichCenter(selectedGraphData.value)
  return enriched.edges.filter((e) => e.data?._cluster).length
}

// ============================================================
// 历史记录、Agent侧边栏及文件拖拽逻辑
// ============================================================
const historyList = ref<ForceGraphData[]>([])
const selectedGraphName = ref<string | null>(null)
const selectedGraphData = ref<{ nodes: GraphNode[], edges: GraphEdge[] }>({ nodes: [], edges: [] })

const isRenaming = ref<string | null>(null)
const renameInputVal = ref('')
const agentSidebarCollapsed = ref(false)

const renameInputRef = ref<any>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const workspaceStore = useWorkspaceStore()
const chatStore = useChatStore()

async function loadHistory() {
  try {
    const res = await getForceGraphs()
    if (res.success) {
      historyList.value = res.graphs || []
    }
  } catch (err: any) {
    ElMessage.error(`加载历史列表失败: ${err.message}`)
  }
}

async function selectGraph(name: string) {
  selectedGraphName.value = name
  const item = historyList.value.find(h => h.name === name)
  if (item) {
    selectedGraphData.value = {
      nodes: JSON.parse(JSON.stringify(item.nodes || [])),
      edges: JSON.parse(JSON.stringify(item.edges || []))
    }
    
    // 持久化选中的图名，并加载对应的 Agent 会话历史
    workspaceStore.selectedGraphName = name
    // chatStore.loadChatHistory(name)
    
    await nextTick()
    createGraph(clusterMode.value)
  }
}

// 默认命名算法：找度数（连接边数）最高的节点
function getMostCentralNodeLabel(nodes: GraphNode[], edges: GraphEdge[]): string {
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

function handleDrop(e: DragEvent) {
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  const file = files[0]
  if (!file) return
  if (!file.name.endsWith('.json')) {
    ElMessage.warning('仅支持导入 .json 格式的图数据文件')
    return
  }
  importJsonFile(file)
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0) return
  const file = files[0]
  if (file) {
    importJsonFile(file)
  }
  target.value = ''
}

function importJsonFile(file: File) {
  const reader = new FileReader()
  reader.onload = async (event) => {
    try {
      const content = event.target?.result as string
      const parsed = JSON.parse(content)
      
      let nodes = parsed.nodes
      let edges = parsed.edges || []
      
      if (!nodes || !Array.isArray(nodes)) {
        ElMessage.error('JSON 文件格式不正确，缺少 nodes 数组')
        return
      }
      
      // 判断是否需要 assemble
      let needsAssemble = false
      if (nodes.length > 0) {
        if (!nodes[0].data) {
          needsAssemble = true
        }
      }
      
      let finalNodes = nodes
      let finalEdges = edges
      
      if (needsAssemble) {
        finalNodes = nodes.map((n: any) => ({
          id: n.id,
          data: {
            label: n.label || n.id,
            group: n.group || 'default'
          }
        }))
        finalEdges = edges.map((e: any) => ({
          source: e.source,
          target: e.target,
          data: {
            label: e.label || ''
          }
        }))
      }
      
      const defaultName = getMostCentralNodeLabel(finalNodes, finalEdges)
      
      // 冲突解决
      let finalName = defaultName
      let counter = 1
      while (historyList.value.some(g => g.name === finalName)) {
        finalName = `${defaultName}_${counter}`
        counter++
      }
      
      const res = await saveForceGraph(finalName, finalNodes, finalEdges)
      if (res.success) {
        ElMessage.success(`导入成功，已新增历史力导图: ${finalName}`)
        await loadHistory()
        selectGraph(finalName)
      }
    } catch (err: any) {
      ElMessage.error(`解析 JSON 失败: ${err.message}`)
    }
  }
  reader.readAsText(file)
}

function startRename(name: string) {
  isRenaming.value = name
  renameInputVal.value = name
  nextTick(() => {
    if (renameInputRef.value && renameInputRef.value[0]) {
      const el = renameInputRef.value[0].$el?.querySelector('input') || renameInputRef.value[0].querySelector?.('input')
      if (el) el.focus()
    }
  })
}

async function confirmRename(oldName: string) {
  const newName = renameInputVal.value.trim()
  if (!newName) {
    isRenaming.value = null
    return
  }
  if (newName === oldName) {
    isRenaming.value = null
    return
  }
  if (historyList.value.some(g => g.name === newName)) {
    ElMessage.error('名称已存在')
    return
  }
  
  try {
    const res = await renameForceGraph(oldName, newName)
    if (res.success) {
      ElMessage.success('重命名成功')
      await loadHistory()
      if (selectedGraphName.value === oldName) {
        selectedGraphName.value = newName
        workspaceStore.selectedGraphName = newName
      }
    }
  } catch (err: any) {
    ElMessage.error(`重命名失败: ${err.message}`)
  } finally {
    isRenaming.value = null
  }
}

async function confirmDelete(name: string) {
  try {
    await ElMessageBox.confirm(`确定要删除力导图 "${name}" 吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    const res = await deleteForceGraph(name)
    if (res.success) {
      ElMessage.success('删除成功')
      await loadHistory()
      if (selectedGraphName.value === name) {
        if (historyList.value.length > 0) {
          const firstItem = historyList.value[0]
          if (firstItem) {
            selectGraph(firstItem.name)
          }
        } else {
          selectedGraphName.value = null
          selectedGraphData.value = { nodes: [], edges: [] }
          if (graph) {
            graph.destroy()
            graph = null
          }
        }
      }
    }
  } catch {
    // cancelled
  }
}

// 监听 Agent 完成流，只有当 AI 调用了图工具才重新加载力导图
watch(() => chatStore.chatLoading, async (newLoading) => {
  if (!newLoading && selectedGraphName.value) {
    // 只有最新一轮包含 make_graph / update_graph 工具调用时，才重绘图以避免闪烁
    const usedGraphTool = chatStore.events.some(
      e => (e.type === 'tool_result' || e.type === 'tool_call') &&
           /make_graph|update_graph/.test(e.toolName ?? '')
    )
    if (usedGraphTool) {
      await loadHistory()
      selectGraph(selectedGraphName.value)
    }
  }
})

// 监听侧边栏折叠，折叠后自适应力导图视口
watch(agentSidebarCollapsed, () => {
  setTimeout(() => {
    if (graph) {
      graph.fitView()
    }
  }, 350)
})

// 监听外部 AgentSidebar 下拉框切换的图名（只在有效图名时响应）
watch(() => workspaceStore.selectedGraphName, (newName) => {
  if (newName && newName !== selectedGraphName.value) {
    const exists = historyList.value.some(h => h.name === newName)
    if (exists) {
      selectGraph(newName)
    }
  }
})

onMounted(async () => {
  await loadHistory()
  if (historyList.value.length === 0) {
    const res = await saveForceGraph('Vue 3', graphData.nodes, graphData.edges)
    if (res.success) {
      await loadHistory()
    }
  }
  
  // 从 localStorage 恢复上次选中的图（切页面/刷新后维持选中状态）
  const startGraph = workspaceStore.selectedGraphName
  const exists = startGraph && historyList.value.some(h => h.name === startGraph)
  if (exists) {
    selectGraph(startGraph)
  } else if (historyList.value.length > 0) {
    const firstItem = historyList.value[0]
    if (firstItem) {
      selectGraph(firstItem.name)
    }
  }
})

onBeforeUnmount(() => {
  graph?.destroy()
  graph = null
})
</script>

<template>
  <div 
    class="graph-page-layout"
    @dragover.prevent
    @drop.prevent="handleDrop"
  >
    <!-- 左侧栏：历史力导图列表 -->
    <div class="graph-left-sidebar">
      <div class="sidebar-title-row">
        <span>历史力导图</span>
        <el-tooltip content="导入 JSON 图文件 (支持拖拽至此页面)" placement="top">
          <el-button class="import-btn" type="primary" link @click="triggerFileInput">
            <el-icon class="import-icon"><i-ep-upload /></el-icon>
          </el-button>
        </el-tooltip>
        <input 
          type="file" 
          ref="fileInputRef" 
          style="display: none;" 
          accept=".json"
          @change="handleFileChange"
        />
      </div>
      <div class="history-list scrollable-history">
        <div 
          v-for="item in historyList" 
          :key="item.name" 
          class="history-item"
          :class="{ active: selectedGraphName === item.name }"
          @click="selectGraph(item.name)"
        >
          <el-icon class="graph-icon"><i-ep-share /></el-icon>
          <div class="item-name-wrap">
            <el-input
              v-if="isRenaming === item.name"
              ref="renameInputRef"
              v-model="renameInputVal"
              size="small"
              @blur="confirmRename(item.name)"
              @keyup.enter="confirmRename(item.name)"
              @click.stop
            />
            <span v-else class="item-name" @dblclick.stop="startRename(item.name)" title="双击重命名">
              {{ item.name }}
            </span>
          </div>
          <el-button
            v-if="isRenaming !== item.name"
            class="delete-btn"
            type="danger"
            link
            @click.stop="confirmDelete(item.name)"
          >
            <el-icon><i-ep-delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <!-- 中间：力导图画布区域 -->
    <div class="graph-main-area">
      <div class="graph-toolbar">
        <!-- 统一的力导/原始布局切换按钮 -->
        <el-tooltip
          placement="bottom"
          :show-after="300"
          :content="hasPositions ? '点击切换力导布局与原始结构静态渲染' : '当前图无初始坐标，仅支持力导布局'"
        >
          <el-tag
            :effect="clusterMode !== 'static' ? 'dark' : 'plain'"
            :type="clusterMode !== 'static' ? 'primary' : 'success'"
            class="mode-tag"
            :style="{ cursor: hasPositions ? 'pointer' : 'not-allowed' }"
            @click="toggleForceLayout"
            round
          >
            {{ clusterMode !== 'static' ? '⚡ 力导布局' : '📐 原始结构' }}
          </el-tag>
        </el-tooltip>

        <!-- 仅在力导布局开启时，显示聚类模式（Clique/虚拟中心）切换 -->
        <div class="mode-switch" v-if="selectedGraphData.nodes.length > 0 && clusterMode !== 'static'">
          <!-- 力导布局类型按钮组 -->
          <el-tooltip
            placement="bottom"
            :show-after="300"
          >
            <template #content>
              <div style="max-width: 260px; line-height: 1.6">
                <b>Clique 全连接</b><br />
                同组节点两两相连（不可见），每对都有直接拉力。<br />
                聚合效果最好，但边数为 O(n²)。<br />
                当前虚边数: <b>{{ countClusterEdges('clique') }}</b>
              </div>
            </template>
            <el-tag
              :effect="clusterMode === 'clique' ? 'dark' : 'plain'"
              :type="clusterMode === 'clique' ? 'primary' : 'info'"
              class="mode-tag"
              @click="clusterMode = 'clique'"
              round
            >
              Clique 聚类
            </el-tag>
          </el-tooltip>

          <el-tooltip
            placement="bottom"
            :show-after="300"
          >
            <template #content>
              <div style="max-width: 260px; line-height: 1.6">
                <b>虚拟中心节点</b><br />
                每组插入一个不可见的中心节点，成员连到中心。<br />
                边数为 O(n)，但中心位置是被动平衡，<br />
                无法精确收敛到组内高出度节点。<br />
                当前虚边数: <b>{{ countClusterEdges('center') }}</b>
              </div>
            </template>
            <el-tag
              :effect="clusterMode === 'center' ? 'dark' : 'plain'"
              :type="clusterMode === 'center' ? 'primary' : 'info'"
              class="mode-tag"
              @click="clusterMode = 'center'"
              round
            >
              虚拟中心
            </el-tag>
          </el-tooltip>
        </div>

        <!-- 图例 -->
        <div class="graph-legend">
          <span v-for="(color, group) in groupColors" :key="group" class="legend-item">
            <i :style="{ background: color }" class="legend-dot" />
            {{ group }}
          </span>
        </div>
      </div>

      <div ref="containerRef" class="graph-container">
        <div v-if="selectedGraphData.nodes.length === 0" class="empty-graph-tip">
          <el-icon class="empty-icon"><i-ep-share /></el-icon>
          <span>暂无图数据，请导入 JSON 文件或直接将文件拖拽至此页面</span>
        </div>
      </div>
    </div>

    <!-- 右侧：Agent 协同窗口 -->
    <div 
      class="graph-right-sidebar"
      :class="{ collapsed: agentSidebarCollapsed }"
    >
      <!-- 中段折叠拉伸页签 -->
      <div 
        class="collapse-handle" 
        @click="agentSidebarCollapsed = !agentSidebarCollapsed"
        :title="agentSidebarCollapsed ? '展开 Agent 栏' : '折叠 Agent 栏'"
      >
        <el-icon>
          <i-ep-arrow-left v-if="agentSidebarCollapsed" />
          <i-ep-arrow-right v-else />
        </el-icon>
      </div>

      <div class="agent-sidebar-wrapper">
        <AgentSidebar />
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-page-layout {
  display: flex;
  flex-direction: row;
  height: calc(100vh - 60px - 40px); /* 扣除 Header 和 Padding */
  margin: -20px; /* 抵消 el-main 默认 20px padding 实现全屏填充 */
  overflow: hidden;
  background: #f8fafc;
}

/* 左侧历史列表 */
.graph-left-sidebar {
  width: 240px;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.import-icon {
  font-size: 16px;
  color: #6366f1;
}

.scrollable-history {
  flex: 1;
  overflow-y: auto;
  padding: 12px 8px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: 6px;
  position: relative;
  border: 1px solid transparent;
}

.history-item:hover {
  background-color: #f1f5f9;
}

.history-item.active {
  background-color: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.15);
  color: #6366f1;
}

.graph-icon {
  font-size: 14px;
  color: #94a3b8;
}

.history-item.active .graph-icon {
  color: #6366f1;
}

.item-name-wrap {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.delete-btn {
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
  padding: 0;
  margin-left: 4px;
  height: auto;
  color: #94a3b8;
}

.history-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  color: #ef4444 !important;
}

/* 中间主画布 */
.graph-main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  min-width: 0;
  height: 100%;
}

.graph-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.mode-switch {
  display: flex;
  gap: 6px;
}

.mode-tag {
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.mode-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.graph-legend {
  display: flex;
  gap: 14px;
  margin-left: auto;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #606266;
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.graph-container {
  flex: 1;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
  min-height: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-graph-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #94a3b8;
  font-size: 14px;
}

.empty-icon {
  font-size: 32px;
  color: #cbd5e1;
}

/* 右侧 Agent */
.graph-right-sidebar {
  position: relative;
  width: 320px;
  background: #ffffff;
  border-left: 1px solid #e2e8f0;
  height: 100%;
  flex-shrink: 0;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-left 0.3s ease;
}

.graph-right-sidebar.collapsed {
  width: 0 !important;
  border-left: none;
}

.agent-sidebar-wrapper {
  width: 320px;
  height: 100%;
  overflow: hidden;
}

/* 中段拉出拉回页签 */
.collapse-handle {
  position: absolute;
  left: -20px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 60px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-right: none;
  border-radius: 8px 0 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 100;
  box-shadow: -3px 0 10px rgba(0, 0, 0, 0.05);
  transition: background-color 0.2s, color 0.2s;
  color: #64748b;
}

.collapse-handle:hover {
  background-color: #f8fafc;
  color: #6366f1;
}
</style>
