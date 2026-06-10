<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { 
  Picture, Refresh, Delete, ZoomIn, Film, 
  Loading, Warning, Edit, MagicStick, Star, StarFilled
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { uploadToObs } from '@/utils/obs'
import { useCanvasStore } from '@/stores/canvas'
import { useWorkspaceStore } from '@/stores/workspace'
import { useCollectionsStore } from '@/stores/collections'
import NodeParameterEditor from './NodeParameterEditor.vue'

interface NodeData {
  display_id?: number
  image_url?: string
  prompt?: string
  media_type?: 'image' | 'video'
  source?: 'upload' | 'generate'
  status?: 'success' | 'generating' | 'failed'
  error_message?: string
  model?: string
  ratio?: string
  sizeLevel?: string
  videoResolution?: string
  videoDuration?: number
  reference_images?: string[]
  template_values?: Record<string, string>
  mode?: 'image' | 'video'
}

const props = defineProps<{
  id: string
  data: NodeData
}>()

const emit = defineEmits<{
  (e: 'change-image', id: string, url: string): void
  (e: 'delete', id: string): void
  (e: 'generate', id: string, form: {
    prompt: string;
    model: string;
    ratio: string;
    sizeLevel: string;
    mode?: 'image' | 'video';
    videoResolution?: string;
    videoDuration?: number;
  }): void
  (e: 'remove-edge', edgeId: string): void
}>()

const canvasStore = useCanvasStore()
const workspaceStore = useWorkspaceStore()
const collectionsStore = useCollectionsStore()

const isFavorited = computed(() => {
  if (!props.data.image_url) return false
  return collectionsStore.isFavorited('media', props.data.image_url)
})

function toggleFavorite() {
  if (!props.data.image_url) return
  const title = props.data.prompt ? (props.data.prompt.substring(0, 20) + '...') : `媒体卡片 #${props.data.display_id || ''}`
  collectionsStore.toggleFavorite(
    'media',
    title,
    props.data.image_url,
    {
      url: props.data.image_url,
      prompt: props.data.prompt || '',
      model: props.data.model || '',
      ratio: props.data.ratio || '',
      media_type: props.data.media_type || 'image',
      source: props.data.source || 'generate'
    }
  )
}

// Upload state
const isUploading = ref(false)
const uploadProgress = ref(0)
const fileInputRef = ref<HTMLInputElement | null>(null)
const elImageRef = ref<{ showPreview?: () => void } | null>(null)
const imageRatio = ref(1.0)

// Editor state (for generated nodes)
const isExpanded = ref(false)
const mode = ref<'image' | 'video'>(props.data.mode || (props.data.media_type === 'video' ? 'video' : 'image'))
const isMorphing = ref(false)

async function switchMode(newMode: 'image' | 'video') {
  if (mode.value === newMode) return
  isMorphing.value = true
  
  setTimeout(async () => {
    mode.value = newMode
    
    // Save mode change immediately
    const workspaceId = workspaceStore.selectedWorkspaceId
    if (workspaceId) {
      const localNode = canvasStore.nodes.find(n => n.id === props.id)
      if (localNode) {
        const defaultModel = newMode === 'video' ? 'Seedance 2.0' : 'Seedream 5.0'
        const defaultRatio = newMode === 'video' ? 'adaptive' : '9:16'
        const updatedData = {
          ...props.data,
          mode: newMode,
          media_type: newMode,
          model: defaultModel,
          ratio: defaultRatio
        }
        localNode.data = updatedData
        await canvasStore.saveNode(workspaceId, {
          id: props.id,
          type: 'image_card',
          x: localNode.position.x,
          y: localNode.position.y,
          data: updatedData
        })
        canvasStore.pushHistory()
      }
    }
  }, 180)
  
  setTimeout(() => {
    isMorphing.value = false
  }, 450)
}

const urlMediaType = computed(() => {
  const url = props.data.image_url || ''
  if (!url) return null
  return (url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm')) ? 'video' : 'image'
})

const hasValidMediaForCurrentMode = computed(() => {
  if (props.data.source !== 'generate') return true
  if (!props.data.image_url) return false
  return urlMediaType.value === mode.value
})

const isVideo = computed(() => {
  if (props.data.source === 'generate') {
    return urlMediaType.value === 'video'
  }
  if (props.data.media_type === 'video') return true
  const url = props.data.image_url || ''
  return url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm')
})

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
  if (!props.data.image_url || props.data.status === 'generating' || props.data.status === 'failed' || !hasValidMediaForCurrentMode.value) {
    return '150px'
  }
  const clampedRatio = Math.max(0.5, Math.min(2.0, imageRatio.value))
  return `${Math.round(220 / clampedRatio)}px`
})

