<script setup lang="ts">
defineProps<{
  modelValue: boolean
  loading: boolean
  isNew: boolean
  name: string
  content: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:name', value: string): void
  (e: 'update:content', value: string): void
  (e: 'save'): void
}>()

function onCancel() {
  emit('update:modelValue', false)
}

function onSave() {
  emit('save')
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :title="isNew ? '新建模板' : '编辑模板'"
    width="700px"
    append-to-body
    align-center
    class="template-edit-dialog"
  >
    <div v-loading="loading">
      <el-form label-width="80px">
        <el-form-item label="模板名称">
          <el-input
            :model-value="name"
            @update:model-value="emit('update:name', $event)"
            placeholder="请输入模板名称"
            :disabled="!isNew"
          />
        </el-form-item>
        <el-form-item label="模板内容">
          <el-input
            :model-value="content"
            @update:model-value="emit('update:content', $event)"
            type="textarea"
            :autosize="{ minRows: 15, maxRows: 30 }"
            placeholder="请输入系统提示词内容..."
          />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button @click="onCancel">取消</el-button>
      <el-button type="primary" @click="onSave" :loading="loading">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.template-edit-dialog :deep(.el-dialog) {
  background-color: var(--el-dialog-bg-color, #ffffff);
}
.template-edit-dialog :deep(.el-dialog__header) {
  background-color: var(--el-dialog-bg-color, #ffffff);
  margin-right: 0;
}
.template-edit-dialog :deep(.el-dialog__body) {
  background-color: var(--el-dialog-bg-color, #ffffff);
}
.template-edit-dialog :deep(.el-dialog__footer) {
  background-color: var(--el-dialog-bg-color, #ffffff);
}
</style>
