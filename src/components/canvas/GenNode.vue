<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { Loading, Warning, Edit, Delete, Picture, ZoomIn, Film } from '@element-plus/icons-vue'
import { useCanvasStore } from '@/stores/canvas'
import NodeParameterEditor from './NodeParameterEditor.vue'

interface NodeData {
  display_id?: number
  image_url?: string
  prompt?: string
  model?: string
  ratio?: string
  sizeLevel?: string
  status?: 'success' | 'generating' | 'failed'
  error_message?: string
  reference_images?: string[]
  template_values?: Record<string, string>
  mode?: 'image' | 'video'
  videoResolution?: string
  videoDuration?: number
}

const props = defineProps<{
  id: string
  data: NodeData
}>()

const emit = defineEmits<{
  (e: 'generate', id: string, form: {
    prompt: string;
    model: string;
    ratio: string;
    sizeLevel: string;
    mode?: 'image' | 'video';
    videoResolution?: string;
    videoDuration?: number;
  }): void
  (e: 'delete', id: string): void
  (e: 'remove-edge', edgeId: string): void
}>()

const canvasStore = useCanvasStore()
const nodeRef = ref<HTMLElement | null>(null)

const isExpanded = computed({
  get: () => !!canvasStore.expandedNodes[props.id],
  set: (val: boolean) => {
    canvasStore.expandedNodes[props.id] = val
  }
})

const isVideo = computed(() => {
  if (props.data.image_url) {
    const url = props.data.image_url.toLowerCase()
    return url.endsWith('.mp4') || url.endsWith('.webm')
  }
  return props.data.mode === 'video'
})

const activeMediaType = computed(() => isVideo.value ? 'video' : 'image')

const displayLabel = computed(() => {
  let label = isVideo.value ? 'Video' : 'Image'
  if (props.data.image_url) {
    const url = props.data.image_url
    const parts = url.split('/')
    const lastPart = parts[parts.length - 1] || ''
    if (lastPart) {
      try {
        label = decodeURIComponent(lastPart)
        const match = label.match(/^\d{13}_(.+)$/)
        if (match && match[1]) {
          label = match[1]
        }
      } catch {
        label = lastPart
      }
    }
  }
  if (canvasStore.showNodeId) {
    return `${label} #${props.data.display_id}`
  }
  return label
})

const generationTypeText = computed(() => {
  const hasRef = props.data.reference_images && props.data.reference_images.length > 0
  if (isVideo.value) {
    return hasRef ? '图生视频' : '文生视频'
  } else {
    return hasRef ? '图生图' : '文生图'
  }
})

const imageRatio = ref(1.0)

function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  if (img.naturalWidth && img.naturalHeight) {
    imageRatio.value = img.naturalWidth / img.naturalHeight
  }
}

function onVideoLoad(event: Event) {
  const video = event.target as HTMLVideoElement
  if (video.videoWidth && video.videoHeight) {
    imageRatio.value = video.videoWidth / video.videoHeight
  }
}

const computedUpperHeight = computed(() => {
  if (!props.data.image_url || props.data.status === 'generating' || props.data.status === 'failed') {
    return '150px'
  }
  const clampedRatio = Math.max(0.5, Math.min(2.0, imageRatio.value))
  return `${Math.round(240 / clampedRatio)}px`
})

// Toggle expansion
function toggleExpand() {
  if (props.data.status === 'generating') return
  isExpanded.value = !isExpanded.value
}

// Click outside handler to collapse editor
function handleClickOutside(event: MouseEvent) {
  if (!nodeRef.value) return
  if (canvasStore.isConnectingOrJustConnected) return
  
  const target = event.target as HTMLElement
  if (!target) return
  if (nodeRef.value.contains(target)) return
  if (target.closest('.vue-flow__handle') || target.closest('.node-handle')) return
  if (
    target.closest('.vue-flow__edge') || 
    target.closest('.vue-flow__edges') || 
    target.closest('.vue-flow__connection') || 
    target.closest('.vue-flow__connection-path') ||
    target.tagName.toLowerCase() === 'path' || 
    target.tagName.toLowerCase() === 'svg'
  ) {
    return
  }
  
  isExpanded.value = false
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  if (canvasStore.expandedNodes[props.id] === undefined) {
    if (!props.data.image_url && props.data.status !== 'generating') {
      canvasStore.expandedNodes[props.id] = true
    }
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})

interface GenerateFormPayload {
  prompt: string
  model: string
  ratio: string
  sizeLevel: string
  mode?: 'image' | 'video'
  videoResolution?: string
  videoDuration?: number
}

function handleGenerate(formPayload?: GenerateFormPayload) {
  const finalForm = formPayload || {
    prompt: props.data.prompt || '',
    model: props.data.model || (props.data.mode === 'video' ? 'Seedance 2.0' : 'Seedream 5.0'),
    ratio: props.data.ratio || (props.data.mode === 'video' ? 'adaptive' : '9:16'),
    sizeLevel: props.data.sizeLevel || '2K',
    mode: props.data.mode || 'image',
    videoResolution: props.data.videoResolution || '720p',
    videoDuration: props.data.videoDuration || 5
  }
  emit('generate', props.id, finalForm)
  isExpanded.value = false
}