function triggerFileSelect() {
  if (isUploading.value) return
  fileInputRef.value?.click()
}

async function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    ElMessage.warning('仅支持上传图片或视频文件')
    return
  }

  isUploading.value = true
  uploadProgress.value = 0
  
  try {
    const isVideoFile = file.type.startsWith('video/')
    const prefix = isVideoFile ? 'ai_picture/reference_video' : 'ai_picture/reference_image'
    
    const url = await uploadToObs(file, prefix, (percent) => {
      uploadProgress.value = percent
    })
    
    emit('change-image', props.id, url)
    ElMessage.success('上传成功')
  } catch (err: any) {
    console.error('上传失败:', err)
    ElMessage.error(`上传失败: ${err.message || err}`)
  } finally {
    isUploading.value = false
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}

function openPreview() {
  if (!props.data.image_url || isUploading.value) return
  if (!isVideo.value) {
    elImageRef.value?.showPreview?.()
  }
}

function handleDelete() {
  emit('delete', props.id)
}

function toggleExpand() {
  if (props.data.status === 'generating') return
  isExpanded.value = !isExpanded.value
}

const activeMediaType = computed(() => {
  if (props.data.source === 'generate') {
    return mode.value
  }
  return props.data.media_type === 'video' ? 'video' : 'image'
})

const displayLabel = computed(() => {
  let label = activeMediaType.value === 'video' ? 'Video' : 'Image'
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
  const isVid = activeMediaType.value === 'video'
  const hasRef = props.data.reference_images && props.data.reference_images.length > 0
  if (isVid) {
    return hasRef ? '图生视频' : '文生视频'
  } else {
    return hasRef ? '图生图' : '文生图'
  }
})

function handleOutsideClick(event: MouseEvent) {
  if (canvasStore.isConnectingOrJustConnected) return
  const target = event.target as HTMLElement
  if (!target) return
  
  const nodeEl = document.querySelector(`.vue-flow__node[data-id="${props.id}"]`)
  if (nodeEl && !nodeEl.contains(target) && !target.closest('.vue-flow__handle') && !target.closest('.node-handle')) {
    isExpanded.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  collectionsStore.init()
  if (props.data.source === 'generate' && (!props.data.image_url || !hasValidMediaForCurrentMode.value) && props.data.status !== 'generating') {
    isExpanded.value = true
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
})

const { findNode } = useVueFlow()
function selectThisNode() {
  const n = findNode(props.id)
  if (n) {
    n.selected = true
  }
}

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
    model: props.data.model || (mode.value === 'video' ? 'Seedance 2.0' : 'Seedream 5.0'),
    ratio: props.data.ratio || (mode.value === 'video' ? 'adaptive' : '9:16'),
    sizeLevel: props.data.sizeLevel || '2K',
    mode: mode.value,
    videoResolution: props.data.videoResolution || '720p',
    videoDuration: props.data.videoDuration || 5
  }
  emit('generate', props.id, finalForm)
  isExpanded.value = false
}

function handleRemoveEdge(edgeId: string) {
  emit('remove-edge', edgeId)
}
</script>

