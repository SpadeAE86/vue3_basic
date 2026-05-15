<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElImageViewer, ElMessage } from 'element-plus'
import { Position, VideoCamera } from '@element-plus/icons-vue'
import {
  fetchImageHistoryForBoard,
  fetchVideoAnalysisHistoryForBoard,
  fetchImageTaskDetail,
  fetchVideoAnalysisTaskDetail,
  fetchVideoMatchJobsForBoard,
  fetchVideoMatchJobTaskDetail,
  fetchMaterialMatchesForBoard,
  fetchMaterialMatchTaskDetail,
  retryImageHistoryTask,
  retryVideoAnalysisHistoryTask,
  retryVideoMatchJobTask,
} from '@/api/taskBoard'
import {
  getVideoMatchJobApi,
  getVideoMatchShotDetailApi,
  rematchVideoMatchShotApi,
  type VideoMatchShotDto,
} from '@/api/video_match'
import { getTokenJoinDefaultFieldsApi } from '@/api/video_analysis'
import { IMAGEGEN_RETRY_STARTED_EVENT } from '@/composables/image/useGenerateHistory'
import TokenChipsReadonly from '@/components/video_match/TokenChipsReadonly.vue'
import type { SearchToken } from '@/components/video_analysis/TagSearchBar.vue'
import HttpTraceJsonBlock from '@/components/task_board/HttpTraceJsonBlock.vue'
import { tagsJsonToSearchTokens, DEFAULT_TOKEN_JOIN_AND_FIELDS } from '@/utils/matchTagsFromSegment'
import { stashVideoAnalysisPrefillFromMatch, stashVideoAnalysisNavFromBoard } from '@/utils/videoAnalysisSessionCache'
import { computeVideoAnalysisSearchCacheKey } from '@/utils/videoAnalysisSearchKey'
import { type BoardSection, isVmBoard } from '@/views/task_board/taskBoardTypes'
import {
  rowCreatedAt,
  rowDurationLabel,
  rowStatusNorm,
  vmParseColStatus,
  vmRowNeedsLiveDurationTick,
} from '@/views/task_board/taskBoardRowUtils'

const route = useRoute()
const router = useRouter()

const boardSection = computed<BoardSection>(() => {
  const s = route.meta.boardSection
  if (s === 'video') return 'video'
  if (s === 'video_match_transcribe') return 'video_match_transcribe'
  if (s === 'video_match_search') return 'video_match_search'
  return 'image'
})

const pageTitle = computed(() => (route.meta.title as string) || '任务看板')

const loading = ref(false)
const imageRows = ref<Record<string, unknown>[]>([])
const videoRows = ref<Record<string, unknown>[]>([])
const vmJobRows = ref<Record<string, unknown>[]>([])
const materialMatchRows = ref<Record<string, unknown>[]>([])

const dateRange = ref<[Date, Date] | null>(null)
const statusFilter = ref<string>('')
const workspaceFilter = ref<string>('')
/** 各看板按关键字段子串过滤（任务/履历 ID、match_id、关联 ID 等） */
const idSearchFilter = ref<string>('')
const currentPage = ref(1)
const pageSize = ref(10)

const detailVisible = ref(false)
const detailLoading = ref(false)
const detailPayload = ref<Record<string, unknown> | null>(null)
const detailDialogTitle = ref('HTTP 调用记录详情')
const detailIsShotMatch = ref(false)
const detailMatchHitRows = ref<
  { rank: number; score: number; history_id: string; video_path: string; doc_id: string }[]
>([])
/** 仅使用 ElImageViewer，避免 el-image 内置预览叠出两层（一层不可缩放） */
const detailImageViewerVisible = ref(false)

/** 脚本转写：分镜子弹窗 */
const storyboardVisible = ref(false)
const storyboardLoading = ref(false)
const storyboardJobId = ref<string | null>(null)
const storyboardJobSearchStatus = ref<string | null>(null)
const storyboardShots = ref<VideoMatchShotDto[]>([])
const storyboardParentRow = ref<Record<string, unknown> | null>(null)
const storyboardJobWorkspace = ref('')
const storyboardJobStrategySnapshot = ref<Record<string, unknown> | null>(null)
const shotRematchingId = ref<number | null>(null)

/** 有进行中的生图/视频分析任务时每秒 +1，驱动「耗时」列用当前时间 - 本轮开始时间/创建时间动态展示（仅小表） */
const durationTick = ref(0)
let durationLiveTimer: ReturnType<typeof setInterval> | null = null

function syncRunningDurationTimer() {
  const need =
    (boardSection.value === 'image' &&
      imageRows.value.some((r) => rowStatusNorm(r, 'image') === 'running')) ||
    (boardSection.value === 'video' &&
      videoRows.value.some((r) => rowStatusNorm(r, 'video') === 'running')) ||
    (boardSection.value === 'video_match_search' &&
      materialMatchRows.value.some((r) => vmRowNeedsLiveDurationTick(r, 'video_match_search'))) ||
    (boardSection.value === 'video_match_transcribe' &&
      vmJobRows.value.some((r) => vmRowNeedsLiveDurationTick(r, 'video_match_transcribe')))
  if (need) {
    if (!durationLiveTimer) {
      durationLiveTimer = setInterval(() => {
        durationTick.value++
      }, 1000)
    }
  } else if (durationLiveTimer) {
    clearInterval(durationLiveTimer)
    durationLiveTimer = null
  }
}

function pickRows(): Record<string, unknown>[] {
  if (boardSection.value === 'image') return imageRows.value
  if (boardSection.value === 'video') return videoRows.value
  if (boardSection.value === 'video_match_transcribe') return vmJobRows.value
  if (boardSection.value === 'video_match_search') return materialMatchRows.value
  return []
}

function rowMatchesRecordIdFilter(r: Record<string, unknown>): boolean {
  const q = idSearchFilter.value.trim().toLowerCase()
  if (!q) return true
  const section = boardSection.value
  const hay: string[] = []
  if (section === 'image') {
    hay.push(String(r.id ?? ''), String(r.taskId ?? ''))
  } else if (section === 'video') {
    hay.push(String(r.id ?? ''))
  } else if (section === 'video_match_transcribe') {
    hay.push(String(r.id ?? ''))
  } else if (section === 'video_match_search') {
    hay.push(
      String(r.id ?? ''),
      String(r.video_match_job_id ?? ''),
      String(r.video_match_shot_row_id ?? ''),
      String(r.va_context_history_id ?? ''),
    )
  }
  return hay.some((x) => x.toLowerCase().includes(q))
}

const filteredRows = computed(() => {
  let list = pickRows().slice()
  if (dateRange.value) {
    const [a, b] = dateRange.value
    const start = a.getTime()
    const end = b.getTime()
    list = list.filter((r) => {
      const t = rowCreatedAt(r)?.getTime()
      if (t == null) return true
      return t >= start && t <= end
    })
  }
  if (statusFilter.value) {
    list = list.filter((r) => rowStatusNorm(r, boardSection.value) === statusFilter.value)
  }
  if (idSearchFilter.value.trim()) {
    list = list.filter((r) => rowMatchesRecordIdFilter(r))
  }
  return list
})

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRows.value.slice(start, start + pageSize.value)
})

watch([boardSection, statusFilter, dateRange, workspaceFilter, idSearchFilter], () => {
  currentPage.value = 1
})

async function loadImage(silent = false) {
  if (!silent) loading.value = true
  try {
    const data = await fetchImageHistoryForBoard()
    if (data?.success && Array.isArray(data.history)) {
      imageRows.value = data.history as Record<string, unknown>[]
    } else {
      imageRows.value = []
    }
  } finally {
    if (!silent) loading.value = false
  }
}

async function loadVideo(silent = false) {
  if (!silent) loading.value = true
  try {
    const data = await fetchVideoAnalysisHistoryForBoard(workspaceFilter.value || undefined)
    if (data?.success && Array.isArray(data.history)) {
      videoRows.value = data.history as Record<string, unknown>[]
    } else {
      videoRows.value = []
    }
  } finally {
    if (!silent) loading.value = false
  }
}

