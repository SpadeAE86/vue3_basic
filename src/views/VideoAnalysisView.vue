<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Setting } from '@element-plus/icons-vue'
import {
  getVideoAnalysisHistoryApi,
  getVideoAnalysisHistoryItemApi,
  getVideoAnalysisCardsApi,
  searchVideoAnalysisCardsApi,
  getVideoAnalysisWorkspacesApi,
  getTokenJoinDefaultFieldsApi,
  submitVideoAnalysisApi,
  type SearchStrategy,
  type VideoAnalysisSearchToken,
} from '@/api/video_analysis'

type SearchStrategyWeightsState = Pick<
  SearchStrategy,
  'bm25_weight' | 'vector_weight' | 'use_rrf' | 'text_weights' | 'vector_weights'
>
import ShotDetailDrawer from '@/components/video_analysis/ShotDetailDrawer.vue'
import ShotCardGrid from '@/components/video_analysis/ShotCardGrid.vue'
import TagSearchBar, { type SearchToken } from '@/components/video_analysis/TagSearchBar.vue'
import TokenJoinTemplateDialog from '@/components/video_analysis/TokenJoinTemplateDialog.vue'
import type { ShotCard, VideoAnalysisHistoryItem, UiShotCard, WorkspaceOption } from '@/types/videoAnalysis'
import {
  buildSearchCacheKey,
  loadPageSnapshot,
  savePageSnapshot,
  videoAnalysisSearchCache,
  rewriteTaskState,
  consumeVideoAnalysisPrefillFromMatch,
  consumeVideoAnalysisNavFromBoard,
  type VideoAnalysisPageSnapshot,
} from '@/utils/videoAnalysisSessionCache'
import { tagsJsonToSearchTokens, DEFAULT_TOKEN_JOIN_AND_FIELDS } from '@/utils/matchTagsFromSegment'
import { ZHIJI_CAR_MODEL_OPTIONS, VIDEO_FRAME_SIZE_OPTIONS } from '@/constants/zhijiCarModels'

/** 拉取历史分镜卡片时遮罩，与异步提交分析任务解耦，避免阻塞再次上传 */
const isLoadingHistory = ref(false)
/** 仅在选择文件→提交任务 HTTP 阶段为 true；服务端异步跑豆包时不占此状态 */
const isSubmittingBatch = ref(false)
const selectedFiles = ref<File[]>([])
const selectedHistory = ref('')
const searchTokens = ref<SearchToken[]>([])
const searchStrategyWeights = ref<SearchStrategyWeightsState>({
  bm25_weight: 0.3,
  vector_weight: 0.7,
  use_rrf: false,
})
const splitScenes = ref(true)

const tokenJoinDialogVisible = ref(false)

/** 当前 workspace 下默认 AND 模板字段（DB / 内置） */
const tokenJoinAndFields = ref<string[]>([...DEFAULT_TOKEN_JOIN_AND_FIELDS])

async function loadTokenJoinAndFields() {
  try {
    const res = await getTokenJoinDefaultFieldsApi(currentWorkspace.value)
    if (res.success && Array.isArray(res.and_segment_fields) && res.and_segment_fields.length) {
      tokenJoinAndFields.value = res.and_segment_fields
    } else {
      tokenJoinAndFields.value = [...DEFAULT_TOKEN_JOIN_AND_FIELDS]
    }
  } catch {
    tokenJoinAndFields.value = [...DEFAULT_TOKEN_JOIN_AND_FIELDS]
  }
}

watch(tokenJoinDialogVisible, async (open, wasOpen) => {
  if (wasOpen === true && open === false) {
    await loadTokenJoinAndFields()
  }
})

watch(() => rewriteTaskState.pendingTokens, (tokens) => {
  if (tokens && tokens.length > 0) {
    searchTokens.value = tokens
    rewriteTaskState.pendingTokens = null
    kickRemoteSearch()
  }
}, { immediate: true })

// ─── 模块级搜索缓存（跨路由导航保持，keep-alive 替代方案）────────────────
let _cachedResults: UiShotCard[] = []

/** 从 sessionStorage 批量还原时跳过 workspace 等 watcher 的副作用 */
const restoringSnapshot = ref(false)
/** 最近一次成功 /search（或缓存命中）对应的 cache key，写入快照 */
const lastSuccessfulSearchKey = ref<string | null>(null)

// ─── Workspace ─────────────────────────────────────────────────────────────
const currentWorkspace = ref('v1')
const workspaceOptions = ref<WorkspaceOption[]>([
  { key: 'v1', label: '经典分析 v1', description: '', is_default: true },
])

async function fetchWorkspaces() {
  try {
    const res = await getVideoAnalysisWorkspacesApi()
    if (res?.success && Array.isArray(res.workspaces)) {
      workspaceOptions.value = res.workspaces
      const def = res.workspaces.find((w: WorkspaceOption) => w.is_default)
      if (def && !currentWorkspace.value) currentWorkspace.value = def.key
    }
  } catch {
    // keep defaults
  }
}

