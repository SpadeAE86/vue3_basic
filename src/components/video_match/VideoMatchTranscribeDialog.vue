<template>
  <el-dialog
    :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)"
    title="分镜 · 转写与标签"
    width="600px"
    top="8vh"
    class="admin-dialog"
    align-center
    destroy-on-close
    @open="onOpen"
  >
    <template v-if="row">
      <div class="field-label">口播</div>
      <div class="text-panel">{{ row.segment_text || '—' }}</div>
      <div class="field-label">画面描述</div>
      <div class="text-panel">{{ row.description || '—' }}</div>
      <div class="field-label field-label--with-hint">
        结构化标签
        <span class="hint">点击标签循环切换 AND / OR / NOT</span>
      </div>
      <!-- 可编辑标签列表 -->
      <div v-if="!localTokens.length" class="muted">暂无结构化标签</div>
      <div v-else class="token-edit-box">
        <el-tag
          v-for="(t, idx) in localTokens"
          :key="t.id"
          :type="tagType(t)"
          :effect="tagEffect(t)"
          :round="true"
          class="token-chip editable"
          :style="getTagStyle(t, '999px')"
          :title="`当前: ${t.not ? 'NOT' : t.join ?? 'AND'}  — 点击切换`"
          @click="cycleTokenJoin(idx)"
        >
          <span v-if="idx !== 0" class="join">{{ t.not ? 'NOT' : (t.join ?? 'AND') }}</span>
          <span v-else-if="t.not" class="join">NOT</span>
          <span class="txt">{{ t.text }}</span>
        </el-tag>
      </div>
    </template>

    <template #footer>
      <div class="dialog-footer">
        <span v-if="dirty" class="dirty-hint">有未保存的修改</span>
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!dirty" @click="save">保存标签</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { SearchToken } from '@/components/video_analysis/TagSearchBar.vue'
import { tagType, tagEffect, getTagStyle } from '@/composables/search/useSearchTokenVisual'

const props = defineProps<{
  modelValue: boolean
  row: any
  tokens: SearchToken[]
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const localTokens = ref<SearchToken[]>([])
const saving = ref(false)
const dirty = ref(false)

function onOpen() {
  localTokens.value = props.tokens.map((t) => ({ ...t }))
  dirty.value = false
}

/** 循环切换 AND → OR → NOT → AND */
function cycleTokenJoin(idx: number) {
  const t = localTokens.value[idx]
  if (!t) return
  if (t.not) {
    t.not = false
    t.join = 'AND'
  } else if ((t.join ?? 'AND') === 'AND') {
    t.join = 'OR'
  } else {
    t.not = true
    t.join = 'AND'
  }
  dirty.value = true
}

async function save() {
  if (!props.row?.id || !dirty.value) return
  saving.value = true
  try {
    // 调用后端：PUT /video-match/jobs/{job_id}/shots/{shot_row_id}/tags
    // 目前后端暂无此接口，先只发 emit 给父组件处理
    emit('saved', { shotId: props.row.id, tokens: localTokens.value })
    dirty.value = false
    ElMessage.success('标签已更新（需重新匹配生效）')
    emit('update:modelValue', false)
  } catch (e: any) {
    ElMessage.error(`保存失败: ${e?.message ?? e}`)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.field-label {
  font-size: 13px;
  color: #606266;
  font-weight: 600;
  margin: 10px 0 4px;
}
.field-label--with-hint {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hint {
  font-size: 11px;
  color: #909399;
  font-weight: 400;
}
.text-panel {
  padding: 10px 12px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(0, 0, 0, 0.85);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 120px;
  overflow-y: auto;
}
.token-edit-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}
.token-chip.editable {
  cursor: pointer;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: opacity 0.15s, transform 0.1s;
}
.token-chip.editable:hover {
  opacity: 0.82;
  transform: scale(1.04);
}
.token-chip.editable :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}
.join {
  font-size: 11px;
  opacity: 0.75;
  line-height: 1;
}
.txt {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1;
}
.muted {
  font-size: 13px;
  color: #909399;
}
.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.dirty-hint {
  font-size: 12px;
  color: #e6a23c;
  margin-right: auto;
}
</style>