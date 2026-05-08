<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
  mode: 'edit' | 'create'
  initialName?: string
  initialIsDefault?: boolean
  bm25Weight: number
  vectorWeight: number
  textWeights: Record<string, number>
  vectorWeights: Record<string, number>
  indexFields: { text_fields: string[]; vector_fields: string[] }
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'update:bm25Weight', val: number): void
  (e: 'update:vectorWeight', val: number): void
  (e: 'update:textWeights', val: Record<string, number>): void
  (e: 'update:vectorWeights', val: Record<string, number>): void
  (e: 'save', data: { name: string; isDefault: boolean }): void
  (e: 'change'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const localName = ref(props.initialName || '')
const localIsDefault = ref(props.initialIsDefault || false)

const localBm25 = ref(props.bm25Weight)
const localVector = ref(props.vectorWeight)
const localTextWeights = ref<Record<string, number>>({ ...props.textWeights })
const localVectorWeights = ref<Record<string, number>>({ ...props.vectorWeights })

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    localName.value = props.initialName || ''
    localIsDefault.value = props.initialIsDefault || false
    localBm25.value = props.bm25Weight
    localVector.value = props.vectorWeight
    localTextWeights.value = { ...props.textWeights }
    localVectorWeights.value = { ...props.vectorWeights }
  }
})

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
    width="500px" 
    append-to-body
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
          <div class="section-title">向量字段权重 (KNN)</div>
          <div v-for="field in indexFields.vector_fields" :key="field" class="slider-row mini">
            <span class="label" :title="field">{{ field }}</span>
            <div class="custom-slider-group">
              <el-slider
                :model-value="Math.min(localVectorWeights[field] || 0, 2)"
                @update:model-value="localVectorWeights[field] = $event; onSliderChange()"
                :min="0"
                :max="2"
                :step="0.1"
                :show-input="false"
              />
              <el-input-number
                v-model="localVectorWeights[field]"
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
}
</style>