// ─── Types imported from src/types/videoAnalysis.ts ─────────────────────────
// ShotCard, UiShotCard, VideoAnalysisHistoryItem, WorkspaceOption

const historyItems = ref<VideoAnalysisHistoryItem[]>([])
const historyOptions = computed(() =>
  [
    { value: '__all__', label: 'All（全部卡片）' },
    ...historyItems.value.map((it) => ({
      value: String((it as { id?: unknown }).id ?? ''),
      label: `${it.time} ${it.name}`,
    })),
  ],
)

// analysisResults = 当前历史/上传加载的卡片（不因搜索而改变）
const analysisResults = ref<UiShotCard[]>([])
// remoteSearchCards = /search 接口返回的结果（与 analysisResults 独立，清 token 后清空）
const remoteSearchCards = ref<UiShotCard[]>([])
const remoteSearching = ref(false)
let searchAbort: AbortController | null = null
let searchSeq = 0

const searchFuzzy = ref(true)

let persistTimer: ReturnType<typeof setTimeout> | null = null
function schedulePersistPageState() {
  if (restoringSnapshot.value) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const snap: VideoAnalysisPageSnapshot = {
      currentWorkspace: currentWorkspace.value,
      selectedHistory: selectedHistory.value,
      splitScenes: splitScenes.value,
      searchTokens: [...searchTokens.value],
      lastSearchCacheKey: lastSuccessfulSearchKey.value,
      searchFuzzy: searchFuzzy.value,
    }
    savePageSnapshot(snap)
  }, 350)
}

// ─── 详情抽屉（承载卡片容不下的字段） ─────────────────────────────
const drawerOpen = ref(false)
const activeShot = ref<UiShotCard | null>(null)

function openShotDetail(shot: UiShotCard) {
  activeShot.value = shot
  drawerOpen.value = true
}

// 帧预览活跃索引（reactive 字典：避免 ref.value 在模板/事件链里偶发 undefined）
const activeFrameIndex = reactive<Record<string, number>>({})
function onFrameSelect(id: string, idx: number) {
  const k = String(id)
  const n = Number(idx)
  if (!Number.isFinite(n)) return
  activeFrameIndex[k] = n
}

const MAX_BATCH_VIDEOS = 20

const handleFileChange = (_uploadFile: unknown, uploadFiles: unknown[]) => {
  const incoming = (uploadFiles || [])
    .map((u: unknown) => (u as { raw?: File }).raw)
    .filter((f): f is File => Boolean(f))
  const byKey = new Map<string, File>()
  for (const f of selectedFiles.value) byKey.set(`${f.name}_${f.size}`, f)
  for (const f of incoming) {
    if (byKey.size >= MAX_BATCH_VIDEOS) break
    byKey.set(`${f.name}_${f.size}`, f)
  }
  selectedFiles.value = Array.from(byKey.values()).slice(0, MAX_BATCH_VIDEOS)
}

function handleUploadExceed() {
  ElMessage.warning(`单次最多选择 ${MAX_BATCH_VIDEOS} 个视频（仍可分批提交）`)
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function toUiCards(cards: ShotCard[]) {
  return (cards || []).map((c) => ({
    ...c,
    // 复合 ID 防止跨 history 的 scene_id 冲突（frame hover bug 根因）
    id: `${c.history_id || (c as any).video_id || ''}_${c.scene_id}`,
    time: `${formatTime(c.start_time)} - ${formatTime(c.end_time)}`,
    object: c.object ?? [],
    adjective: c.adjective ?? [],
    appealing_audience: c.appealing_audience ?? [],
    // 只有真正有非零质量分时才保留（v2 通常无此字段）
    visual_quality: (c.visual_quality?.some(s => (s as number) > 0) ? c.visual_quality : null) as any,
    os_index_status: c.os_index_status ?? 'PENDING',
  }))
}

async function reindexOne(e: MouseEvent, shot: UiShotCard) {
  e.stopPropagation()
  if (!shot?.history_id) return
  try {
    shot.os_index_status = 'PENDING'
    const res = await fetch('/api/video-analysis/reindex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history_id: shot.history_id, scene_ids: [shot.scene_id] }),
    }).then((r) => r.json())
    if (res?.success && Array.isArray(res.updated) && res.updated.length) {
      const updated = res.updated[0] as ShotCard
      shot.os_index_status = updated.os_index_status ?? 'OK'
      shot.os_index_error = updated.os_index_error ?? null
    } else {
      shot.os_index_status = 'FAILED'
    }
  } catch {
    shot.os_index_status = 'FAILED'
  }
}