async function loadVmJobs(silent = false) {
  if (!silent) loading.value = true
  try {
    const ws = workspaceFilter.value.trim() || undefined
    const params: { workspace?: string; limit: number } = {
      limit: 100,
      workspace: ws,
    }
    const data = await fetchVideoMatchJobsForBoard(params)
    if (data?.success && Array.isArray(data.jobs)) {
      vmJobRows.value = data.jobs as Record<string, unknown>[]
    } else {
      vmJobRows.value = []
    }
  } finally {
    if (!silent) loading.value = false
  }
}

async function loadMaterialMatches(silent = false) {
  if (!silent) loading.value = true
  try {
    const ws = workspaceFilter.value.trim() || undefined
    const data = await fetchMaterialMatchesForBoard({ limit: 100, workspace: ws })
    if (data?.success && Array.isArray(data.matches)) {
      materialMatchRows.value = data.matches as Record<string, unknown>[]
    } else {
      materialMatchRows.value = []
    }
  } finally {
    if (!silent) loading.value = false
  }
}

async function refresh() {
  loading.value = true
  try {
    const s = boardSection.value
    if (s === 'image') {
      await loadImage()
    } else if (s === 'video') {
      await loadVideo()
    } else if (s === 'video_match_transcribe') {
      await loadVmJobs()
    } else if (s === 'video_match_search') {
      await loadMaterialMatches()
    }
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

watch([boardSection, imageRows, videoRows, vmJobRows, materialMatchRows], syncRunningDurationTimer, { deep: true })

/** 当前看板存在「进行中」任务时定时拉取历史，避免后台已完成仍显示生成中 */
let boardHistoryPollTimer: ReturnType<typeof setInterval> | null = null

function syncBoardHistoryPoll() {
  const section = boardSection.value
  const imageRunning = imageRows.value.some((r) => rowStatusNorm(r, 'image') === 'running')
  const videoRunning = videoRows.value.some((r) => rowStatusNorm(r, 'video') === 'running')
  const materialRunning =
    section === 'video_match_search' &&
    materialMatchRows.value.some((r) => rowStatusNorm(r, 'video_match_search') === 'running')
  const vmTranscribeRunning =
    section === 'video_match_transcribe' &&
    vmJobRows.value.some((r) => rowStatusNorm(r, 'video_match_transcribe') === 'running')
  const needPoll =
    (section === 'image' && imageRunning) ||
    (section === 'video' && videoRunning) ||
    materialRunning ||
    vmTranscribeRunning

  if (needPoll && !boardHistoryPollTimer) {
    const tick = async () => {
      const s = boardSection.value
      try {
        if (s === 'image' && imageRows.value.some((r) => rowStatusNorm(r, 'image') === 'running')) {
          await loadImage(true)
        } else if (s === 'video' && videoRows.value.some((r) => rowStatusNorm(r, 'video') === 'running')) {
          await loadVideo(true)
        } else if (
          s === 'video_match_search' &&
          materialMatchRows.value.some((r) => rowStatusNorm(r, 'video_match_search') === 'running')
        ) {
          await loadMaterialMatches(true)
        } else if (
          s === 'video_match_transcribe' &&
          vmJobRows.value.some((r) => rowStatusNorm(r, 'video_match_transcribe') === 'running')
        ) {
          await loadVmJobs(true)
        }
      } catch {
        /* 静默轮询失败不打断 */
      }
    }
    void tick()
    boardHistoryPollTimer = setInterval(tick, 3000)
  } else if (!needPoll && boardHistoryPollTimer) {
    clearInterval(boardHistoryPollTimer)
    boardHistoryPollTimer = null
  }
}

watch([boardSection, imageRows, videoRows, vmJobRows, materialMatchRows], syncBoardHistoryPoll, { deep: true })

onUnmounted(() => {
  if (durationLiveTimer) {
    clearInterval(durationLiveTimer)
    durationLiveTimer = null
  }
  if (boardHistoryPollTimer) {
    clearInterval(boardHistoryPollTimer)
    boardHistoryPollTimer = null
  }
})

watch(
  () => route.path,
  () => {
    refresh()
  },
)

watch(workspaceFilter, async () => {
  const s = boardSection.value
  if (s === 'video') await loadVideo()
  else if (s === 'video_match_transcribe') await loadVmJobs()
  else if (s === 'video_match_search') await loadMaterialMatches()
})

function resetFilters() {
  dateRange.value = null
  statusFilter.value = ''
  idSearchFilter.value = ''
  if (boardSection.value === 'video' || isVmBoard(boardSection.value)) {
    workspaceFilter.value = ''
  }
}

function formatJson(v: unknown) {
  try {
    return JSON.stringify(v ?? null, null, 2)
  } catch {
    return String(v)
  }
}

function shortStr(s: unknown, n = 48) {
  if (s == null) return '—'
  const t = String(s)
  return t.length > n ? `${t.slice(0, n)}…` : t
}

function vmJobTitle(row: Record<string, unknown>) {
  const t = row.title != null && String(row.title).trim() ? String(row.title).trim() : ''
  const top = row.topic != null && String(row.topic).trim() ? String(row.topic).trim() : ''
  if (t && top) return `${t} / ${top}`
  return t || top || '—'
}

/** 列表中的提示词：前 10 字 + ...，便于区分记录 */
function imagePromptPreview(row: Record<string, unknown>) {
  const p = row.prompt
  if (p == null) return '—'
  const t = String(p).trim()
  if (!t) return '—'
  return t.length > 10 ? `${t.slice(0, 10)}...` : t
}

/** 与表格「任务 ID」列一致优先用 id，兼容仅 taskId 的旧数据；两端 strip 避免隐性空白 */
function detailLookupKey(row: Record<string, unknown>): string {
  const pid = row.id != null && String(row.id).trim() !== '' ? String(row.id).trim() : ''
  const tid = row.taskId != null && String(row.taskId).trim() !== '' ? String(row.taskId).trim() : ''
  return pid || tid
}

async function openDetail(row: Record<string, unknown>) {
  resetDetailDialogDefaults()
  detailVisible.value = true
  detailLoading.value = true
  detailPayload.value = null
  const id = detailLookupKey(row)
  if (!id) {
    detailPayload.value = { error: '缺少任务 ID' }
    detailLoading.value = false
    return
  }
  const section = boardSection.value
  try {
    const res =
      section === 'image'
        ? await fetchImageTaskDetail(id)
        : section === 'video'
          ? await fetchVideoAnalysisTaskDetail(id)
          : section === 'video_match_transcribe'
            ? await fetchVideoMatchJobTaskDetail(id)
            : await fetchMaterialMatchTaskDetail(id)
    if (res?.success && res.detail) {
      detailPayload.value = res.detail as Record<string, unknown>
    } else {
      detailPayload.value = { error: res?.detail || res?.error || '加载失败' }
    }
  } catch (e: unknown) {
    detailPayload.value = { error: (e as Error)?.message || '请求失败' }
  } finally {
    detailLoading.value = false
  }
}

/** 素材履历中的 query_preview 与当时 /search 的 query_text 一致（全为相关性片段时可用单 token 还原） */
function tokensFromMaterialQueryPreview(raw: unknown): SearchToken[] {
  const q = String(raw ?? '').trim()
  if (!q) return []
  return [
    {
      id: `board_va_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
      text: q,
      join: 'AND',
      not: false,
      type: 'keyword',
    },
  ]
}

/** 与 POST /video-analysis/search 入参一致（strategy_snapshot.search_tokens，新数据才有） */
function searchTokensFromMaterialSnapshot(row: Record<string, unknown>): SearchToken[] {
  const snap = row.strategy_snapshot
  if (!snap || typeof snap !== 'object') return []
  const raw = (snap as Record<string, unknown>).search_tokens
  if (!Array.isArray(raw) || raw.length === 0) return []
  const out: SearchToken[] = []
  let i = 0
  const base = Date.now().toString(36)
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const text = String(o.text ?? '').trim()
    if (!text) continue
    i += 1
    const j = String(o.join ?? 'AND').toUpperCase()
    const join: 'AND' | 'OR' = j === 'OR' ? 'OR' : 'AND'
    const not = !!o.not
    const typRaw = String(o.type ?? 'keyword').toLowerCase()
    const type: 'keyword' | 'text' = typRaw === 'text' ? 'text' : 'keyword'
    const sf =
      typeof o.source_field === 'string' && o.source_field.trim() ? o.source_field.trim() : undefined
    out.push({
      id: `rst_${base}_${i}_${Math.random().toString(36).slice(2, 8)}`,
      text,
      join,
      not,
      type,
      ...(sf ? { sourceField: sf } : {}),
    })
  }
  return out
}

function canJumpVideoAnalysisFromMaterialRow(row: Record<string, unknown>): boolean {
  const src = String(row.source ?? '')
  if (src === 'video_analysis_search') {
    if (String(row.va_context_history_id ?? '').trim()) return true
    if (searchTokensFromMaterialSnapshot(row).length > 0) return true
    return !!String(row.query_preview ?? '').trim()
  }
  if (src === 'video_match_shot') {
    return (
      !!String(row.video_match_job_id ?? '').trim() && Number(row.video_match_shot_row_id ?? 0) > 0
    )
  }
  return false
}

async function goVideoAnalysisFromMaterialRow(row: Record<string, unknown>) {
  const src = String(row.source ?? '')
  const ws = String(row.workspace ?? 'v1').trim() || 'v1'
  if (src === 'video_analysis_search') {
    const hid = String(row.va_context_history_id ?? '').trim()
    if (hid) {
      stashVideoAnalysisNavFromBoard({ workspace: ws, historyId: hid })
      router.push({ name: 'video-analysis' })
      return
    }
    const snap = row.strategy_snapshot as Record<string, unknown> | null | undefined
    const fromSnap = searchTokensFromMaterialSnapshot(row)
    const preview = String(row.query_preview ?? '').trim()
    const tokList = fromSnap.length > 0 ? fromSnap : tokensFromMaterialQueryPreview(preview)
    if (tokList.length === 0) {
      ElMessage.warning('该条履历缺少检索标签，无法回填到视频分析')
      return
    }
    const bm25 = typeof snap?.bm25_weight === 'number' ? (snap.bm25_weight as number) : 0.3
    const vec = typeof snap?.vector_weight === 'number' ? (snap.vector_weight as number) : 0.7
    const rrf = !!snap?.use_rrf
    const fuzzy = typeof snap?.fuzzy === 'boolean' ? (snap.fuzzy as boolean) : true
    const tw = snap?.text_weights as Record<string, number> | undefined
    const vw = snap?.vector_weights as Record<string, number> | undefined
    const preferredSearchCacheKey = computeVideoAnalysisSearchCacheKey({
      workspace: ws,
      fuzzy,
      tokens: tokList,
      strategyWeights: {
        bm25_weight: bm25,
        vector_weight: vec,
        use_rrf: rrf,
        ...(tw && typeof tw === 'object' && !Array.isArray(tw) ? { text_weights: tw } : {}),
        ...(vw && typeof vw === 'object' && !Array.isArray(vw) ? { vector_weights: vw } : {}),
      },
    })
    stashVideoAnalysisPrefillFromMatch({
      workspace: ws,
      selectedHistory: '__all__',
      searchTokens: tokList,
      searchStrategyWeights: {
        bm25_weight: bm25,
        vector_weight: vec,
        use_rrf: rrf,
        ...(tw && typeof tw === 'object' && !Array.isArray(tw) ? { text_weights: tw } : {}),
        ...(vw && typeof vw === 'object' && !Array.isArray(vw) ? { vector_weights: vw } : {}),
      },
      searchFuzzy: fuzzy,
      autoSearch: false,
      preferredSearchCacheKey,
    })
    router.push({ name: 'video-analysis' })
    return
  }
  if (src === 'video_match_shot') {
    const jid = String(row.video_match_job_id ?? '').trim()
    const sid = Number(row.video_match_shot_row_id ?? 0)
    if (!jid || sid <= 0) {
      ElMessage.warning('缺少任务或分镜信息')
      return
    }
    try {
      const res = await getVideoMatchJobApi(jid)
      if (!res.success || !res.shots?.length) {
        ElMessage.error(res.error || '加载视频匹配任务失败')
        return
      }
      const shot = res.shots.find((s) => s.id === sid)
      if (!shot?.tags_json || !Object.keys(shot.tags_json as object).length) {
        ElMessage.warning('该分镜无结构化标签，无法回填到视频分析搜索栏')
        return
      }
      const jobWs = String(res.workspace ?? ws).trim() || 'v1'
      let andFields = [...DEFAULT_TOKEN_JOIN_AND_FIELDS]
      try {
        const r = await getTokenJoinDefaultFieldsApi(jobWs)
        if (r.success && r.and_segment_fields?.length) {
          andFields = r.and_segment_fields
        }
      } catch {
        /* 内置默认 */
      }
      const tokens = tagsJsonToSearchTokens(shot.tags_json as Record<string, unknown>, andFields)
      const snap = res.search_strategy_snapshot
      const bm25 =
        typeof snap?.bm25_weight === 'number' ? (snap.bm25_weight as number) : 0.3
      const vec =
        typeof snap?.vector_weight === 'number' ? (snap.vector_weight as number) : 0.7
      const rrf = !!snap?.use_rrf
      const tw = snap?.text_weights as Record<string, number> | undefined
      const vw = snap?.vector_weights as Record<string, number> | undefined
      stashVideoAnalysisPrefillFromMatch({
        workspace: jobWs,
        selectedHistory: '__all__',
        searchTokens: tokens,
        searchStrategyWeights: {
          bm25_weight: bm25,
          vector_weight: vec,
          use_rrf: rrf,
          ...(tw && typeof tw === 'object' && !Array.isArray(tw) ? { text_weights: tw } : {}),
          ...(vw && typeof vw === 'object' && !Array.isArray(vw) ? { vector_weights: vw } : {}),
        },
        searchFuzzy: true,
        autoSearch: true,
      })
      router.push('/video-analysis')
    } catch (e: unknown) {
      ElMessage.error((e as Error)?.message || '请求失败')
    }
    return
  }
  ElMessage.warning('当前来源不支持跳转视频分析')
}

async function openStoryboard(row: Record<string, unknown>) {
  const id = String(row.id ?? '').trim()
  if (!id) {
    ElMessage.warning('缺少任务 ID')
    return
  }
  storyboardParentRow.value = row
  storyboardVisible.value = true
  storyboardLoading.value = true
  storyboardJobId.value = id
  storyboardJobSearchStatus.value = null
  storyboardShots.value = []
  storyboardJobWorkspace.value = ''
  storyboardJobStrategySnapshot.value = null
  try {
    const res = await getVideoMatchJobApi(id)
    if (!res.success) {
      ElMessage.error(res.error || '加载失败')
      storyboardVisible.value = false
      return
    }
    storyboardJobSearchStatus.value = res.search_status ?? null
    storyboardJobWorkspace.value = String(res.workspace ?? '').trim() || 'v1'
    storyboardJobStrategySnapshot.value =
      res.search_strategy_snapshot && typeof res.search_strategy_snapshot === 'object'
        ? (res.search_strategy_snapshot as Record<string, unknown>)
        : null
    storyboardShots.value = res.shots ?? []
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message || '请求失败')
    storyboardVisible.value = false
  } finally {
    storyboardLoading.value = false
  }
}

function resetDetailDialogDefaults() {
  detailDialogTitle.value = 'HTTP 调用记录详情'
  detailIsShotMatch.value = false
  detailMatchHitRows.value = []
}

function shotSearchStatusNormBoard(row: VideoMatchShotDto): string {
  const s = (row.search_status || '').toLowerCase()
  if (s === 'failed') return 'failed'
  if (s === 'done') return 'success'
  if (s === 'running') return 'running'
  if (s === 'pending') {
    const j = (storyboardJobSearchStatus.value || '').toLowerCase()
    if (j === 'running') return 'running'
    return 'pending'
  }
  return s || 'unknown'
}

function shotStatusLabelBoard(st: string) {
  if (st === 'success') return '成功'
  if (st === 'failed') return '失败'
  if (st === 'running') return '进行中'
  if (st === 'pending') return '待匹配'
  if (st === 'unknown') return '未知'
  return st
}

function shotStatusTagTypeBoard(st: string): 'success' | 'danger' | 'warning' | 'info' {
  if (st === 'success') return 'success'
  if (st === 'failed') return 'danger'
  if (st === 'running') return 'warning'
  if (st === 'pending') return 'info'
  return 'info'
}

const shotTranscribeVisible = ref(false)
const shotTranscribeRow = ref<VideoMatchShotDto | null>(null)

const shotTranscribeTokens = computed(() =>
  tagsJsonToSearchTokens((shotTranscribeRow.value?.tags_json ?? {}) as Record<string, unknown>),
)

const storyboardJobParseFailed = computed(
  () => String(storyboardParentRow.value?.parse_status ?? '').toLowerCase() === 'failed',
)

function normalizeMatchHitRows(hits: unknown) {
  if (!Array.isArray(hits)) return []
  return hits.slice(0, 10).map((h, i) => {
    const o = h as Record<string, unknown>
    const sc = o._score
    const score = typeof sc === 'number' ? sc : parseFloat(String(sc ?? '0')) || 0
    const rawPath = [o.video_path, o.video_url, o.url, o.obs_video_url].map((x) =>
      typeof x === 'string' ? x.trim() : '',
    ).find(Boolean)
    return {
      rank: i + 1,
      score,
      history_id: String(o.history_id ?? ''),
      video_path: rawPath || '',
      doc_id: String(o._id ?? ''),
    }
  })
}

function top1UrlDisplayBoard(url: string): string {
  const u = (url || '').trim()
  if (!u) return '—'
  try {
    const parsed = new URL(u)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const last = parts.length ? parts[parts.length - 1] : ''
    if (last) return decodeURIComponent(last)
  } catch {
    /* ignore */
  }
  return u.length > 52 ? `${u.slice(0, 52)}…` : u
}

function openShotTranscribe(row: VideoMatchShotDto) {
  shotTranscribeRow.value = row
  shotTranscribeVisible.value = true
}

async function openShotMatch(row: VideoMatchShotDto) {
  const jid = storyboardJobId.value
  if (!jid || row.id == null) {
    ElMessage.warning('缺少任务或分镜 ID')
    return
  }
  resetDetailDialogDefaults()
  detailDialogTitle.value = '分镜 · 匹配 HTTP 详情与 Top 命中'
  detailIsShotMatch.value = true
  detailVisible.value = true
  detailLoading.value = true
  detailPayload.value = null
  detailMatchHitRows.value = normalizeMatchHitRows(row.match_top_hits_json)
  try {
    const res = await getVideoMatchShotDetailApi(jid, row.id)
    if (res?.success && res.detail) {
      detailPayload.value = res.detail as Record<string, unknown>
      if (res.shot?.match_top_hits_json) {
        detailMatchHitRows.value = normalizeMatchHitRows(res.shot.match_top_hits_json)
      }
    } else {
      detailPayload.value = { error: res?.error || '加载失败' }
    }
  } catch (e: unknown) {
    detailPayload.value = { error: (e as Error)?.message || '请求失败' }
  } finally {
    detailLoading.value = false
  }
}

function shotMatchFailed(row: VideoMatchShotDto): boolean {
  return (row.search_status || '').toLowerCase() === 'failed'
}

async function rematchStoryboardShot(row: VideoMatchShotDto) {
  const jid = storyboardJobId.value
  if (!jid || row.id == null) return
  shotRematchingId.value = row.id
  try {
    const res = await rematchVideoMatchShotApi(jid, row.id)
    if (res.success) {
      ElMessage.success('已重新检索本分镜')
      const shot = res.shot
      if (shot) {
        const i = storyboardShots.value.findIndex((s) => s.id === row.id)
        if (i >= 0) storyboardShots.value[i] = { ...storyboardShots.value[i], ...shot }
      } else {
        const r2 = await getVideoMatchJobApi(jid)
        if (r2.success && r2.shots) storyboardShots.value = r2.shots
      }
    } else {
      ElMessage.error(res.error || '重试失败')
    }
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message || '请求失败')
  } finally {
    shotRematchingId.value = null
  }
}

function canJumpVideoAnalysisFromShot(row: VideoMatchShotDto): boolean {
  return (
    (row.search_status || '').toLowerCase() === 'done' &&
    !!row.tags_json &&
    Object.keys(row.tags_json as object).length > 0
  )
}

async function goVideoAnalysisFromShot(row: VideoMatchShotDto) {
  if (!canJumpVideoAnalysisFromShot(row)) return
  const ws = storyboardJobWorkspace.value || 'v1'
  let andFields = [...DEFAULT_TOKEN_JOIN_AND_FIELDS]
  try {
    const r = await getTokenJoinDefaultFieldsApi(ws)
    if (r.success && r.and_segment_fields?.length) {
      andFields = r.and_segment_fields
    }
  } catch {
    /* 内置默认 */
  }
  const tokens = tagsJsonToSearchTokens((row.tags_json ?? {}) as Record<string, unknown>, andFields)
  const snap = storyboardJobStrategySnapshot.value
  const bm25 = typeof snap?.bm25_weight === 'number' ? snap.bm25_weight : 0.3
  const vec = typeof snap?.vector_weight === 'number' ? snap.vector_weight : 0.7
  const rrf = !!snap?.use_rrf
  const tw = snap?.text_weights
  const vw = snap?.vector_weights
  stashVideoAnalysisPrefillFromMatch({
    workspace: storyboardJobWorkspace.value || 'v1',
    selectedHistory: '__all__',
    searchTokens: tokens,
    searchStrategyWeights: {
      bm25_weight: bm25,
      vector_weight: vec,
      use_rrf: rrf,
      ...(tw && typeof tw === 'object' && !Array.isArray(tw)
        ? { text_weights: tw as Record<string, number> }
        : {}),
      ...(vw && typeof vw === 'object' && !Array.isArray(vw)
        ? { vector_weights: vw as Record<string, number> }
        : {}),
    },
    searchFuzzy: true,
    autoSearch: true,
  })
  router.push('/video-analysis')
}

/** 任务看板：进入视频分析页并选中该条历史与工作区 */
function goVideoAnalysisFromBoardRow(row: Record<string, unknown>) {
  const id = String(row.id ?? '').trim()
  const ws = String(row.workspace ?? 'v1').trim() || 'v1'
  if (!id) {
    ElMessage.warning('缺少分析 ID')
    return
  }
  stashVideoAnalysisNavFromBoard({ workspace: ws, historyId: id })
  router.push({ name: 'video-analysis' })
}

const vaRetryingId = ref('')

async function retryVideoRow(row: Record<string, unknown>) {
  const id = String(row.id ?? '').trim()
  if (!id) {
    ElMessage.warning('缺少分析 ID')
    return
  }
  vaRetryingId.value = id
  try {
    const res = (await retryVideoAnalysisHistoryTask(id)) as { success?: boolean; error?: string }
    if (res?.success) {
      ElMessage.success('已重新排队视频分析')
      await loadVideo(true)
    } else {
      ElMessage.error(typeof res?.error === 'string' ? res.error : '重试失败')
    }
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message || '重试请求失败')
  } finally {
    vaRetryingId.value = ''
  }
}

const imageRetryingId = ref('')

async function retryImageRow(row: Record<string, unknown>) {
  const id = detailLookupKey(row)
  if (!id) {
    ElMessage.warning('缺少任务 ID')
    return
  }
  imageRetryingId.value = id
  try {
    const res = (await retryImageHistoryTask(id)) as { success?: boolean; error?: string }
    if (res?.success) {
      ElMessage.success('已重新排队生成')
      window.dispatchEvent(new CustomEvent(IMAGEGEN_RETRY_STARTED_EVENT, { detail: { id } }))
      await loadImage(true)
    } else {
      ElMessage.error(typeof res?.error === 'string' ? res.error : '重试失败')
    }
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message || '重试请求失败')
  } finally {
    imageRetryingId.value = ''
  }
}

const vmRetryingId = ref('')

function vmJobCanRetryTranscribe(row: Record<string, unknown>): boolean {
  const ps = String(row.parse_status ?? '').toLowerCase()
  if (ps === 'running' || ps === 'processing' || ps === 'pending') return false
  return ps === 'failed'
}

const mmRetryingKey = ref('')

function materialSourceLabel(src: unknown): string {
  const s = String(src ?? '').trim()
  if (s === 'video_analysis_search') return '视频分析搜索'
  if (s === 'video_match_shot') return '视频匹配分镜'
  return s || '—'
}

function formatMaterialStrategyTemplate(snap: unknown): string {
  if (snap == null || typeof snap !== 'object') return '—'
  const o = snap as Record<string, unknown>
  const parts: string[] = []
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  if (name) parts.push(name)
  if (o.fuzzy === true) parts.push('模糊')
  else if (o.fuzzy === false) parts.push('非模糊')
  if (o.use_rrf === true) parts.push('RRF')
  const b = o.bm25_weight
  const v = o.vector_weight
  if (typeof b === 'number' && Number.isFinite(b) && typeof v === 'number' && Number.isFinite(v)) {
    parts.push(`BM25 ${b} / 向量 ${v}`)
  }
  return parts.length ? parts.join(' · ') : '—'
}

function materialMatchCanRetry(row: Record<string, unknown>): boolean {
  if (String(row.source ?? '') !== 'video_match_shot') return false
  if (String(row.status ?? '').toLowerCase() !== 'failed') return false
  const jid = String(row.video_match_job_id ?? '').trim()
  const sid = row.video_match_shot_row_id
  return !!jid && sid != null && Number(sid) > 0
}

async function retryMaterialMatchRow(row: Record<string, unknown>) {
  const jid = String(row.video_match_job_id ?? '').trim()
  const sid = Number(row.video_match_shot_row_id ?? 0)
  if (!jid || sid <= 0) {
    ElMessage.warning('缺少任务或分镜 ID')
    return
  }
  const k = `${jid}:${sid}`
  mmRetryingKey.value = k
  try {
    const res = (await rematchVideoMatchShotApi(jid, sid)) as { success?: boolean; error?: string }
    if (res?.success) {
      ElMessage.success('已重新检索该分镜')
      await loadMaterialMatches(true)
    } else {
      ElMessage.error(typeof res?.error === 'string' ? res.error : '重试失败')
    }
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message || '重试请求失败')
  } finally {
    mmRetryingKey.value = ''
  }
}

async function retryVmJobRow(row: Record<string, unknown>) {
  const id = String(row.id ?? '').trim()
  if (!id) {
    ElMessage.warning('缺少任务 ID')
    return
  }
  vmRetryingId.value = id
  try {
    const res = (await retryVideoMatchJobTask(id)) as { success?: boolean; error?: string; retry?: string }
    if (res?.success) {
      const k = typeof res.retry === 'string' ? res.retry : ''
      ElMessage.success(k === 'search' ? '已重新排队素材检索' : '已重新排队口播转写')
      await loadVmJobs(true)
    } else {
      ElMessage.error(typeof res?.error === 'string' ? res.error : '重试失败')
    }
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message || '重试请求失败')
  } finally {
    vmRetryingId.value = ''
  }
}

function statusLabel(st: string) {
  if (st === 'success') return '成功'
  if (st === 'failed') return '失败'
  if (st === 'running') return '进行中'
  if (st === 'pending_match') return '待匹配'
  if (st === 'unknown') return '未知'
  return st
}

function statusTagType(st: string) {
  if (st === 'success') return 'success'
  if (st === 'failed') return 'danger'
  if (st === 'running') return 'warning'
  if (st === 'pending_match') return 'info'
  return 'info'
}

const isImageGenDetail = computed(
  () => detailPayload.value && detailPayload.value.businessType === 'IMAGE_GEN',
)

const detailPrompt = computed(() => {
  const p = detailPayload.value?.prompt_full
  return typeof p === 'string' ? p : ''
})

const detailResultImageUrl = computed(() => {
  const u = detailPayload.value?.result_image_url
  return typeof u === 'string' && u.startsWith('http') ? u : ''
})

watch(detailVisible, (open) => {
  if (!open) {
    detailImageViewerVisible.value = false
    detailIsShotMatch.value = false
    detailMatchHitRows.value = []
    detailDialogTitle.value = 'HTTP 调用记录详情'
  }
})

watch(storyboardVisible, (open) => {
  if (!open) {
    storyboardJobId.value = null
    storyboardShots.value = []
    storyboardJobSearchStatus.value = null
    storyboardParentRow.value = null
    storyboardJobWorkspace.value = ''
    storyboardJobStrategySnapshot.value = null
  }
})

watch(shotTranscribeVisible, (open) => {
  if (!open) shotTranscribeRow.value = null
})
</script>

<template>
  <div class="task-board">
    <div class="board-panel">
      <div class="panel-head">
        <h2 class="panel-title">{{ pageTitle }}</h2>
        <el-button type="primary" size="small" :loading="loading" @click="refresh">刷新</el-button>
      </div>

      <el-form :inline="true" class="filter-form" @submit.prevent>
        <el-form-item label="创建时间">
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            style="width: 340px"
          />
        </el-form-item>
        <el-form-item label="总状态">
          <el-select v-model="statusFilter" clearable placeholder="请选择状态" style="width: 160px">
            <el-option label="成功" value="success" />
            <el-option label="失败" value="failed" />
            <el-option label="进行中" value="running" />
          </el-select>
        </el-form-item>
        <el-form-item label="记录 ID">
          <el-input
            v-model="idSearchFilter"
            clearable
            placeholder="子串匹配：履历 ID、视频匹配任务/分镜、VA 上下文等"
            style="width: 260px"
            @keyup.enter="currentPage = 1"
          />
        </el-form-item>
        <el-form-item v-if="boardSection === 'video' || isVmBoard(boardSection)" label="工作区">
          <el-select v-model="workspaceFilter" clearable placeholder="全部" style="width: 120px">
            <el-option label="v1" value="v1" />
            <el-option label="v2" value="v2" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="currentPage = 1">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 图像生成 -->
      <el-table
        v-if="boardSection === 'image'"
        v-loading="loading"
        :data="pagedRows"
        stripe
        :border="false"
        class="admin-table"
        header-cell-class-name="admin-th"
        style="width: 100%"
      >
        <el-table-column prop="id" label="任务 ID" min-width="120" show-overflow-tooltip />
        <el-table-column label="总状态" width="104" align="center">
          <template #default="{ row }">
            <el-tag
              :type="statusTagType(rowStatusNorm(row, 'image'))"
              effect="light"
              size="small"
              class="status-pill status-tag-admin"
            >
              {{ statusLabel(rowStatusNorm(row, 'image')) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提示词" min-width="140">
          <template #default="{ row }">
            <span class="prompt-clip" :title="row.prompt != null && String(row.prompt).trim() ? String(row.prompt) : ''">
              {{ imagePromptPreview(row) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="168">
          <template #default="{ row }">
            {{ rowCreatedAt(row)?.toLocaleString() ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="120" align="center">
          <template #default="{ row }">
            {{ rowDurationLabel(row, 'image', durationTick) }}
          </template>
        </el-table-column>
        <el-table-column prop="model" label="模型" width="130" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="72" />
        <el-table-column label="操作" width="168" fixed="right" align="center">
          <template #default="{ row }">
            <div class="op-links">
              <el-button type="primary" link @click="openDetail(row)">查看详情</el-button>
              <el-button
                v-if="rowStatusNorm(row, 'image') === 'failed'"
                type="primary"
                link
                :loading="imageRetryingId === detailLookupKey(row)"
                @click="retryImageRow(row)"
              >
                重试
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 视频分析 -->
      <el-table
        v-else-if="boardSection === 'video'"
        v-loading="loading"
        :data="pagedRows"
        stripe
        :border="false"
        class="admin-table"
        header-cell-class-name="admin-th"
        style="width: 100%"
      >
        <el-table-column prop="id" label="分析 ID" min-width="120" show-overflow-tooltip />
        <el-table-column label="总状态" width="104" align="center">
          <template #default="{ row }">
            <el-tag
              :type="statusTagType(rowStatusNorm(row, 'video'))"
              effect="light"
              size="small"
              class="status-pill status-tag-admin"
            >
              {{ statusLabel(rowStatusNorm(row, 'video')) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="产品名" min-width="100" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.car_model != null && String(row.car_model).trim() ? String(row.car_model).trim() : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="168">
          <template #default="{ row }">
            {{ rowCreatedAt(row)?.toLocaleString() ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="120" align="center">
          <template #default="{ row }">
            {{ rowDurationLabel(row, 'video', durationTick) }}
          </template>
        </el-table-column>
        <el-table-column label="视频标题" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ shortStr(row.name, 48) }}
          </template>
        </el-table-column>
        <el-table-column prop="workspace" label="工作区" width="88" />
        <el-table-column label="视频地址" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ shortStr(row.video_url, 40) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right" align="center">
          <template #default="{ row }">
            <div class="va-board-op">
              <el-button type="primary" link @click="openDetail(row)">查看详情</el-button>
              <el-button
                v-if="rowStatusNorm(row, 'video') === 'failed'"
                type="primary"
                link
                :loading="vaRetryingId === String(row.id ?? '').trim()"
                @click="retryVideoRow(row)"
              >
                重试
              </el-button>
              <el-tooltip content="在视频分析中打开此记录（已选工作区与历史）" placement="top">
                <el-button
                  class="va-jump-icon-btn"
                  :icon="VideoCamera"
                  circle
                  size="small"
                  aria-label="打开视频分析"
                  @click="goVideoAnalysisFromBoardRow(row)"
                />
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 视频匹配 · 脚本转写 -->
      <el-table
        v-else-if="boardSection === 'video_match_transcribe'"
        v-loading="loading"
        :data="pagedRows"
        stripe
        :border="false"
        class="admin-table"
        header-cell-class-name="admin-th"
        style="width: 100%"
      >
        <el-table-column prop="id" label="任务 ID" min-width="120" show-overflow-tooltip />
        <el-table-column label="转写状态" width="104" align="center">
          <template #default="{ row }">
            <el-tag
              :type="statusTagType(vmParseColStatus(row))"
              effect="light"
              size="small"
              class="status-pill status-tag-admin"
            >
              {{ statusLabel(vmParseColStatus(row)) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="标题/主题" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ vmJobTitle(row) }}
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="168">
          <template #default="{ row }">
            {{ rowCreatedAt(row)?.toLocaleString() ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="120" align="center">
          <template #default="{ row }">
            {{ rowDurationLabel(row, 'video_match_transcribe', durationTick) }}
          </template>
        </el-table-column>
        <el-table-column prop="workspace" label="工作区" width="88" />
        <el-table-column label="操作" width="220" fixed="right" align="center">
          <template #default="{ row }">
            <div class="op-links">
              <el-button type="primary" link @click="openDetail(row)">查看详情</el-button>
              <el-button type="primary" link @click="openStoryboard(row)">查看分镜</el-button>
              <el-button
                v-if="vmJobCanRetryTranscribe(row)"
                type="primary"
                link
                :loading="vmRetryingId === String(row.id ?? '').trim()"
                @click="retryVmJobRow(row)"
              >
                重试
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 视频匹配 · 素材匹配 -->
      <el-table
        v-else-if="boardSection === 'video_match_search'"
        v-loading="loading"
        :data="pagedRows"
        stripe
        :border="false"
        class="admin-table"
        header-cell-class-name="admin-th"
        style="width: 100%"
      >
        <el-table-column prop="id" label="履历 ID" min-width="112" show-overflow-tooltip />
        <el-table-column label="来源" width="120" show-overflow-tooltip>
          <template #default="{ row }">
            {{ materialSourceLabel(row.source) }}
          </template>
        </el-table-column>
        <el-table-column label="总状态" width="104" align="center">
          <template #default="{ row }">
            <el-tag
              :type="statusTagType(rowStatusNorm(row, 'video_match_search'))"
              effect="light"
              size="small"
              class="status-pill status-tag-admin"
            >
              {{ statusLabel(rowStatusNorm(row, 'video_match_search')) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="检索摘要" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ shortStr(row.query_preview, 64) }}
          </template>
        </el-table-column>
        <el-table-column label="命中数" width="72" align="center">
          <template #default="{ row }">
            {{ row.hit_count != null ? row.hit_count : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="Top1 视频" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <a
              v-if="(row.top1_obs_url || '').trim()"
              class="match-url-link"
              :href="(row.top1_obs_url || '').trim()"
              target="_blank"
              rel="noopener noreferrer"
              >{{ shortStr(row.top1_obs_url, 36) }}</a
            >
            <span v-else class="muted-small">—</span>
          </template>
        </el-table-column>
        <el-table-column label="检索模板" min-width="168" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatMaterialStrategyTemplate(row.strategy_snapshot) }}
          </template>
        </el-table-column>
        <el-table-column label="模式" width="88" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.search_mode || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="168">
          <template #default="{ row }">
            {{ rowCreatedAt(row)?.toLocaleString() ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="120" align="center">
          <template #default="{ row }">
            {{ rowDurationLabel(row, 'video_match_search', durationTick) }}
          </template>
        </el-table-column>
        <el-table-column prop="workspace" label="工作区" width="88" />
        <el-table-column label="操作" width="240" fixed="right" align="center">
          <template #default="{ row }">
            <div class="op-links">
              <el-button type="primary" link @click="openDetail(row)">查看详情</el-button>
              <el-tooltip
                content="回到视频分析：若当时挂在某条分析上会直接定位；全库搜索则用本行检索摘要与模板权重自动再搜（与分镜跳转一致）"
                placement="top"
              >
                <el-button
                  class="va-jump-icon-btn"
                  :icon="Position"
                  circle
                  size="small"
                  :disabled="!canJumpVideoAnalysisFromMaterialRow(row)"
                  aria-label="跳转视频分析"
                  @click="goVideoAnalysisFromMaterialRow(row)"
                />
              </el-tooltip>
              <el-button
                v-if="materialMatchCanRetry(row)"
                type="primary"
                link
                :loading="mmRetryingKey === `${String(row.video_match_job_id ?? '').trim()}:${Number(row.video_match_shot_row_id ?? 0)}`"
                @click="retryMaterialMatchRow(row)"
              >
                重试
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="filteredRows.length"
          background
        />
      </div>
    </div>

    <el-dialog
      v-model="storyboardVisible"
      title="分镜列表"
      width="1080px"
      top="5vh"
      class="storyboard-dialog admin-dialog"
      align-center
      destroy-on-close
    >
      <div v-loading="storyboardLoading" class="storyboard-dialog-body">
        <p v-if="storyboardJobId" class="story-job-id muted-small">任务 ID：{{ storyboardJobId }}</p>
        <el-alert
          v-if="storyboardJobParseFailed && !storyboardShots.length && !storyboardLoading"
          type="warning"
          show-icon
          :closable="false"
          class="storyboard-parse-alert"
        >
          <template #title>口播转写失败，暂无分镜</template>
          <div v-if="storyboardParentRow" class="storyboard-alert-actions">
            <el-button
              v-if="storyboardParentRow && vmJobCanRetryTranscribe(storyboardParentRow)"
              type="primary"
              size="small"
              :loading="vmRetryingId === String(storyboardParentRow.id ?? '').trim()"
              @click="retryVmJobRow(storyboardParentRow)"
            >
              重试转写
            </el-button>
          </div>
        </el-alert>
        <el-table
          v-if="storyboardShots.length"
          :data="storyboardShots"
          stripe
          border
          size="small"
          style="width: 100%"
        >
          <el-table-column prop="shot_order" label="#" width="52" />
          <el-table-column prop="segment_text" label="口播" min-width="140" show-overflow-tooltip />
          <el-table-column prop="description" label="画面描述" min-width="120" show-overflow-tooltip />
          <el-table-column
            v-if="boardSection === 'video_match_transcribe'"
            label="match_id"
            min-width="120"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              {{ (row.match_id && String(row.match_id).trim()) || '—' }}
            </template>
          </el-table-column>
          <el-table-column
            v-if="boardSection === 'video_match_search'"
            label="匹配状态"
            width="96"
            align="center"
          >
            <template #default="{ row }">
              <el-tag
                :type="shotStatusTagTypeBoard(shotSearchStatusNormBoard(row))"
                effect="light"
                size="small"
                class="status-pill status-tag-admin"
              >
                {{ shotStatusLabelBoard(shotSearchStatusNormBoard(row)) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            v-if="boardSection === 'video_match_search'"
            label="本镜耗时(ms)"
            width="104"
            align="center"
          >
            <template #default="{ row }">
              {{
                row.match_elapsed_ms != null && Number.isFinite(Number(row.match_elapsed_ms))
                  ? Number(row.match_elapsed_ms).toFixed(0)
                  : '—'
              }}
            </template>
          </el-table-column>
          <el-table-column v-if="boardSection === 'video_match_search'" label="Top1 视频" min-width="168">
            <template #default="{ row }">
              <a
                v-if="(row.top1_obs_url || '').trim()"
                class="match-url-link"
                :href="(row.top1_obs_url || '').trim()"
                target="_blank"
                rel="noopener noreferrer"
                >{{ top1UrlDisplayBoard((row.top1_obs_url || '').trim()) }}</a
              >
              <span v-else class="muted-small">—</span>
            </template>
          </el-table-column>
          <el-table-column
            v-if="boardSection === 'video_match_transcribe'"
            label="转写操作"
            width="108"
            fixed="right"
            align="center"
          >
            <template #default="{ row }">
              <el-button type="primary" link :disabled="row.id == null" @click="openShotTranscribe(row)">
                查看转写
              </el-button>
            </template>
          </el-table-column>
          <el-table-column
            v-if="boardSection === 'video_match_search'"
            label="匹配操作"
            width="248"
            fixed="right"
            align="center"
          >
            <template #default="{ row }">
              <div class="shot-op-cell">
                <el-button type="primary" link :disabled="row.id == null" @click="openShotMatch(row)">
                  查看匹配
                </el-button>
                <el-button
                  v-if="shotMatchFailed(row)"
                  type="primary"
                  link
                  :disabled="row.id == null"
                  :loading="shotRematchingId === row.id"
                  @click="rematchStoryboardShot(row)"
                >
                  重试
                </el-button>
                <el-tooltip content="用本分镜标签与当时匹配策略打开视频分析，并自动全库搜索" placement="top">
                  <el-button
                    class="va-jump-icon-btn"
                    :icon="Position"
                    circle
                    size="small"
                    :disabled="!canJumpVideoAnalysisFromShot(row)"
                    aria-label="跳转视频分析"
                    @click="goVideoAnalysisFromShot(row)"
                  />
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else-if="!storyboardLoading" description="暂无分镜数据" />
      </div>
    </el-dialog>

    <el-dialog
      v-model="shotTranscribeVisible"
      title="分镜 · 转写与标签"
      width="560px"
      top="8vh"
      class="admin-dialog"
      align-center
      destroy-on-close
    >
      <template v-if="shotTranscribeRow">
        <div v-if="shotTranscribeRow.match_id" class="field-label">match_id（素材匹配履历）</div>
        <div v-if="shotTranscribeRow.match_id" class="text-panel">{{ shotTranscribeRow.match_id }}</div>
        <div class="field-label">口播</div>
        <div class="text-panel">{{ shotTranscribeRow.segment_text || '—' }}</div>
        <div class="field-label">画面描述</div>
        <div class="text-panel">{{ shotTranscribeRow.description || '—' }}</div>
        <div class="field-label">结构化标签</div>
        <TokenChipsReadonly :tokens="shotTranscribeTokens" />
      </template>
    </el-dialog>

    <el-dialog
      v-model="detailVisible"
      :title="detailDialogTitle"
      :width="detailIsShotMatch ? 'min(1080px, 96vw)' : '900px'"
      top="4vh"
      class="detail-dialog admin-dialog"
      align-center
      destroy-on-close
    >
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detailPayload && !detailPayload.error">
          <el-descriptions :column="2" border size="small" class="desc-grid">
            <el-descriptions-item label="任务 ID">{{ detailPayload.id }}</el-descriptions-item>
            <el-descriptions-item label="Task ID">{{ detailPayload.taskId ?? '—' }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.requestRid" label="请求记录 rid">{{ detailPayload.requestRid }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.processId != null" label="进程 ID">{{ detailPayload.processId }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.upstreamTaskId" label="上游 Task ID">{{ detailPayload.upstreamTaskId }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.traceId" label="Trace ID">{{ detailPayload.traceId }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.parentTraceId" label="父 Trace ID">{{ detailPayload.parentTraceId }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.callSequence != null" label="调用序号">{{ detailPayload.callSequence }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.businessId" label="业务 ID">{{ detailPayload.businessId }}</el-descriptions-item>
            <el-descriptions-item label="服务">{{ detailPayload.serviceName }}</el-descriptions-item>
            <el-descriptions-item label="方法">{{ detailPayload.methodName }}</el-descriptions-item>
            <el-descriptions-item label="HTTP">{{ detailPayload.httpMethod }}</el-descriptions-item>
            <el-descriptions-item label="业务类型">{{ detailPayload.businessType }}</el-descriptions-item>
            <el-descriptions-item label="状态码">{{ detailPayload.statusCode }}</el-descriptions-item>
            <el-descriptions-item label="耗时">{{ detailPayload.durationMs != null ? `${detailPayload.durationMs} ms` : '—' }}</el-descriptions-item>
            <el-descriptions-item label="业务状态">
              <el-tag
                :type="
                  detailPayload.businessSuccess === true
                    ? 'success'
                    : detailPayload.businessSuccess === false
                      ? 'danger'
                      : 'info'
                "
                effect="light"
                size="small"
                class="status-tag-admin"
              >
                {{ detailPayload.businessStatusLabel ?? '—' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="错误信息">{{ (detailPayload.errorMessage as string) || '—' }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ detailPayload.createdAt ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ detailPayload.updatedAt ?? '—' }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.httpTraceCreatedAt" label="HTTP 记录创建">{{ detailPayload.httpTraceCreatedAt }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.httpTraceUpdatedAt" label="HTTP 记录更新">{{ detailPayload.httpTraceUpdatedAt }}</el-descriptions-item>
          </el-descriptions>

          <div class="field-label">Request URL</div>
          <pre class="code-block">{{ detailPayload.requestUrl }}</pre>

          <div class="field-label">Request Headers</div>
          <pre class="code-block muted">{{ formatJson(detailPayload.requestHeaders) }}</pre>

          <HttpTraceJsonBlock
            label="Request Body"
            :model-value="detailPayload.requestBody"
            :pre-extra-class="detailIsShotMatch ? 'code-block--shot-trace' : undefined"
          >
            <template v-if="detailIsShotMatch" #before-body>
              <p class="hint trace-body-hint">
                以下内容仅作审计对照：检索请求里的<strong>长向量</strong>入库前会替换为
                <code>_omitted: numeric_vector</code>
                占位；若整体仍超长则会再出现
                <code>_truncated</code>
                。<strong>重试匹配</strong>由服务端根据当前分镜的
                <code>tags_json</code>
                重新调用检索逻辑，<strong>不会</strong>也不应依赖本条 Request Body 回放。
              </p>
            </template>
          </HttpTraceJsonBlock>

          <div class="field-label">Response Headers</div>
          <pre class="code-block muted">{{ formatJson(detailPayload.responseHeaders) }}</pre>

          <HttpTraceJsonBlock label="Response Body" :model-value="detailPayload.responseBody" />

          <template v-if="detailIsShotMatch">
            <div class="field-label">Top 命中（OpenSearch _score，与分镜检索结果一致）</div>
            <p v-if="!detailMatchHitRows.length" class="hint">暂无命中记录（尚未匹配或 trace 未落库时可仍可从上方 Response 查看摘要）</p>
            <el-table
              v-else
              :data="detailMatchHitRows"
              border
              stripe
              size="small"
              class="hit-rank-table"
              max-height="280"
            >
              <el-table-column prop="rank" label="#" width="44" align="center" />
              <el-table-column prop="score" label="_score" width="96" align="right">
                <template #default="{ row: hr }">
                  {{ Number.isFinite(hr.score) ? hr.score.toFixed(4) : hr.score }}
                </template>
              </el-table-column>
              <el-table-column prop="history_id" label="history_id" min-width="110" show-overflow-tooltip />
              <el-table-column label="video_url" min-width="200" show-overflow-tooltip>
                <template #default="{ row: hr }">
                  <a
                    v-if="hr.video_path"
                    class="match-url-link"
                    :href="hr.video_path"
                    :title="hr.video_path"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ hr.video_path }}</a
                  >
                  <span v-else class="muted-small">—</span>
                </template>
              </el-table-column>
            </el-table>
            <p v-if="detailIsShotMatch && detailMatchHitRows.some((r) => !r.video_path)" class="hint">
              表格中
              <code>video_url</code>
              为「—」表示服务端未解析到成片地址：该
              <code>history_id</code>
              在
              <code>video_analysis_history</code>
              无记录、或
              <code>video_url</code>
              为空且 v2 分镜里也暂无
              <code>obs_video_url</code>
              ，与界面截断无关。可直接点
              <code>history_id</code>
              同一行的其它列或到视频分析里核对该条历史。
            </p>
          </template>

          <p v-if="detailPayload.note" class="hint">{{ detailPayload.note }}</p>

          <template v-if="isImageGenDetail">
            <div class="detail-image-tail">
              <div class="field-label">提示词</div>
              <div class="text-panel">{{ detailPrompt || '—' }}</div>
              <div class="field-label">生成结果</div>
              <div
                v-if="detailResultImageUrl"
                class="result-img-wrap detail-result-img-wrap detail-result-img-open"
                role="button"
                tabindex="0"
                title="点击查看大图（可缩放拖动）"
                @click="detailImageViewerVisible = true"
                @keydown.enter.prevent="detailImageViewerVisible = true"
              >
                <el-image
                  :src="detailResultImageUrl"
                  fit="contain"
                  class="detail-result-el-image"
                  preview-disabled
                />
              </div>
              <div v-else class="text-panel muted">暂无图片 URL（可能仍在生成或失败）</div>
            </div>
          </template>
        </template>
        <el-alert v-else-if="detailPayload?.error" type="error" :title="String(detailPayload.error)" show-icon :closable="false" />
      </div>
    </el-dialog>

    <ElImageViewer
      v-if="detailImageViewerVisible && detailResultImageUrl"
      :url-list="[detailResultImageUrl]"
      @close="detailImageViewerVisible = false"
    />
  </div>
</template>

<style scoped>
.task-board {
  max-width: 100%;
  margin: 0;
}

.board-panel {
  background: #fff;
  border-radius: 2px;
  padding: 20px 24px 24px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.panel-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.85);
  letter-spacing: 0.02em;
}

.filter-form {
  margin-bottom: 16px;
  padding: 16px 16px 4px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 2px;
}

.filter-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.op-links {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  justify-content: center;
  align-items: center;
}

.admin-table {
  --el-table-border-color: transparent;
}

.admin-table :deep(.el-table__inner-wrapper::before) {
  display: none;
}

.admin-table :deep(td.el-table__cell) {
  border-bottom: 1px solid #f0f0f0;
}

.admin-th {
  background: #fafafa !important;
  color: rgba(0, 0, 0, 0.65);
  font-weight: 500;
}

.status-pill {
  border: none;
}

/* 参考管理后台：浅底 + 深字 */
.status-tag-admin.el-tag--success {
  --el-tag-bg-color: #f6ffed;
  --el-tag-border-color: #b7eb8f;
  --el-tag-text-color: #389e0d;
}

.status-tag-admin.el-tag--danger {
  --el-tag-bg-color: #fff2f0;
  --el-tag-border-color: #ffccc7;
  --el-tag-text-color: #cf1322;
}

.status-tag-admin.el-tag--warning {
  --el-tag-bg-color: #fffbe6;
  --el-tag-border-color: #ffe58f;
  --el-tag-text-color: #d48806;
}

.status-tag-admin.el-tag--info {
  --el-tag-bg-color: #f0f5ff;
  --el-tag-border-color: #adc6ff;
  --el-tag-text-color: #2f54eb;
}

.pager {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.detail-body {
  min-height: 120px;
}

/* 详情弹窗 body 可滚动，避免整图在视口外被截断 */
.detail-dialog.admin-dialog :deep(.el-dialog__body) {
  max-height: calc(100vh - 132px);
  overflow-y: auto;
  padding-right: 4px;
}

.storyboard-dialog-body {
  min-height: 120px;
}

.storyboard-dialog.admin-dialog :deep(.el-dialog__body) {
  max-height: calc(100vh - 132px);
  overflow-y: auto;
  padding-right: 4px;
}

.story-job-id {
  margin: 0 0 12px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.muted-small {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.text-panel {
  padding: 12px 14px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 2px;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(0, 0, 0, 0.85);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.text-panel.muted {
  color: #8c8c8c;
}

.result-img-wrap {
  margin-bottom: 16px;
}

.result-img {
  max-width: 100%;
  max-height: 360px;
  border-radius: 4px;
  border: 1px solid #f0f0f0;
}

.detail-image-tail {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

.detail-image-tail .text-panel {
  max-height: 280px;
}

/* el-image 默认 height:100% + overflow:hidden，易把竖图裁成一条；改为随原图比例撑满宽度 */
.detail-result-img-wrap {
  margin-bottom: 0;
}

.detail-result-img-open {
  cursor: zoom-in;
  outline: none;
}

.detail-result-img-wrap :deep(.el-image) {
  display: block;
  width: 100%;
  max-height: none;
  overflow: visible;
}

.detail-result-img-wrap :deep(.el-image__inner) {
  position: relative;
  width: 100% !important;
  height: auto !important;
  max-height: none !important;
  vertical-align: top;
  border-radius: 4px;
  border: 1px solid #f0f0f0;
}

.desc-grid {
  margin-bottom: 16px;
}

.field-label {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  margin: 12px 0 6px;
  font-weight: 500;
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
  overflow-x: auto;
  max-height: 260px;
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

.trace-body-hint {
  margin: 0 0 8px;
}

.hint {
  margin-top: 12px;
  font-size: 12px;
  color: #8c8c8c;
}

.match-url-list {
  margin: 0 0 16px;
  padding-left: 1.1rem;
  font-size: 13px;
  line-height: 1.7;
}

.match-url-link {
  color: var(--el-color-primary);
  word-break: break-all;
}

.match-url-link:hover {
  text-decoration: underline;
}

.storyboard-parse-alert {
  margin-bottom: 12px;
}

.storyboard-alert-actions {
  margin-top: 8px;
}

.shot-op-cell {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px 6px;
}

.va-board-op {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.va-jump-icon-btn {
  flex-shrink: 0;
}

.hit-rank-table {
  margin-bottom: 12px;
}
</style>
