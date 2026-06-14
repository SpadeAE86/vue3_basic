<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Graph } from '@antv/g6'
import { groupColor } from '@/utils/graphColors'

const props = defineProps<{
  nodes: any[]
  edges: any[]
}>()

const containerRef = ref<HTMLDivElement>()
let graph: Graph | null = null

onMounted(() => {
  if (!containerRef.value) return
  
  // Clean up data for G6
  const cleanNodes = props.nodes.map(n => ({
    id: n.id,
    data: {
      label: n.data?.label || n.id,
      group: n.data?.group || 'default'
    }
  }))
  
  const cleanEdges = props.edges.map(e => ({
    source: e.source,
    target: e.target,
    data: {
      label: e.data?.label || ''
    }
  }))

  graph = new Graph({
    container: containerRef.value,
    width: 294,
    height: 180,
    autoFit: 'view',
    data: { nodes: cleanNodes, edges: cleanEdges },
    layout: {
      type: 'd3-force',
      animated: false,
      preventOverlap: true,
      link: { distance: 60, strength: 0.3 },
      collide: { radius: 25 },
      manyBody: { strength: -80 },
    },
    node: {
      style: {
        size: 20,
        labelText: (d: any) => d.data?.label || d.id,
        labelPlacement: 'bottom',
        labelFontSize: 8,
        labelFill: '#666',
        fill: (d: any) => groupColor(d.data?.group),
        stroke: '#fff',
        lineWidth: 1,
      }
    },
    edge: {
      style: {
        stroke: '#cbd5e1',
        lineWidth: 1,
        endArrow: true
      }
    },
    behaviors: ['drag-canvas', 'zoom-canvas']
  })
  
  graph.render()
})

onBeforeUnmount(() => {
  if (graph) {
    graph.destroy()
    graph = null
  }
})
</script>

<template>
  <div ref="containerRef" class="mini-graph-canvas" />
</template>

<style scoped>
.mini-graph-canvas {
  width: 100%;
  height: 180px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}
</style>
