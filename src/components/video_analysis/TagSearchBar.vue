<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
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
  /** segment / v2 索引 keyword 字段名；AND 时参与 term filter */
  sourceField?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: SearchToken[]
    strategyName?: string
    strategyWeights: {
      bm25_weight: number
      vector_weight: number
      text_weights?: Record<string, number>
      vector_weights?: Record<string, number>
      use_rrf?: boolean
    }
    workspace?: string
    loading?: boolean
    enableRoadRunFallback?: boolean
    placeholder?: string
    maxPreviewChars?: number
    radius?: string
    /** 更矮的标签区（如视频分析顶栏） */
    dense?: boolean
  }>(),
  {
    modelValue: () => [],
    workspace: 'v2',
    loading: false,
    placeholder: '回车添加标签；空格可分词；在标签上按下拖到另一枚可多选，Delete 批量删除',
    maxPreviewChars: 512,
    radius: '999px',
    dense: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: SearchToken[]): void
  (e: 'update:strategyName', v: string): void
  (e: 'update:strategyWeights', v: {
    bm25_weight: number
    vector_weight: number
    text_weights?: Record<string, number>
    vector_weights?: Record<string, number>
    use_rrf?: boolean
  }): void
  (e: 'update:enableRoadRunFallback', v: boolean): void
  (e: 'search'): void
}>()

// --- 搜索策略相关逻辑 ---
const strategies = ref<SearchStrategy[]>([])
const selectedStrategy = ref<string>('')
const strategyDialogVisible = ref(false)
const strategyDialogMode = ref<'edit' | 'create'>('edit')

const localBm25 = ref(props.strategyWeights.bm25_weight)
const localVector = ref(props.strategyWeights.vector_weight)
const localUseRrf = ref(!!props.strategyWeights.use_rrf)
const localTextWeights = ref<Record<string, number>>(props.strategyWeights.text_weights || {})
const localVectorWeights = ref<Record<string, number>>(props.strategyWeights.vector_weights || {})

const newStrategyName = ref('')
const newStrategyIsDefault = ref(false)

const indexFields = ref<{ text_fields: string[]; vector_fields: string[] }>({
  text_fields: [],
  vector_fields: [],
})
/** 索引模型上 Text/Keyword、Vector 标注的默认权重（新字段补全、与后端 hybrid 一致） */
const textWeightDefaults = ref<Record<string, number>>({})
const vectorWeightDefaults = ref<Record<string, number>>({})

function mergeTextWeightsFromIndex(saved: Record<string, number>): Record<string, number> {
  const fields = indexFields.value.text_fields
  if (!fields?.length) return { ...saved }
  const defs = textWeightDefaults.value
  const out = { ...saved }
  for (const f of fields) {
    const v = out[f]
    if (v === undefined || !Number.isFinite(Number(v))) {
      out[f] = defs[f] ?? 1.0
    }
  }
  return out
}

function mergeVectorWeightsFromIndex(saved: Record<string, number>): Record<string, number> {
  const fields = indexFields.value.vector_fields
  if (!fields?.length) return { ...saved }
  const defs = vectorWeightDefaults.value
  const out = { ...saved }
  for (const f of fields) {
    const v = out[f]
    if (v === undefined || !Number.isFinite(Number(v))) {
      out[f] = defs[f] ?? 0
    }
  }
  return out
}