function handleDelete() {
  emit('delete', props.id)
}

function handleRemoveEdge(edgeId: string) {
  emit('remove-edge', edgeId)
}

const { findNode } = useVueFlow()
function selectThisNode() {
  const n = findNode(props.id)
  if (n) {
    n.selected = true
  }
}

const elImageRef = ref<{ showPreview?: () => void } | null>(null)
function openPreview() {
  if (!props.data.image_url || props.data.status === 'generating') return
  if (!isVideo.value) {
    elImageRef.value?.showPreview?.()
  }
}
</script>

<template>
  <div class="node-wrapper-outer" @click.capture="selectThisNode">
    <div v-if="canvasStore.showNodeId" class="node-id-badge">#{{ data.display_id }}</div>
    
    <!-- Badge bar for IDs and labels -->
    <div class="node-top-badge-bar">
      <!-- Model Badge -->
      <span 
        class="type-badge model"
        title="模型名称"
      >
        <span class="badge-icon">
          <Film v-if="isVideo" />
          <Picture v-else />
        </span>
        <span class="badge-text">{{ data.model || (data.mode === 'video' ? 'Seedance 2.0' : 'Seedream 5.0') }}</span>
      </span>
      <!-- Generation Type Badge -->
      <span 
        class="type-badge gen-type"
        :class="{ 'i2x': data.reference_images && data.reference_images.length > 0 }"
      >
        <span class="badge-text">{{ generationTypeText }}</span>
      </span>
    </div>

    <div ref="nodeRef" class="gen-node-card" :class="[`is-${data.status || 'success'}`, { 'is-expanded': isExpanded }]">
      <!-- 连接端口 (左入右出) -->
      <Handle 
        id="in" 
        type="target" 
        :position="Position.Left" 
        class="node-handle handle-in" 
        :class="isVideo ? 'handle-video-color' : 'handle-image-color'"
      />
      <Handle 
        v-if="data.image_url" 
        id="out" 
        type="source" 
        :position="Position.Right" 
        class="node-handle handle-out"
        :class="isVideo ? 'handle-video-color' : 'handle-image-color'"
      />

      <div class="gen-node-inner">
        <!-- 上半部分：预览/生成区/占位区 -->
        <div class="node-upper" :style="{ height: computedUpperHeight }">
          <!-- 生成中 -->
          <div v-if="data.status === 'generating'" class="media-container loading">
            <el-icon class="is-loading" :size="28"><Loading /></el-icon>
            <span class="status-text">正在绘制中...</span>
          </div>

          <!-- 生成失败 -->
          <div v-else-if="data.status === 'failed'" class="media-container error" @click="toggleExpand">
            <el-icon :size="28" color="#ef4444"><Warning /></el-icon>
            <span class="status-text text-danger">生成失败</span>
            <div class="error-detail" :title="data.error_message">{{ data.error_message || '接口调用异常' }}</div>
            
            <div class="hover-overlay-actions">
              <el-tooltip content="编辑并重试" placement="top">
                <button class="action-icon-btn" @click.stop="toggleExpand">
                  <el-icon><Edit /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="删除节点" placement="top">
                <button class="action-icon-btn danger" @click.stop="handleDelete">
                  <el-icon><Delete /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </div>

          <!-- 成功生成 -->
          <div v-else-if="data.image_url" class="media-container success">
            <video 
              v-if="isVideo" 
              :src="data.image_url" 
              class="node-media" 
              autoplay 
              loop 
              muted 
              playsinline 
              @loadedmetadata="onVideoLoad"
            />
            <el-image
              v-else
              ref="elImageRef"
              :src="data.image_url"
              :preview-src-list="[data.image_url]"
              fit="cover"
              class="node-media"
              preview-teleported
              hide-on-click-modal
              @load="onImageLoad"
            />
            
            <!-- Model Tag -->
            <span class="model-tag">{{ data.model || 'gpt-5.4' }}</span>

            <!-- Hover Overlay Actions -->
            <div class="hover-overlay-actions">
              <el-tooltip content="大图预览" placement="top" v-if="!isVideo">
                <button class="action-icon-btn" @click.stop="openPreview">
                  <el-icon><ZoomIn /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="重新编辑" placement="top">
                <button class="action-icon-btn" @click.stop="toggleExpand">
                  <el-icon><Edit /></el-icon>
                </button>
              </el-tooltip>
               <el-tooltip content="重新生成" placement="top">
                <button class="action-icon-btn" @click.stop="handleGenerate()">
                  <el-icon><Refresh /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="删除节点" placement="top">
                <button class="action-icon-btn danger" @click.stop="handleDelete">
                  <el-icon><Delete /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </div>

          <!-- 未生成占位 -->
          <div v-else class="media-container empty" @click="toggleExpand">
            <el-icon :size="28" class="placeholder-icon"><Picture /></el-icon>
            <span class="placeholder-text">点击配置并生成</span>
            <button class="empty-delete-btn" @click.stop="handleDelete" title="删除节点">
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </div>

        <!-- 下半部分：参数编辑器 (可展开收起) -->
        <transition name="slide-fade">
          <NodeParameterEditor
            v-show="isExpanded"
            :id="id"
            :data="data"
            node-type="gen_node"
            @generate="(nodeId, form) => handleGenerate(form)"
            @delete="handleDelete"
            @remove-edge="handleRemoveEdge"
          />
        </transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gen-node-card {
  width: 240px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  overflow: visible;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.2s, transform 0.2s;
}

