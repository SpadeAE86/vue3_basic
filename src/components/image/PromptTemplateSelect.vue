<script setup lang="ts">
import { computed } from 'vue'

interface TemplateInfo {
  name: string
  has_content: boolean
}

const props = defineProps<{
  modelValue: string
  templates: TemplateInfo[]
  placeholder?: string
  actionColor?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'create'): void
  (e: 'delete', name: string): void
  (e: 'refresh'): void
}>()

const value = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v),
})

function onChange(v: string) {
  if (v === '__create__') {
    // revert selection (keep current) then open dialog
    emit('update:modelValue', props.modelValue)
    emit('create')
  } else {
    emit('update:modelValue', v)
  }
}

function handleDelete(e: MouseEvent, name: string) {
  e.preventDefault()
  e.stopPropagation()
  emit('delete', name)
}
</script>

<template>
  <el-select
    :model-value="value"
    @update:model-value="value = $event"
    @change="onChange"
    :placeholder="placeholder ?? '选择系统模板'"
    size="small"
    placement="top-start"
    popper-class="template-select-dropdown"
    style="width: 220px"
    @visible-change="(v: boolean) => v && emit('refresh')"
  >
    <el-option :value="'__create__'" :label="'＋ 新建模板'" />

    <el-option v-for="tpl in templates" :key="tpl.name" :label="tpl.name" :value="tpl.name">
      <div class="opt-row">
        <span class="opt-label">{{ tpl.name }}</span>
        <el-button
          class="opt-del"
          link
          @click="(e: any) => handleDelete(e, tpl.name)"
          title="删除"
        >
          <el-icon><i-ep-close /></el-icon>
        </el-button>
      </div>
    </el-option>
  </el-select>
</template>

<style scoped>
.opt-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0;
}

.opt-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opt-del {
  margin-left: auto;
  color: #a8abb2;
  opacity: 0;
  pointer-events: none;
  padding: 0;
}

.opt-row:hover .opt-del {
  opacity: 1;
  pointer-events: auto;
}

.opt-del:hover {
  color: #606266;
}
</style>

<style>
/* 下拉最多展示 5 条，滚动 */
.template-select-dropdown .el-select-dropdown__wrap {
  max-height: 170px;
}
</style>