<template>
  <div class="node-wrapper-outer" @click.capture="selectThisNode">
    <!-- Floating Tab Ears on the right-bottom edge -->
    <div v-if="isExpanded && data.source === 'generate' && data.status !== 'generating'" class="node-tab-ears nodrag">
      <el-tooltip content="切换为图像生成" placement="right" :show-after="400">
        <div 
          class="tab-ear" 
          :class="{ active: mode === 'image', 'ear-image': mode === 'image' }"
          @click.stop="switchMode('image')"
        >
          <el-icon><Picture /></el-icon>
        </div>
      </el-tooltip>
      <el-tooltip content="切换为视频生成" placement="right" :show-after="400">
        <div 
          class="tab-ear" 
          :class="{ active: mode === 'video', 'ear-video': mode === 'video' }"
          @click.stop="switchMode('video')"
        >
          <el-icon><Film /></el-icon>
        </div>
      </el-tooltip>
      <el-tooltip content="音频生成 (即将推出)" placement="right" :show-after="400">
        <div class="tab-ear disabled">
          <el-icon><Headset /></el-icon>
        </div>
      </el-tooltip>
    </div>

    <!-- Badge bar for IDs and labels -->
    <div class="node-top-badge-bar">
      <!-- For local upload node -->
      <template v-if="data.source === 'upload'">
        <span 
          class="type-badge upload"
          title="本地上传参考媒介"
        >
          <span class="badge-icon">
            <el-icon>
              <Film v-if="activeMediaType === 'video'" />
              <Picture v-else />
            </el-icon>
          </span>
          <span class="badge-text">{{ displayLabel }}</span>
        </span>
      </template>
      <!-- For generated node -->
      <template v-else>
        <!-- Model Badge -->
        <span 
          class="type-badge model"
          title="模型名称"
        >
          <span class="badge-icon">
            <el-icon>
              <Film v-if="activeMediaType === 'video'" />
              <Picture v-else />
            </el-icon>
          </span>
          <span class="badge-text">{{ data.model || (mode === 'video' ? 'Seedance 2.0' : 'Seedream 5.0') }}</span>
        </span>
        <!-- Generation Type Badge -->
        <span 
          class="type-badge gen-type"
          :class="{ 'i2x': data.reference_images && data.reference_images.length > 0 }"
        >
          <span class="badge-text">{{ generationTypeText }}</span>
        </span>
      </template>
    </div>

    <div class="image-card-node" :class="[`is-${data.status || 'success'}`, { 'is-expanded': isExpanded, 'is-morphing': isMorphing }]">
      <!-- Ports (in / out) -->
      <Handle 
        id="in" 
        type="target" 
        :position="Position.Left" 
        class="node-handle handle-in" 
        :class="activeMediaType === 'video' ? 'handle-video-color' : 'handle-image-color'"
      />
      <Handle 
        v-if="data.image_url && hasValidMediaForCurrentMode"
        id="out" 
        type="source" 
        :position="Position.Right" 
        class="node-handle handle-out"
        :class="activeMediaType === 'video' ? 'handle-video-color' : 'handle-image-color'"
      />

      <div class="card-content">
        <!-- Upper Area: Media Zone -->
        <div class="node-upper" :style="{ height: computedUpperHeight }">
          <!-- Loading Overlay (local upload or generation) -->
          <div v-if="isUploading || data.status === 'generating'" class="media-overlay loading">
            <el-icon class="is-loading" :size="28"><Loading /></el-icon>
            <span class="status-text">{{ isUploading ? '上传中...' : '正在绘制中...' }}</span>
            <el-progress v-if="isUploading" type="line" :percentage="uploadProgress" :stroke-width="3" style="width: 80%; margin-top: 8px;" />
          </div>

          <!-- Failed generation -->
          <div v-else-if="data.status === 'failed'" class="media-overlay error" @click="toggleExpand">
            <el-icon :size="28" color="#ef4444"><Warning /></el-icon>
            <span class="status-text text-danger">生成失败</span>
            <div class="error-detail" :title="data.error_message">{{ data.error_message || '接口调用异常' }}</div>
            
            <div class="hover-actions-overlay">
              <el-tooltip content="编辑并重试" placement="top">
                <button class="hover-action-btn" @click.stop="toggleExpand">
                  <el-icon><Edit /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="删除节点" placement="top">
                <button class="hover-action-btn danger" @click.stop="handleDelete">
                  <el-icon><Delete /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </div>

          <!-- Successful Media Display -->
          <div v-else-if="data.image_url && hasValidMediaForCurrentMode" class="media-overlay success">
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
            
            <!-- Favorite Star Button (Only for successful generated nodes) -->
            <button 
              v-if="data.source === 'generate'"
              class="node-favorite-star" 
              :class="{ 'is-favorited': isFavorited }"
              @click.stop="toggleFavorite"
              title="收藏到收藏夹"
            >
              <el-icon v-if="isFavorited"><StarFilled /></el-icon>
              <el-icon v-else><Star /></el-icon>
            </button>

            <!-- Hover actions -->
            <div class="hover-actions-overlay">
              <el-tooltip content="大图预览" placement="top" v-if="!isVideo">
                <button class="hover-action-btn" @click.stop="openPreview">
                  <el-icon><ZoomIn /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="重新配置" placement="top" v-if="data.source === 'generate'">
                <button class="hover-action-btn" @click.stop="toggleExpand">
                  <el-icon><Edit /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="重新生成" placement="top" v-if="data.source === 'generate'">
                <button class="hover-action-btn" @click.stop="handleGenerate()">
                  <el-icon><Refresh /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="更换素材" placement="top" v-if="data.source === 'upload'">
                <button class="hover-action-btn" @click.stop="triggerFileSelect">
                  <el-icon><Refresh /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="删除节点" placement="top">
                <button class="hover-action-btn danger" @click.stop="handleDelete">
                  <el-icon><Delete /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </div>

          <!-- Empty placeholders -->
          <div v-else class="media-overlay empty" @click="data.source === 'generate' ? toggleExpand() : triggerFileSelect()">
            <el-icon :size="28" class="placeholder-icon">
              <Film v-if="activeMediaType === 'video'" />
              <Picture v-else />
            </el-icon>
            <span class="placeholder-text">
              {{ data.source === 'generate' ? '点击配置并生成' : (activeMediaType === 'video' ? '选择或拖入视频' : '选择或拖入图片') }}
            </span>
            <button class="empty-delete-btn" @click.stop="handleDelete" title="删除节点">
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </div>

        <!-- Lower Area: Parameter collapsible editor (Only for generate nodes) -->
        <transition name="slide-fade">
          <NodeParameterEditor
            v-show="isExpanded && data.source === 'generate'"
            :id="id"
            :data="data"
            node-type="image_card"
            @generate="(nodeId, form) => handleGenerate(form)"
            @delete="handleDelete"
            @remove-edge="handleRemoveEdge"
          />
        </transition>
      </div>

      <!-- Hidden file input for uploads -->
      <input 
        ref="fileInputRef" 
        type="file" 
        accept="image/*,video/*" 
        style="display: none;" 
        @change="handleFileChange"
      />
    </div>
  </div>
