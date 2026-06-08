<script setup lang="ts">
import { watch, onMounted, onBeforeUnmount, ref, nextTick, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '@/stores/workspace'
import { useCanvasStore } from '@/stores/canvas'
import { VueFlow, useVueFlow, SelectionMode } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import ImageNode from '@/components/canvas/ImageNode.vue'
import ImageCardNode from '@/components/canvas/ImageCardNode.vue'
import GenNode from '@/components/canvas/GenNode.vue'
import PromptTemplateNode from '@/components/canvas/PromptTemplateNode.vue'
import { useCanvasHistory } from '@/composables/useCanvasHistory'
import { useCanvasImport } from '@/composables/useCanvasImport'
import { useCanvasInteractions } from '@/composables/useCanvasInteractions'
import * as nodeService from '@/services/node.service'
import { ElMessage, ElMessageBox } from 'element-plus'

// 导入 Vue Flow 样式
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'

const workspaceStore = useWorkspaceStore()
const canvasStore = useCanvasStore()

const { selectedWorkspaceId } = storeToRefs(workspaceStore)
const { nodes, edges, historyStack } = storeToRefs(canvasStore)

const { setNodes, setEdges, setViewport, project, fitView, userSelectionActive, viewport } = useVueFlow()

const containerRef = ref<HTMLElement | null>(null)

// 绑定自定义节点类型
const nodeTypes = {
  image_node: ImageNode,
  image_card: ImageCardNode,
  gen_node: GenNode,
  prompt_template: PromptTemplateNode
} as any

const { redoStack } = storeToRefs(canvasStore)

// 抽取 Composable
const { undo, redo } = useCanvasHistory(
  nodes,
  edges,
  selectedWorkspaceId,
  historyStack,
  redoStack,
  canvasStore.loadGraph
)

const { handlePaste, handleDrop } = useCanvasImport(
  selectedWorkspaceId,
  containerRef,
  project,
  () => canvasStore.loadGraph(selectedWorkspaceId.value)
)

const {
  handleNodeDragStop,
  handleConnect,
  handleNodesDelete,
  handleEdgesDelete
} = useCanvasInteractions(
  selectedWorkspaceId,
  nodes,
  edges,
  setNodes,
  setEdges,
  () => canvasStore.loadGraph(selectedWorkspaceId.value),
  canvasStore.pushHistory,
  canvasStore.recomputeReferenceImages,
  canvasStore.recomputeTemplatePrompts
)

// ─── 右键刀刃拖拽斩断交互 ──────────────────────────────────────────
const isDrawingBlade = ref(false)
const bladePoints = ref<Array<{ x: number; y: number }>>([])
const collidedNodes = ref<Set<string>>(new Set())
const collidedEdges = ref<Set<string>>(new Set())

// 生成平滑刀刃 SVG path 指令
const bladePathD = computed(() => {
  if (bladePoints.value.length < 2) return ''
  return bladePoints.value.reduce((acc, p, index) => {
    return acc + (index === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`)
  }, '')
})

function handleMouseDown(e: MouseEvent) {
  if (e.button === 2) {
    // 鼠标右键按下，开启划线斩断状态
    e.preventDefault()
    isDrawingBlade.value = true
    collidedNodes.value.clear()
    collidedEdges.value.clear()
    
    if (containerRef.value) {
      const rect = containerRef.value.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      bladePoints.value = [{ x, y }]
    }
  }
}

function handleMouseMove(e: MouseEvent) {
  if (!isDrawingBlade.value || !containerRef.value) return
  
  const rect = containerRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  
  bladePoints.value.push({ x, y })
  if (bladePoints.value.length > 15) {
    bladePoints.value.shift()
  }
  
  // 使用 elementsFromPoint 进行碰撞与相交高亮检测
  const elements = document.elementsFromPoint(e.clientX, e.clientY)
  for (const element of elements) {
    // 1. 节点元素检测
    const nodeEl = element.closest('.vue-flow__node')
    if (nodeEl) {
      const nodeId = nodeEl.getAttribute('data-id')
      if (nodeId && !collidedNodes.value.has(nodeId)) {
        collidedNodes.value.add(nodeId)
        nodeEl.classList.add('blade-highlight')
      }
    }
    
    // 2. 连线元素检测
    const edgeEl = element.closest('.vue-flow__edge')
    if (edgeEl) {
      const edgeId = edgeEl.getAttribute('data-id')
      if (edgeId && !collidedEdges.value.has(edgeId)) {
        collidedEdges.value.add(edgeId)
        const pathEl = edgeEl.querySelector('.vue-flow__edge-path')
        if (pathEl) {
          pathEl.classList.add('blade-highlight')
        }
      }
    }
  }
}

async function handleMouseUp(e: MouseEvent) {
  if (!isDrawingBlade.value) return
  isDrawingBlade.value = false
  
  // 移除所有临时高亮类名
  const highlightedEls = document.querySelectorAll('.blade-highlight')
  highlightedEls.forEach(el => {
    el.classList.remove('blade-highlight')
  })
  
  // 若触碰到了元素，执行同步删除
  if (collidedNodes.value.size > 0 || collidedEdges.value.size > 0) {
    const nodesToDelete = nodes.value.filter(n => collidedNodes.value.has(n.id))
    const edgesToDelete = edges.value.filter(e => collidedEdges.value.has(e.id))
    
    try {
      if (nodesToDelete.length > 0) {
        await handleNodesDelete(nodesToDelete)
      }
      if (edgesToDelete.length > 0) {
        // 过滤掉那些已经在 handleNodesDelete 中随着节点删除被级联删去的边
        const remainingEdgesToDelete = edgesToDelete.filter(e => {
          return !nodesToDelete.some(n => n.id === e.source || n.id === e.target)
        })
        if (remainingEdgesToDelete.length > 0) {
          await handleEdgesDelete(remainingEdgesToDelete)
        }
      }
      ElMessage.success('斩断成功！')
    } catch (err) {
      console.error('斩断删除失败:', err)
    }
  }
  
  // 重置临时划线和碰撞列表
  bladePoints.value = []
  collidedNodes.value.clear()
  collidedEdges.value.clear()
}

// 双击节点平滑聚焦
async function handleNodeDoubleClick({ node }: any) {
  await nextTick()
  fitView({
    nodes: [node.id],
    duration: 600,
    padding: 0.3
  })
}

async function handleRemoveEdge(edgeId: string) {
  canvasStore.isConnectingOrJustConnected = true
  setTimeout(() => {
    canvasStore.isConnectingOrJustConnected = false
  }, 500)

  const edge = edges.value.find(e => e.id === edgeId)
  if (edge) {
    try {
      await handleEdgesDelete([edge])
      ElMessage.success('已断开该参考图的连线')
    } catch (e) {
      console.error('断开连线失败:', e)
    }
  }
}

function onConnectStart() {
  canvasStore.isConnectingOrJustConnected = true
}

function onConnectEnd() {
  setTimeout(() => {
    canvasStore.isConnectingOrJustConnected = false
  }, 500)
}

// 全选
function handleSelectAll() {
  nodes.value = nodes.value.map(n => ({
    ...n,
    selected: true
  }))
  setNodes(nodes.value)
  ElMessage.info('已选择所有节点')
}

// 全局按键与粘贴防打扰
function handleGlobalKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    undo()
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    redo()
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault()
    handleSelectAll()
  }
}

function handleGlobalPaste(e: ClipboardEvent) {
  const target = e.target as HTMLElement
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return
  }
  handlePaste(e)
}

// 强制清除多选残留
function handleGlobalMouseup() {
  if (userSelectionActive && userSelectionActive.value) {
    userSelectionActive.value = false
  }
}

// 节点内部事件回调
function handleChangeImage(nodeId: string, url: string) {
  nodeService.changeImage(
    selectedWorkspaceId.value,
    nodeId,
    url,
    nodes.value,
    () => canvasStore.loadGraph(selectedWorkspaceId.value),
    canvasStore.pushHistory
  )
}

async function handleDeleteNode(nodeId: string) {
  const node = nodes.value.find(n => n.id === nodeId)
  if (node) {
    try {
      await ElMessageBox.confirm('确定要删除这个节点吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      })
      await handleNodesDelete([node])
      ElMessage.success('节点删除成功')
    } catch (e) {
      if (e !== 'cancel') {
        console.error('删除节点失败:', e)
      }
    }
  }
}

function handleGenerateFromNode(
  nodeId: string,
  form: { 
    prompt: string; 
    model: string; 
    ratio: string; 
    sizeLevel: string;
    mode?: 'image' | 'video';
    videoResolution?: string;
    videoDuration?: number;
  }
) {
  nodeService.generateFromNode(
    selectedWorkspaceId.value,
    nodeId,
    form,
    nodes.value,
    edges.value,
    () => canvasStore.loadGraph(selectedWorkspaceId.value),
    canvasStore.pushHistory
  )
}

function handleRegenerateNode(nodeId: string) {
  nodeService.regenerateNode(
    selectedWorkspaceId.value,
    nodeId,
    nodes.value,
    edges.value,
    () => canvasStore.loadGraph(selectedWorkspaceId.value),
    canvasStore.pushHistory
  )
}

function handleUpdateNodePrompt(nodeId: string, text: string) {
  nodeService.updateNodePrompt(
    selectedWorkspaceId.value,
    nodeId,
    text,
    nodes.value,
    () => canvasStore.loadGraph(selectedWorkspaceId.value),
    canvasStore.pushHistory
  )
}

// 连线双击修改演进词
async function handleEdgeDoubleClick({ edge }: any) {
  if (!selectedWorkspaceId.value) return
  try {
    const { value: newLabel } = await ElMessageBox.prompt(
      '修改连线上的演进词/说明：',
      '编辑演进词',
      {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: edge.label || '',
      }
    )
    if (newLabel !== null) {
      const payload = {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: newLabel,
      }
      await canvasStore.saveEdge(selectedWorkspaceId.value, payload)
      ElMessage.success('演进词更新成功')
      await canvasStore.loadGraph(selectedWorkspaceId.value)
    }
  } catch (e) {
    // cancelled
  }
}

// 保存视口到本地
function handleMoveEnd() {
  if (selectedWorkspaceId.value) {
    workspaceStore.saveViewport(selectedWorkspaceId.value, {
      x: viewport.value.x,
      y: viewport.value.y,
      zoom: viewport.value.zoom
    })
  }
}

// 还原视口
function restoreViewport() {
  if (selectedWorkspaceId.value) {
    const vp = workspaceStore.getViewport(selectedWorkspaceId.value)
    try {
      setViewport(vp)
    } catch (e) {
      // 忽略可能由于 Vue Flow 视口未完全就绪导致的报错
    }
  }
}

// 监听 selectedWorkspaceId 变化以重载图和视图
watch(selectedWorkspaceId, async (newId) => {
  if (newId) {
    canvasStore.historyStack = [] // 切换工程时清空历史栈
    canvasStore.redoStack = []    // 同时清空重做栈
    await canvasStore.loadGraph(newId)
    await nextTick()
    restoreViewport()
  }
})

// 画布首次渲染就绪事件
function onPaneReady() {
  restoreViewport()
}

onMounted(async () => {
  window.addEventListener('paste', handleGlobalPaste)
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('mouseup', handleGlobalMouseup)
  
  if (selectedWorkspaceId.value) {
    await canvasStore.loadGraph(selectedWorkspaceId.value)
    await nextTick()
    restoreViewport()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', handleGlobalPaste)
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('mouseup', handleGlobalMouseup)
})
</script>

<template>
  <div 
    ref="containerRef" 
    class="vue-flow-wrapper"
    @dragover.prevent
    @drop="handleDrop"
    @contextmenu.prevent
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
  >
    <!-- 刀光动画 SVG 覆盖层 -->
    <svg class="blade-overlay" v-if="isDrawingBlade">
      <path :d="bladePathD" stroke="#ef4444" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none" class="blade-path" />
    </svg>
    <VueFlow
      v-if="selectedWorkspaceId"
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      :fit-view-on-init="true"
      :selectionKey="'Shift'"
      :multiSelectionKey="'Shift'"
      :deleteKeyCode="['Backspace', 'Delete']"
      :selectionMode="SelectionMode.Partial"
      class="custom-flow-board"
      @edge-double-click="handleEdgeDoubleClick"
      @node-drag-stop="handleNodeDragStop"
      @nodes-delete="handleNodesDelete"
      @edges-delete="handleEdgesDelete"
      @node-double-click="handleNodeDoubleClick"
      @connect="handleConnect"
      @connect-start="onConnectStart"
      @connect-end="onConnectEnd"
      @pane-ready="onPaneReady"
      @move-end="handleMoveEnd"
    >
      <Background pattern-color="#cbd5e1" :gap="16" />
      <Controls />
      
      <!-- Vue Flow 插槽，绑定卡片重新生成和更新事件 -->
      <template #node-prompt_template="props">
        <PromptTemplateNode 
          :id="props.id" 
          :data="props.data" 
          @delete="handleDeleteNode"
        />
      </template>

      <template #node-image_card="props">
        <ImageCardNode 
          :id="props.id" 
          :data="props.data" 
          @change-image="handleChangeImage"
          @delete="handleDeleteNode"
        />
      </template>
      
      <template #node-gen_node="props">
        <GenNode 
          :id="props.id" 
          :data="props.data" 
          @generate="handleGenerateFromNode"
          @delete="handleDeleteNode"
          @remove-edge="handleRemoveEdge"
        />
      </template>

      <template #node-image_node="props">
        <ImageNode 
          :id="props.id" 
          :data="props.data" 
          @regenerate="handleRegenerateNode"
          @update-prompt="handleUpdateNodePrompt"
          @delete="handleDeleteNode"
        />
      </template>
    </VueFlow>
    
    <div v-else class="empty-canvas-state">
      <el-empty description="请在上方选择或新建一个工程画布，以开始创意演进。" />
    </div>
  </div>
</template>

<style scoped>
.vue-flow-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #f1f5f9;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.custom-flow-board {
  width: 100%;
  height: 100%;
}

.empty-canvas-state {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Glowing selection border for nodes */
:deep(.vue-flow__node.selected) {
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.6);
  border-radius: 12px;
  transition: box-shadow 0.15s ease;
}

:deep(.vue-flow__selection) {
  pointer-events: none;
}

/* 刀刃效果 SVG 覆盖层 */
.blade-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 100;
}

.blade-path {
  filter: drop-shadow(0 0 6px rgba(239, 68, 68, 0.8));
  transition: stroke-dashoffset 0.1s;
}

/* 扫过高亮状态 */
:deep(.vue-flow__node.blade-highlight) {
  box-shadow: 0 0 0 4px #ef4444 !important;
  border-radius: 12px;
  transition: box-shadow 0.1s ease;
}

:deep(.vue-flow__edge-path.blade-highlight) {
  stroke: #ef4444 !important;
  stroke-width: 4px !important;
  transition: stroke 0.1s ease, stroke-width 0.1s ease;
}
</style>
