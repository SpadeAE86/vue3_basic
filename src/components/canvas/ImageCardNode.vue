<script setup lang="ts">
import { ref, computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Picture, Refresh, Delete, ZoomIn } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { uploadToObs } from '@/utils/obs'
import { useCanvasStore } from '@/stores/canvas'

interface NodeData {
  display_id?: number
  image_url?: string
  prompt?: string
  media_type?: 'image' | 'video'
}

const props = defineProps<{
  id: string
  data: NodeData
}>()

const emit = defineEmits<{
  (e: 'change-image', id: string, url: string): void
  (e: 'delete', id: string): void
}>()

const canvasStore = useCanvasStore()
const isUploading = ref(false)
const uploadProgress = ref(0)
const fileInputRef = ref<HTMLInputElement | null>(null)
const elImageRef = ref<any>(null)
const imageRatio = ref(1.0)

const isVideo = computed(() => {
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

const computedHeight = computed(() => {
  if (!props.data.image_url) return '220px'
  // Clamp ratio to avoid extremely tall/wide nodes
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
    console.error('更换图片失败:', err)
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
</script>

<template>
  <div class="node-wrapper-outer">
    <div v-if="canvasStore.showNodeId" class="node-id-badge">#{{ data.display_id }}</div>
    <div class="image-card-node" :style="{ height: computedHeight }">
    <!-- 连接端口 (左入右出) -->
    <Handle id="in" type="target" :position="Position.Left" class="node-handle" />
    <Handle id="out" type="source" :position="Position.Right" class="node-handle" />

    <div class="card-content">
      <!-- Loading overlay -->
      <div v-if="isUploading" class="uploading-overlay">
        <el-progress type="circle" :percentage="uploadProgress" :width="50" :stroke-width="4" />
        <span class="uploading-text">上传中...</span>
      </div>

      <!-- Image/Video Display -->
      <div v-else-if="data.image_url" class="media-container">
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
        
        <!-- Hover Overlay -->
        <div class="hover-overlay">
          <div class="action-buttons">
            <el-tooltip content="大图预览" placement="top" v-if="!isVideo">
              <button class="action-icon-btn" @click.stop="openPreview">
                <el-icon><ZoomIn /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip content="更换图片" placement="top">
              <button class="action-icon-btn" @click.stop="triggerFileSelect">
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
      </div>

      <!-- Empty state placeholder -->
      <div v-else class="empty-placeholder" @click="triggerFileSelect">
        <el-icon :size="32" class="placeholder-icon"><Picture /></el-icon>
        <span class="placeholder-text">选择或拖入图片</span>
        <button class="empty-delete-btn" @click.stop="handleDelete" title="删除节点">
          <el-icon><Delete /></el-icon>
        </button>
      </div>
    </div>

    <!-- Hidden input for file selection -->
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
.image-card-node {
  width: 220px;
  height: 220px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  overflow: visible;
  position: relative;
  box-sizing: border-box;
  transition: transform 0.2s, box-shadow 0.2s, height 0.2s ease;
  border: 1px solid transparent;
}

.image-card-node:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.card-content {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  border-radius: 12px;
}

.media-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.node-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 12px;
  pointer-events: none;
}

:deep(.node-media .el-image__inner) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

/* Hover overlay with bottom-right alignment and gradient mask */
.hover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 50%, rgba(0, 0, 0, 0.7) 100%);
  opacity: 0;
  transition: opacity 0.25s ease;
  display: flex;
  justify-content: flex-end; /* Align right */
  align-items: flex-end;     /* Align bottom */
  padding: 12px;
  box-sizing: border-box;
  border-radius: 12px;
  pointer-events: none;      /* Let mouse hover pass when hidden */
}

.hover-overlay * {
  pointer-events: auto;      /* Enable mouse interaction for actions */
}

.media-container:hover .hover-overlay {
  opacity: 1;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.action-icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  transition: transform 0.2s, background-color 0.2s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.action-icon-btn:hover {
  transform: scale(1.1);
  background: rgba(255, 255, 255, 0.45);
  color: #ffffff;
}

.action-icon-btn.danger:hover {
  background: rgba(239, 68, 68, 0.85);
  color: #ffffff;
}

/* Empty Placeholder */
.empty-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #f8fafc;
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
}

.empty-placeholder:hover {
  background: #f1f5f9;
  border-color: #6366f1;
}

.placeholder-icon {
  color: #94a3b8;
  transition: color 0.2s;
}

.empty-placeholder:hover .placeholder-icon {
  color: #6366f1;
}

.placeholder-text {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}

.uploading-overlay {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
}

.uploading-text {
  font-size: 12px;
  color: #64748b;
}

/* Ports */
.node-handle {
  width: 10px;
  height: 10px;
  background: #6366f1;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
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
</style>
