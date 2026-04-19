<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import ObsClient from 'esdk-obs-browserjs'

const props = defineProps<{
  modelValue: string[]
  maxCount?: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: string[]): void
  (e: 'update:isUploading', val: boolean): void
}>()

const max = props.maxCount || 5
const fileInput = ref<HTMLInputElement>()
const isDragging = ref(false)

// OBS Configuration
const obsClient = new ObsClient({
  access_key_id: 'UJDPK31ANIBV0XTEUN5N',
  secret_access_key: 'NhQExxv9PUYsvmvGnVReizRksaiHcJdQ6vMMw19d',
  server: 'https://obs.cn-east-3.myhuaweicloud.com'
})
const BUCKET_NAME = 'freeuuu'

interface UploadingImage {
  id: string
  localUrl: string
  progress: number
  status: 'uploading' | 'error' | 'success'
}

const uploadingImages = ref<UploadingImage[]>([])

function checkUploadingState() {
  const isUploading = uploadingImages.value.some(img => img.status === 'uploading')
  emit('update:isUploading', isUploading)
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files) {
    processFiles(Array.from(target.files))
  }
  if (fileInput.value) fileInput.value.value = ''
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function onDragLeave(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer?.files) {
    processFiles(Array.from(e.dataTransfer.files))
  }
}

async function processFiles(files: File[]) {
  const validFiles = files.filter(f => f.type.startsWith('image/'))
  if (validFiles.length === 0) {
    ElMessage.warning('请选择图片文件')
    return
  }
  
  const currentCount = props.modelValue.length + uploadingImages.value.length
  const availableSlots = max - currentCount
  
  if (availableSlots <= 0) {
    ElMessage.warning(`最多只能上传 ${max} 张参考图`)
    return
  }
  
  const filesToAdd = validFiles.slice(0, availableSlots)
  if (validFiles.length > availableSlots) {
    ElMessage.warning(`只能再添加 ${availableSlots} 张，多余的图片已被忽略`)
  }
  
  for (const file of filesToAdd) {
    await uploadFile(file)
  }
}

async function uploadFile(file: File) {
  const id = Math.random().toString(36).substring(2, 15)
  const localUrl = URL.createObjectURL(file)
  
  const uploadItem: UploadingImage = {
    id,
    localUrl,
    progress: 0,
    status: 'uploading'
  }
  
  uploadingImages.value.push(uploadItem)
  checkUploadingState()
  
  try {
    const ext = file.name.split('.').pop() || 'png'
    const timestamp = new Date().getTime()
    const filename = `${timestamp}_${id}.${ext}`
    const objectKey = `ai_picture/reference_image/${filename}`
    
    const result = await new Promise<unknown>((resolve, reject) => {
      obsClient.putObject({
        Bucket: BUCKET_NAME,
        Key: objectKey,
        SourceFile: file,
        ProgressCallback: function (transferredAmount: number, totalAmount: number) {
          const percent = Math.round((transferredAmount * 100.0) / totalAmount)
          const item = uploadingImages.value.find(img => img.id === id)
          if (item) item.progress = percent
        }
      }, (err: Error | null, result: unknown) => {
        if (err) reject(err)
        else resolve(result)
      })
    })
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((result as any).CommonMsg.Status < 300) {
      const publicUrl = `https://${BUCKET_NAME}.obs.cn-east-3.myhuaweicloud.com/${objectKey}`
      
      // Remove from uploading list
      const index = uploadingImages.value.findIndex(img => img.id === id)
      if (index !== -1) {
        uploadingImages.value.splice(index, 1)
      }
      
      // Add to modelValue
      emit('update:modelValue', [...props.modelValue, publicUrl])
    } else {
      throw new Error(`Upload failed with status ${result.CommonMsg.Status}`)
    }
  } catch (error) {
    console.error('Upload error:', error)
    const item = uploadingImages.value.find(img => img.id === id)
    if (item) item.status = 'error'
    ElMessage.error(`图片上传失败: ${file.name}`)
  } finally {
    checkUploadingState()
    URL.revokeObjectURL(localUrl)
  }
}

function removeImage(index: number) {
  const newUrls = [...props.modelValue]
  newUrls.splice(index, 1)
  emit('update:modelValue', newUrls)
}

function removeUploadingImage(index: number) {
  uploadingImages.value.splice(index, 1)
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
  
  const newUrls = [...props.modelValue]
  const [moved] = newUrls.splice(draggedIndex, 1)
  newUrls.splice(index, 0, moved)
  
  emit('update:modelValue', newUrls)
  draggedIndex = -1
}

function triggerSelect() {
  fileInput.value?.click()
}
</script>

<template>
  <div class="image-uploader">
    <div class="image-list">
      <!-- Existing Images -->
      <div 
        v-for="(url, index) in modelValue" 
        :key="url"
        class="image-item"
        draggable="true"
        @dragstart="(e) => onDragStart(index, e)"
        @dragover="onDragOverItem"
        @drop="(e) => onDropItem(index, e)"
      >
        <img :src="url" alt="reference" />
        <div class="delete-btn" @click.stop="removeImage(index)">
          <el-icon><i-ep-close /></el-icon>
        </div>
      </div>
      
      <!-- Uploading Images -->
      <div 
        v-for="(item, index) in uploadingImages" 
        :key="item.id"
        class="image-item uploading"
      >
        <img :src="item.localUrl" alt="uploading" />
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
        <div class="delete-btn" @click.stop="removeUploadingImage(index)">
          <el-icon><i-ep-close /></el-icon>
        </div>
      </div>
      
      <!-- Upload Button / Drop Zone -->
      <div 
        v-if="modelValue.length + uploadingImages.length < max"
        class="upload-btn"
        :class="{ 'is-dragging': isDragging }"
        @click="triggerSelect"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
        title="点击或拖拽添加参考图"
      >
        <el-icon><i-ep-picture /></el-icon>
      </div>
    </div>
    
    <input 
      ref="fileInput"
      type="file" 
      accept="image/*" 
      multiple
      style="display: none;"
      @change="handleFileSelect"
    />
  </div>
</template>

<style scoped>
.image-uploader {
  display: flex;
  align-items: center;
}

.image-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.image-item {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  overflow: hidden;
  cursor: grab;
  border: 1px solid #ebeef5;
  background: #fff;
}

.image-item.uploading {
  cursor: default;
}

.image-item:active {
  cursor: grabbing;
}

.image-item.uploading:active {
  cursor: default;
}

.image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
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

.image-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: #f56c6c;
}

.upload-btn {
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

.upload-btn:hover, .upload-btn.is-dragging {
  border-color: #6366f1;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.05);
}
</style>
