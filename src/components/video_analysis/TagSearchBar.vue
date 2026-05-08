<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getSearchStrategiesApi, saveSearchStrategyApi, deleteSearchStrategyApi, type SearchStrategy } from '@/api/video_analysis'
import SearchStrategySelect from './SearchStrategySelect.vue'
import SearchStrategyDialog from './SearchStrategyDialog.vue'
import TokenEditPopover from './TokenEditPopover.vue'

export type TokenJoin = 'AND' | 'OR'

export type TokenType = 'keyword' | 'text'

export type SearchToken = {
  id: string
  text: string
  join?: TokenJoin // join with previous token (ignored for first)
  not?: boolean
  type?: TokenType
}

const props = withDefaults(
  defineProps<{
    modelValue: SearchToken[]
    strategyWeights: { 
      bm25_weight: number; 
      vector_weight: number;
      text_weights?: Record<string, number>;
      vector_weights?: Record<string, number>;
    }
    workspace?: string
    loading?: boolean
    fuzzy?: boolean
    placeholder?: string
    maxPreviewChars?: number
    radius?: string
  }>(),
  {
    modelValue: () => [],
    workspace: 'v2',
    loading: false,
    fuzzy: true,
    placeholder: '输入标签回车添加；空格可分词',
    maxPreviewChars: 6,
    radius: '999px',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: SearchToken[]): void
  (e: 'update:strategyWeights', v: { 
    bm25_weight: number; 
    vector_weight: number;
    text_weights?: Record<string, number>;
    vector_weights?: Record<string, number>;
  }): void
  (e: 'update:fuzzy', v: boolean): void
  (e: 'search'): void
}>()

// --- 搜索策略相关逻辑 ---
const strategies = ref<SearchStrategy[]>([])
const selectedStrategy = ref<string>('')
const editDialogVisible = ref(false)
const createDialogVisible = ref(false)

const localBm25 = ref(props.strategyWeights.bm25_weight)
const localVector = ref(props.strategyWeights.vector_weight)
const localTextWeights = ref<Record<string, number>>(props.strategyWeights.text_weights || {})
const localVectorWeights = ref<Record<string, number>>(props.strategyWeights.vector_weights || {})

const newStrategyName = ref('')
const newStrategyIsDefault = ref(false)

const indexFields = ref<{text_fields: string[], vector_fields: string[]}>({
  text_fields: [],
  vector_fields: []
})

async function fetchIndexFields() {
  try {
    const ws = props.workspace || 'v2' 
    const res = await fetch(`/api/video-analysis/index-fields?workspace=${ws}`).then(r => r.json())
    if (res.success) {
      indexFields.value = {
        text_fields: res.text_fields || [],
        vector_fields: res.vector_fields || []
      }
      
      // Initialize default weights if not present
      res.text_fields.forEach((f: string) => {
        if (localTextWeights.value[f] === undefined) localTextWeights.value[f] = 1.0
      })
      res.vector_fields.forEach((f: string) => {
        if (localVectorWeights.value[f] === undefined) localVectorWeights.value[f] = 1.0
      })
    }
  } catch (e) {
    console.error('Failed to fetch index fields', e)
  }
}

async function loadStrategies() {
  try {
    const res = await getSearchStrategiesApi()
    if (res.success) {
      strategies.value = res.strategies
      if (!selectedStrategy.value) {
        const def = strategies.value.find((s) => s.is_default)
        if (def) {
          applyStrategy(def)
        }
      }
    }
  } catch (e) {
    console.error('Failed to load search strategies', e)
  }
}

function applyStrategy(s: SearchStrategy) {
  selectedStrategy.value = s.name
  localBm25.value = s.bm25_weight
  localVector.value = s.vector_weight
  localTextWeights.value = s.text_weights || {}
  localVectorWeights.value = s.vector_weights || {}
  emitUpdate()
}

watch(selectedStrategy, (newVal) => {
  if (newVal) {
    const s = strategies.value.find(x => x.name === newVal)
    if (s) {
      localBm25.value = s.bm25_weight
      localVector.value = s.vector_weight
      localTextWeights.value = s.text_weights || {}
      localVectorWeights.value = s.vector_weights || {}
      emitUpdate()
    }
  }
})

