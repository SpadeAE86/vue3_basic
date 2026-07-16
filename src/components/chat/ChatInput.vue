<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import MediaUploader, { type MediaFile } from '@/components/image/MediaUploader.vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'

const props = withDefaults(defineProps<{
  disabled?: boolean
  roleId?: string
  tokenInfo?: {
    token_count: number
    threshold: number
    percent: number
  } | null
}>(), {
  roleId: 'default',
  tokenInfo: null
})

const emit = defineEmits<{
  send: [text: string, referenceMedia: MediaFile[], model: string]
  'update:roleId': [roleId: string]
}>()

const inputText = ref('')
const referenceMedia = ref<MediaFile[]>([])
const isUploading = ref(false)
const models = ref<{ display_name: string, real_name: string }[]>([])
const selectedModel = ref('gpt-5.4')
const roles = ref<{ id: string, name: string, description?: string, avatar_emoji?: string }[]>([])

const strokeDasharray = 62.83
const strokeDashoffset = computed(() => {
  if (!props.tokenInfo) return strokeDasharray
  const pct = Math.max(0, Math.min(100, props.tokenInfo.percent))
  return strokeDasharray * (1 - pct / 100)
})

const circleColor = computed(() => {
  if (!props.tokenInfo) return '#cbd5e1'
  const pct = props.tokenInfo.percent
  if (pct < 50) return '#10b981'
  if (pct < 80) return '#eab308'
  return '#ef4444'
})

// 获取角色列表
async function loadRoles() {
  try {
    const res = await fetch('/api/chat/roles')
    if (res.ok) {
      roles.value = await res.json()
      // If parent has no roleId or it's invalid, default to CC or the first role
      if (!props.roleId && roles.value[0]) {
        emit('update:roleId', roles.value[0].id)
      }
    }
  } catch (e) {
    console.error('获取角色列表失败:', e)
  }
}

// 角色头像文字 (第一个字)
const selectedRoleInitial = computed(() => {
  const current = roles.value.find(r => r.id === props.roleId)
  if (current && current.name) {
    return current.name.charAt(0).toUpperCase()
  }
  return 'C'
})

// 角色头像背景颜色分配
const selectedRoleColor = computed(() => {
  const id = props.roleId || 'default'
  if (id === 'default') return '#6366f1' // CC purple
  if (id === 'neuro') return '#ec4899'   // Pink
  // Hash ID to generate a hue
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 60%, 50%)`
})

function getRoleColor(id: string) {
  if (id === 'default') return '#6366f1'
  if (id === 'neuro') return '#ec4899'
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 60%, 50%)`
}

function selectRole(id: string) {
  emit('update:roleId', id)
}

async function handleCreateRole() {
  try {
    const { value: name } = await ElMessageBox.prompt(
      '请输入新角色的名称',
      '新建角色',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '角色名称不能为空',
      }
    )
    if (!name) return

    const res = await fetch('/api/chat/roles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    })

    if (res.ok) {
      const data = await res.json()
      if (data.ok && data.role) {
        ElMessage.success(`角色「${name}」新建成功`)
        await loadRoles()
        selectRole(data.role.id)
      } else {
        ElMessage.error(`新建失败: ${data.error || '未知错误'}`)
      }
    } else {
      ElMessage.error('新建角色接口响应异常')
    }
  } catch (err) {
    if (err !== 'cancel') {
      console.error('Failed to create role:', err)
      ElMessage.error('新建角色出现异常')
    }
  }
}