async function reindexAllBad() {
  const bad = (filteredResults.value || []).filter((s) => (s.os_index_status ?? 'PENDING') !== 'OK' && s.history_id)
  if (!bad.length) return
  const byHistory = new Map<string, number[]>()
  for (const s of bad) {
    const hid = String(s.history_id)
    if (!byHistory.has(hid)) byHistory.set(hid, [])
    byHistory.get(hid)!.push(Number(s.scene_id))
    s.os_index_status = 'PENDING'
  }
  for (const [hid, sceneIds] of byHistory.entries()) {
    try {
      const res = await fetch('/api/video-analysis/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history_id: hid, scene_ids: sceneIds }),
      }).then((r) => r.json())
      if (res?.success && Array.isArray(res.updated)) {
        const map = new Map<number, any>(res.updated.map((u: any) => [Number(u.scene_id), u]))
        for (const s of bad.filter((x) => x.history_id === hid)) {
          const u = map.get(Number(s.scene_id))
          if (u) {
            s.os_index_status = u.os_index_status ?? 'OK'
            s.os_index_error = u.os_index_error ?? null
          } else {
            s.os_index_status = s.os_index_status === 'PENDING' ? 'FAILED' : s.os_index_status
          }
        }
      } else {
        for (const s of bad.filter((x) => x.history_id === hid)) s.os_index_status = 'FAILED'
      }
    } catch {
      for (const s of bad.filter((x) => x.history_id === hid)) s.os_index_status = 'FAILED'
    }
  }
}

const handleHistoryChange = async (val: string) => {
  if (!val) return

  if (val === '__all__') {
    isLoadingHistory.value = true
    try {
      const res = await getVideoAnalysisCardsApi('__all__', currentWorkspace.value)
      if (!res?.success || !Array.isArray(res.cards)) {
        analysisResults.value = []
        return
      }
      analysisResults.value = toUiCards(res.cards || [])
    } finally {
      isLoadingHistory.value = false
    }
    return
  }

  isLoadingHistory.value = true
  try {
    const res = await getVideoAnalysisHistoryItemApi(val, currentWorkspace.value)
    if (!res?.success || !res?.item) {
      analysisResults.value = []
      return
    }
    const item = res.item as VideoAnalysisHistoryItem
    analysisResults.value = toUiCards(item.cards || [])
  } finally {
    isLoadingHistory.value = false
  }
}

function buildBag(shot: UiShotCard) {
  // 兼容 v1 + v2 所有标签字段，确保本地过滤对 v2 卡片立即生效
  const strField = (k: string) => { const v = shot[k]; return typeof v === 'string' && v ? [v] : [] }
  return [
    ...(shot.key_words ?? []),            // v2
    ...(shot.search_tags ?? []),          // v1
    ...(shot.object ?? []),
    ...(shot.design_adjectives ?? []),    // v2
    ...(shot.function_adjectives ?? []), // v2
    ...(shot.adjective ?? []),            // v1
    ...(shot.appealing_audience ?? []),
    ...(shot.marketing_tags ?? []),
    ...(shot.marketing_phrases ?? []),    // v2
    ...(shot.scenario_a ?? []),           // v2
    ...(shot.scenario_b ?? []),           // v2
    ...(shot.design_selling_points ?? []),   // v2
    ...(shot.function_selling_points ?? []), // v2
    ...(shot.scene_location ?? []),      // v2
    ...(shot.text ?? []),                 // v2 画面文字
    ...strField('footage_type'),          // v2
    ...strField('shot_type'),             // v2
    ...strField('shot_style'),            // v2
    ...strField('topic'),                 // v2
    ...strField('product_status_scene'),  // v2
  ].filter(Boolean)
}

function matchTag(tags: string[], token: string) {
  const q = token.trim()
  if (!q) return true
  const qq = q.toLowerCase()
  return tags.some((t) => {
    const s = String(t).toLowerCase()
    return s.includes(qq) || qq.includes(s)
  })
}

// effectiveResults 状态分离设计：
//   有搜索 token → 优先显示 remoteSearchCards；尚未返回时用 analysisResults 做本地过滤垫底
//   无搜索 token → 始终显示历史卡片 analysisResults（搜索结果不混入）
const effectiveResults = computed(() => {
  const hasTokens = (searchTokens.value ?? []).some(t => t.text?.trim())
  if (!hasTokens) {
    // 无 token：历史卡片或模块级缓存
    return analysisResults.value.length > 0 ? analysisResults.value : _cachedResults
  }
  // 有 token：搜索结果（加载完前先用历史卡片做本地过滤，不出现空卡片状态）
  return remoteSearchCards.value.length > 0 ? remoteSearchCards.value : analysisResults.value
})

