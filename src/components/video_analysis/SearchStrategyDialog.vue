<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

/** 非 RRF：OpenSearch hybrid 1×BM25 + 最多 4×KNN */
const MAX_ACTIVE_VECTOR_ROUTES_FLAT = 4

const props = defineProps<{
  modelValue: boolean
  mode: 'edit' | 'create'
  initialName?: string
  initialIsDefault?: boolean
  bm25Weight: number
  vectorWeight: number
  textWeights: Record<string, number>
  vectorWeights: Record<string, number>
  useRrf: boolean
  indexFields: { text_fields: string[]; vector_fields: string[] }
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'update:bm25Weight', val: number): void
  (e: 'update:vectorWeight', val: number): void
  (e: 'update:textWeights', val: Record<string, number>): void
  (e: 'update:vectorWeights', val: Record<string, number>): void
  (e: 'update:useRrf', val: boolean): void
  (e: 'save', data: { name: string; isDefault: boolean }): void
  (e: 'change'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const maxActiveVectorRoutes = computed(() =>
  props.useRrf ? Math.max(32, props.indexFields.vector_fields?.length || 0) : MAX_ACTIVE_VECTOR_ROUTES_FLAT,
)

const localName = ref(props.initialName || '')
const localIsDefault = ref(props.initialIsDefault || false)

const localBm25 = ref(props.bm25Weight)
const localVector = ref(props.vectorWeight)
const localTextWeights = ref<Record<string, number>>({ ...props.textWeights })
const localVectorWeights = ref<Record<string, number>>({ ...props.vectorWeights })

function zeroAllVectorFields(): Record<string, number> {
  const o: Record<string, number> = {}
  for (const f of props.indexFields.vector_fields) {
    o[f] = 0
  }
  return o
}

function syncDialogFromProps() {
  localName.value = props.initialName || ''
  localIsDefault.value = props.initialIsDefault || false
  localBm25.value = props.bm25Weight
  localVector.value = props.vectorWeight
  localTextWeights.value = { ...props.textWeights }
  if (props.mode === 'create') {
    localVectorWeights.value = zeroAllVectorFields()
  } else {
    localVectorWeights.value = { ...props.vectorWeights }
  }
}

watch(() => props.modelValue, (open) => {
  if (open) syncDialogFromProps()
})

/** 新建弹窗打开时 index 字段可能晚于弹窗到达，补 0 */
watch(
  () => props.indexFields.vector_fields,
  (fields) => {
    if (!props.modelValue || props.mode !== 'create' || !fields?.length) return
    const next = { ...localVectorWeights.value }
    let touched = false
    for (const f of fields) {
      if (next[f] === undefined) {
        next[f] = 0
        touched = true
      }
    }
    if (touched) localVectorWeights.value = next
  },
  { deep: true },
)

function setVectorFieldWeight(field: string, raw: number | null | undefined) {
  const next = Number(raw)
  if (!Number.isFinite(next)) return
  const prev = localVectorWeights.value[field] ?? 0
  if (next > 0 && prev <= 0) {
    const others = Object.entries(localVectorWeights.value).filter(
      ([k, v]) => k !== field && (v ?? 0) > 0,
    ).length
    if (others >= maxActiveVectorRoutes.value) {
      ElMessage.warning(
        props.useRrf
          ? `向量路最多启用 ${maxActiveVectorRoutes.value} 条`
          : `向量路最多启用 ${maxActiveVectorRoutes.value} 条（OpenSearch hybrid 上限为 5 子查询）`,
      )
      return
    }
  }
  localVectorWeights.value = { ...localVectorWeights.value, [field]: next }
  onSliderChange()
}

function onRrfToggle(val: boolean) {
  emit('update:useRrf', val)
  onSliderChange()
}

function onSliderChange() {
  emit('update:bm25Weight', localBm25.value)
  emit('update:vectorWeight', localVector.value)
  emit('update:textWeights', localTextWeights.value)
  emit('update:vectorWeights', localVectorWeights.value)
  emit('change')
}

function handleSave() {
  if (!localName.value.trim()) {
    ElMessage.warning('策略名称不能为空')
    return
  }
  emit('save', { name: localName.value.trim(), isDefault: localIsDefault.value })
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="mode === 'create' ? '保存搜索策略' : '编辑搜索权重'"
    width="560px"
    align-center
    append-to-body
    destroy-on-close
    class="search-strategy-dialog"
  >
    <div class="sliders-container">
      <el-form v-if="mode === 'create'" label-width="80px">
        <el-form-item label="策略名称">
          <el-input v-model="localName" placeholder="例如：偏向关键词匹配" />
        </el-form-item>
        <el-form-item label="设为默认">
          <el-switch v-model="localIsDefault" />
        </el-form-item>
      </el-form>
      
      <div class="sliders" :style="mode === 'create' ? 'margin-top: 20px; padding: 0 10px;' : ''">
        <div class="slider-row rrf-row">
          <span class="label">RRF 融合</span>
          <div class="rrf-hint-wrap">
            <el-switch
              :model-value="props.useRrf"
              inline-prompt
              active-text="开"
              inactive-text="关"
              @update:model-value="onRrfToggle"
            />
            <span class="rrf-caption">开启后模糊检索按排名融合；可启用更多向量路。宏观「BM25/向量」权重对后端不参与。</span>
          </div>
        </div>
        <template v-if="!props.useRrf">
        <div class="slider-row">
          <span class="label">BM25 权重</span>
          <div class="custom-slider-group">
            <el-slider
              :model-value="Math.min(localBm25, 2)"
              @update:model-value="localBm25 = $event; onSliderChange()"
              :min="0"
              :max="2"
              :step="0.1"
              :show-input="false"
            />
            <el-input-number
              v-model="localBm25"
              :min="0"
              :max="10"
              :step="0.1"
              size="small"
              controls-position="right"
              @change="onSliderChange"
            />
          </div>
        </div>
        <div class="slider-row">
          <span class="label">向量 权重</span>
          <div class="custom-slider-group">
            <el-slider
              :model-value="Math.min(localVector, 2)"
              @update:model-value="localVector = $event; onSliderChange()"
              :min="0"
              :max="2"
              :step="0.1"
              :show-input="false"
            />
            <el-input-number
              v-model="localVector"
              :min="0"
              :max="10"
              :step="0.1"
              size="small"
              controls-position="right"
              @change="onSliderChange"
            />
          </div>
        </div>
        </template>
        
        <el-divider v-if="indexFields.text_fields.length || indexFields.vector_fields.length" border-style="dashed" />
        
        <div v-if="indexFields.text_fields.length" class="field-weights-section">
          <div class="section-title">文本字段权重 (BM25)</div>
          <div v-for="field in indexFields.text_fields" :key="field" class="slider-row mini">
            <span class="label" :title="field">{{ field }}</span>
            <div class="custom-slider-group">
              <el-slider
                :model-value="Math.min(localTextWeights[field] || 0, 2)"
                @update:model-value="localTextWeights[field] = $event; onSliderChange()"
                :min="0"
                :max="2"
                :step="0.1"
                :show-input="false"
              />
              <el-input-number
                v-model="localTextWeights[field]"
                :min="0"
                :max="10"
                :step="0.1"
                size="small"
                controls-position="right"
                @change="onSliderChange"
              />
            </div>
          </div>
        </div>
        
        <div v-if="indexFields.vector_fields.length" class="field-weights-section">
          <div class="section-title">
            向量字段权重 (KNN)
            <span class="section-hint">· 权重 0 不生效</span>
            <span class="section-hint">· 最多启用 {{ props.useRrf ? '不限（受字段数限制）' : maxActiveVectorRoutes }} 路</span>
          </div>
          <div
            v-for="field in indexFields.vector_fields"
            :key="field"
            class="slider-row mini"
            :class="{ inactive: !(localVectorWeights[field] > 0) }"
          >
            <span class="label" :title="field">{{ field }}</span>
            <div class="custom-slider-group">
              <el-slider
                :model-value="Math.min(localVectorWeights[field] || 0, 2)"
                @update:model-value="setVectorFieldWeight(field, $event)"
                :min="0"
                :max="2"
                :step="0.1"
                :show-input="false"
              />
              <el-input-number
                :model-value="localVectorWeights[field] ?? 0"
                :min="0"
                :max="10"
                :step="0.1"
                size="small"
                controls-position="right"
                @update:model-value="setVectorFieldWeight(field, $event)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <template #footer>
      <template v-if="mode === 'create'">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
      <template v-else>
        <el-button @click="visible = false">关闭</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
/* append-to-body 时可能拿不到页面内的 --el-bg-color，用对话框专用色 + 实色兜底避免透底 */
.search-strategy-dialog :deep(.el-dialog) {
  background-color: var(--el-dialog-bg-color, #ffffff);
  border-radius: var(--el-dialog-border-radius, 4px);
}

.search-strategy-dialog :deep(.el-dialog__header) {
  background-color: var(--el-dialog-bg-color, #ffffff);
  padding-bottom: 12px;
  margin-right: 0;
}

.search-strategy-dialog :deep(.el-dialog__body) {
  background-color: var(--el-dialog-bg-color, #ffffff);
  padding: 16px 20px;
  box-sizing: border-box;
}

.search-strategy-dialog :deep(.el-dialog__footer) {
  padding: 12px 20px;
  border-top: 1px solid var(--el-border-color-lighter);
  background-color: var(--el-dialog-bg-color, #ffffff);
  box-sizing: border-box;
}

.sliders-container {
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 10px;
}

.sliders-container::-webkit-scrollbar {
  width: 6px;
}
.sliders-container::-webkit-scrollbar-track {
  background: transparent;
}
.sliders-container::-webkit-scrollbar-thumb {
  background: #dcdfe6;
  border-radius: 3px;
}

.sliders {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 10px;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.slider-row .label {
  width: 80px;
  font-size: 13px;
  color: #606266;
}

.custom-slider-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.custom-slider-group :deep(.el-slider) {
  flex: 1;
}

.custom-slider-group :deep(.el-input-number) {
  width: 100px;
}

.slider-row.mini {
  gap: 8px;
}

.slider-row.mini .label {
  width: 100px;
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-weights-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
  line-height: 1.4;
}

.section-hint {
  margin-left: 6px;
  font-weight: 400;
  font-size: 12px;
  color: #909399;
}

.slider-row.mini.inactive .label {
  color: #c0c4cc;
}

.rrf-row {
  align-items: flex-start;
}
.rrf-hint-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rrf-caption {
  font-size: 12px;
  color: #909399;
  line-height: 1.45;
}
</style>
