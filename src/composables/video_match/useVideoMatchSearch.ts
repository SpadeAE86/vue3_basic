import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getSearchStrategiesApi, getTokenJoinDefaultFieldsApi, saveSearchStrategyApi, type SearchStrategy } from '@/api/video_analysis'
import { tagsJsonToSearchTokens, DEFAULT_TOKEN_JOIN_AND_FIELDS } from '@/utils/matchTagsFromSegment'
import type { VideoMatchShotDto } from '@/api/video_match'

export function useVideoMatchSearch(form: import('vue').Ref<any>, matchDetailRow: import('vue').Ref<VideoMatchShotDto | null>, shotTranscribeRow: import('vue').Ref<VideoMatchShotDto | null>) {
const strategies = ref<SearchStrategy[]>([])
const selectedStrategy = ref('')

/** 视频匹配页内新建 / 编辑搜索策略（与「视频分析」TagSearchBar 同源弹窗） */
const vmStrategyDialogVisible = ref(false)
const vmStrategyDialogMode = ref<'edit' | 'create'>('create')
const vmStrategyInitialName = ref('')
const vmStrategyInitialIsDefault = ref(false)
const vmStrategyBm25 = ref(0.3)
const vmStrategyVector = ref(0.7)
const vmStrategyUseRrf = ref(false)
const vmStrategyTextWeights = ref<Record<string, number>>({})
const vmStrategyVectorWeights = ref<Record<string, number>>({})
const vmIndexFields = ref<{ text_fields: string[]; vector_fields: string[] }>({
  text_fields: [],
  vector_fields: [],
})
const vmTextWeightDefaults = ref<Record<string, number>>({})
const vmVectorWeightDefaults = ref<Record<string, number>>({})

/** 与当前 workspace 默认 AND 模板对齐（标签预览 / 跳转视频分析） */
const tokenJoinDialogVisible = ref(false)
const tokenJoinAndFields = ref<string[]>([...DEFAULT_TOKEN_JOIN_AND_FIELDS])

async function loadTokenJoinAndFields() {
  const ws = form.value.workspace.trim() || 'v1'
  try {
    const r = await getTokenJoinDefaultFieldsApi(ws)
    if (r.success && Array.isArray(r.and_segment_fields) && r.and_segment_fields.length) {
      tokenJoinAndFields.value = r.and_segment_fields
    } else {
      tokenJoinAndFields.value = [...DEFAULT_TOKEN_JOIN_AND_FIELDS]
    }
  } catch {
    tokenJoinAndFields.value = [...DEFAULT_TOKEN_JOIN_AND_FIELDS]
  }
}


const matchDetailTokens = computed(() =>
  tagsJsonToSearchTokens(
    (matchDetailRow.value?.tags_json ?? {}) as Record<string, unknown>,
    tokenJoinAndFields.value,
  ),
)

const shotTranscribeTokens = computed(() =>
  tagsJsonToSearchTokens(
    (shotTranscribeRow.value?.tags_json ?? {}) as Record<string, unknown>,
    tokenJoinAndFields.value,
  ),
)


async function loadStrategies() {
  try {
    const res = await getSearchStrategiesApi()
    if (res?.success && Array.isArray(res.strategies)) {
      strategies.value = res.strategies
      const def = res.strategies.find((s: SearchStrategy) => s.is_default)
      if (def && !selectedStrategy.value) {
        selectedStrategy.value = def.name
      }
    }
  } catch {
    strategies.value = []
  }
}

async function fetchVmIndexFields() {
  try {
    const ws = form.value.workspace.trim() || 'v1'
    const r = await fetch(`/api/video-analysis/index-fields?workspace=${encodeURIComponent(ws)}`)
    const res = (await r.json()) as {
      success?: boolean
      text_fields?: string[]
      vector_fields?: string[]
      text_field_weights?: Record<string, number>
      vector_field_weights?: Record<string, number>
    }
    if (res.success) {
      vmIndexFields.value = {
        text_fields: res.text_fields || [],
        vector_fields: res.vector_fields || [],
      }
      vmTextWeightDefaults.value = res.text_field_weights || {}
      vmVectorWeightDefaults.value = res.vector_field_weights || {}
      const tw = { ...vmStrategyTextWeights.value }
      const vw = { ...vmStrategyVectorWeights.value }
      const twDef = vmTextWeightDefaults.value
      const vwDef = vmVectorWeightDefaults.value
      for (const f of vmIndexFields.value.text_fields) {
        if (tw[f] === undefined) tw[f] = twDef[f] ?? 1
      }
      for (const f of vmIndexFields.value.vector_fields) {
        if (vw[f] === undefined) vw[f] = vwDef[f] ?? 0
      }
      vmStrategyTextWeights.value = tw
      vmStrategyVectorWeights.value = vw
    }
  } catch {
    vmIndexFields.value = { text_fields: [], vector_fields: [] }
  }
}

function applyVmStrategyWeightsFromSelection() {
  const name = selectedStrategy.value.trim()
  const s = name ? strategies.value.find((x) => x.name === name) : undefined
  if (s) {
    vmStrategyBm25.value = s.bm25_weight
    vmStrategyVector.value = s.vector_weight
    vmStrategyUseRrf.value = !!s.use_rrf
    vmStrategyTextWeights.value = { ...(s.text_weights || {}) }
    vmStrategyVectorWeights.value = { ...(s.vector_weights || {}) }
  } else {
    vmStrategyBm25.value = 0.3
    vmStrategyVector.value = 0.7
    vmStrategyUseRrf.value = false
    vmStrategyTextWeights.value = {}
    vmStrategyVectorWeights.value = {}
  }
}

function openVmStrategyCreateDialog() {
  vmStrategyDialogMode.value = 'create'
  vmStrategyInitialName.value = ''
  vmStrategyInitialIsDefault.value = false
  applyVmStrategyWeightsFromSelection()
  void fetchVmIndexFields().then(() => {
    vmStrategyDialogVisible.value = true
  })
}

function openVmStrategyEditDialog() {
  const name = selectedStrategy.value.trim()
  if (!name) {
    ElMessage.warning('请先在列表中选择一个搜索策略')
    return
  }
  const s = strategies.value.find((x) => x.name === name)
  if (!s) {
    ElMessage.warning('未找到该策略，请点下拉框刷新重试')
    return
  }
  vmStrategyDialogMode.value = 'edit'
  vmStrategyInitialName.value = name
  vmStrategyInitialIsDefault.value = !!s.is_default
  vmStrategyBm25.value = s.bm25_weight
  vmStrategyVector.value = s.vector_weight
  vmStrategyUseRrf.value = !!s.use_rrf
  vmStrategyTextWeights.value = { ...(s.text_weights || {}) }
  vmStrategyVectorWeights.value = { ...(s.vector_weights || {}) }
  void fetchVmIndexFields().then(() => {
    vmStrategyDialogVisible.value = true
  })
}

async function handleVmStrategySave(data: { name: string; isDefault: boolean }) {
  try {
    const res = await saveSearchStrategyApi({
      name: data.name,
      bm25_weight: vmStrategyBm25.value,
      vector_weight: vmStrategyVector.value,
      text_weights: vmStrategyTextWeights.value,
      vector_weights: vmStrategyVectorWeights.value,
      is_default: data.isDefault,
      use_rrf: vmStrategyUseRrf.value,
    })
    if (res?.success) {
      ElMessage.success('策略已保存')
      vmStrategyDialogVisible.value = false
      await loadStrategies()
      selectedStrategy.value = data.name
    } else {
      ElMessage.error((res as { error?: string })?.error || '保存失败')
    }
  } catch {
    ElMessage.error('保存失败')
  }
}


  return { strategies, selectedStrategy, vmStrategyDialogVisible, vmStrategyDialogMode, vmStrategyInitialName, vmStrategyInitialIsDefault, vmStrategyBm25, vmStrategyVector, vmStrategyUseRrf, vmStrategyTextWeights, vmStrategyVectorWeights, vmIndexFields, vmTextWeightDefaults, vmVectorWeightDefaults, tokenJoinDialogVisible, tokenJoinAndFields, loadTokenJoinAndFields, matchDetailTokens, shotTranscribeTokens, loadStrategies, fetchVmIndexFields, applyVmStrategyWeightsFromSelection, openVmStrategyCreateDialog, openVmStrategyEditDialog, handleVmStrategySave }
}