const filteredResults = computed(() => {
  const tokens = (searchTokens.value ?? []).filter((t) => t.text && t.text.trim())
  if (!tokens.length) return effectiveResults.value

  // 若 remoteSearchCards 已返回，这些卡片是后端已精确排好序的结果，直接展示不再过滤
  if (remoteSearchCards.value.length > 0) return remoteSearchCards.value

  // 远程结果尚未回来时：用本地集合过滤 analysisResults 立即呈现
  return effectiveResults.value.filter((shot) => {
    const tags = buildBag(shot)
    const hay = `${shot.subject ?? ''} ${shot.description ?? ''} ${tags.join(' ')}`.toLowerCase()

    let acc = true
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      if (!t) continue
      const join = (t.join ?? 'AND').toUpperCase() as 'AND' | 'OR'
      const not = !!t.not

      let ok = true
      if (t.type === 'text') ok = hay.includes(t.text.toLowerCase())
      else ok = matchTag(tags, t.text)
      if (not) ok = !ok

      if (i === 0) acc = ok
      else if (join === 'OR') acc = acc || ok
      else acc = acc && ok
    }
    return acc
  })
})

const hasBadCards = computed(() =>
  (filteredResults.value ?? []).some((s) => (s.os_index_status ?? 'PENDING') !== 'OK')
)

function toBackendTokens(tokens: SearchToken[]): VideoAnalysisSearchToken[] {
  return (tokens || [])
    .filter((t): t is SearchToken => !!t && !!String(t.text || '').trim())
    .map((t) => ({
      text: String(t.text).trim(),
      join: (t.join ?? 'AND') as 'AND' | 'OR',
      not: !!t.not,
      type: t.type,
      source_field: t.sourceField || undefined,
    }))
}

function applySearchHit(
  cards: ShotCard[],
  search_mode: 'precise' | 'fuzzy' | 'fuzzy_rrf' | null,
) {
  const rawCards = cards.map((c) => ({ ...c, _search_mode: search_mode }))
  const fresh = toUiCards(rawCards)
  _cachedResults = fresh
  remoteSearchCards.value = fresh
}

function kickRemoteSearch() {
  const tokens = (searchTokens.value ?? []).filter((t) => t.text && t.text.trim())
  const stratSig = JSON.stringify({
    r: !!searchStrategyWeights.value.use_rrf,
    b: searchStrategyWeights.value.bm25_weight,
    v: searchStrategyWeights.value.vector_weight,
    tw: searchStrategyWeights.value.text_weights ?? {},
    vw: searchStrategyWeights.value.vector_weights ?? {},
  })
  if (!tokens.length) {
    // token 全清：中止进行中的请求，清空搜索结果 → effectiveResults 自动回到历史卡片
    if (searchAbort) { searchAbort.abort(); searchAbort = null }
    remoteSearchCards.value = []
    remoteSearching.value = false
    lastSuccessfulSearchKey.value = null
    schedulePersistPageState()
    return
  }

  const backendTok = toBackendTokens(tokens)
  
  // 动态决定是否模糊检索：如果存在 text 类型的 token，则使用模糊（混合）检索；否则使用精确（BM25）检索
  // 除非用户手动切换了 searchFuzzy 的状态，我们以 searchFuzzy.value 为准
  const isFuzzy = searchFuzzy.value

  const cacheKey = buildSearchCacheKey({
    workspace: currentWorkspace.value,
    fuzzy: isFuzzy,
    tokens: backendTok,
    size: 80,
    strategySig: stratSig,
  })

  const cached = videoAnalysisSearchCache.get(cacheKey)
  if (cached?.cards?.length) {
    applySearchHit(
      cached.cards as ShotCard[],
      (cached.search_mode as 'precise' | 'fuzzy' | 'fuzzy_rrf') ?? null,
    )
    lastSuccessfulSearchKey.value = cacheKey
    schedulePersistPageState()
    remoteSearching.value = false
    return
  }

  if (searchAbort) searchAbort.abort()
  searchAbort = new AbortController()
  const mySeq = ++searchSeq
  remoteSearching.value = true

  searchVideoAnalysisCardsApi(
    {
      tokens: backendTok,
      fuzzy: isFuzzy,
      size: 80,
      workspace: currentWorkspace.value,
      bm25_weight: searchStrategyWeights.value.bm25_weight,
      vector_weight: searchStrategyWeights.value.vector_weight,
      text_weights: searchStrategyWeights.value.text_weights,
      vector_weights: searchStrategyWeights.value.vector_weights,
      use_rrf: !!searchStrategyWeights.value.use_rrf,
    },
    { signal: searchAbort.signal }
  )
    .then((res) => {
      if (mySeq !== searchSeq) return // stale
      if (!res?.success || !Array.isArray(res.cards)) return
      const mode = res.search_mode as 'precise' | 'fuzzy' | 'fuzzy_rrf' | null ?? null
      applySearchHit(res.cards as ShotCard[], mode)
      videoAnalysisSearchCache.set(cacheKey, res.cards as ShotCard[], mode)
      lastSuccessfulSearchKey.value = cacheKey
      schedulePersistPageState()
    })
    .catch((e: any) => {
      if (e?.name === 'AbortError') return
      // eslint-disable-next-line no-console
      console.warn('video-analysis remote search failed', e)
    })
    .finally(() => {
      if (mySeq !== searchSeq) return
      remoteSearching.value = false
    })
}

