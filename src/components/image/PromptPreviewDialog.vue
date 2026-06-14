<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
  title?: string
  content: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

function handleCopy() {
  if (!props.content) return
  navigator.clipboard.writeText(props.content)
  ElMessage.success('提示词已复制到剪贴板')
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title || '提示词预览'"
    width="600px"
    align-center
    class="premium-preview-dialog"
    :teleported="true"
  >
    <div class="dialog-body">
      <div class="preview-box">
        <pre class="preview-text">{{ content || '无内容' }}</pre>
      </div>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">关闭</el-button>
        <el-button type="primary" @click="handleCopy" :disabled="!content">
          <el-icon style="margin-right: 4px;"><i-ep-document-copy /></el-icon>
          复制提示词
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.premium-preview-dialog :deep(.el-dialog) {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(99, 102, 241, 0.15);
}

.premium-preview-dialog :deep(.el-dialog__header) {
  margin-right: 0;
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
}

.premium-preview-dialog :deep(.el-dialog__title) {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.dialog-body {
  padding: 20px 24px;
}

.preview-box {
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  max-height: 350px;
  overflow-y: auto;
}

.preview-text {
  margin: 0;
  font-family: inherit;
  font-size: 14px;
  color: #334155;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 0 24px 20px 24px;
}
</style>
