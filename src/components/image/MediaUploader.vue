<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { uploadToObs, getMediaType } from '@/utils/obs'
import MediaCollectionsImportDialog from './MediaCollectionsImportDialog.vue'

export interface MediaFile {
  url: string
  type: 'image' | 'video' | 'audio'
}

const props = defineProps<{
  modelValue: MediaFile[]
  maxCount?: number
  acceptTypes?: ('image' | 'video' | 'audio')[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: MediaFile[]): void
  (e: 'update:isUploading', val: boolean): void
}>()

const max = props.maxCount || 5
const acceptTypes = computed(() => props.acceptTypes || ['image'])
const fileInput = ref<HTMLInputElement>()
const isDragging = ref(false)

const acceptString = computed(() => {
  return acceptTypes.value.map(t => `${t}/*`).join(',')
})

const isCollectionDialogVisible = ref(false)
const selectedUrls = ref<string[]>([])

// Sync selectedUrls with modelValue
watch(() => props.modelValue, (newVal) => {
  selectedUrls.value = newVal.map(m => m.url)
}, { immediate: true })

function handleSelectMultipleFromCollection(urls: string[]) {
  const currentItems = [...props.modelValue]
  const availableSlots = max - currentItems.length
  
  if (availableSlots <= 0) {
    ElMessage.warning(`最多只能上传 ${max} 个参考素材`)
    return
  }
  
  const toAdd = urls.slice(0, availableSlots)
  if (urls.length > availableSlots) {
    ElMessage.warning(`参考素材个数超限，仅成功导入前 ${availableSlots} 张图片`)
  } else {
    ElMessage.success(`成功导入 ${toAdd.length} 张参考图`)
  }
  
  const newItems = [...currentItems, ...toAdd.map(url => ({ url, type: 'image' as const }))]
  emit('update:modelValue', newItems)
}

interface UploadingMedia {
  id: string
  localUrl: string
  type: 'image' | 'video' | 'audio'
  progress: number
  status: 'uploading' | 'error' | 'success'
}

const uploadingMedias = ref<UploadingMedia[]>([])

function checkUploadingState() {
  const isUploading = uploadingMedias.value.some(m => m.status === 'uploading')
  emit('update:isUploading', isUploading)
}

function handleFileSelect(e: Event) {
  if (props.disabled) return
  const target = e.target as HTMLInputElement
  if (target.files) {
    processFiles(Array.from(target.files))
  }
  if (fileInput.value) fileInput.value.value = ''
}

function onDragOver(e: DragEvent) {
  if (props.disabled) return
  e.preventDefault()
  isDragging.value = true
}

function onDragLeave(e: DragEvent) {
  if (props.disabled) return
  e.preventDefault()
  isDragging.value = false
}

function onDrop(e: DragEvent) {
  if (props.disabled) return
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer?.files) {
    processFiles(Array.from(e.dataTransfer.files))
  }
}

async function processFiles(files: File[]) {
  const validFiles = files.filter(f => {
    const t = getMediaType(f.type)
    return t && acceptTypes.value.includes(t)
  })
  
  if (validFiles.length === 0) {
    ElMessage.warning(`请选择支持的文件类型: ${acceptTypes.value.join(', ')}`)
    return
  }
  
  const currentCount = props.modelValue.length + uploadingMedias.value.length
  const availableSlots = max - currentCount
  
  if (availableSlots <= 0) {
    ElMessage.warning(`最多只能上传 ${max} 个参考素材`)
    return
  }
  
  const filesToAdd = validFiles.slice(0, availableSlots)
  if (validFiles.length > availableSlots) {
    ElMessage.warning(`只能再添加 ${availableSlots} 个，多余的文件已被忽略`)
  }
  
  for (const file of filesToAdd) {
    await uploadFile(file)
  }
}

