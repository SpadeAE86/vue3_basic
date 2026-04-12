<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Graph } from '@antv/g6'

const containerRef = ref<HTMLDivElement>()
let graph: Graph | null = null

// ============================================================
// 聚类模式切换
// ============================================================
const clusterMode = ref<'clique' | 'center'>('clique')

// ============================================================
// 原始数据 —— Agent 生成的 JSON 格式
// ============================================================
const graphData = {
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
function enrichClique(data: typeof graphData) {
  const groupMap = new Map<string, string[]>()
  for (const node of data.nodes) {
    const g = node.data.group
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
            source: ids[i],
            target: ids[j],
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
function enrichCenter(data: typeof graphData) {
  const groupMap = new Map<string, string[]>()
  for (const node of data.nodes) {
    const g = node.data.group
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

// 节点颜色映射
const groupColors: Record<string, string> = {
  framework: '#6366f1',
  tooling: '#f59e0b',
  platform: '#8b5cf6',
  ui: '#ec4899',
  visualization: '#14b8a6',
}

function createGraph(mode: 'clique' | 'center') {
  if (!containerRef.value) return

  // 销毁旧图
  if (graph) {
    graph.destroy()
    graph = null
  }

  const enrichedData = mode === 'clique' ? enrichClique(graphData) : enrichCenter(graphData)

  graph = new Graph({
    container: containerRef.value,
    autoFit: 'view',
    data: enrichedData,
    layout: layoutConfigs[mode],
    node: {
      style: {
        size: (d: any) => (d.data?._isCenter ? 0 : 42),
        labelText: (d: any) => {
          if (d.data?._isCenter) return ''
          return d.data?.label || d.id
        },
        labelPlacement: 'bottom',
        labelOffsetY: 8,
        labelFontSize: 13,
        labelFontWeight: 500,
        labelFill: '#555',
        fill: (d: any) => groupColors[d.data?.group] || '#6366f1',
        stroke: (d: any) => (d.data?._isCenter ? 'transparent' : '#fff'),
        lineWidth: (d: any) => (d.data?._isCenter ? 0 : 2),
        shadowColor: 'rgba(0,0,0,0.12)',
        shadowBlur: 8,
        opacity: (d: any) => (d.data?._isCenter ? 0 : 1),
      },
    },
    edge: {
      style: {
        stroke: (d: any) => (d.data?._cluster ? 'transparent' : '#c0c4cc'),
        lineWidth: (d: any) => (d.data?._cluster ? 0 : 1.5),
        endArrow: (d: any) => !d.data?._cluster,
        labelText: (d: any) => d.data?.label || '',
        labelFontSize: 11,
        labelFill: '#909399',
        labelBackground: true,
        labelBackgroundFill: '#fff',
        labelBackgroundRadius: 4,
        labelBackgroundOpacity: 0.9,
        labelPadding: [2, 6],
      },
    },
    behaviors: [
      'drag-canvas',
      'zoom-canvas',
      {
        type: 'drag-element-force',
        fixed: false,
      },
    ],
  })

  graph.render()
}

// 切换模式时重建图
watch(clusterMode, async (mode) => {
  await nextTick()
  createGraph(mode)
})

onMounted(() => {
  createGraph(clusterMode.value)
})

onBeforeUnmount(() => {
  graph?.destroy()
  graph = null
})

// 统计虚边数量用于展示
function countClusterEdges(mode: 'clique' | 'center') {
  const enriched = mode === 'clique' ? enrichClique(graphData) : enrichCenter(graphData)
  return enriched.edges.filter((e) => e.data?._cluster).length
}
</script>

<template>
  <div class="graph-page">
    <div class="graph-toolbar">
      <el-tag effect="dark" round>力导布局</el-tag>

      <!-- 聚类模式切换 -->
      <div class="mode-switch">
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

    <div ref="containerRef" class="graph-container" />
  </div>
</template>

<style scoped>
.graph-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.graph-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 0 12px 0;
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
}
</style>
