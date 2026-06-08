<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import MediaUploader, { type MediaFile } from '@/components/image/MediaUploader.vue'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  send: [text: string, referenceMedia: MediaFile[], model: string]
}>()

const inputText = ref('')
const referenceMedia = ref<MediaFile[]>([])
const isUploading = ref(false)
const models = ref<{ display_name: string, real_name: string }[]>([])
const selectedModel = ref('gpt-5.4')

// 自动获取后端支持的模型列表
onMounted(async () => {
  try {
    const res = await fetch('/api/chat/models')
    if (res.ok) {
      models.value = await res.json()
      // 默认选择第一个包含默认字样的或者第一个模型
      const defaultModel = models.value.find(m => m.real_name === 'gpt-5.4')
      if (defaultModel) {
        selectedModel.value = defaultModel.real_name
      } else if (models.value[0]) {
        selectedModel.value = models.value[0].real_name
      }
    }
  } catch (e) {
    console.error('获取模型列表失败:', e)
  }
})

// 判断是否切换为多行模式
const isMultiline = computed(() => true)

function handleUploadingState(uploading: boolean) {
  isUploading.value = uploading
}

function handleSend() {
  const text = inputText.value.trim()
  const media = [...referenceMedia.value]
  if (isUploading.value || props.disabled) return
  if (!text && media.length === 0) return

  emit('send', text, media, selectedModel.value)
  
  // 发送后清空输入和媒体资源
  inputText.value = ''
  referenceMedia.value = []
}

const uploaderRef = ref<InstanceType<typeof MediaUploader> | null>(null)

async function handlePaste(e: ClipboardEvent) {
  if (props.disabled || isUploading.value) return
  const items = e.clipboardData?.items
  if (!items) return

  const filesToUpload: File[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item && item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        filesToUpload.push(file)
      }
    }
  }

  if (filesToUpload.length > 0) {
    e.preventDefault()
    await uploaderRef.value?.processFiles(filesToUpload)
  }
}

function handleKeydown(e: KeyboardEvent) {
  // Enter 发送, Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="chat-input-container">
    <div class="chat-input-box" :class="{ 'is-multiline': isMultiline }" @paste="handlePaste">
      <!-- 媒体上传器 (加号与缩略图) -->
      <div class="media-uploader-wrapper">
        <MediaUploader
          ref="uploaderRef"
          v-model="referenceMedia"
          @update:is-uploading="handleUploadingState"
          :max-count="5"
          :accept-types="['image']"
          :disabled="disabled"
        />
      </div>

      <!-- 文本输入框 -->
      <div class="input-text-area">
        <el-input
          v-model="inputText"
          type="textarea"
          :autosize="isMultiline ? { minRows: 2, maxRows: 6 } : { minRows: 1, maxRows: 1 }"
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          :disabled="disabled || isUploading"
          @keydown="handleKeydown"
          class="text-input-inner"
          resize="none"
        />
      </div>

      <!-- 右侧/底部控制栏（模型选择、发送按钮） -->
      <div class="right-controls">
        <!-- 模型选择 -->
        <el-select v-model="selectedModel" class="model-select" placeholder="选择模型" size="small">
          <el-option
            v-for="m in models"
            :key="m.real_name"
            :label="m.display_name"
            :value="m.real_name"
          />
        </el-select>

        <!-- 发送按钮 -->
        <el-button
          type="primary"
          :disabled="disabled || isUploading || (!inputText.trim() && referenceMedia.length === 0)"
          @click="handleSend"
          class="send-btn"
        >
          发送
        </el-button>
      </div>

      <!-- 分割线仅在多行下渲染于输入框下方 -->
      <div v-if="isMultiline" class="horizontal-divider" />
    </div>
  </div>
</template>

<style scoped>
.chat-input-container {
  padding: 12px 16px;
  background: #fff;
  border-top: 1px solid #ebeef5;
  width: 100%;
  box-sizing: border-box;
}

.chat-input-box {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 6px 6px 6px 14px;
  background: #f0f4f9;
  border: 1px solid transparent;
  border-radius: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  width: 100%;
  box-sizing: border-box;
  position: relative;
}

.chat-input-box:focus-within {
  border-color: #6366f1;
  background: #fff;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.06);
}

.input-text-area {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

:deep(.text-input-inner .el-textarea__inner) {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  padding: 0 4px;
  resize: none;
  line-height: 1.6;
  font-size: 14px;
  color: #334155;
  min-height: 24px !important;
  align-items: center;
  display: flex;
}

.media-uploader-wrapper {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

/* 强制定制 MediaUploader 里面的 + 按钮，呈现类似 Gemini 的极简圆圈效果 */
:deep(.media-uploader-wrapper .upload-btn) {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none !important;
  background: transparent !important;
  color: #64748b;
  transition: all 0.2s;
  box-shadow: none !important;
}

:deep(.media-uploader-wrapper .upload-btn:hover:not(.is-disabled)) {
  background: rgba(99, 102, 241, 0.08) !important;
  color: #6366f1;
}

.right-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.model-select {
  width: auto;
  min-width: 120px;
  max-width: 220px;
}

:deep(.model-select .el-select__wrapper) {
  border-radius: 8px;
  background-color: transparent;
  border: none !important;
  box-shadow: none !important;
  transition: background-color 0.2s;
  padding: 0 8px;
}

:deep(.model-select .el-select__wrapper:hover) {
  background-color: rgba(15, 23, 42, 0.05);
}

:deep(.model-select .el-select__wrapper.is-focused) {
  background-color: rgba(15, 23, 42, 0.05);
}

.send-btn {
  border-radius: 8px;
  height: 32px;
  padding: 0 18px;
  min-width: 64px;
  background: #6366f1;
  border-color: #6366f1;
  font-weight: 500;
  font-size: 13px;
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.15);
}

.send-btn:hover:not(:disabled) {
  background: #4f46e5;
  border-color: #4f46e5;
}

.send-btn:disabled,
.send-btn.is-disabled,
.send-btn.is-disabled:hover,
.send-btn.is-disabled:focus,
.send-btn.is-disabled:active {
  background: #cbd5e1 !important;
  border-color: #cbd5e1 !important;
  color: #94a3b8 !important;
  box-shadow: none !important;
  cursor: default !important;
}

/* 多行布局 */
.chat-input-box.is-multiline {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  row-gap: 12px;
  column-gap: 12px;
  border-radius: 12px;
  padding: 12px 12px 12px 16px;
  background: #fff;
  border-color: #e2e8f0;
}

.chat-input-box.is-multiline:focus-within {
  border-color: #6366f1;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.08);
}

.chat-input-box.is-multiline .input-text-area {
  grid-column: 1 / span 2;
  grid-row: 1;
}

:deep(.chat-input-box.is-multiline .text-input-inner .el-textarea__inner) {
  padding: 4px 0 12px 0;
}

.chat-input-box.is-multiline .media-uploader-wrapper {
  grid-column: 1;
  grid-row: 2;
  justify-self: start;
}

.chat-input-box.is-multiline .right-controls {
  grid-column: 2;
  grid-row: 2;
  justify-self: end;
}

.horizontal-divider {
  grid-column: 1 / span 2;
  grid-row: 1;
  align-self: end;
  border-bottom: 1px solid #f1f5f9;
  pointer-events: none;
  width: 100%;
}
</style>
