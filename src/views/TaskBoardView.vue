<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElImageViewer, ElMessage } from 'element-plus'
import { Position, VideoCamera } from '@element-plus/icons-vue'
import {
  fetchImageHistoryForBoard,
  fetchVideoAnalysisHistoryForBoard,
  fetchVideoMatchJobsForBoard,
  fetchMaterialMatchesForBoard,
  fetchImageTaskDetail,
  fetchVideoAnalysisTaskDetail,
  fetchVideoMatchJobTaskDetail,
  fetchMaterialMatchTaskDetail,
  retryImageHistoryTask,
  retryVideoAnalysisHistoryTask,
  retryVideoMatchJobTask
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
import { useTaskBoardPolling } from '@/composables/task_board/useTaskBoardPolling'
import TaskBoardFilterForm from '@/components/task_board/TaskBoardFilterForm.vue'
import ImageBoardPanel from '@/components/task_board/ImageBoardPanel.vue'
import VideoAnalysisBoardPanel from '@/components/task_board/VideoAnalysisBoardPanel.vue'
import VideoMatchTagBoardPanel from '@/components/task_board/VideoMatchTagBoardPanel.vue'
import VideoMatchTranscribeBoardPanel from '@/components/task_board/VideoMatchTranscribeBoardPanel.vue'
import VideoMatchSearchBoardPanel from '@/components/task_board/VideoMatchSearchBoardPanel.vue'
import TaskBoardDetailDialog from '@/components/task_board/TaskBoardDetailDialog.vue'
import TaskBoardStoryboardDialog from '@/components/task_board/TaskBoardStoryboardDialog.vue'
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
  if (s === 'video_match_tag') return 'video_match_tag'
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

async function loadImage(silent = false, targetIds?: string[]) {
  if (!silent) loading.value = true
  try {
    const data = await fetchImageHistoryForBoard(targetIds?.length ? { ids: targetIds.join(',') } : undefined)
    if (data?.success && Array.isArray(data.history)) {
      if (targetIds?.length) {
        data.history.forEach((newItem: Record<string, unknown>) => {
          const idx = imageRows.value.findIndex((r) => r.id === newItem.id || r.taskId === newItem.taskId)
          if (idx !== -1 && imageRows.value[idx]) Object.assign(imageRows.value[idx]!, newItem)
        })
      } else {
        imageRows.value = data.history as Record<string, unknown>[]
      }
    } else if (!targetIds?.length) {
      imageRows.value = []
    }
  } finally {
    if (!silent) loading.value = false
  }
}

async function loadVideo(silent = false, targetIds?: string[]) {
  if (!silent) loading.value = true
  try {
    const params = {
      workspace: workspaceFilter.value || undefined,
      ids: targetIds?.length ? targetIds.join(',') : undefined
    }
    const data = await fetchVideoAnalysisHistoryForBoard(params)
    if (data?.success && Array.isArray(data.history)) {
      if (targetIds?.length) {
        data.history.forEach((newItem: Record<string, unknown>) => {
          const idx = videoRows.value.findIndex((r) => r.id === newItem.id || r.taskId === newItem.taskId)
          if (idx !== -1 && videoRows.value[idx]) Object.assign(videoRows.value[idx]!, newItem)
        })
      } else {
        videoRows.value = data.history as Record<string, unknown>[]
      }
    } else if (!targetIds?.length) {
      videoRows.value = []
    }
  } finally {
    if (!silent) loading.value = false
  }
}

async function loadMaterialMatches(silent = false, targetIds?: string[]) {
  if (!silent) loading.value = true
  try {
    const ws = workspaceFilter.value.trim() || undefined
    const params: { limit: number; workspace?: string; ids?: string } = { limit: 100, workspace: ws }
    if (targetIds?.length) params.ids = targetIds.join(',')
    const data = await fetchMaterialMatchesForBoard(params)
    if (data?.success && Array.isArray(data.matches)) {
      if (targetIds?.length) {
        data.matches.forEach((newItem: Record<string, unknown>) => {
          const idx = materialMatchRows.value.findIndex((r) => r.id === newItem.id || r.taskId === newItem.taskId)
          if (idx !== -1 && materialMatchRows.value[idx]) Object.assign(materialMatchRows.value[idx]!, newItem)
        })
      } else {
        materialMatchRows.value = data.matches as Record<string, unknown>[]
      }
    } else if (!targetIds?.length) {
      materialMatchRows.value = []
    }
  } finally {
    if (!silent) loading.value = false
  }
}

async function loadVmJobs(silent = false, targetIds?: string[]) {
  if (!silent) loading.value = true
  try {
    const ws = workspaceFilter.value.trim() || undefined
    const params: { workspace?: string; limit: number; ids?: string } = {
      limit: 100,
      workspace: ws,
    }
    if (targetIds?.length) params.ids = targetIds.join(',')
    const data = await fetchVideoMatchJobsForBoard(params)
    if (data?.success && Array.isArray(data.jobs)) {
      if (targetIds?.length) {
        data.jobs.forEach((newItem: Record<string, unknown>) => {
          const idx = vmJobRows.value.findIndex((r) => r.id === newItem.id || r.taskId === newItem.taskId)
          if (idx !== -1 && vmJobRows.value[idx]) Object.assign(vmJobRows.value[idx]!, newItem)
        })
      } else {
        vmJobRows.value = data.jobs as Record<string, unknown>[]
      }
    } else if (!targetIds?.length) {
      vmJobRows.value = []
    }
  } finally {
    if (!silent) loading.value = false
  }
}

const { durationTick } = useTaskBoardPolling({
  boardSection,
  imageRows,
  videoRows,
  materialMatchRows,
  vmJobRows,
  loadImage,
  loadVideo,
  loadMaterialMatches,
  loadVmJobs,
  rowStatusNorm
})


async function refresh() {
  const s = boardSection.value
  if (s === 'image') await loadImage()
  else if (s === 'video') await loadVideo()
  else if (s === 'video_match_transcribe' || s === 'video_match_tag') await loadVmJobs()
  else if (s === 'video_match_search') await loadMaterialMatches()
}

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





watch(
  () => route.path,
  () => {
    refresh()
  },
  { immediate: true }
)

watch(workspaceFilter, async () => {
  const s = boardSection.value
  if (s === 'video') await loadVideo()
  else if (s === 'video_match_transcribe' || s === 'video_match_tag') await loadVmJobs()
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


const handleRetry = (row: Record<string, unknown>) => {
  const s = boardSection.value
  if (s === 'image') retryImageRow(row)
  else if (s === 'video') retryVideoRow(row)
  else if (s === 'video_match_transcribe') retryVmJobRow(row)
  else if (s === 'video_match_search') retryMaterialMatchRow(row)
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
      // 素材匹配看板：从 top_hits_for_board 里提取 Top 命中行
      if (section === 'video_match_search') {
        detailIsShotMatch.value = true
        const topHits = (res.detail as Record<string, unknown>).top_hits_for_board
        if (Array.isArray(topHits) && topHits.length) {
          detailMatchHitRows.value = normalizeMatchHitRows(topHits)
        }
      }
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
    const snap = row.strategy_snapshot
    const stratName = typeof (snap as any)?.name === 'string' ? (snap as any).name : undefined
    const fromSnap = searchTokensFromMaterialSnapshot(row)
    const preview = String(row.query_preview ?? '').trim()
    const tokList = fromSnap.length > 0 ? fromSnap : tokensFromMaterialQueryPreview(preview)
    if (tokList.length === 0) {
      ElMessage.warning('该条履历缺少检索标签，无法回填到视频分析')
      return
    }
    const bm25 = typeof (snap as any)?.bm25_weight === 'number' ? (snap as any).bm25_weight : 0.3
    const vec = typeof (snap as any)?.vector_weight === 'number' ? (snap as any).vector_weight : 0.7
    const rrf = !!(snap as any)?.use_rrf
    const fuzzy = typeof (snap as any)?.fuzzy === 'boolean' ? ((snap as any).fuzzy as boolean) : true
    const tw = (snap as any)?.text_weights as Record<string, number> | undefined
    const vw = (snap as any)?.vector_weights as Record<string, number> | undefined
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
      searchStrategyName: stratName,
      searchFuzzy: fuzzy,
      enableRoadRunFallback: !!(row as any).enable_road_run_fallback,
      autoSearch: true,
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
      if (!andFields.includes('frame_orientation')) andFields.push('frame_orientation')
      if (!andFields.includes('frame_size')) andFields.push('frame_size')
      const tokens = tagsJsonToSearchTokens(shot.tags_json as Record<string, unknown>, andFields)
      const snap = res.search_strategy_snapshot
      const stratName = typeof (snap as any)?.name === 'string' ? (snap as any).name : undefined
      const bm25 =
        typeof (snap as any)?.bm25_weight === 'number' ? ((snap as any).bm25_weight as number) : 0.3
      const vec =
        typeof (snap as any)?.vector_weight === 'number' ? ((snap as any).vector_weight as number) : 0.7
      const rrf = !!(snap as any)?.use_rrf
      const tw = (snap as any)?.text_weights as Record<string, number> | undefined
      const vw = (snap as any)?.vector_weights as Record<string, number> | undefined
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
        searchStrategyName: stratName,
        searchFuzzy: true,
        enableRoadRunFallback: !!(row as any).enable_road_run_fallback,
        autoSearch: true,
      })
      router.push({ name: 'video-analysis' })
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

const shotTranscribeTokens = computed(() => {
  if (shotTranscribeRow.value?.search_tokens_json && Array.isArray(shotTranscribeRow.value.search_tokens_json)) {
    return shotTranscribeRow.value.search_tokens_json
  }
  return tagsJsonToSearchTokens((shotTranscribeRow.value?.tags_json ?? {}) as Record<string, unknown>)
})

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
  router.push({ name: 'video-analysis' })
}

/** 任务看板：进入视频分析页并选中该条历史与工作区 */
function goVideoAnalysisFromBoardRow(row: Record<string, unknown>) {
  const id = String(row.va_context_history_id || row.id || '').trim()
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
  () => !!(detailPayload.value && detailPayload.value.businessType === 'IMAGE_GEN'),
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

const handleViewMaterialBoard = (row: any) => { console.log('View material board', row) }
const handleNavigateToVideoAnalysis = (row: any, workspace: string) => { 
  if (boardSection.value === 'video_match_search') {
    goVideoAnalysisFromMaterialRow(row)
  } else {
    goVideoAnalysisFromBoardRow(row)
  }
}

</script>

<template>
  <div class="task-board">
    <div class="board-panel">
      <div class="panel-head">
        <h2 class="panel-title">{{ pageTitle }}</h2>
        <el-button type="primary" size="small" :loading="loading" @click="refresh">刷新</el-button>
      </div>

            <TaskBoardFilterForm
        v-model:dateRange="dateRange"
        v-model:statusFilter="statusFilter"
        v-model:idSearchFilter="idSearchFilter"
        v-model:workspaceFilter="workspaceFilter"
        :board-section="boardSection"
        @search="currentPage = 1"
        @reset="resetFilters"
      />

      <!-- 图像生成 -->
      <ImageBoardPanel
        v-if="boardSection === 'image'"
        :loading="loading" :rows="pagedRows" :durationTick="durationTick" @detail="openDetail" @retry="handleRetry"
      />

      <!-- 视频分析 -->
      <VideoAnalysisBoardPanel
        v-else-if="boardSection === 'video'"
        :loading="loading" :rows="pagedRows" :durationTick="durationTick" @detail="openDetail" @retry="handleRetry"
      />

      <!-- 视频匹配 · 脚本转写 -->
  
    <VideoMatchTagBoardPanel
      v-else-if="boardSection === 'video_match_tag'"
      :rows="vmJobRows"
      :loading="loading"
      :duration-tick="durationTick"
      @detail="openDetail"
      @storyboard="openStoryboard"
      @retry="handleRetry"
    />
    <VideoMatchTranscribeBoardPanel

        v-else-if="boardSection === 'video_match_transcribe'"
        :loading="loading" :rows="pagedRows" :durationTick="durationTick" @detail="openDetail" @retry="handleRetry" @storyboard="openStoryboard"
      />

      <!-- 视频匹配 · 素材匹配 -->
      <VideoMatchSearchBoardPanel
        v-else-if="boardSection === 'video_match_search'"
        :loading="loading" :rows="pagedRows" :durationTick="durationTick" @detail="openDetail" @retry="handleRetry" @view-material="handleViewMaterialBoard" @navigate-analysis="(r) => handleNavigateToVideoAnalysis(r, workspaceFilter)"
      />

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

    <TaskBoardStoryboardDialog
      v-model="storyboardVisible"
      :board-section="boardSection"
      :storyboard-loading="storyboardLoading"
      :storyboard-job-id="storyboardJobId"
      :storyboard-job-parse-failed="storyboardJobParseFailed"
      :storyboard-parent-row="storyboardParentRow"
      :vm-retrying-id="vmRetryingId"
      :storyboard-shots="storyboardShots"
      :shot-rematching-id="shotRematchingId"
      @retry-job="retryVmJobRow"
      @open-match="openShotMatch"
      @rematch-shot="rematchStoryboardShot"
      @go-video-analysis="goVideoAnalysisFromShot"
    />

    <TaskBoardDetailDialog
      v-model="detailVisible"
      :detail-dialog-title="detailDialogTitle"
      :detail-is-shot-match="detailIsShotMatch"
      :detail-loading="detailLoading"
      :detail-payload="detailPayload"
      :detail-match-hit-rows="detailMatchHitRows"
      :is-image-gen-detail="isImageGenDetail"
      :detail-prompt="detailPrompt"
      :detail-result-image-url="detailResultImageUrl"
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