async function refreshHistory() {
  try {
    const res = await getVideoAnalysisHistoryApi(currentWorkspace.value)
    if (res?.success && Array.isArray(res.history)) {
      historyItems.value = res.history
    } else {
      historyItems.value = []
    }
  } catch (e) {
    historyItems.value = []
  }
}

const carModelDialogVisible = ref(false)
const batchCarModel = ref('')

function historyBasenameKey(name: string) {
  return (name || '').trim().toLowerCase()
}

/** 仅展示文件名：去掉本地路径前缀；若为 URL 则只取路径最后一段（不要完整 OBS 地址）。 */
function stripToBasename(nameOrPath: string): string {
  let s = (nameOrPath || '').trim()
  if (!s) return ''
  s = s.replace(/\\/g, '/')
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s)
      const parts = u.pathname.split('/').filter(Boolean)
      const last = parts[parts.length - 1]
      if (last) {
        try {
          return decodeURIComponent(last)
        } catch {
          return last
        }
      }
    } catch {
      /* ignore */
    }
  }
  const i = s.lastIndexOf('/')
  return i >= 0 ? s.slice(i + 1) : s
}

function buildDuplicateHistoryMessage(dupFiles: File[]): string {
  const names = [...new Set(dupFiles.map((f) => stripToBasename(f.name)).filter(Boolean))]
  const list = names.join('\n-')
  return `以下视频在当前工作区历史中已存在（按文件名识别）：\n-${list}\n\n重新提交将排队新的分析任务（新的 project_id）。是否仍要替换？`
}

const openCarModelDialog = async () => {
  if (!selectedFiles.value.length) return

  const existingNames = new Set(
    historyItems.value.map((h) => historyBasenameKey(h.name || '')).filter(Boolean),
  )
  const dupFiles = selectedFiles.value.filter((f) => existingNames.has(historyBasenameKey(f.name)))
  if (dupFiles.length) {
    try {
      await ElMessageBox.confirm(buildDuplicateHistoryMessage(dupFiles), '重复素材', {
        type: 'warning',
        confirmButtonText: '仍要替换',
        cancelButtonText: '取消',
        customClass:
          dupFiles.length <= 10
            ? 'va-dup-confirm-dialog va-dup-few'
            : 'va-dup-confirm-dialog va-dup-many',
      })
    } catch {
      return
    }
  }

  batchCarModel.value = ''
  carModelDialogVisible.value = true
}

const confirmUpload = async () => {
  carModelDialogVisible.value = false
  if (!selectedFiles.value.length) return

  isSubmittingBatch.value = true
  try {
    const uploadConcurrency = 4
    const files = [...selectedFiles.value]
    const carModelVal = batchCarModel.value.trim()
    const queue = [...files]
    let ok = 0
    let fail = 0

    const worker = async () => {
      while (queue.length) {
        const file = queue.shift()!
        try {
          const res = await submitVideoAnalysisApi(file, {
            splitScenes: splitScenes.value,
            workspace: currentWorkspace.value,
            carModel: carModelVal || undefined,
          })
          if (res.success && res.task_id) ok += 1
          else fail += 1
        } catch {
          fail += 1
        }
      }
    }

    const nWorkers = Math.min(uploadConcurrency, files.length)
    await Promise.all(Array.from({ length: nWorkers }, () => worker()))

    await refreshHistory()

    if (files.length === 1) {
      if (ok) {
        ElMessage.success('任务已提交，分析完成后可在历史中选择记录或前往任务看板查看')
      } else {
        ElMessage.error('提交失败，请检查网络或后端日志')
      }
    } else {
      ElMessage.success(
        `已提交 ${ok} 个视频分析任务（失败 ${fail} 个）。请到任务看板查看排队与执行状态`,
      )
    }
    window.dispatchEvent(new CustomEvent('va-tasks-submitted'))
    selectedFiles.value = []
  } finally {
    isSubmittingBatch.value = false
  }
}

const submitRewrite = async () => {
  if (!rewriteTaskState.form.script.trim()) {
    ElMessage.warning('口播脚本不能为空')
    return
  }
  
  rewriteTaskState.dialogVisible = false
  rewriteTaskState.isRewriting = true
  
  try {
    const res = await fetch('/api/video-analysis/rewrite-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script: rewriteTaskState.form.script.trim(),
        topic: rewriteTaskState.form.topic.trim() || undefined,
        title: rewriteTaskState.form.title.trim() || undefined,
        car_model: rewriteTaskState.form.car_model.trim() || undefined,
        frame_size: rewriteTaskState.form.frame_size.trim() || undefined,
      })
    }).then(r => r.json())

    if (res?.success && res.tags?.segment_result?.length > 0) {
      const seg = res.tags.segment_result[0]
      const newTokens = tagsJsonToSearchTokens(seg as Record<string, unknown>, tokenJoinAndFields.value)
      rewriteTaskState.pendingTokens = newTokens
      ElMessage.success('提取成功')
    } else {
      ElMessage.error(res?.error || '提取失败或无结果')
    }
  } catch (e) {
    ElMessage.error('提取请求出错')
  } finally {
    rewriteTaskState.isRewriting = false
  }
}