async function uploadFile(file: File) {
  const id = Math.random().toString(36).substring(2, 15)
  const localUrl = URL.createObjectURL(file)
  const mediaType = getMediaType(file.type) || 'image'
  
  const uploadItem: UploadingMedia = {
    id,
    localUrl,
    type: mediaType,
    progress: 0,
    status: 'uploading'
  }
  
  uploadingMedias.value.push(uploadItem)
  checkUploadingState()
  
  try {
    let prefix = 'ai_picture/reference_image'
    if (mediaType === 'video') prefix = 'ai_picture/reference_video'
    if (mediaType === 'audio') prefix = 'ai_picture/reference_audio'
    
    const publicUrl = await uploadToObs(file, prefix, (percent) => {
      const item = uploadingMedias.value.find(m => m.id === id)
      if (item) item.progress = percent
    })
    
    const index = uploadingMedias.value.findIndex(m => m.id === id)
    if (index !== -1) {
      uploadingMedias.value.splice(index, 1)
    }
    
    emit('update:modelValue', [...props.modelValue, { url: publicUrl, type: mediaType }])
  } catch (error) {
    console.error('Upload error:', error)
    const item = uploadingMedias.value.find(m => m.id === id)
    if (item) item.status = 'error'
    ElMessage.error(`${mediaType === 'image' ? '图片' : mediaType === 'video' ? '视频' : '音频'}上传失败: ${file.name}`)
  } finally {
    checkUploadingState()
    URL.revokeObjectURL(localUrl)
  }
}

function removeMedia(index: number) {
  const newItems = [...props.modelValue]
  newItems.splice(index, 1)
  emit('update:modelValue', newItems)
}

function removeUploadingMedia(index: number) {
  uploadingMedias.value.splice(index, 1)
  checkUploadingState()
}

let draggedIndex = -1

function onDragStart(index: number, e: DragEvent) {
  draggedIndex = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }
}