async function fetchIndexFields() {
  try {
    const ws = props.workspace || 'v2'
    const res = await fetch(`/api/video-analysis/index-fields?workspace=${ws}`).then((r) => r.json())
    if (res.success) {
      indexFields.value = {
        text_fields: res.text_fields || [],
        vector_fields: res.vector_fields || [],
      }
      textWeightDefaults.value = (res.text_field_weights || {}) as Record<string, number>
      vectorWeightDefaults.value = (res.vector_field_weights || {}) as Record<string, number>

      const tw = { ...localTextWeights.value }
      const vw = { ...localVectorWeights.value }
      for (const f of indexFields.value.text_fields) {
        if (tw[f] === undefined) tw[f] = textWeightDefaults.value[f] ?? 1.0
      }
      for (const f of indexFields.value.vector_fields) {
        if (vw[f] === undefined) vw[f] = vectorWeightDefaults.value[f] ?? 0
      }
      localTextWeights.value = tw
      localVectorWeights.value = vw
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
  localUseRrf.value = !!s.use_rrf
  localTextWeights.value = mergeTextWeightsFromIndex(s.text_weights || {})
  localVectorWeights.value = mergeVectorWeightsFromIndex(s.vector_weights || {})
  emitUpdate()
}

watch(
  () => props.strategyName,
  (name) => {
    if (name && name !== selectedStrategy.value) {
      const s = strategies.value.find((x) => x.name === name)
      if (s) {
        applyStrategy(s)
      } else {
        selectedStrategy.value = name
      }
    }
  },
  { immediate: true }
)

watch(selectedStrategy, (newVal) => {
  if (newVal) {
    emit('update:strategyName', newVal)
    const s = strategies.value.find((x) => x.name === newVal)
    if (s) {
      localBm25.value = s.bm25_weight
      localVector.value = s.vector_weight
      localUseRrf.value = !!s.use_rrf
      localTextWeights.value = mergeTextWeightsFromIndex(s.text_weights || {})
      localVectorWeights.value = mergeVectorWeightsFromIndex(s.vector_weights || {})
      emitUpdate()
    }
  }
})

watch(
  () => props.strategyWeights,
  (sw) => {
    localBm25.value = sw.bm25_weight
    localVector.value = sw.vector_weight
    localUseRrf.value = !!sw.use_rrf
    localTextWeights.value = mergeTextWeightsFromIndex({ ...(sw.text_weights || {}) })
    localVectorWeights.value = mergeVectorWeightsFromIndex({ ...(sw.vector_weights || {}) })
  },
  { deep: true },
)

function onSliderChange() {
  // 如果修改了权重，但当前选中了某个预设，我们自动取消选中（或者你可以选择覆盖它，这里选择保持原逻辑：修改即自定义）
  // 但因为组件要求必须有个名字，我们可以暂时不清除 selectedStrategy，或者你可以设计一个 "自定义" 选项
  // 这里为了简单，我们直接 emit 更新，并触发搜索
  emitUpdate()
}

function onUpdateUseRrf(v: boolean) {
  localUseRrf.value = v
  onSliderChange()
}

function emitUpdate() {
  emit('update:strategyWeights', {
    bm25_weight: localBm25.value,
    vector_weight: localVector.value,
    text_weights: localTextWeights.value,
    vector_weights: localVectorWeights.value,
    use_rrf: localUseRrf.value,
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
      use_rrf: localUseRrf.value,
    })
    if (res.success) {
      ElMessage.success('保存成功')
      strategyDialogVisible.value = false
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

function openCreateStrategyDialog() {
  strategyDialogMode.value = 'create'
  strategyDialogVisible.value = true
}

function openEditStrategyDialog() {
  strategyDialogMode.value = 'edit'
  strategyDialogVisible.value = true
}

watch(strategyDialogVisible, (open) => {
  if (!open || strategyDialogMode.value !== 'create') return
  const fields = indexFields.value.vector_fields
  if (!fields.length) return
  const next = { ...localVectorWeights.value }
  for (const f of fields) {
    next[f] = 0
  }
  localVectorWeights.value = next
})

onMounted(async () => {
  await fetchIndexFields()
  await loadStrategies()
})
// ------------------------

const inputText = ref('')
const editing = ref<SearchToken | null>(null)
const editorOpen = ref(false)
const popoverAnchor = ref<HTMLElement | null>(null)

const tokens = computed(() => props.modelValue ?? [])
const selectedTokenIds = ref<string[]>([])

/** 按下标签拖拽到另一标签：按 DOM 序范围多选；短按打开编辑 */
type DragSession = {
  pressIndex: number
  startX: number
  startY: number
  active: boolean
  token: SearchToken
  anchorEl: HTMLElement
}
let dragSession: DragSession | null = null

function findTokenIndexAtPoint(cx: number, cy: number): number | null {
  const els = document.elementsFromPoint(cx, cy)
  for (const node of els) {
    const el = node as HTMLElement
    const tag = el.closest?.('.tag-search-composer .token') as HTMLElement | null
    if (!tag) continue
    const idxStr = tag.dataset.tokenIndex
    if (idxStr != null) {
      const i = parseInt(idxStr, 10)
      if (!Number.isNaN(i) && i >= 0 && i < tokens.value.length) return i
    }
  }
  return null
}

function onWindowPointerMove(e: PointerEvent) {
  if (!dragSession) return
  const dx = e.clientX - dragSession.startX
  const dy = e.clientY - dragSession.startY
  if (!dragSession.active && dx * dx + dy * dy >= 25) {
    dragSession.active = true
  }
  if (dragSession.active) {
    const hi = findTokenIndexAtPoint(e.clientX, e.clientY)
    if (hi != null) selectTokenRange(dragSession.pressIndex, hi)
  }
}

function endDragListeners() {
  window.removeEventListener('pointermove', onWindowPointerMove)
  window.removeEventListener('pointerup', onWindowPointerUp)
  window.removeEventListener('pointercancel', onWindowPointerUp)
}

function onWindowPointerUp() {
  if (!dragSession) return
  const wasDrag = dragSession.active
  const { token, anchorEl } = dragSession
  endDragListeners()
  dragSession = null
  if (!wasDrag) {
    openEditor(anchorEl, token)
  }
}

function onTokenPointerDown(e: PointerEvent, t: SearchToken, idx: number) {
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest?.('.token-remove-hit')) return

  clearSelection()
  dragSession = {
    pressIndex: idx,
    startX: e.clientX,
    startY: e.clientY,
    active: false,
    token: t,
    anchorEl: e.currentTarget as HTMLElement,
  }
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp)
  window.addEventListener('pointercancel', onWindowPointerUp)
}

watch(tokens, (list) => {
  const ids = new Set(list.map((t) => t.id))
  selectedTokenIds.value = selectedTokenIds.value.filter((id) => ids.has(id))
})

function isTokenSelected(id: string) {
  return selectedTokenIds.value.includes(id)
}

function clearSelection() {
  selectedTokenIds.value = []
}

function selectTokenRange(from: number, to: number) {
  const a = Math.min(from, to)
  const b = Math.max(from, to)
  const slice = tokens.value.slice(a, b + 1)
  selectedTokenIds.value = slice.map((t) => t.id)
}

function removeSelectedTokens() {
  if (selectedTokenIds.value.length === 0) return
  const rm = new Set(selectedTokenIds.value)
  const next = tokens.value.filter((t) => !rm.has(t.id))
  selectedTokenIds.value = []
  emit('update:modelValue', next)
}

function toggleRoadRunFallback() {
  if (props.enableRoadRunFallback !== undefined) {
    emit('update:enableRoadRunFallback', !props.enableRoadRunFallback)
  }
}

async function clearAllTokens() {
  if (tokens.value.length === 0) return
  if (tokens.value.length > 10) {
    try {
      await ElMessageBox.confirm(`确定清空全部 ${tokens.value.length} 个标签？`, '清空', { type: 'warning' })
    } catch {
      return
    }
  }
  clearSelection()
  emit('update:modelValue', [])
}

onUnmounted(() => {
  if (dragSession) {
    endDragListeners()
    dragSession = null
  }
})

function onInputKeydown(e: KeyboardEvent) {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return
  if (inputText.value.trim()) return
  if (selectedTokenIds.value.length > 0) {
    e.preventDefault()
    removeSelectedTokens()
    return
  }
  if (e.key === 'Backspace' && tokens.value.length > 0) {
    e.preventDefault()
    const next = tokens.value.slice(0, -1)
    emit('update:modelValue', next)
  }
}

function onComposerKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    const t = e.target as HTMLElement | null
    if (t?.closest?.('.inp')) return // Let the input handle it
    e.preventDefault()
    handleEnterKey()
    return
  }
  if (e.key !== 'Backspace' && e.key !== 'Delete') return
  const t = e.target as HTMLElement | null
  if (t?.closest?.('.inp')) return
  if (selectedTokenIds.value.length === 0) return
  e.preventDefault()
  removeSelectedTokens()
}

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