watch(
  [searchTokens, currentWorkspace, selectedHistory, splitScenes, searchFuzzy],
  () => schedulePersistPageState(),
  { deep: true },
)

onMounted(async () => {
  await fetchWorkspaces()
  await loadTokenJoinAndFields()

  let prefill: ReturnType<typeof consumeVideoAnalysisPrefillFromMatch> = null

  /** 整块初始化期间保持 true，避免切换 workspace 的 watcher 清空看板/快照刚写入的 selectedHistory */
  restoringSnapshot.value = true
  try {
    const boardNav = consumeVideoAnalysisNavFromBoard()

    if (boardNav?.historyId?.trim()) {
      currentWorkspace.value = (boardNav.workspace || 'v1').trim() || 'v1'
      selectedHistory.value = boardNav.historyId.trim()
      splitScenes.value = true
      searchTokens.value = []
      lastSuccessfulSearchKey.value = null
      remoteSearchCards.value = []
      analysisResults.value = []
      ElMessage.success('已定位到任务看板选中的分析记录')
    } else {
      prefill = consumeVideoAnalysisPrefillFromMatch()
      if (prefill) {
        if (prefill.workspace) currentWorkspace.value = prefill.workspace
        selectedHistory.value = prefill.selectedHistory || '__all__'
        splitScenes.value = true
        searchTokens.value = Array.isArray(prefill.searchTokens) ? [...prefill.searchTokens] : []
        searchFuzzy.value = prefill.searchFuzzy !== false
        const w = prefill.searchStrategyWeights
        if (w) {
          searchStrategyWeights.value = {
            ...searchStrategyWeights.value,
            bm25_weight: w.bm25_weight,
            vector_weight: w.vector_weight,
            use_rrf: !!w.use_rrf,
            ...(w.text_weights ? { text_weights: w.text_weights } : {}),
            ...(w.vector_weights ? { vector_weights: w.vector_weights } : {}),
          }
        }
        lastSuccessfulSearchKey.value = null
        remoteSearchCards.value = []
        analysisResults.value = []
        ElMessage.success('已从视频匹配填入检索条件与模板权重')
      } else {
        const snap = loadPageSnapshot()
        if (snap) {
          if (snap.currentWorkspace) currentWorkspace.value = snap.currentWorkspace
          selectedHistory.value = snap.selectedHistory ?? ''
          splitScenes.value = snap.splitScenes ?? true
          searchTokens.value = Array.isArray(snap.searchTokens) ? [...snap.searchTokens] : []
          lastSuccessfulSearchKey.value = snap.lastSearchCacheKey ?? null
          if (snap.searchFuzzy !== undefined) searchFuzzy.value = snap.searchFuzzy
        }
      }
    }

    await refreshHistory()

    if (selectedHistory.value) {
      await handleHistoryChange(selectedHistory.value)
    }
  } finally {
    restoringSnapshot.value = false
  }

  if (prefill?.autoSearch && (searchTokens.value ?? []).some((t) => t.text?.trim())) {
    await nextTick()
    kickRemoteSearch()
  } else {
    const tok = (searchTokens.value ?? []).filter((t) => t.text?.trim())
    if (tok.length) {
      const backendTok = toBackendTokens(tok)
      const key = buildSearchCacheKey({
        workspace: currentWorkspace.value,
        fuzzy: searchFuzzy.value,
        tokens: backendTok,
        size: 80,
        strategySig: JSON.stringify({
          r: !!searchStrategyWeights.value.use_rrf,
          b: searchStrategyWeights.value.bm25_weight,
          v: searchStrategyWeights.value.vector_weight,
          tw: searchStrategyWeights.value.text_weights ?? {},
          vw: searchStrategyWeights.value.vector_weights ?? {},
        }),
      })
      const hit = videoAnalysisSearchCache.get(key)
      if (hit?.cards?.length) {
        applySearchHit(hit.cards as ShotCard[], (hit.search_mode as 'precise' | 'fuzzy' | 'fuzzy_rrf') ?? null)
        lastSuccessfulSearchKey.value = key
      }
    }
  }

  schedulePersistPageState()
})

