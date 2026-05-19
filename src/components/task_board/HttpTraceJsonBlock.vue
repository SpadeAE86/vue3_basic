<script setup lang="ts">
import { DocumentCopy } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  label: string
  modelValue: unknown
  preExtraClass?: string
}>()

function formatJson(v: unknown) {
  try {
    return JSON.stringify(v ?? null, null, 2)
  } catch {
    return String(v)
  }
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(formatJson(props.modelValue))
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}
</script>

<template>
  <div class="http-trace-json-block">
    <div class="field-label-row">
      <div class="field-label">{{ label }}</div>
      <el-button type="primary" link class="copy-json-btn" @click="copyJson">
        <el-icon class="copy-json-icon"><DocumentCopy /></el-icon>
        复制
      </el-button>
    </div>
    <slot name="before-body" />
    <pre class="code-block" :class="preExtraClass || undefined">{{ formatJson(modelValue) }}</pre>
  </div>
</template>

<style scoped>
.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
}

.field-label-row .field-label {
  margin: 0;
}

.copy-json-icon {
  margin-right: 4px;
  vertical-align: middle;
}

.code-block {
  margin: 0;
  padding: 12px 14px;
  background: #f5f5f5;
  border: 1px solid #e8e8e8;
  border-radius: 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  max-height: 400px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.code-block.muted {
  color: #8c8c8c;
}

.code-block--shot-trace {
  max-height: min(48vh, 520px);
}
</style>