function onDragOverItem(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDropItem(index: number, e: DragEvent) {
  e.preventDefault()
  if (draggedIndex === -1 || draggedIndex === index) return
  
  const newItems = [...props.modelValue]
  const moved = newItems.splice(draggedIndex, 1)[0]
  if (moved !== undefined) {
    newItems.splice(index, 0, moved)
    emit('update:modelValue', newItems)
  }
  draggedIndex = -1
}

function triggerSelect() {
  if (props.disabled) return
  fileInput.value?.click()
}

defineExpose({
  processFiles
})
</script>

<template>
  <div class="media-uploader" :class="{ 'is-disabled': disabled }">
    <div class="media-list">
      <!-- Existing Media -->
      <div 
        v-for="(item, index) in modelValue" 
        :key="item.url"
        class="media-item"
        draggable="true"
        @dragstart="(e) => onDragStart(index, e)"
        @dragover="onDragOverItem"
        @drop="(e) => onDropItem(index, e)"
      >
        <img v-if="item.type === 'image'" :src="item.url" alt="reference" />
        <div v-else-if="item.type === 'video'" class="media-icon-wrapper">
          <el-icon :size="20" color="#606266"><i-ep-video-camera /></el-icon>
        </div>
        <div v-else-if="item.type === 'audio'" class="media-icon-wrapper">
          <el-icon :size="20" color="#606266"><i-ep-mic /></el-icon>
        </div>
        
        <div class="type-badge">
          <el-icon v-if="item.type === 'video'"><i-ep-video-play /></el-icon>
          <el-icon v-if="item.type === 'audio'"><i-ep-headset /></el-icon>
        </div>

        <div class="delete-btn" @click.stop="removeMedia(index)">
          <el-icon><i-ep-close /></el-icon>
        </div>
      </div>
      
      <!-- Uploading Media -->
      <div 
        v-for="(item, index) in uploadingMedias" 
        :key="item.id"
        class="media-item uploading"
      >
        <img v-if="item.type === 'image'" :src="item.localUrl" alt="uploading" />
        <div v-else class="media-icon-wrapper">
          <el-icon :size="20" color="#a8abb2">
            <i-ep-video-camera v-if="item.type === 'video'" />
            <i-ep-mic v-else />
          </el-icon>
        </div>

        <div class="upload-overlay">
          <el-progress 
            v-if="item.status === 'uploading'"
            type="circle" 
            :percentage="item.progress" 
            :width="24"
            :stroke-width="2"
            :show-text="false"
          />
          <el-icon v-else-if="item.status === 'error'" color="#f56c6c"><i-ep-warning /></el-icon>
        </div>
        <div class="delete-btn" @click.stop="removeUploadingMedia(index)">
          <el-icon><i-ep-close /></el-icon>
        </div>
      </div>
      
      <!-- Upload Button / Drop Zone -->
      <div 
        v-if="modelValue.length + uploadingMedias.length < max"
        class="upload-btn"
        :class="{ 'is-dragging': isDragging, 'is-disabled': disabled }"
        @click="triggerSelect"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
        :title="disabled ? '当前模型不支持参考素材' : '点击/拖拽添加参考素材，或点击右下角从收藏导入'"
      >
        <el-icon v-if="!disabled">
          <i-ep-plus v-if="acceptTypes.length > 1" />
          <i-ep-video-camera v-else-if="acceptTypes.includes('video')" />
          <i-ep-mic v-else-if="acceptTypes.includes('audio')" />
          <i-ep-picture v-else />
        </el-icon>
        <el-icon v-else><i-ep-circle-close /></el-icon>

        <!-- 收藏角标 -->
        <div
          v-if="!disabled && acceptTypes.includes('image')"
          class="import-from-collection-badge"
          @click.stop="isCollectionDialogVisible = true"
          title="从收藏空间导入参考图"
        >
          <el-icon><i-ep-folder /></el-icon>
        </div>
      </div>
    </div>
    
    <input 
      ref="fileInput"
      type="file" 
      :accept="acceptString" 
      multiple
      style="display: none;"
      @change="handleFileSelect"
    />

    <!-- 从收藏导入 Dialog -->
    <MediaCollectionsImportDialog
      v-model="isCollectionDialogVisible"
      :selected-urls="selectedUrls"
      :max-count="max"
      @select-multiple="handleSelectMultipleFromCollection"
    />
  </div>
</template>

<style scoped>
.media-uploader {
  display: flex;
  align-items: center;
}

.media-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.media-item {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  overflow: hidden;
  cursor: grab;
  border: 1px solid #ebeef5;
  background: #fff;
}

.media-item.uploading {
  cursor: default;
}

.media-item:active {
  cursor: grabbing;
}

.media-item.uploading:active {
  cursor: default;
}

.media-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.media-icon-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
}

.type-badge {
  position: absolute;
  bottom: 2px;
  left: 2px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border-radius: 4px;
  padding: 2px;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.delete-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 14px;
  height: 14px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 2;
}

.media-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: #f56c6c;
}

.upload-btn {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  border: 1px dashed #c0c4cc;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.5);
}

.upload-btn:hover:not(.is-disabled), .upload-btn.is-dragging:not(.is-disabled) {
  border-color: #6366f1;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.05);
}

.upload-btn.is-disabled {
  cursor: not-allowed;
  background: #f5f7fa;
  border-color: #e4e7ed;
  color: #c0c4cc;
}

.import-from-collection-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 18px;
  height: 18px;
  background: #6366f1;
  color: #ffffff;
  clip-path: polygon(100% 0, 100% 100%, 0 100%);
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding-bottom: 2px;
  padding-right: 2px;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.85);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 5;
}

.upload-btn:hover .import-from-collection-badge {
  opacity: 0.9;
  transform: scale(1);
}

.import-from-collection-badge:hover {
  opacity: 1 !important;
  background: #4f46e5;
  transform: scale(1.15) !important;
}

.import-from-collection-badge .el-icon {
  font-size: 8px !important;
  color: #ffffff;
}
</style>