function onSliderChange() {
  // 如果修改了权重，但当前选中了某个预设，我们自动取消选中（或者你可以选择覆盖它，这里选择保持原逻辑：修改即自定义）
  // 但因为组件要求必须有个名字，我们可以暂时不清除 selectedStrategy，或者你可以设计一个 "自定义" 选项
  // 这里为了简单，我们直接 emit 更新，并触发搜索
  emitUpdate()
}

function emitUpdate() {
  emit('update:strategyWeights', {
    bm25_weight: localBm25.value,
    vector_weight: localVector.value,
    text_weights: localTextWeights.value,
    vector_weights: localVectorWeights.value
  })
  emit('search')
}

async function handleSaveStrategy(data: { name: string; isDefault: boolean }) {
  try {
    const res = await saveSearchStrategyApi({
      name: data.name,
      bm25_weight: localBm25.value,
      vector_weight: localVector.value,
      text_weights: localTextWeights.value,
      vector_weights: localVectorWeights.value,
      is_default: data.isDefault,
    })
    if (res.success) {
      ElMessage.success('保存成功')
      createDialogVisible.value = false
      await loadStrategies()
      selectedStrategy.value = data.name
    } else {
      ElMessage.error(res.error || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

async function handleDeleteStrategy(name: string) {
  const s = strategies.value.find(x => x.name === name)
  if (!s?.id) return
  try {
    const res = await deleteSearchStrategyApi(s.id)
    if (res.success) {
      ElMessage.success('删除成功')
      if (selectedStrategy.value === name) {
        selectedStrategy.value = ''
      }
      await loadStrategies()
    }
  } catch (e) {
    ElMessage.error('删除失败')
  }
}

watch(() => props.workspace, () => {
  fetchIndexFields()
})

import { onMounted } from 'vue'
onMounted(() => {
  loadStrategies()
  fetchIndexFields()
})
// ------------------------

const inputText = ref('')
const editing = ref<SearchToken | null>(null)
const editorOpen = ref(false)
const popoverAnchor = ref<HTMLElement | null>(null)

const tokens = computed(() => props.modelValue ?? [])

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeTokens(s: string) {
  return String(s)
    .split(/[\s,，;；]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function addFromInput() {
  const raw = inputText.value.trim()
  if (!raw) return

  const parts = normalizeTokens(raw)
  const next: SearchToken[] = [...tokens.value]
  for (const p of parts) {
    next.push({
      id: uid(),
      text: p,
      join: next.length === 0 ? 'AND' : 'AND',
      not: false,
      type: p.length >= 10 ? 'text' : 'keyword',
    })
  }
  emit('update:modelValue', next)
  inputText.value = ''
}

function removeToken(id: string) {
  const next = tokens.value.filter((t) => t.id !== id)
  emit('update:modelValue', next)
}

// 记录打开编辑器时的原始状态，用于取消时回滚
let originalTokenState: SearchToken | null = null

function openEditor(e: MouseEvent, t: SearchToken) {
  popoverAnchor.value = e.currentTarget as HTMLElement
  // 保存原始状态的深拷贝用于回滚
  originalTokenState = JSON.parse(JSON.stringify(t))
  // 直接引用原对象，实现即时响应
  editing.value = t
  editorOpen.value = true
}

function saveEditor() {
  if (!editing.value) return
  const text = editing.value.text.trim()
  if (!text) {
    ElMessage.warning('内容不能为空')
    return
  }
  // 触发 emit 让外部知道更新（触发搜索等）
  emit('update:modelValue', [...tokens.value])
  editorOpen.value = false
  originalTokenState = null
}

function cancelEditor() {
  if (editing.value && originalTokenState) {
    // 恢复原始状态
    Object.assign(editing.value, originalTokenState)
  }
  editing.value = null
  editorOpen.value = false
  originalTokenState = null
}

function previewText(t: SearchToken) {
  const s = t.text ?? ''
  const max = props.maxPreviewChars
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function tagType(t: SearchToken): 'primary' | 'success' | 'danger' | 'info' {
  if (t.not) return 'danger'
  if (t.type === 'text') return 'info'
  if ((t.join ?? 'AND') === 'OR') return 'success'
  return 'primary'
}

function tagEffect(t: SearchToken): 'plain' | 'light' {
  return t.type === 'text' ? 'plain' : 'light'
}

function getTagStyle(t: SearchToken) {
  const radius = props.radius

  // 统一颜色基准
  let baseColor = '#409eff' // primary
  let lightBorder = '#d9ecff'
  let lightBg = '#318ff1'

  if (t.not) {
    baseColor = '#f56c6c'
    lightBorder = '#fde2e2'
    lightBg = '#fef0f0'
  } else if ((t.join ?? 'AND') === 'OR') {
    baseColor = '#67c23a'
    lightBorder = '#e1f3d8'
    lightBg = '#f0f9eb'
  }

  // ✅ keyword：实心风格
  if (t.type !== 'text') {
    return {
      borderRadius: radius,
      backgroundColor: baseColor,
      borderColor: baseColor, // 和 text 语义一致（同一套色）
      color: '#fff',
      borderStyle: 'solid',
      borderWidth: '1px'
    }
  }

  // ✅ text：轻量风格
  return {
    borderRadius: radius,
    backgroundColor: '#fff', // 或 transparent
    borderColor: baseColor,
    color: baseColor,
    borderStyle: 'solid',
    borderWidth: '1px'
  }
}

function handleEnterKey() {
  if (inputText.value.trim()) {
    // 有文字 → 先形成 label
    addFromInput()
  } else if (tokens.value.length > 0) {
    // 输入框已空且有 label → 发起搜索
    emit('search')
  }
}
</script>

<template>
  <div class="tag-search-composer">
    <div class="token-box">
      <el-tag
        v-for="(t, idx) in tokens"
        :key="t.id"
        :type="tagType(t)"
        :effect="tagEffect(t)"
        :round="true"
        class="token"
        :style="getTagStyle(t)"
        @click="(e) => openEditor(e, t)"
      >
        <span v-if="idx !== 0" class="join">{{ t.join ?? 'AND' }}</span>
        <span v-if="t.not" class="not">NOT</span>
        <el-tooltip :content="t.text" placement="top" :show-after="350">
          <span class="txt">{{ previewText(t) }}</span>
        </el-tooltip>
        <el-icon class="x" @click.stop="removeToken(t.id)"><i-ep-close /></el-icon>
      </el-tag>

      <el-input
        v-model="inputText"
        :placeholder="placeholder"
        class="inp"
        @keydown.enter.prevent="handleEnterKey"
      />
    </div>

    <div class="composer-footer">
      <div class="left-area">
        <el-icon v-if="loading" class="search-loading" title="远程搜索中…">
          <i-ep-loading />
        </el-icon>
      </div>

      <!-- 搜索策略配置工具栏，和 PromptComposer 类似的一体化设计 -->
      <div class="toolbar">
        <el-button
          v-if="fuzzy !== undefined"
          size="small"
          class="ghost-btn fuzzy-toggle-btn"
          :class="{ 'is-fuzzy': fuzzy }"
          @click="emit('update:fuzzy', !fuzzy)"
          :title="fuzzy ? '当前：模糊检索 (包含向量)' : '当前：精准检索 (仅关键词)'"
        >
          <el-icon class="fuzzy-icon">
            <i-ep-connection v-if="fuzzy" />
            <i-ep-aim v-else />
          </el-icon>
          <span>{{ fuzzy ? '模糊' : '精准' }}</span>
        </el-button>
        
        <SearchStrategySelect
          v-model="selectedStrategy"
          :strategies="strategies"
          @create="createDialogVisible = true"
          @delete="handleDeleteStrategy"
          @refresh="loadStrategies"
        />

        <el-button
          class="beautify-btn"
          circle
          size="small"
          color="#6366f1"
          :disabled="!selectedStrategy"
          @click="editDialogVisible = true"
          title="配置权重"
        >
          <el-icon><i-ep-setting /></el-icon>
        </el-button>
      </div>
    </div>

    <SearchStrategyDialog
      v-model="editDialogVisible"
      mode="edit"
      :bm25-weight="localBm25"
      :vector-weight="localVector"
      :text-weights="localTextWeights"
      :vector-weights="localVectorWeights"
      :index-fields="indexFields"
      @update:bm25-weight="localBm25 = $event"
      @update:vector-weight="localVector = $event"
      @update:text-weights="localTextWeights = $event"
      @update:vector-weights="localVectorWeights = $event"
      @change="onSliderChange"
    />

    <SearchStrategyDialog
      v-model="createDialogVisible"
      mode="create"
      :initial-name="newStrategyName"
      :initial-is-default="newStrategyIsDefault"
      :bm25-weight="localBm25"
      :vector-weight="localVector"
      :text-weights="localTextWeights"
      :vector-weights="localVectorWeights"
      :index-fields="indexFields"
      @update:bm25-weight="localBm25 = $event"
      @update:vector-weight="localVector = $event"
      @update:text-weights="localTextWeights = $event"
      @update:vector-weights="localVectorWeights = $event"
      @change="onSliderChange"
      @save="handleSaveStrategy"
    />

    <TokenEditPopover
      v-model="editorOpen"
      :anchor="popoverAnchor"
      :editing-token="editing"
      @save="saveEditor"
      @cancel="cancelEditor"
    />
  </div>
</template>

<style scoped>
.tag-search-composer {
  position: relative;
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 12px;
  background-color: #fff;
  transition: border-color 0.2s;
  display: flex;
  flex-direction: column;
}

.tag-search-composer:focus-within {
  border-color: #409eff;
}

.token-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  min-height: 40px;
  max-height: 120px;
  overflow-y: auto;
}

.token-box::-webkit-scrollbar {
  width: 6px;
}
.token-box::-webkit-scrollbar-track {
  background: transparent;
}
.token-box::-webkit-scrollbar-thumb {
  background: #dcdfe6;
  border-radius: 3px;
}

.composer-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 0 10px 10px 10px;
}

.left-area {
  display: flex;
  align-items: center;
  min-height: 32px;
}

.token {
  cursor: pointer;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ensure tag content vertically centered */
.token :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.join {
  font-size: 11px;
  opacity: 0.75;
  line-height: 1;
}

.not {
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.txt {
  max-width: 92px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1;
}

.x {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.token:hover .x {
  opacity: 0.65;
}

.inp {
  flex: 1;
  min-width: 180px;
}

.inp :deep(.el-input__wrapper) {
  box-shadow: none !important;
  border: none !important;
  background: transparent;
}

.toggle {
  cursor: pointer;
  user-select: none;
}

.ic {
  margin-right: 6px;
}

.search-loading {
  font-size: 16px;
  color: #409eff;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 999px;
  background: #f3f4f6;
}

.beautify-btn {
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4) !important;
  color: white !important;
  border: none !important;
  transition: all 0.2s ease;
}

.beautify-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.5) !important;
}

.beautify-btn:disabled {
  opacity: 0.5;
  box-shadow: none !important;
}

:deep(.toolbar .ghost-btn) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: #6b7280;
}

:deep(.toolbar .ghost-btn:hover) {
  background: rgba(99, 102, 241, 0.08) !important;
  color: #6366f1;
}

:deep(.toolbar .ghost-btn:disabled) {
  opacity: 0.4;
}

/* 幽灵按钮模糊状态 */
:deep(.toolbar .fuzzy-toggle-btn) {
  transition: all 0.2s ease;
  padding: 5px 10px;
  border-radius: 999px !important;
}
:deep(.toolbar .fuzzy-toggle-btn .el-icon) {
  margin-right: 4px;
  font-size: 14px;
  transition: color 0.2s ease;
}
:deep(.toolbar .fuzzy-toggle-btn.is-fuzzy) {
  color: #6366f1; /* 文字变为紫色 */
  background: rgba(99, 102, 241, 0.1) !important; /* 极浅的紫色背景 */
}
:deep(.toolbar .fuzzy-toggle-btn.is-fuzzy .el-icon) {
  color: #eab308; /* 黄色高亮 */
}

:deep(.toolbar .el-select__wrapper) {
  border: none !important;
  box-shadow: none !important;
  background: transparent;
  border-radius: 999px;
}

:deep(.toolbar .el-button),
:deep(.toolbar .el-button-group) {
  box-shadow: none !important;
}

:deep(.toolbar .el-button) {
  border: none !important;
}

:deep(.left-btns .el-button) {
  border-radius: 999px;
}


</style>