// 自动获取后端支持的模型列表
onMounted(async () => {
  await loadRoles()
  try {
    const res = await fetch('/api/chat/models')
    if (res.ok) {
      models.value = await res.json()
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

      <!-- 右侧/底部控制栏（角色选择、模型选择、发送按钮） -->
      <div class="right-controls">
        <!-- 上下文 Token 压缩监控环 -->
        <el-tooltip
          v-if="tokenInfo"
          placement="top"
          :content="`上下文长度: ${tokenInfo.token_count} / ${tokenInfo.threshold} tokens (已用 ${tokenInfo.percent}%)`"
        >
          <div class="context-token-circle">
            <svg class="progress-ring" width="28" height="28">
              <!-- 背景圆环 -->
              <circle
                class="progress-ring__background"
                stroke="rgba(0, 0, 0, 0.08)"
                stroke-width="2.5"
                fill="transparent"
                r="10"
                cx="14"
                cy="14"
              />
              <!-- 进度圆环 -->
              <circle
                class="progress-ring__circle"
                :stroke="circleColor"
                stroke-width="2.5"
                fill="transparent"
                r="10"
                cx="14"
                cy="14"
                :stroke-dasharray="strokeDasharray"
                :stroke-dashoffset="strokeDashoffset"
                stroke-linecap="round"
              />
            </svg>
            <span class="circle-inner-dot" :style="{ backgroundColor: circleColor }"></span>
          </div>
        </el-tooltip>

        <!-- 角色选择 -->
        <el-popover
          placement="top"
          :width="220"
          trigger="click"
          popper-class="role-select-popover"
        >
          <template #reference>
            <div class="role-avatar-trigger" :style="{ backgroundColor: selectedRoleColor }" title="选择角色">
              <span class="role-avatar-text">{{ selectedRoleInitial }}</span>
            </div>
          </template>

          <div class="role-popover-content">
            <div class="role-popover-header" @click="handleCreateRole">
              <el-icon><Plus /></el-icon>
              <span>新建角色</span>
            </div>
            <div class="role-divider"></div>
            <el-scrollbar max-height="200px">
              <div class="role-list">
                <div
                  v-for="r in roles"
                  :key="r.id"
                  class="role-item"
                  :class="{ 'is-active': r.id === roleId }"
                  @click="selectRole(r.id)"
                >
                  <div class="role-item-avatar" :style="{ backgroundColor: getRoleColor(r.id) }">
                    {{ r.name.charAt(0).toUpperCase() }}
                  </div>
                  <div class="role-item-info">
                    <div class="role-item-name">{{ r.name }}</div>
                    <div class="role-item-desc">{{ r.description || '自定义人设角色' }}</div>
                  </div>
                </div>
              </div>
            </el-scrollbar>
          </div>
        </el-popover>

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

:deep(.media-uploader-wrapper .upload-btn) {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: #64748b;
  transition: all 0.2s;
  box-shadow: none !important;
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

/* 角色选择样式 */
.role-avatar-trigger {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  cursor: pointer;
  font-size: 14px;
  user-select: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.role-avatar-trigger:hover {
  transform: scale(1.08);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
}

.role-popover-content {
  display: flex;
  flex-direction: column;
}

.role-popover-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  color: #6366f1;
  font-weight: 600;
  font-size: 13px;
  transition: background 0.2s;
  border-radius: 6px;
}

.role-popover-header:hover {
  background: rgba(99, 102, 241, 0.05);
}

.role-divider {
  height: 1px;
  background: #f1f5f9;
  margin: 4px 0;
}

.role-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
}

.role-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.role-item:hover {
  background: #f1f5f9;
}

.role-item.is-active {
  background: rgba(99, 102, 241, 0.06);
}

.role-item-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.role-item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.role-item-name {
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-item.is-active .role-item-name {
  color: #6366f1;
  font-weight: 600;
}

.role-item-desc {
  font-size: 11px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 1px;
}

.context-token-circle {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  margin-right: 4px;
}

.progress-ring {
  transform: rotate(-90deg);
}

.progress-ring__background {
  stroke: rgba(0, 0, 0, 0.08);
}

.chat-input-box:focus-within .progress-ring__background {
  stroke: rgba(0, 0, 0, 0.05);
}

.progress-ring__circle {
  transition: stroke-dashoffset 0.35s;
  transform-origin: 50% 50%;
}

.circle-inner-dot {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  top: 12px;
  left: 12px;
}
</style>