function openEditor(anchorEl: HTMLElement, t: SearchToken) {
  popoverAnchor.value = anchorEl
  // 把原始状态深拷贝以便回滚
  originalTokenState = JSON.parse(JSON.stringify(t))
  // 直接让原来实例接受双向绑定
  editing.value = t
  // 延迟打开，避免当前 pointerup 产生的 click 事件冒泡触发 popover 的 click-outside 导致瞬间关闭
  setTimeout(() => {
    editorOpen.value = true
  }, 10)
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
  <div class="tag-search-composer" tabindex="0" @keydown="onComposerKeydown">
    <div class="token-box" :class="{ 'token-box--dense': dense }">
      <el-tag
        v-for="(t, idx) in tokens"
        :key="t.id"
        :data-token-index="idx"
        :type="tagType(t)"
        :effect="tagEffect(t)"
        :round="true"
        class="token"
        :class="{ 'token--selected': isTokenSelected(t.id) }"
        :style="getTagStyle(t)"
        @pointerdown="onTokenPointerDown($event, t, idx)"
      >
        <span v-if="idx !== 0" class="join">{{ t.join ?? 'AND' }}</span>
        <span v-if="t.not" class="not">NOT</span>
        <el-tooltip :content="t.text" placement="top" :show-after="350">
          <span class="txt">{{ previewText(t) }}</span>
        </el-tooltip>
        <el-icon class="x token-remove-hit" @pointerdown.stop.prevent @click.stop="removeToken(t.id)">
          <i-ep-close />
        </el-icon>
      </el-tag>

      <el-input
        v-model="inputText"
        :placeholder="placeholder"
        class="inp"
        @keydown.enter.prevent="handleEnterKey"
        @keydown="onInputKeydown"
      />
    </div>

    <div class="composer-footer">
      <div class="left-area">
        <div class="footer-leading-actions">
          <slot name="footer-leading-actions" />
        </div>
        <el-tooltip content="清空全部标签" placement="top">
          <el-button
            circle
            size="small"
            type="danger"
            plain
            :disabled="tokens.length === 0"
            class="clear-tags-btn"
            @click="clearAllTokens"
          >
            <el-icon><i-ep-delete /></el-icon>
          </el-button>
        </el-tooltip>
        <el-icon v-if="loading" class="search-loading" title="远程搜索中…">
          <i-ep-loading />
        </el-icon>
      </div>

      <!-- 搜索策略配置工具栏，和 PromptComposer 类似的一体化设计 -->
      <div class="toolbar">
        <el-button
          v-if="enableRoadRunFallback !== undefined"
          class="fuzzy-toggle-btn"
          :class="{ 'is-fuzzy': enableRoadRunFallback }"
          size="small"
          text
          @click="toggleRoadRunFallback"
        >
          <el-icon>
            <i-ep-magic-stick v-if="enableRoadRunFallback" />
            <i-ep-aim v-else />
          </el-icon>
          路跑兜底
        </el-button>
        <SearchStrategySelect
          v-model="selectedStrategy"
          :strategies="strategies"
          @create="openCreateStrategyDialog"
          @delete="handleDeleteStrategy"
          @refresh="loadStrategies"
        />

        <el-button
          class="beautify-btn"
          circle
          size="small"
          color="#6366f1"
          :disabled="!selectedStrategy"
          @click="openEditStrategyDialog"
          title="配置权重"
        >
          <el-icon><i-ep-setting /></el-icon>
        </el-button>
      </div>
    </div>

    <SearchStrategyDialog
      v-model="strategyDialogVisible"
      :mode="strategyDialogMode"
      :initial-name="newStrategyName"
      :initial-is-default="newStrategyIsDefault"
      :bm25-weight="localBm25"
      :vector-weight="localVector"
      :text-weights="localTextWeights"
      :vector-weights="localVectorWeights"
      :use-rrf="localUseRrf"
      :index-fields="indexFields"
      :text-weight-defaults="textWeightDefaults"
      :vector-weight-defaults="vectorWeightDefaults"
      @update:bm25-weight="localBm25 = $event"
      @update:vector-weight="localVector = $event"
      @update:text-weights="localTextWeights = $event"
      @update:vector-weights="localVectorWeights = $event"
      @update:use-rrf="onUpdateUseRrf"
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

.footer-leading-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.clear-tags-btn {
  flex-shrink: 0;
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

.token-box--dense {
  max-height: 96px;
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
  gap: 8px;
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
  max-width: min(720px, calc(100vw - 320px));
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

.token--selected {
  outline: 2px solid #f59e0b;
  outline-offset: 1px;
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.35);
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