.gen-node-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.1);
}

.gen-node-inner {
  width: 100%;
  height: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.gen-node-card.is-generating .gen-node-inner {
  border-color: #f59e0b;
}

.gen-node-card.is-failed .gen-node-inner {
  border-color: #ef4444;
}

.gen-node-card.is-success .gen-node-inner {
  border-color: #10b981;
}

.node-upper {
  position: relative;
  width: 100%;
  background: #f1f5f9;
  transition: height 0.25s ease-out;
}

.media-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
}

.node-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

:deep(.node-media .el-image__inner) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.model-tag {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  backdrop-filter: blur(4px);
  z-index: 2;
  font-weight: 500;
}

.media-container.empty {
  background: #f8fafc;
  color: #94a3b8;
}

.media-container.empty:hover {
  background: #f1f5f9;
  color: #6366f1;
}

.placeholder-icon {
  margin-bottom: 4px;
  transition: transform 0.2s;
}

.media-container.empty:hover .placeholder-icon {
  transform: scale(1.1);
}

.placeholder-text {
  font-size: 11px;
  font-weight: 500;
}

.media-container.loading {
  background: #fffbeb;
  color: #d97706;
}

.media-container.loading .status-text {
  font-size: 11px;
  margin-top: 6px;
  font-weight: 500;
}

.media-container.error {
  background: #fef2f2;
  color: #dc2626;
  padding: 12px;
  box-sizing: border-box;
}

.media-container.error .status-text {
  font-size: 11px;
  margin-top: 4px;
  font-weight: 600;
}

.error-detail {
  font-size: 9px;
  color: #991b1b;
  margin-top: 6px;
  text-align: center;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: rgba(239, 68, 68, 0.05);
  padding: 2px 4px;
  border-radius: 4px;
}

.hover-overlay-actions {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 50%, rgba(0, 0, 0, 0.7) 100%);
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 6px;
  padding: 12px;
  box-sizing: border-box;
  opacity: 0;
  transition: opacity 0.25s ease;
  z-index: 3;
  pointer-events: none;
  border-radius: 12px;
}

.hover-overlay-actions * {
  pointer-events: auto;
}

.media-container:hover .hover-overlay-actions {
  opacity: 1;
}

.action-icon-btn {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  color: #fff;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  padding: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.action-icon-btn:hover {
  background: rgba(255, 255, 255, 0.45);
  transform: scale(1.1);
  color: #ffffff;
}

.action-icon-btn.danger:hover {
  background: rgba(239, 68, 68, 0.85);
  border-color: rgba(239, 68, 68, 0.85);
  color: #ffffff;
}

/* Transitions */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.25s ease-out;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-8px);
  opacity: 0;
}

/* Ports */
.node-handle {
  width: 10px;
  height: 10px;
  background: #94a3b8;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
  z-index: 5;
}

.handle-image-color {
  background: #f59e0b !important; /* Yellow for image ports */
}

.handle-video-color {
  background: linear-gradient(270deg, #a855f7, #3b82f6, #db2777, #a855f7) !important;
  background-size: 600% 600% !important;
  animation: handleGlow 3s infinite alternate, shiftingGradient 8s ease infinite !important;
}

@keyframes handleGlow {
  0% { filter: drop-shadow(0 0 1px rgba(168, 85, 247, 0.6)); }
  100% { filter: drop-shadow(0 0 5px rgba(59, 130, 246, 0.9)); }
}

@keyframes shiftingGradient {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.node-handle:hover {
  transform: scale(1.3);
}

.node-handle::after {
  content: "";
  position: absolute;
  top: -10px;
  left: -10px;
  right: -10px;
  bottom: -10px;
  border-radius: 50%;
}

.empty-delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.05);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: background-color 0.2s, color 0.2s, transform 0.2s;
  z-index: 10;
}

.empty-delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  transform: scale(1.1);
}

.node-wrapper-outer {
  position: relative;
  overflow: visible;
}

.node-id-badge {
  position: absolute;
  top: -16px;
  left: 0;
  font-size: 9px;
  font-weight: 700;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1;
}

.node-top-badge-bar {
  position: absolute;
  top: -22px;
  left: 2px;
  z-index: 50;
  display: flex;
  gap: 6px;
  align-items: center;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.type-badge.upload {
  background: #ffffff;
  border-color: #e2e8f0;
  color: #64748b;
}

.type-badge.model {
  background: #ffffff;
  border-color: #cbd5e1;
  color: #475569;
}

.type-badge.gen-type {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.type-badge.gen-type.i2x {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #15803d;
}

.type-badge:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08);
}

.badge-icon {
  display: flex;
  align-items: center;
  font-size: 11px;
}

.badge-text {
  letter-spacing: 0.2px;
}
</style>
