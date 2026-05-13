<script setup lang="ts">
import { computed } from 'vue'
import type { SearchToken } from './TagSearchBar.vue'

const props = defineProps<{
  modelValue: boolean
  anchor: HTMLElement | null
  editingToken: SearchToken | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'save'): void
  (e: 'cancel'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})
</script>

<template>
  <el-popover
    v-model:visible="visible"
    placement="bottom-start"
    :width="360"
    trigger="manual"
    :virtual-ref="anchor"
    virtual-triggering
  >
    <div v-if="editingToken" class="editor">
      <div class="row">
        <span class="lab">类型</span>
        <el-segmented
          v-model="editingToken.type"
          :options="[{label: 'Keyword', value: 'keyword'}, {label: 'Text', value: 'text'}]"
          size="small"
          style="width: 160px"
        />
      </div>

      <div class="row">
        <span class="lab">逻辑</span>
        <el-checkbox v-model="editingToken.not" label="NOT" />
      </div>

      <div class="row">
        <span class="lab">连接</span>
        <el-segmented
          v-model="editingToken.join"
          :options="['AND', 'OR']"
          size="small"
          style="width: 160px"
        />
      </div>

      <div class="row">
        <span class="lab">内容</span>
        <el-input v-model="editingToken.text" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" />
      </div>

      <div class="btns">
        <el-button size="small" @click="emit('cancel')">取消</el-button>
        <el-button size="small" type="primary" @click="emit('save')">保存</el-button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lab {
  width: 40px;
  font-size: 12px;
  color: #606266;
}

.btns {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}
</style>