// 切换 workspace 时重新加载当前历史，清空搜索状态（批量还原快照时不要触发）
watch(currentWorkspace, async () => {
  if (restoringSnapshot.value) return
  analysisResults.value = []
  remoteSearchCards.value = []
  searchTokens.value = []
  lastSuccessfulSearchKey.value = null
  selectedHistory.value = '' // 清空选中的历史，因为不同 workspace 历史不同
  await loadTokenJoinAndFields()
  await refreshHistory()
  schedulePersistPageState()
})

// token 变化 或 searchFuzzy 变化：
//   - 有 token → 本地过滤立即生效（filteredResults computed）；不自动触发远程搜索
//   - 无 token → 清空搜索结果，恢复历史卡片
watch([searchTokens, searchFuzzy], ([tokens, fuzzy], [oldTokens, oldFuzzy]) => {
  if (!(tokens ?? []).some(t => t.text?.trim())) {
    kickRemoteSearch() // 内部 tokens.length===0 分支：中止请求 + 清空 remoteSearchCards
  } else if (fuzzy !== oldFuzzy) {
    // 如果仅仅是 searchFuzzy 变化，且有 token，我们应该触发重新搜索
    kickRemoteSearch()
  }
})

onBeforeUnmount(() => {
  if (searchAbort) searchAbort.abort()
  searchAbort = null
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = null
})
</script>

<template>
  <div class="video-analysis-container">
    <!-- 顶部控制区：精简高度 -->
    <el-card class="control-panel" shadow="never" :body-style="{ padding: '12px 20px' }">
      <!-- 数据源：历史与索引 -->
      <div class="header-controls">
        <div class="left-controls va-datasource">
          <h3 class="section-title">视频分析</h3>
          <div class="va-inline-group">
            <span class="va-group-label">数据</span>
            <el-select
              v-model="selectedHistory"
              placeholder="选择历史分析记录"
              clearable
              class="history-select"
              @change="handleHistoryChange"
            >
              <el-option
                v-for="item in historyOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>

            <el-tag
              :type="splitScenes ? 'success' : 'info'"
              effect="dark"
              size="small"
              round
              class="toggle-tag"
              @click="splitScenes = !splitScenes"
            >
              <el-icon class="toggle-icon"><i-ep-scissor /></el-icon>
              {{ splitScenes ? '拆分镜' : '不拆分镜' }}
            </el-tag>

            <el-select
              v-model="currentWorkspace"
              size="small"
              class="workspace-select"
              title="切换分析 workspace（schema / index / 卡片表）"
            >
              <el-option
                v-for="ws in workspaceOptions"
                :key="ws.key"
                :value="ws.key"
                :label="ws.label"
              >
                <span>{{ ws.label }}</span>
                <span v-if="ws.is_default" class="workspace-default-badge">默认</span>
              </el-option>
            </el-select>

            <el-button v-if="hasBadCards" size="small" type="warning" plain @click="reindexAllBad">
              重入库异常卡片
            </el-button>
          </div>
        </div>
      </div>

      <!-- 检索：标签与策略 -->
      <div class="va-search-panel">
        <TagSearchBar
          v-model="searchTokens"
          v-model:strategyWeights="searchStrategyWeights"
          v-model:fuzzy="searchFuzzy"
          :workspace="currentWorkspace"
          :loading="remoteSearching"
          dense
          @search="kickRemoteSearch"
          class="tag-search"
        >
          <template #footer-leading-actions>
            <el-tooltip :content="rewriteTaskState.isRewriting ? '正在提取...' : '从脚本智能提取标签'" placement="bottom">
              <el-button
                circle
                size="small"
                @click="rewriteTaskState.dialogVisible = true"
                :loading="rewriteTaskState.isRewriting"
                :disabled="rewriteTaskState.isRewriting"
              >
                <el-icon v-if="!rewriteTaskState.isRewriting"><MagicStick /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="AND 命中模板（转写 MUST / v2 检索 term filter）" placement="bottom">
              <el-button circle size="small" @click="tokenJoinDialogVisible = true">
                <el-icon><Setting /></el-icon>
              </el-button>
            </el-tooltip>
          </template>
        </TagSearchBar>
      </div>

      <div class="va-upload-panel">
        <div class="va-upload-actions">
          <el-upload
            class="compact-uploader"
            action="#"
            :auto-upload="false"
            :show-file-list="false"
            multiple
            :limit="MAX_BATCH_VIDEOS"
            @change="handleFileChange"
            :on-exceed="handleUploadExceed"
            accept="video/*"
          >
            <el-button type="default">
              <el-icon class="el-icon--left"><i-ep-video-camera /></el-icon>
              选择视频
            </el-button>
          </el-upload>

          <span
            v-if="selectedFiles.length > 0"
            class="compact-file-info"
            :title="selectedFiles.map((f) => f.name).join(', ')"
          >
            已选 {{ selectedFiles.length }} 个文件
          </span>

          <el-button
            type="primary"
            @click="openCarModelDialog"
            :loading="isSubmittingBatch"
            :disabled="selectedFiles.length === 0"
          >
            {{ isSubmittingBatch ? '提交中...' : '开始分析' }}
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 分析结果展示区 -->
    <div class="results-area" v-if="effectiveResults.length > 0">
      <ShotCardGrid
        :shots="filteredResults"
        :active-frame-index="activeFrameIndex"
        :strategy-weights="searchStrategyWeights"
        @select-shot="openShotDetail"
        @frame-select="onFrameSelect"
        @reindex="reindexOne"
      />
    </div>

    <!-- 空状态 -->
    <el-empty v-else-if="!isLoadingHistory" description="暂无分析数据，请选择历史记录或上传视频" class="empty-state" />

    <ShotDetailDrawer v-model="drawerOpen" :shot="activeShot" />

    <!-- 智能提取弹窗 -->
    <el-dialog
      v-model="rewriteTaskState.dialogVisible"
      title="智能提取搜索条件"
      width="500px"
    >
      <el-form :model="rewriteTaskState.form" label-width="80px">
        <el-form-item label="口播脚本">
          <el-input
            v-model="rewriteTaskState.form.script"
            type="textarea"
            :rows="4"
            placeholder="例如：智己LS6，城市道路，展示一键泊车功能..."
          />
        </el-form-item>
        <el-form-item label="主题">
          <el-input v-model="rewriteTaskState.form.topic" placeholder="选填" />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="rewriteTaskState.form.title" placeholder="选填" />
        </el-form-item>
        <el-form-item label="车型">
          <el-select
            v-model="rewriteTaskState.form.car_model"
            placeholder="请选择车型（影响卖点词表与拆条）"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="opt in ZHIJI_CAR_MODEL_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="画面比例">
          <el-select
            v-model="rewriteTaskState.form.frame_size"
            placeholder="选填：与素材库 frame_size 一致；是否在提取中标为 AND 由 AND 模板配置"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="opt in VIDEO_FRAME_SIZE_OPTIONS"
              :key="`va_fs_${opt.value || 'any'}`"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="rewriteTaskState.dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitRewrite" :loading="rewriteTaskState.isRewriting">
            提取
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 车型输入弹窗 -->
    <el-dialog
      v-model="carModelDialogVisible"
      title="输入车型信息"
      width="400px"
    >
      <el-form label-width="80px" @submit.prevent>
        <el-form-item label="车型">
          <el-select
            v-model="batchCarModel"
            placeholder="请选择（写入分析与 OBS 目录，可选）"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="opt in ZHIJI_CAR_MODEL_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="carModelDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmUpload">
            确认并开始分析
          </el-button>
        </span>
      </template>
    </el-dialog>

    <TokenJoinTemplateDialog v-model="tokenJoinDialogVisible" :workspace="currentWorkspace" />
  </div>
