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
import { MagicStick, Film, Picture, FolderOpened, Memo } from '@element-plus/icons-vue'
import { uploadToObs } from '@/utils/obs'

// 导入 Vue Flow 样式
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'

const workspaceStore = useWorkspaceStore()
const canvasStore = useCanvasStore()

const { selectedWorkspaceId } = storeToRefs(workspaceStore)
const { nodes, edges, historyStack } = storeToRefs(canvasStore)

const { 
  setNodes, 
  setEdges, 
  setViewport, 
  project, 
  fitView, 
  userSelectionActive, 
  viewport
} = useVueFlow()

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

// 右键菜单状态
const contextMenu = ref({ visible: false, x: 0, y: 0, canvasX: 0, canvasY: 0 })
const boardFileRef = ref<HTMLInputElement | null>(null)
let mousedownX = 0
let mousedownY = 0
let mousedownTime = 0

// 生成平滑刀刃 SVG path 指令
const bladePathD = computed(() => {
  if (bladePoints.value.length < 2) return ''
  return bladePoints.value.reduce((acc, p, index) => {
    return acc + (index === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`)
  }, '')
})

function handleMouseDown(e: MouseEvent) {
  contextMenu.value.visible = false
  if (e.button === 2) {
    // 鼠标右键按下，开启划线斩断状态前记录起点
    e.preventDefault()
    mousedownX = e.clientX
    mousedownY = e.clientY
    mousedownTime = Date.now()
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
  // 实时记录鼠标容器内位置，供快捷键添加节点定位
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    lastContainerMousePos.value = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }

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

  const clickDist = Math.hypot(e.clientX - mousedownX, e.clientY - mousedownY)
  const duration = Date.now() - mousedownTime
  
  // 判断是简单点击右键（无明显拖拽且时间短），如果是，则弹起创建菜单
  if (clickDist < 8 && duration < 300 && e.button === 2) {
    // 重置斩断点
    bladePoints.value = []
    collidedNodes.value.clear()
    collidedEdges.value.clear()

    if (containerRef.value && selectedWorkspaceId.value) {
      const rect = containerRef.value.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top
      const pos = project({ x: clickX, y: clickY })
      
      contextMenu.value = {
        visible: true,
        x: clickX,
        y: clickY,
        canvasX: pos.x,
        canvasY: pos.y
      }
    }
    return
  }
  
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

// 菜单项事件响应
async function createNodeFromMenu(source: 'upload' | 'generate' | 'template', mediaType: 'image' | 'video' | 'template') {
  contextMenu.value.visible = false
  if (!selectedWorkspaceId.value) return

  if (source === 'template') {
    await canvasStore.addPromptTemplateNode(selectedWorkspaceId.value, contextMenu.value.canvasX, contextMenu.value.canvasY)
    ElMessage.success('已新建模板节点')
  } else {
    await canvasStore.addImageCardNode(
      selectedWorkspaceId.value,
      source,
      mediaType as 'image' | 'video',
      contextMenu.value.canvasX,
      contextMenu.value.canvasY
    )
    ElMessage.success(`已新建${mediaType === 'video' ? '视频' : '图像'}节点`)
  }
}

function triggerUploadFromMenu() {
  contextMenu.value.visible = false
  boardFileRef.value?.click()
}

async function handleMenuFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file || !selectedWorkspaceId.value) return

  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    ElMessage.warning('仅支持上传图片或视频文件')
    return
  }

  ElMessage.info('正在上传文件到 OBS...')
  try {
    const isVideoFile = file.type.startsWith('video/')
    const prefix = isVideoFile ? 'ai_picture/reference_video' : 'ai_picture/reference_image'
    const url = await uploadToObs(file, prefix)

    const payload = {
      id: `card_${Math.random().toString(36).substring(2, 8)}`,
      type: 'image_card',
      x: contextMenu.value.canvasX,
      y: contextMenu.value.canvasY,
      data: {
        display_id: nodes.value.reduce((max, n) => {
          const did = n.data?.display_id || 0
          return did > max ? did : max
        }, 0) + 1,
        image_url: url,
        prompt: '',
        media_type: isVideoFile ? 'video' : 'image',
        source: 'upload',
        status: 'success'
      }
    }
    await canvasStore.saveNode(selectedWorkspaceId.value, payload)
    ElMessage.success('素材上传成功，已创建素材节点')
    await canvasStore.loadGraph(selectedWorkspaceId.value)
  } catch (err: any) {
    ElMessage.error(`上传失败: ${err.message || err}`)
  } finally {
    if (boardFileRef.value) boardFileRef.value.value = ''
  }
}

function importFromWork() {
  contextMenu.value.visible = false
  ElMessage.info('作品导入功能即将推出，敬请期待')
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

// 快捷键记录鼠标位置
const lastContainerMousePos = ref({ x: 200, y: 200 })

// 全局按键与粘贴防打扰
async function handleGlobalKeydown(e: KeyboardEvent) {
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

  // 快捷键创建节点以鼠标位置生成
  if (!selectedWorkspaceId.value) return
  const key = e.key.toLowerCase()
  if (key === 'g' || key === 'm' || key === 'v' || key === 't' || key === 'x') {
    // 投影坐标
    const pos = project({ x: lastContainerMousePos.value.x, y: lastContainerMousePos.value.y })
    
    if (key === 'g') {
      e.preventDefault()
      await canvasStore.addImageCardNode(selectedWorkspaceId.value, 'generate', 'image', pos.x, pos.y)
      ElMessage.success('已快捷添加图像节点 (G)')
    } else if (key === 'm') {
      e.preventDefault()
      contextMenu.value.canvasX = pos.x
      contextMenu.value.canvasY = pos.y
      boardFileRef.value?.click()
    } else if (key === 'v') {
      e.preventDefault()
      await canvasStore.addImageCardNode(selectedWorkspaceId.value, 'generate', 'video', pos.x, pos.y)
      ElMessage.success('已快捷添加视频节点 (V)')
    } else if (key === 't') {
      e.preventDefault()
      await canvasStore.addPromptTemplateNode(selectedWorkspaceId.value, pos.x, pos.y)
      ElMessage.success('已快捷添加提示词模板节点 (T)')
    } else if (key === 'x') {
      // 快捷键删除选中节点
      e.preventDefault()
      const selectedNodes = nodes.value.filter(n => n.selected)
      if (selectedNodes.length > 0) {
        try {
          await ElMessageBox.confirm(`确定要删除选中的 ${selectedNodes.length} 个节点吗？`, '提示', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          })
          await handleNodesDelete(selectedNodes)
          ElMessage.success('已快捷删除选中节点 (X)')
        } catch {
          // ignore cancel
        }
      } else {
        ElMessage.info('当前未选中任何节点')
      }
    }
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

function closeContextMenu() {
  contextMenu.value.visible = false
}

function handleWindowClick(e: MouseEvent) {
  if (e.button !== 0) return
  const menuEl = document.querySelector('.canvas-context-menu')
  if (menuEl && !menuEl.contains(e.target as Node)) {
    closeContextMenu()
  }
}

onMounted(async () => {
  window.addEventListener('paste', handleGlobalPaste)
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('mouseup', handleGlobalMouseup)
  window.addEventListener('click', handleWindowClick)
  
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
  window.removeEventListener('click', handleWindowClick)
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

    <!-- SVG Defs for edge linear gradient -->
    <svg style="position: absolute; width: 0; height: 0; pointer-events: none;">
      <defs>
        <linearGradient id="video-edge-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#a855f7" />
          <stop offset="100%" stop-color="#3b82f6" />
        </linearGradient>
      </defs>
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
      @pane-click="closeContextMenu"
      @pane-scroll="closeContextMenu"
      @zoom="closeContextMenu"
      @node-drag-start="closeContextMenu"
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
          @generate="handleGenerateFromNode"
          @delete="handleDeleteNode"
          @remove-edge="handleRemoveEdge"
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
    
    <!-- Hidden input for context menu upload -->
    <input 
      ref="boardFileRef" 
      type="file" 
      accept="image/*,video/*" 
      style="display: none;" 
      @change="handleMenuFileChange"
    />

    <!-- Frosted Context Menu Overlay -->
    <div 
      v-if="contextMenu.visible" 
      class="canvas-context-menu" 
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @mousedown.stop
      @mouseup.stop
    >
      <div class="menu-header">新建画布节点</div>
      <div class="menu-item" @click="createNodeFromMenu('generate', 'image')">
        <el-icon class="menu-item-icon"><MagicStick /></el-icon>
        <span class="menu-item-text">新建图像节点</span>
        <span class="menu-item-shortcut">G</span>
      </div>
      <div class="menu-item" @click="createNodeFromMenu('generate', 'video')">
        <el-icon class="menu-item-icon"><Film /></el-icon>
        <span class="menu-item-text">新建视频节点</span>
        <span class="menu-item-shortcut">V</span>
      </div>
      <div class="menu-item" @click="triggerUploadFromMenu">
        <el-icon class="menu-item-icon"><Picture /></el-icon>
        <span class="menu-item-text">上传本地素材</span>
        <span class="menu-item-shortcut">M</span>
      </div>
      <div class="menu-item disabled" @click="importFromWork">
        <el-icon class="menu-item-icon"><FolderOpened /></el-icon>
        <span class="menu-item-text">从作品导入</span>
        <span class="menu-item-shortcut">I</span>
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="createNodeFromMenu('template', 'template')">
        <el-icon class="menu-item-icon"><Memo /></el-icon>
        <span class="menu-item-text">提示词模板</span>
        <span class="menu-item-shortcut">T</span>
      </div>
    </div>

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

/* Shake animation for invalid target nodes */
:deep(.vue-flow__node.shake-node) {
  animation: nodeShake 0.4s ease-in-out;
}

@keyframes nodeShake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}

/* Frosted glass right click context menu */
.canvas-context-menu {
  position: absolute;
  z-index: 1500;
  width: 170px;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
  padding: 6px;
  box-sizing: border-box;
  animation: menuFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes menuFadeIn {
  from { opacity: 0; transform: scale(0.95) translateY(-5px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.menu-header {
  font-size: 10px;
  font-weight: 700;
  color: #94a3b8;
  padding: 4px 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
  color: #334155;
}

.menu-item:hover {
  background: rgba(99, 102, 241, 0.08);
  color: #6366f1;
}

.menu-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.menu-item-icon {
  font-size: 14px;
}

.menu-item-text {
  font-size: 12px;
  font-weight: 500;
  flex: 1;
}

.menu-item-shortcut {
  font-size: 9px;
  font-weight: 700;
  color: #94a3b8;
  background: rgba(0, 0, 0, 0.05);
  padding: 1px 4px;
  border-radius: 4px;
}

.menu-item:hover .menu-item-shortcut {
  background: rgba(99, 102, 241, 0.15);
  color: #6366f1;
}

.menu-divider {
  height: 1px;
  background: rgba(226, 232, 240, 0.6);
  margin: 4px 6px;
}

/* Custom edge styles matching their port colors */
:deep(.vue-flow__edge.edge-image-style .vue-flow__edge-path) {
  stroke: #f59e0b !important;
  stroke-width: 2px !important;
}

:deep(.vue-flow__edge.edge-video-style .vue-flow__edge-path) {
  stroke: url(#video-edge-gradient) !important;
  stroke-width: 3px !important;
}

:deep(.vue-flow__edge.edge-template-style .vue-flow__edge-path) {
  stroke: #8b5cf6 !important;
  stroke-width: 2px !important;
}

/* Connect line dragging styles */
:deep(.vue-flow__connection-path) {
  stroke: #6366f1 !important;
  stroke-width: 2px !important;
}
</style>