</template>

<style scoped>
.node-wrapper-outer {
  position: relative;
  overflow: visible;
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

.image-card-node {
  width: 220px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  overflow: visible;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform-style: preserve-3d;
  perspective: 1000px;
}

.image-card-node:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.1);
}

.image-card-node.is-morphing {
  animation: cardFlipMorph 0.45s ease-in-out forwards;
}

@keyframes cardFlipMorph {
  0% {
    transform: rotateY(0deg) scale(1);
    filter: brightness(1);
  }
  40% {
    transform: rotateY(90deg) scale(0.95);
    filter: brightness(1.2);
  }
  60% {
    transform: rotateY(90deg) scale(0.95);
    filter: brightness(1.2);
  }
  100% {
    transform: rotateY(0deg) scale(1);
    filter: brightness(1);
  }
}

.image-card-node.is-generating {
  border-color: #f59e0b;
}

.image-card-node.is-failed {
  border-color: #ef4444;
}

.image-card-node.is-success {
  border-color: #e2e8f0;
}

.card-content {
  width: 100%;
  height: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.node-upper {
  position: relative;
  width: 100%;
  background: #f8fafc;
  transition: height 0.25s ease-out;
}

.media-overlay {
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

.hover-actions-overlay {
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

.hover-actions-overlay * {
  pointer-events: auto;
}

.media-overlay:hover .hover-actions-overlay {
  opacity: 1;
}

.hover-action-btn {
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

.hover-action-btn:hover {
  background: rgba(255, 255, 255, 0.45);
  transform: scale(1.1);
  color: #ffffff;
}

.hover-action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.85);
  border-color: rgba(239, 68, 68, 0.85);
  color: #ffffff;
}

.media-overlay.empty {
  background: #f8fafc;
  color: #94a3b8;
}

.media-overlay.empty:hover {
  background: #f1f5f9;
  color: #6366f1;
}

.placeholder-icon {
  margin-bottom: 4px;
  transition: transform 0.2s;
}

.placeholder-text {
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  padding: 0 8px;
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

.status-text {
  font-size: 11px;
  font-weight: 500;
  margin-top: 6px;
}

.text-danger {
  color: #ef4444;
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

/* Ports style overrides */
.node-handle {
  width: 10px;
  height: 10px;
  background: #94a3b8;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
  z-index: 5;
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

/* Animations */
.slide-fade-enter-active {
  transition: all 0.3s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}

/* Node ears tabs */
.node-tab-ears {
  position: absolute;
  bottom: 12px;
  right: -32px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 99;
}

.tab-ear {
  width: 32px;
  height: 28px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-left: none;
  border-radius: 0 6px 6px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 2px 1px 3px rgba(0, 0, 0, 0.04);
}

.tab-ear:hover:not(.disabled) {
  width: 36px;
  color: #334155;
  background: #e2e8f0;
}

.tab-ear.active.ear-image {
  background: #6366f1;
  border-color: #6366f1;
  color: #ffffff;
}

.tab-ear.active.ear-video {
  background: #db2777;
  border-color: #db2777;
  color: #ffffff;
}

.tab-ear.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #f8fafc;
}

/* Favorite Star Overlay Button */
.node-favorite-star {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  color: #94a3b8;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: auto;
}

/* Hover or favorited state triggers visibility */
.media-overlay:hover .node-favorite-star,
.node-favorite-star.is-favorited {
  opacity: 1;
  transform: scale(1);
}

.node-favorite-star:hover {
  transform: scale(1.1) !important;
  color: #eab308;
  background: #ffffff;
}

.node-favorite-star.is-favorited {
  color: #eab308 !important;
  background: #ffffff !important;
  border-color: #f59e0b !important;
}
</style>
