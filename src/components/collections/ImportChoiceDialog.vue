<script setup lang="ts">
import { defineProps, defineEmits } from 'vue'

defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'choice', value: 'files' | 'folder'): void
}>()

function handleChoice(type: 'files' | 'folder') {
  emit('choice', type)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="v => emit('update:modelValue', v)"
    title="选择导入类型"
    width="400px"
    align-center
    class="import-choice-dialog"
  >
    <div class="import-choice-body">
      <div class="choice-option" @click="handleChoice('files')">
        <div class="option-icon">📷</div>
        <div class="option-info">
          <div class="option-title">导入媒体文件</div>
          <div class="option-desc">从本地选择图片或视频文件上传至云端并加入收藏</div>
        </div>
      </div>
      <div class="choice-option" @click="handleChoice('folder')">
        <div class="option-icon">📂</div>
        <div class="option-info">
          <div class="option-title">关联本地文件夹</div>
          <div class="option-desc">将整个本地文件夹以胶囊标签页的形式关联，同步浏览</div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.import-choice-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 4px;
}

.choice-option {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.choice-option:hover {
  background: #ffffff;
  border-color: #6366f1;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.08);
  transform: translateY(-2px);
}

.choice-option:hover .option-icon {
  transform: scale(1.15);
}

.option-icon {
  font-size: 28px;
  transition: transform 0.2s ease;
}

.option-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.option-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.option-desc {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}
</style>