</template>

<style scoped>
.video-analysis-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow: hidden; /* 防止整个页面滚动 */
}

/* 精简版控制面板 */
.control-panel {
  border-radius: 8px;
  border: 1px solid #ebeef5;
  flex-shrink: 0;
}

.header-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.left-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.va-datasource {
  width: 100%;
}

.va-inline-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.va-group-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.va-search-panel,
.va-upload-panel {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.va-upload-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toggle-tag {
  cursor: pointer;
  user-select: none;
}

.toggle-icon {
  margin-right: 6px;
}

.workspace-select {
  width: 130px;
}

.workspace-default-badge {
  font-size: 11px;
  color: #909399;
  margin-left: 6px;
}


.muted {
  color: #9ca3af;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0;
  padding-left: 8px;
  border-left: 4px solid #409eff;
}

.history-select {
  width: 240px;
}

.tag-search {
  flex: 1;
  min-width: min(100%, 320px);
  width: auto;
}

.compact-uploader {
  display: inline-block;
}

.compact-file-info {
  font-size: 13px;
  color: #606266;
  max-width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #f4f4f5;
  padding: 4px 8px;
  border-radius: 4px;
}

/* 结果区：包裹 ShotCardGrid */
.results-area {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow-y: auto;
}

.empty-state {
  margin-top: 60px;
}
</style>

<style>
/* ElMessageBox 挂载在 body，需非 scoped */
.va-dup-confirm-dialog.el-message-box {
  width: min(600px, 96vw) !important;
  max-width: 96vw;
}

.va-dup-confirm-dialog .el-message-box__message {
  white-space: pre-wrap;
  word-break: break-all;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.55;
  text-align: left;
  padding-right: 4px;
}

/* 10 个以内：不限制高度、不出现滚动条 */
.va-dup-confirm-dialog.va-dup-few .el-message-box__message {
  max-height: none;
  overflow: visible;
}

/* 数量较多时再限制高度并滚动 */
.va-dup-confirm-dialog.va-dup-many .el-message-box__message {
  max-height: min(560px, 72vh);
  overflow-y: auto;
}
</style>
