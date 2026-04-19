<script setup lang="ts">
import PromptTemplateSelect from './PromptTemplateSelect.vue'
import MediaUploader, { type MediaFile } from './MediaUploader.vue'

interface TemplateInfo {
  name: string
  has_content: boolean
}

const props = defineProps<{
  prompt: string
  templates: TemplateInfo[]
  selectedTemplate: string
  beautifying?: boolean
  actionColor?: string
  referenceMedia?: MediaFile[]
  acceptTypes?: ('image' | 'video' | 'audio')[]
  disableMedia?: boolean
}>()

// Use props to avoid unused var warning
void props

const emit = defineEmits<{
  (e: 'update:prompt', v: string): void
  (e: 'update:selectedTemplate', v: string): void
  (e: 'update:referenceMedia', v: MediaFile[]): void
  (e: 'update:isUploading', v: boolean): void
  (e: 'createTemplate'): void
  (e: 'editTemplate'): void
  (e: 'downloadTemplate'): void
  (e: 'deleteTemplate', name: string): void
  (e: 'beautify'): void
}>()
</script>

<template>
  <div class="prompt-composer">
    <el-input
      :model-value="prompt"
      @update:model-value="(v: string) => emit('update:prompt', v)"
      type="textarea"
      :autosize="{ minRows: 4, maxRows: 8 }"
      placeholder="请输入生成提示词..."
      class="prompt-textarea"
    />

    <div class="composer-footer">
      <div class="reference-images-container">
        <MediaUploader 
          :model-value="referenceMedia || []" 
          @update:model-value="(v: MediaFile[]) => emit('update:referenceMedia', v)"
          @update:is-uploading="(v: boolean) => emit('update:isUploading', v)"
          :max-count="5"
          :accept-types="acceptTypes"
          :disabled="disableMedia"
        />
      </div>

      <div class="toolbar">
        <el-button-group class="left-btns">
        <el-button
          size="small"
          class="ghost-btn"
          :disabled="!selectedTemplate"
          @click="emit('editTemplate')"
          title="编辑模板"
        >
          <el-icon><i-ep-edit /></el-icon>
        </el-button>
        <el-button
          size="small"
          class="ghost-btn"
          :disabled="!selectedTemplate"
          @click="emit('downloadTemplate')"
          title="下载 .md"
        >
          <el-icon><i-ep-download /></el-icon>
        </el-button>
      </el-button-group>

      <PromptTemplateSelect
        :model-value="selectedTemplate"
        @update:model-value="(v) => emit('update:selectedTemplate', v)"
        :templates="templates"
        @create="emit('createTemplate')"
        @delete="(name) => emit('deleteTemplate', name)"
      />

      <el-button
        class="beautify-btn"
        circle
        size="small"
        :color="actionColor ?? '#6366f1'"
        :loading="beautifying"
        :disabled="!selectedTemplate"
        @click="emit('beautify')"
        title="美化提示词"
      >
        <el-icon v-if="!beautifying"><i-ep-magic-stick /></el-icon>
      </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prompt-composer {
  position: relative;
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 12px;
  background-color: #fff;
  transition: border-color 0.2s;
  display: flex;
  flex-direction: column;
}

.prompt-composer:focus-within {
  border-color: #409eff;
}

.composer-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 0 10px 10px 10px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 999px;
  background: #f3f4f6; /* 浅灰色背景，不再悬浮在文本上 */
}

.reference-images-container {
  z-index: 10;
}

:deep(.prompt-textarea .el-textarea__inner) {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  padding-bottom: 8px; /* 移除之前的 54px */
  border-radius: 12px 12px 0 0;
  resize: none;
}

.left-btns :deep(.el-button) {
  padding: 0 10px;
}

.beautify-btn {
  margin-left: 2px;
}

:deep(.toolbar .ghost-btn) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: #6b7280; /* 灰色低存在感 */
}

:deep(.toolbar .ghost-btn:hover) {
  background: rgba(99, 102, 241, 0.08); /* hover 才有紫色 hint */
  color: #6366f1;
}

:deep(.toolbar .ghost-btn:disabled) {
  opacity: 0.4;
}

/* 工具条里选择器做“无边框/更圆润” */
:deep(.toolbar .el-select__wrapper) {
  border: none !important;
  box-shadow: none !important;
  background: transparent;
  border-radius: 999px;
}

:deep(.toolbar .el-select__selection) {
  padding-left: 2px;
}

/* 把按钮/按钮组的边框阴影吃掉，融入浮层 */
:deep(.toolbar .el-button),
:deep(.toolbar .el-button-group) {
  box-shadow: none !important;
}

:deep(.toolbar .el-button) {
  border: none !important;
}

/* 让左侧按钮组和浮层背景一致，不要“突出来一块” */
:deep(.left-btns .el-button) {
  border-radius: 999px;
}

:deep(.beautify-btn) {
  background: #6366f1 !important;
  border: none !important;
  color: white !important;
  box-shadow: 0 6px 18px rgba(99, 102, 241, 0.35);
}

:deep(.beautify-btn:hover) {
  background: #4f46e5 !important;
  transform: translateY(-1px);
}
</style>

