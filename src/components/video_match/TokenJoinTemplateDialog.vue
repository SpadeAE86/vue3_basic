<template>
  <el-dialog
    :model-value="isJoinTemplateDialogVisible"
    @update:model-value="emit('update:isJoinTemplateDialogVisible', $event)"
    title="调整串联模板"
    width="800px"
  >
    <div style="margin-bottom:12px;">
      可使用占位符，如 <code>{0}</code>, <code>{1}</code>, 或具体的类别如 <code>{visual}</code>, <code>{caption}</code> 等。
    </div>
    <el-input
      :model-value="currentTokenJoinTemplate"
      @update:model-value="emit('update:currentTokenJoinTemplate', $event)"
      type="textarea"
      :rows="5"
      placeholder="请输入串联模板"
    />
    <div v-if="previewTokenJoinFields && previewTokenJoinFields.length > 0" style="margin-top:16px;">
      <p style="font-weight:600;margin-bottom:8px;">可用占位符列表：</p>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        <el-tag v-for="f in previewTokenJoinFields" :key="f.key" size="small" type="info">
          {{ f.key }} : {{ f.value }}
        </el-tag>
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:isJoinTemplateDialogVisible', false)">取消</el-button>
      <el-button type="primary" @click="emit('submitTokenJoinTemplate')" :loading="isJoiningTemplate">应用</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
const props = defineProps<{
  isJoinTemplateDialogVisible: boolean
  isJoiningTemplate: boolean
  currentTokenJoinTemplate: string
  previewTokenJoinFields: any[]
}>()

const emit = defineEmits<{
  (e: 'update:isJoinTemplateDialogVisible', val: boolean): void
  (e: 'update:currentTokenJoinTemplate', val: string): void
  (e: 'submitTokenJoinTemplate'): void
}>()
</script>
