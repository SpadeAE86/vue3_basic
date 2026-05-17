<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Headset,
  Microphone,
  Position,
  RefreshRight,
  Setting,
  VideoPlay,
} from '@element-plus/icons-vue'
import {
  createVideoMatchJobApi,
  getVideoMatchJobApi,
  getVideoMatchShotDetailApi,
  getMixComposeApi,
  listVideoMatchJobsApi,
  rematchVideoMatchShotApi,
  searchVideoMatchJobApi,
  startMixComposeApi,
  synthesizeShotAudioApi,
  type VideoMatchJobResponse,
  type VideoMatchJobSummary,
  type VideoMatchShotDto,
} from '@/api/video_match'
import {
  getVideoAnalysisWorkspacesApi,
  getSearchStrategiesApi,
  getTokenJoinDefaultFieldsApi,
  saveSearchStrategyApi,
  deleteSearchStrategyApi,
  type SearchStrategy,
} from '@/api/video_analysis'
import type { WorkspaceOption } from '@/types/videoAnalysis'
import SearchStrategySelect from '@/components/video_analysis/SearchStrategySelect.vue'
import SearchStrategyDialog from '@/components/video_analysis/SearchStrategyDialog.vue'
import TokenJoinTemplateDialog from '@/components/video_analysis/TokenJoinTemplateDialog.vue'
import TokenChipsReadonly from '@/components/video_match/TokenChipsReadonly.vue'
import { tagsJsonToSearchTokens, DEFAULT_TOKEN_JOIN_AND_FIELDS } from '@/utils/matchTagsFromSegment'
import { stashVideoAnalysisPrefillFromMatch } from '@/utils/videoAnalysisSessionCache'
import { ZHIJI_CAR_MODEL_OPTIONS, VIDEO_FRAME_SIZE_OPTIONS, VIDEO_FRAME_ORIENTATION_OPTIONS, videoFrameSizeOptionsForOrientation, normalizeZhijiCarSelectValue } from '@/constants/zhijiCarModels'

const router = useRouter()

const form = ref({
  script: '',
  topic: '',
  title: '',
  car_model: '',
  frame_size: '',
  frame_orientation: '',
  workspace: 'v1',
})

const workspaceOptions = ref<WorkspaceOption[]>([
  { key: 'v1', label: '经典分析 v1', description: '', is_default: true },
])

/** 随横竖屏过滤画面比例选项，避免组合互斥 */
const videoMatchFrameSizeOptions = computed(() =>
  videoFrameSizeOptionsForOrientation(form.value.frame_orientation),
)

watch(
  () => form.value.frame_orientation,
  () => {
    const allowed = new Set<string>(videoMatchFrameSizeOptions.value.map((x) => x.value))
    const fs = form.value.frame_size
    if (fs && !allowed.has(fs)) {
      form.value.frame_size = ''
    }
  },
)

const parsing = ref(false)
const matching = ref(false)
const composing = ref(false)
const currentJobId = ref<string | null>(null)
const shots = ref<VideoMatchShotDto[]>([])
const parseStatus = ref<string | null>(null)
const parseError = ref<string | null>(null)
const searchTotalMs = ref<number | null>(null)
const jobSearchStatus = ref<string | null>(null)
const jobSearchError = ref<string | null>(null)
/** 与任务看板一致：跳转视频分析时带入工作区与策略权重 */
const matchJobWorkspace = ref('v1')
const jobStrategySnapshot = ref<Record<string, unknown> | null>(null)

/** 口播预览：共享一个 audio 元素，按行切换 src */
const sharedAudioRef = ref<HTMLAudioElement | null>(null)
const playingRowKey = ref<string | null>(null)
const isAudioPlaying = ref(false)
const audioProgressPct = ref(0)
const synthBusyByShotId = reactive<Record<number, boolean>>({})

let composePollTimer: ReturnType<typeof setInterval> | null = null

const mixPreferSrt = ref(false)

const lastMixCompose = ref<{
  compose_id: string
  biz_id: string | number
  status: string
  prefer_srt?: boolean
  result_obs_url?: string | null
  result_srt_text?: string | null
  error_message?: string | null
} | null>(null)

function clearComposePoll() {
  if (composePollTimer != null) {
    clearInterval(composePollTimer)
    composePollTimer = null
  }
}

/** 装饰用假波形条高度（px） */
const waveHeights = [5, 12, 7, 15, 9, 13, 6, 11, 8, 14, 5, 10, 7, 12]

function rowAudioKey(row: VideoMatchShotDto) {
  return row.id != null ? `id-${row.id}` : `ord-${row.shot_order}`
}

function onAudioTimeUpdate() {
  const a = sharedAudioRef.value
  if (!a?.duration || !Number.isFinite(a.duration) || a.duration <= 0) return
  audioProgressPct.value = Math.min(100, (a.currentTime / a.duration) * 100)
}

function onAudioPlay() {
  isAudioPlaying.value = true
}

function onAudioPause() {
  isAudioPlaying.value = false
}

function onAudioEnded() {
  playingRowKey.value = null
  isAudioPlaying.value = false
  audioProgressPct.value = 0
}

function togglePlayObs(row: VideoMatchShotDto) {
  const url = (row.obs_audio_url || '').trim()
  const el = sharedAudioRef.value
  if (!url || !el) return
  const key = rowAudioKey(row)
  if (playingRowKey.value === key && !el.paused) {
    el.pause()
    return
  }
  if (playingRowKey.value !== key) {
    el.src = url
    playingRowKey.value = key
    audioProgressPct.value = 0
    el.load()
  }
  void el.play().catch(() => {
    ElMessage.error('无法播放该地址（检查浏览器跨域或链接是否失效）')
  })
}

function rowIsActivelyPlaying(row: VideoMatchShotDto) {
  return playingRowKey.value === rowAudioKey(row) && isAudioPlaying.value
}

async function onSynthesizeAudio(row: VideoMatchShotDto) {
  if (!currentJobId.value) {
    ElMessage.warning('缺少任务 ID')
    return
  }
  if (row.id == null) {
    ElMessage.warning('分镜尚未落库（无数据库 ID），请先完成解析或载入历史任务')
    return
  }
  const sid = row.id
  synthBusyByShotId[sid] = true
  try {
    const res = await synthesizeShotAudioApi(currentJobId.value, sid)
    if (!res.success || !res.shot) {
      ElMessage.error(res.error || '生成失败')
      return
    }
    const i = shots.value.findIndex((s) => s.id === sid)
    if (i >= 0) {
      shots.value[i] = { ...shots.value[i], ...res.shot }
    }
    ElMessage.success('口播朗读已生成并上传')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '请求异常')
  } finally {
    synthBusyByShotId[sid] = false
  }
}

const historyJobs = ref<VideoMatchJobSummary[]>([])
const historyJobId = ref<string | null>(null)

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

/** 分镜详情：HTTP trace（任务看板同款）+ 标签只读 */
const matchDetailVisible = ref(false)
const matchDetailLoading = ref(false)
const matchDetailPayload = ref<Record<string, unknown> | null>(null)
const matchDetailRow = ref<VideoMatchShotDto | null>(null)
const matchDetailLocalOnly = ref(false)
const matchDetailHitRows = ref<
  { rank: number; score: number; history_id: string; video_path: string; doc_id: string }[]
>([])

const shotTranscribeVisible = ref(false)
const shotTranscribeRow = ref<VideoMatchShotDto | null>(null)
const vmShotRematchingId = ref<number | null>(null)

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

function formatMatchDetailJson(v: unknown) {
  try {
    return JSON.stringify(v ?? null, null, 2)
  } catch {
    return String(v)
  }
}

function normalizeMatchHitRows(hits: unknown) {
  if (!Array.isArray(hits)) return []
  return hits.slice(0, 5).map((h, i) => {
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

function top1UrlDisplay(url: string): string {
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

/** 主表展示用 / 状态推断：优先 API 的 top5_video_urls，否则回落 top1 */
function shotRankedVideoUrls(row: VideoMatchShotDto): string[] {
  const raw = (row.top5_video_urls || []).map((x) => String(x || '').trim()).filter(Boolean)
  if (raw.length) return raw.slice(0, 5)
  const t1 = (row.top1_obs_url || '').trim()
  return t1 ? [t1] : []
}

/** 主表 URL 列仅展示 Top1：与 shotRankedVideoUrls 首条一致 */
function shotTop1VideoUrl(row: VideoMatchShotDto): string {
  const urls = shotRankedVideoUrls(row)
  return urls.length ? urls[0]! : ''
}

function syncMatchJobContext(res: VideoMatchJobResponse) {
  const ws = String(res.workspace ?? '').trim()
  if (ws) matchJobWorkspace.value = ws
  else {
    const f = form.value.workspace.trim()
    if (f) matchJobWorkspace.value = f
  }
  jobStrategySnapshot.value =
    res.search_strategy_snapshot && typeof res.search_strategy_snapshot === 'object'
      ? (res.search_strategy_snapshot as Record<string, unknown>)
      : null
}

function openShotTranscribe(row: VideoMatchShotDto) {
  shotTranscribeRow.value = row
  shotTranscribeVisible.value = true
}

function shotMatchFailedVm(row: VideoMatchShotDto): boolean {
  return (row.search_status || '').toLowerCase() === 'failed'
}

async function rematchVmShot(row: VideoMatchShotDto) {
  const jid = currentJobId.value
  if (!jid || row.id == null) return
  vmShotRematchingId.value = row.id
  try {
    const res = await rematchVideoMatchShotApi(jid, row.id)
    const shot = res.shot
    if (shot) {
      const i = shots.value.findIndex((s) => s.id === row.id)
      if (i >= 0) shots.value[i] = { ...shots.value[i], ...shot }
    } else if (res.success) {
      const r2 = await getVideoMatchJobApi(jid)
      if (r2.success && r2.shots) shots.value = r2.shots
      if (r2.success) syncMatchJobContext(r2)
    }
    if (res.success) {
      ElMessage.success('已重新检索本分镜')
    } else {
      ElMessage.error(res.error || '本分镜匹配失败')
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '请求失败')
  } finally {
    vmShotRematchingId.value = null
  }
}

function canJumpVideoAnalysisFromVmShot(row: VideoMatchShotDto): boolean {
  // 无论成功/失败，只要有标签就允许跳转到视频分析搜索框复现
  return !!row.tags_json && Object.keys(row.tags_json as object).length > 0
}

async function goVideoAnalysisFromVmShot(row: VideoMatchShotDto) {
  if (!canJumpVideoAnalysisFromVmShot(row)) return
  const ws = matchJobWorkspace.value || form.value.workspace.trim() || 'v1'
  let andFields = [...DEFAULT_TOKEN_JOIN_AND_FIELDS]
  try {
    const r = await getTokenJoinDefaultFieldsApi(ws)
    if (r.success && r.and_segment_fields?.length) {
      andFields = r.and_segment_fields
    }
  } catch {
    /* 使用内置默认 */
  }
  // Ignore token-join-templates when backfilling from match, to prevent strict term filters 
  // that would drop hits (Match uses relaxed partition filters with generic_hq_road_run fallback).
  const tokens = tagsJsonToSearchTokens((row.tags_json ?? {}) as Record<string, unknown>, [])
  if (row.segment_text?.trim()) {
    tokens.unshift({ text: row.segment_text.trim(), join: 'OR', type: 'keyword' })
  }
  const snap = jobStrategySnapshot.value
  const bm25 = typeof snap?.bm25_weight === 'number' ? snap.bm25_weight : 0.3
  const vec = typeof snap?.vector_weight === 'number' ? snap.vector_weight : 0.7
  const rrf = !!snap?.use_rrf
  const tw = snap?.text_weights
  const vw = snap?.vector_weights
  stashVideoAnalysisPrefillFromMatch({
    workspace: matchJobWorkspace.value || form.value.workspace.trim() || 'v1',
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
    searchStrategyName: typeof snap?.name === 'string' ? snap.name : undefined,
    searchFuzzy: true,
    autoSearch: true,
    sourceMatchId: currentJobId.value || undefined,
  })
  router.push('/video-analysis')
}

async function openMatchDetail(row: VideoMatchShotDto) {
  matchDetailRow.value = row
  matchDetailVisible.value = true
  matchDetailPayload.value = null
  matchDetailLocalOnly.value = false
  matchDetailHitRows.value = normalizeMatchHitRows(row.match_top_hits_json)

  if (row.id == null || !currentJobId.value) {
    matchDetailLocalOnly.value = true
    matchDetailPayload.value = {}
    return
  }

  matchDetailLoading.value = true
  try {
    const res = await getVideoMatchShotDetailApi(currentJobId.value, row.id)
    if (res.success && res.detail) {
      matchDetailPayload.value = res.detail
      if (res.shot?.match_top_hits_json) {
        matchDetailHitRows.value = normalizeMatchHitRows(res.shot.match_top_hits_json)
      }
    } else {
      matchDetailPayload.value = { error: res.error || '加载失败' }
    }
  } catch (e) {
    matchDetailPayload.value = { error: e instanceof Error ? e.message : '请求异常' }
  } finally {
    matchDetailLoading.value = false
  }
}

watch(shotTranscribeVisible, (open) => {
  if (!open) shotTranscribeRow.value = null
})

const hasShots = computed(() => shots.value.length > 0)
const canMatch = computed(
  () =>
    hasShots.value &&
    !!currentJobId.value &&
    parseStatus.value === 'done' &&
    !!selectedStrategy.value.trim(),
)

const canMixCompose = computed(() => {
  if (!currentJobId.value) return false
  if (parseStatus.value !== 'done') return false
  if (!shots.value.length) return false
  if ((jobSearchStatus.value || '').toLowerCase() !== 'done') return false
  return shots.value.every((s) => {
    if (s.id == null) return false
    if ((s.search_status || '').toLowerCase() !== 'done') return false
    if (!(s.obs_audio_url || '').trim()) return false
    if (!(s.top1_obs_url || '').trim()) return false
    return true
  })
})

const mixComposeDisabledHint = computed(() => {
  if (!currentJobId.value) return '请先创建或载入任务'
  if (parseStatus.value !== 'done') return '请先完成口播解析'
  if (!shots.value.length) return '暂无分镜'
  const jss = (jobSearchStatus.value || '').toLowerCase()
  if (jss === 'failed') return '存在分镜素材匹配失败，请处理后再合成'
  if (jss !== 'done') return '请先点击「匹配」并完成素材检索'
  const bad = shots.value.some(
    (s) =>
      s.id == null ||
      (s.search_status || '').toLowerCase() !== 'done' ||
      !(s.obs_audio_url || '').trim() ||
      !(s.top1_obs_url || '').trim(),
  )
  if (bad) return '每条分镜需：匹配成功、已生成口播音频、且有 Top1 视频'
  return ''
})

function shotSearchStatusNorm(row: VideoMatchShotDto): string {
  const s = (row.search_status || '').toLowerCase()
  if (s === 'failed') return 'failed'
  if (s === 'done') {
    if (!shotRankedVideoUrls(row).length) return 'failed'
    return 'success'
  }
  if (s === 'running') return 'running'
  if (s === 'pending') {
    const j = (jobSearchStatus.value || '').toLowerCase()
    if (j === 'running') return 'running'
    return 'pending'
  }
  return s || 'unknown'
}

function shotStatusLabel(st: string) {
  if (st === 'success') return '成功'
  if (st === 'failed') return '失败'
  if (st === 'running') return '匹配中'
  if (st === 'pending') return '待匹配'
  if (st === 'unknown') return '未知'
  return st
}

function shotStatusTagType(st: string): 'success' | 'danger' | 'warning' | 'info' {
  if (st === 'success') return 'success'
  if (st === 'failed') return 'danger'
  if (st === 'running') return 'warning'
  if (st === 'pending') return 'info'
  return 'info'
}

/** 去掉 DB/表格导出等误入的表头行（如 “1000 rows below”） */
function normalizeVideoMatchScriptInbound(raw: unknown): string {
  let s = typeof raw === 'string' ? raw : ''
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1)
  const lineRe = /^\s*\d{1,7}\s+rows?\s+below\.?\s*$/i
  const parts = s.split(/\r?\n/)
  while (parts.length && lineRe.test(parts[0] ?? '')) {
    parts.shift()
  }
  return parts.join('\n').replace(/^\s+/, '')
}

/** 将任务接口返回的入参写回表单（载入历史、对齐检索策略名） */
function applyVideoMatchJobInputsToForm(res: VideoMatchJobResponse) {
  const ws = (res.workspace ?? '').trim()
  if (ws) form.value.workspace = ws
  if (typeof res.script === 'string') form.value.script = normalizeVideoMatchScriptInbound(res.script)
  form.value.topic = res.topic != null ? String(res.topic) : ''
  form.value.title = res.title != null ? String(res.title) : ''
  form.value.car_model = normalizeZhijiCarSelectValue(res.car_model != null ? String(res.car_model) : '')
  {
    const fs = (res.frame_size ?? '').trim()
    const ok = VIDEO_FRAME_SIZE_OPTIONS.some((o) => o.value === fs)
    form.value.frame_size = ok ? fs : ''
  }
  {
    const fo = (res.frame_orientation ?? '').trim()
    const ok = VIDEO_FRAME_ORIENTATION_OPTIONS.some((o) => o.value === fo)
    form.value.frame_orientation = ok ? fo : ''
  }
  {
    const allowed = new Set<string>(
      videoFrameSizeOptionsForOrientation(form.value.frame_orientation).map((x) => x.value),
    )
    if (form.value.frame_size && !allowed.has(form.value.frame_size)) {
      form.value.frame_size = ''
    }
  }

  const snap = res.search_strategy_snapshot
  if (snap && typeof snap === 'object' && snap !== null && 'name' in snap) {
    const n = String((snap as { name?: unknown }).name ?? '').trim()
    if (n) selectedStrategy.value = n
  }
}

function shortJobIdForDisplay(id: string) {
  const t = (id || '').trim()
  if (t.length <= 14) return t
  return `${t.slice(0, 8)}…${t.slice(-4)}`
}

function pipelineStatusZh(raw: string | null | undefined): { label: string; tag: 'success' | 'danger' | 'warning' | 'info' } {
  const s = (raw || '').toLowerCase()
  if (s === 'done') return { label: '已完成', tag: 'success' }
  if (s === 'failed') return { label: '失败', tag: 'danger' }
  if (s === 'running' || s === 'processing') return { label: '进行中', tag: 'warning' }
  if (s === 'pending') return { label: '待处理', tag: 'info' }
  return { label: raw || '—', tag: 'info' }
}

async function loadHistoryJobs() {
  try {
    const res = await listVideoMatchJobsApi({
      parse_status: 'done',
      limit: 80,
    })
    if (res?.success && Array.isArray(res.jobs)) {
      historyJobs.value = res.jobs
    }
  } catch {
    historyJobs.value = []
  }
}

function historyJobLabel(j: VideoMatchJobSummary) {
  const tail = j.id.length > 10 ? j.id.slice(0, 8) + '…' : j.id
  const t = (j.title || j.topic || '未命名').trim()
  const ts = j.created_at ? j.created_at.replace('T', ' ').slice(0, 19) : ''
  const ws = (j.workspace ?? '').trim()
  const wsTag = ws ? `[${ws}] ` : ''
  return ts ? `${wsTag}${ts} · ${t} · ${tail}` : `${wsTag}${t} · ${tail}`
}

async function onHistoryJobChange(id: string | null | undefined) {
  const sid = id == null ? '' : String(id)
  if (!sid) return
  try {
    const res = await getVideoMatchJobApi(sid)
    if (!res.success) {
      ElMessage.error(res.error || '加载任务失败')
      return
    }
    currentJobId.value = res.job_id ?? sid
    shots.value = res.shots ?? []
    parseStatus.value = res.parse_status ?? null
    parseError.value = res.parse_error ?? null
    jobSearchStatus.value = res.search_status ?? null
    searchTotalMs.value = res.search_total_ms ?? null
    jobSearchError.value = res.search_error ?? null
    applyVideoMatchJobInputsToForm(res)
    syncMatchJobContext(res)
    // 持久化选中状态，切路由返回后自动恢复
    try { sessionStorage.setItem('videoMatch:lastJobId:v1', sid) } catch { /* ignore */ }
    ElMessage.success('已载入历史任务')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  }
}

async function fetchWorkspaces() {
  try {
    const res = await getVideoAnalysisWorkspacesApi()
    if (res?.success && Array.isArray(res.workspaces) && res.workspaces.length) {
      workspaceOptions.value = res.workspaces
      const def = res.workspaces.find((w: WorkspaceOption) => w.is_default)
      if (def) {
        form.value.workspace = def.key
      }
    }
  } catch {
    // keep defaults
  }
}

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

async function onParse() {
  const scriptClean = normalizeVideoMatchScriptInbound(form.value.script.trim())
  if (!scriptClean) {
    ElMessage.warning('口播脚本不能为空')
    return
  }

  parsing.value = true
  parseError.value = null
  searchTotalMs.value = null
  jobSearchStatus.value = null
  jobSearchError.value = null
  try {
    const res = await createVideoMatchJobApi({
      script: scriptClean,
      topic: form.value.topic.trim() || undefined,
      title: form.value.title.trim() || undefined,
      car_model: form.value.car_model.trim() || undefined,
      frame_size: form.value.frame_size.trim() || undefined,
      frame_orientation: form.value.frame_orientation.trim() || undefined,
      workspace: form.value.workspace.trim() || 'v1',
      mock: false,
    })

    if (!res.success) {
      parseError.value = res.error || res.parse_error || '解析失败'
      shots.value = []
      currentJobId.value = res.job_id ?? null
      parseStatus.value = res.parse_status ?? null
      ElMessage.error(parseError.value)
      return
    }

    currentJobId.value = res.job_id ?? null
    shots.value = res.shots ?? []
    parseStatus.value = res.parse_status ?? null
    jobSearchStatus.value = res.search_status ?? null
    searchTotalMs.value = res.search_total_ms ?? null
    jobSearchError.value = res.search_error ?? null
    syncMatchJobContext(res)
    form.value.script = scriptClean
    if (res.job_id) try { sessionStorage.setItem('videoMatch:lastJobId:v1', res.job_id) } catch { /* ignore */ }
    ElMessage.success(res.mock ? '转写完成（服务端返回 mock）' : '转写完成')
    await loadHistoryJobs()
    historyJobId.value = currentJobId.value
  } catch (e) {
    const msg = e instanceof Error ? e.message : '请求异常'
    parseError.value = msg
    ElMessage.error(msg)
  } finally {
    parsing.value = false
  }
}

async function onMatch() {
  if (!canMatch.value) {
    if (!selectedStrategy.value.trim()) {
      ElMessage.warning('请选择搜索策略')
    }
    return
  }

  matching.value = true
  jobSearchError.value = null
  let pollTimer: ReturnType<typeof setInterval> | undefined
  try {
    const jid = currentJobId.value!
    pollTimer = setInterval(async () => {
      try {
        const snap = await getVideoMatchJobApi(jid)
        if (snap.success && snap.shots?.length) {
          shots.value = snap.shots
          syncMatchJobContext(snap)
          if (snap.search_status) jobSearchStatus.value = snap.search_status
          if (snap.search_total_ms != null) searchTotalMs.value = snap.search_total_ms
          if (snap.search_error != null) jobSearchError.value = snap.search_error
          const jobSt = (snap.search_status || '').toLowerCase()
          const allTerminal = snap.shots.every((s) => {
            const x = (s.search_status || '').toLowerCase()
            return x === 'done' || x === 'failed'
          })
          if (allTerminal && jobSt !== 'running' && pollTimer != null) {
            clearInterval(pollTimer)
            pollTimer = undefined
          }
        }
      } catch {
        /* polling best-effort */
      }
    }, 750)

    const res = await searchVideoMatchJobApi(jid, {
      strategy_name: selectedStrategy.value.trim(),
      mode: 'field_aligned_hybrid',
      top_k: 5,
    })

    if (!res.success) {
      jobSearchError.value = res.error || res.search_error || '匹配失败'
      if (res.shots?.length) shots.value = res.shots
      if (res.search_status != null) jobSearchStatus.value = res.search_status
      if (res.search_total_ms != null) searchTotalMs.value = res.search_total_ms
      syncMatchJobContext(res)
      ElMessage.error(jobSearchError.value)
      return
    }

    shots.value = res.shots ?? shots.value
    searchTotalMs.value = res.search_total_ms ?? null
    jobSearchStatus.value = res.search_status ?? 'done'
    jobSearchError.value = res.search_error ?? null
    syncMatchJobContext(res)
    ElMessage.success('匹配完成')
  } catch (e) {
    const msg = e instanceof Error ? e.message : '请求异常'
    jobSearchError.value = msg
    ElMessage.error(msg)
  } finally {
    if (pollTimer) clearInterval(pollTimer)
    matching.value = false
  }
}

function isAbsoluteHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test((s || '').trim())
}

function mixComposeResultHref(raw: string | null | undefined): string | null {
  const u = (raw || '').trim()
  if (!u) return null
  return isAbsoluteHttpUrl(u) ? u : null
}

async function copyMixOutputPath(text: string) {
  const t = (text || '').trim()
  if (!t) return
  try {
    await navigator.clipboard.writeText(t)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败，请手动复制下方文本')
  }
}

function downloadMixSrtFile(text: string, composeId: string) {
  const t = (text || '').trim()
  if (!t) {
    ElMessage.warning('暂无 SRT 内容')
    return
  }
  const safeId = (composeId || 'mix').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 36)
  const blob = new Blob([t.endsWith('\n') ? t : `${t}\n`], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeId || 'mix'}.srt`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('已开始下载 .srt')
}

async function onMixCompose() {
  if (!canMixCompose.value) {
    if (mixComposeDisabledHint.value) {
      ElMessage.warning(mixComposeDisabledHint.value)
    }
    return
  }
  if (!currentJobId.value) return

  clearComposePoll()
  composing.value = true
  lastMixCompose.value = null
  try {
    const start = await startMixComposeApi(currentJobId.value, { prefer_srt: mixPreferSrt.value })
    if (!start.compose_id || !start.biz_id) {
      ElMessage.error(start.detail || '启动混剪失败')
      composing.value = false
      return
    }
    lastMixCompose.value = {
      compose_id: start.compose_id,
      biz_id: start.biz_id,
      status: start.status || 'pending',
      prefer_srt: !!start.prefer_srt || mixPreferSrt.value,
      result_obs_url: null,
      result_srt_text: null,
      error_message: null,
    }
    ElMessage.success('混剪已提交，后台正在转码与合成…')

    composePollTimer = window.setInterval(async () => {
      try {
        const st = await getMixComposeApi(start.compose_id!)
        if (!st) return
        lastMixCompose.value = {
          compose_id: st.compose_id,
          biz_id: st.biz_id,
          status: st.status,
          prefer_srt: st.prefer_srt ?? lastMixCompose.value?.prefer_srt,
          result_obs_url: st.result_obs_url ?? null,
          result_srt_text: st.result_srt_text ?? null,
          error_message: st.error_message ?? null,
        }
        if (st.status === 'done') {
          clearComposePoll()
          composing.value = false
          const srtOk = !!(st.result_srt_text || '').trim()
          if (st.prefer_srt && srtOk) {
            ElMessage.success('混剪完成，已生成外挂字幕')
          } else if (st.result_obs_url) {
            ElMessage.success('混剪完成')
          } else {
            ElMessage.success('混剪任务已完成')
          }
        } else if (st.status === 'failed') {
          clearComposePoll()
          composing.value = false
          ElMessage.error(st.error_message || '混剪失败')
        }
      } catch {
        /* 轮询可忽略瞬时错误 */
      }
    }, 2000)
  } catch (e) {
    composing.value = false
    ElMessage.error(e instanceof Error ? e.message : '混剪请求异常')
  }
}

async function refreshJob() {
  if (!currentJobId.value) return
  const res = await getVideoMatchJobApi(currentJobId.value)
  if (res.success && res.shots) {
    shots.value = res.shots
    parseStatus.value = res.parse_status ?? null
    parseError.value = res.parse_error ?? null
    jobSearchStatus.value = res.search_status ?? null
    searchTotalMs.value = res.search_total_ms ?? null
    jobSearchError.value = res.search_error ?? null
    syncMatchJobContext(res)
  }
}

async function onStrategyDelete(name: string) {
  const s = strategies.value.find((x) => x.name === name)
  if (s?.id == null) return
  try {
    await deleteSearchStrategyApi(s.id)
    if (selectedStrategy.value === name) {
      selectedStrategy.value = ''
    }
    await loadStrategies()
    ElMessage.success('已删除策略')
  } catch {
    ElMessage.error('删除失败')
  }
}

function dismissMixComposeAlert() {
  lastMixCompose.value = null
}

watch(
  () => form.value.workspace,
  () => {
    void fetchVmIndexFields()
    void loadTokenJoinAndFields()
  },
)

watch(tokenJoinDialogVisible, async (open, wasOpen) => {
  if (wasOpen === true && open === false) {
    await loadTokenJoinAndFields()
  }
})

watch(vmStrategyDialogVisible, (open) => {
  if (!open || vmStrategyDialogMode.value !== 'create') return
  const fields = vmIndexFields.value.vector_fields
  if (!fields.length) return
  const next = { ...vmStrategyVectorWeights.value }
  for (const f of fields) {
    next[f] = 0
  }
  vmStrategyVectorWeights.value = next
})

function rowClassName() {
  return 'video-match-table-row'
}

onMounted(async () => {
  await fetchWorkspaces()
  await loadStrategies()
  await loadHistoryJobs()
  await fetchVmIndexFields()
  await loadTokenJoinAndFields()
  // 还原上次选中的匹配任务（切路由返回时不用重新选，静默恢复不弹 Toast）
  const savedJobId = sessionStorage.getItem('videoMatch:lastJobId:v1')
  if (savedJobId && historyJobs.value.some((j) => j.id === savedJobId)) {
    historyJobId.value = savedJobId
    try {
      const res = await getVideoMatchJobApi(savedJobId)
      if (res.success) {
        currentJobId.value = res.job_id ?? savedJobId
        shots.value = res.shots ?? []
        parseStatus.value = res.parse_status ?? null
        parseError.value = res.parse_error ?? null
        jobSearchStatus.value = res.search_status ?? null
        searchTotalMs.value = res.search_total_ms ?? null
        jobSearchError.value = res.search_error ?? null
        applyVideoMatchJobInputsToForm(res)
        syncMatchJobContext(res)
      }
    } catch { /* 忽略：静默恢复失败不影响使用 */ }
  }
})


onUnmounted(() => {
  clearComposePoll()
  sharedAudioRef.value?.pause()
})
</script>

<template>
  <div class="video-match-page video-analysis-container">
    <el-card class="control-panel" shadow="never" :body-style="{ padding: '12px 20px' }">
      <div class="header-controls vm-header-unified">
        <div class="left-controls vm-context-row">
          <h3 class="section-title">视频匹配</h3>
          <div class="vm-inline-group">
            <el-select
              v-model="historyJobId"
              filterable
              clearable
              placeholder="载入已转写任务"
              class="history-job-select"
              size="small"
              @change="onHistoryJobChange"
            >
              <el-option
                v-for="j in historyJobs"
                :key="j.id"
                :label="historyJobLabel(j)"
                :value="j.id"
              />
            </el-select>
            <el-tooltip
              placement="top"
              content="与视频分析索引一致；载入历史任务时会自动切换 workspace"
            >
              <el-select v-model="form.workspace" size="small" class="workspace-select">
                <el-option
                  v-for="ws in workspaceOptions"
                  :key="ws.key"
                  :label="ws.label"
                  :value="ws.key"
                />
              </el-select>
            </el-tooltip>
          </div>
        </div>
        <div class="vm-header-right">
          <div v-if="currentJobId" class="job-status-bar">
            <el-tooltip placement="bottom" :content="'完整任务编号：' + currentJobId">
              <span class="job-ref subtle">任务 {{ shortJobIdForDisplay(currentJobId) }}</span>
            </el-tooltip>
            <el-tag v-if="parseStatus" size="small" effect="plain" :type="pipelineStatusZh(parseStatus).tag">
              口播转写 · {{ pipelineStatusZh(parseStatus).label }}
            </el-tag>
            <el-tag v-if="jobSearchStatus" size="small" effect="plain" :type="pipelineStatusZh(jobSearchStatus).tag">
              素材匹配 · {{ pipelineStatusZh(jobSearchStatus).label }}
            </el-tag>
            <el-button size="small" @click="refreshJob">刷新任务</el-button>
          </div>
          <div class="vm-pipeline-actions">
            <div class="vm-action-group">
              <SearchStrategySelect
                v-model="selectedStrategy"
                :strategies="strategies"
                placeholder="选择搜索策略"
                @refresh="loadStrategies"
                @delete="onStrategyDelete"
                @create="openVmStrategyCreateDialog"
              />
              <el-button
                circle
                size="small"
                color="#6366f1"
                :disabled="!selectedStrategy"
                title="编辑策略权重（BM25 / 向量 / RRF）"
                @click="openVmStrategyEditDialog"
              >
                <el-icon><Setting /></el-icon>
              </el-button>
              <el-button type="success" :disabled="!canMatch || matching" :loading="matching" @click="onMatch">
                匹配
              </el-button>
            </div>
            <div class="vm-action-group vm-compose-inline">
              <span class="mix-srt-toggle" @click.stop>
                <el-switch v-model="mixPreferSrt" size="small" :disabled="composing" />
                <span class="mix-srt-label">外挂 SRT</span>
              </span>
              <el-tooltip
                :disabled="canMixCompose"
                placement="top"
                :content="mixComposeDisabledHint || '提交混剪（后台转码 + 拼轨 + 下发）'"
              >
                <el-button
                  type="primary"
                  plain
                  :disabled="!canMixCompose || composing"
                  :loading="composing"
                  @click="onMixCompose"
                >
                  混剪合成
                </el-button>
              </el-tooltip>
            </div>
          </div>
        </div>
      </div>

      <div class="vm-parse-block">
        <el-form class="parse-form" label-width="72px" @submit.prevent="onParse">
          <el-form-item label="口播脚本" required>
            <el-input
              v-model="form.script"
              type="textarea"
              :rows="3"
              placeholder="例如：智己LS6，城市道路，展示一键泊车功能..."
            />
          </el-form-item>
          <div class="vm-extra-fields">
            <div class="form-row-inline">
              <el-form-item label="主题">
                <el-input v-model="form.topic" placeholder="选填" />
              </el-form-item>
              <el-form-item label="标题">
                <el-input v-model="form.title" placeholder="选填" />
              </el-form-item>
              <el-form-item label="车型">
                <el-select
                  v-model="form.car_model"
                  placeholder="请选择车型（影响转写参考词表）"
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
            </div>
            <div class="form-row-inline vm-frame-constraints-row">
              <el-form-item label="画面比例">
                <el-select
                  v-model="form.frame_size"
                  placeholder="选填：与索引 frame_size 一致"
                  clearable
                  class="frame-size-select"
                >
                  <el-option
                    v-for="opt in videoMatchFrameSizeOptions"
                    :key="`fs_${opt.value || 'any'}`"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="横竖屏">
                <el-select
                  v-model="form.frame_orientation"
                  placeholder="选填：仅定横竖屏（不定比例），写入 frame_orientation"
                  clearable
                  class="frame-orientation-select"
                >
                  <el-option
                    v-for="opt in VIDEO_FRAME_ORIENTATION_OPTIONS"
                    :key="`fo_${opt.value || 'any'}`"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </el-form-item>
            </div>
          </div>
          <el-form-item>
            <div class="parse-actions-row">
              <el-button type="primary" :loading="parsing" @click="onParse">
                {{ parsing ? '转写中...' : '解析 / 转写' }}
              </el-button>
              <el-tooltip content="AND 命中模板（转写 MUST / v2 term filter）" placement="bottom">
                <el-button
                  circle
                  size="default"
                  class="template-gear-btn"
                  title="AND 命中模板"
                  @click="tokenJoinDialogVisible = true"
                >
                  <el-icon><Setting /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </el-form-item>
        </el-form>
        <el-alert v-if="parseError" type="error" :closable="false" show-icon class="parse-alert">
          {{ parseError }}
        </el-alert>
      </div>

      <el-alert
        v-if="jobSearchError"
        type="warning"
        :closable="false"
        show-icon
        class="parse-alert vm-search-error-alert"
      >
        {{ jobSearchError }}
      </el-alert>

      <el-alert
        v-if="lastMixCompose"
        class="mix-compose-status"
        :type="
          lastMixCompose.status === 'failed'
            ? 'error'
            : lastMixCompose.status === 'done'
              ? 'success'
              : 'info'
        "
        :closable="true"
        show-icon
        @close="dismissMixComposeAlert"
      >
        <template #title>混剪：{{ lastMixCompose.status }}</template>
        <div class="mix-compose-status-body">
          <div class="mono">
            <span class="lbl">compose</span> {{ lastMixCompose.compose_id }}
          </div>
          <div class="mono">
            <span class="lbl">biz</span> {{ lastMixCompose.biz_id }}
          </div>
          <div v-if="lastMixCompose.result_obs_url" class="result-link">
            <template v-if="mixComposeResultHref(lastMixCompose.result_obs_url)">
              <a
                :href="mixComposeResultHref(lastMixCompose.result_obs_url)!"
                target="_blank"
                rel="noopener noreferrer"
                >成品 URL</a
              >
            </template>
            <template v-else>
              <div class="mix-result-path">
                <div class="muted small">以下为 OBS 对象键（不是浏览器直链）；用于 Worker/CDN 拼接</div>
                <div class="mono path-text">{{ lastMixCompose.result_obs_url }}</div>
                <el-button
                  size="small"
                  link
                  type="primary"
                  @click="copyMixOutputPath(lastMixCompose.result_obs_url!)"
                >
                  复制路径
                </el-button>
              </div>
            </template>
          </div>
          <div v-if="lastMixCompose.prefer_srt" class="mix-srt-block">
            <template v-if="(lastMixCompose.result_srt_text || '').trim()">
              <div class="muted small">外挂字幕（与口播时间轴对齐）</div>
              <el-button
                size="small"
                link
                type="primary"
                @click="copyMixOutputPath(lastMixCompose.result_srt_text!)"
              >
                复制 SRT
              </el-button>
              <el-button
                size="small"
                link
                type="primary"
                @click="downloadMixSrtFile(lastMixCompose.result_srt_text!, lastMixCompose.compose_id)"
              >
                下载 .srt
              </el-button>
            </template>
            <div v-else-if="lastMixCompose.status === 'done'" class="muted small">
              未返回 SRT 文本（可查看服务端日志）
            </div>
          </div>
          <div v-if="lastMixCompose.error_message" class="mix-err">{{ lastMixCompose.error_message }}</div>
        </div>
      </el-alert>
    </el-card>

    <div v-if="hasShots" class="results-area">
      <el-table
        :data="shots"
        stripe
        border
        size="small"
        style="width: 100%"
        :row-class-name="rowClassName"
      >
        <el-table-column prop="shot_order" label="#" width="56" />
        <el-table-column prop="segment_text" label="口播文案" min-width="200" show-overflow-tooltip />
        <el-table-column label="匹配状态" width="96" align="center">
          <template #default="{ row }">
            <el-tag
              :type="shotStatusTagType(shotSearchStatusNorm(row))"
              effect="light"
              size="small"
              class="status-pill status-tag-admin"
            >
              {{ shotStatusLabel(shotSearchStatusNorm(row)) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="duration_sec" label="时长(s)" width="88" />
        <el-table-column label="口播音频 (OBS)" min-width="220">
          <template #default="{ row }">
            <div class="audio-cell">
              <div class="audio-actions">
                <template v-if="(row.obs_audio_url || '').trim()">
                  <el-button
                    size="small"
                    circle
                    :type="rowIsActivelyPlaying(row) ? 'warning' : 'primary'"
                    @click="togglePlayObs(row)"
                  >
                    <el-icon class="audio-btn-icon" :class="{ 'icon-pulse': rowIsActivelyPlaying(row) }">
                      <Headset v-if="rowIsActivelyPlaying(row)" />
                      <VideoPlay v-else />
                    </el-icon>
                  </el-button>
                </template>
                <el-button
                  v-if="!(row.obs_audio_url || '').trim()"
                  size="small"
                  :disabled="row.id == null"
                  :loading="row.id != null && !!synthBusyByShotId[row.id]"
                  @click="onSynthesizeAudio(row)"
                >
                  <el-icon class="btn-inline-icon"><Microphone /></el-icon>
                  生成朗读
                </el-button>
                <el-tooltip
                  v-if="(row.obs_audio_url || '').trim() && row.id != null"
                  content="重新生成朗读"
                  placement="top"
                >
                  <el-button
                    size="small"
                    circle
                    type="info"
                    :loading="row.id != null && !!synthBusyByShotId[row.id]"
                    @click="onSynthesizeAudio(row)"
                  >
                    <el-icon><RefreshRight /></el-icon>
                  </el-button>
                </el-tooltip>
              </div>
              <div v-if="(row.obs_audio_url || '').trim()" class="wave-block">
                <div class="wave-bars" aria-hidden="true">
                  <span
                    v-for="(h, wi) in waveHeights"
                    :key="wi"
                    class="wave-bar"
                    :class="{
                      'wave-bar--hot':
                        playingRowKey === rowAudioKey(row) &&
                        (wi + 1) / waveHeights.length <= audioProgressPct / 100,
                    }"
                    :style="{ height: Math.max(3, h) + 'px' }"
                  />
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="画面描述" min-width="160" show-overflow-tooltip />
        <el-table-column width="96" align="right">
          <template #header>
            <el-tooltip content="本分镜检索链路耗时（毫秒，含排队）" placement="top">
              <span>耗时</span>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <span v-if="row.match_elapsed_ms != null">{{ Number(row.match_elapsed_ms).toFixed(0) }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="Top1 视频" min-width="160">
          <template #default="{ row }">
            <div v-if="shotTop1VideoUrl(row)" class="match-topn-cell">
              <a
                class="match-url-link"
                :href="shotTop1VideoUrl(row)"
                target="_blank"
                rel="noopener noreferrer"
                :title="shotTop1VideoUrl(row)"
                >{{ top1UrlDisplay(shotTop1VideoUrl(row)) }}</a
              >
              <div v-if="row.match_hit_count != null" class="muted-small match-hit-meta">
                命中 {{ row.match_hit_count }} 条
              </div>
            </div>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="转写操作" width="108" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link :disabled="row.id == null" @click="openShotTranscribe(row)">
              查看转写
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="匹配操作" width="248" fixed="right" align="center">
          <template #default="{ row }">
            <div class="shot-op-cell">
              <el-button type="primary" link :disabled="row.id == null" @click="openMatchDetail(row)">
                查看匹配
              </el-button>
              <el-button
                v-if="shotMatchFailedVm(row)"
                type="primary"
                link
                :disabled="row.id == null"
                :loading="vmShotRematchingId === row.id"
                @click="rematchVmShot(row)"
              >
                重试
              </el-button>
              <el-tooltip content="用本分镜标签与当时匹配策略打开视频分析，并自动全库搜索" placement="top">
                <el-button
                  class="va-jump-icon-btn"
                  :icon="Position"
                  circle
                  size="small"
                  :disabled="!canJumpVideoAnalysisFromVmShot(row)"
                  aria-label="跳转视频分析"
                  @click="goVideoAnalysisFromVmShot(row)"
                />
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="matchDetailVisible"
      title="分镜 · 匹配 HTTP 详情与 Top 命中"
      width="min(1080px, 96vw)"
      top="5vh"
      class="match-detail-dialog admin-dialog"
      align-center
      destroy-on-close
    >
      <div v-loading="matchDetailLoading" class="match-detail-body">
        <div class="field-label">结构化标签（与视频分析搜索条语义一致）</div>
        <TokenChipsReadonly :tokens="matchDetailTokens" :max-preview-chars="36" />

        <el-alert
          v-if="matchDetailLocalOnly"
          type="info"
          :closable="false"
          show-icon
          class="match-detail-alert"
          title="当前为未落库分镜或暂无 HTTP 记录：仅展示标签。解析落库并执行「素材匹配」后，可查看 OpenSearch 请求与响应摘要。"
        />

        <template v-else-if="matchDetailPayload && matchDetailPayload.error">
          <el-alert type="error" :title="String(matchDetailPayload.error)" show-icon :closable="false" />
        </template>

        <template v-else-if="matchDetailPayload && !matchDetailPayload.error">
          <el-descriptions :column="2" border size="small" class="desc-grid">
            <el-descriptions-item label="分镜">{{
              matchDetailRow ? `#${matchDetailRow.shot_order}` : '—'
            }}</el-descriptions-item>
            <el-descriptions-item v-if="matchDetailPayload.requestRid" label="请求记录 rid">{{
              matchDetailPayload.requestRid
            }}</el-descriptions-item>
            <el-descriptions-item v-if="matchDetailPayload.upstreamTaskId" label="上游任务">{{
              matchDetailPayload.upstreamTaskId
            }}</el-descriptions-item>
            <el-descriptions-item label="服务">{{ matchDetailPayload.serviceName ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="方法">{{ matchDetailPayload.methodName ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="HTTP">{{ matchDetailPayload.httpMethod ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="业务类型">{{ matchDetailPayload.businessType ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="状态码">{{ matchDetailPayload.statusCode ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="耗时">{{
              matchDetailPayload.durationMs != null ? `${matchDetailPayload.durationMs} ms` : '—'
            }}</el-descriptions-item>
            <el-descriptions-item label="业务状态">
              <el-tag
                v-if="matchDetailPayload.businessSuccess != null"
                :type="matchDetailPayload.businessSuccess ? 'success' : 'danger'"
                effect="light"
                size="small"
                class="status-tag-admin"
              >
                {{ matchDetailPayload.businessStatusLabel ?? '—' }}
              </el-tag>
              <span v-else>—</span>
            </el-descriptions-item>
            <el-descriptions-item label="错误信息">{{
              (matchDetailPayload.errorMessage as string) || '—'
            }}</el-descriptions-item>
            <el-descriptions-item v-if="matchDetailPayload.httpTraceCreatedAt" label="HTTP 记录创建">{{
              matchDetailPayload.httpTraceCreatedAt
            }}</el-descriptions-item>
            <el-descriptions-item v-if="matchDetailPayload.httpTraceUpdatedAt" label="HTTP 记录更新">{{
              matchDetailPayload.httpTraceUpdatedAt
            }}</el-descriptions-item>
          </el-descriptions>

          <div class="field-label">Request URL</div>
          <pre class="code-block">{{ matchDetailPayload.requestUrl ?? '—' }}</pre>

          <div class="field-label">Request Headers</div>
          <pre class="code-block muted">{{ formatMatchDetailJson(matchDetailPayload.requestHeaders) }}</pre>

          <div class="field-label">Request Body</div>
          <p class="hint trace-body-hint">
            以下内容仅作审计对照：检索请求里的<strong>长向量</strong>入库前会替换为
            <code>_omitted: numeric_vector</code>
            占位；若整体仍超长则会再出现
            <code>_truncated</code>
            。<strong>重试匹配</strong>由服务端根据当前分镜的
            <code>tags_json</code>
            重新调用检索逻辑，<strong>不会</strong>也不应依赖本条 Request Body 回放。
          </p>
          <pre class="code-block code-block--shot-trace">{{ formatMatchDetailJson(matchDetailPayload.requestBody) }}</pre>

          <div class="field-label">Response Headers</div>
          <pre class="code-block muted">{{ formatMatchDetailJson(matchDetailPayload.responseHeaders) }}</pre>

          <div class="field-label">Response Body</div>
          <pre class="code-block">{{ formatMatchDetailJson(matchDetailPayload.responseBody) }}</pre>

          <div class="field-label">Top5 命中（OpenSearch _score）</div>
          <p v-if="!matchDetailHitRows.length" class="hint">
            暂无命中记录（尚未匹配或 trace 未落库时可仍可从上方 Response 查看摘要）
          </p>
          <el-table
            v-else
            :data="matchDetailHitRows"
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
                  target="_blank"
                  rel="noopener noreferrer"
                  >{{ hr.video_path }}</a
                >
                <span v-else class="muted-small">—</span>
              </template>
            </el-table-column>
          </el-table>
          <p v-if="matchDetailHitRows.some((r) => !r.video_path)" class="hint">
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

          <p v-if="matchDetailPayload.note" class="hint">{{ matchDetailPayload.note }}</p>
        </template>
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
        <div class="field-label">口播</div>
        <div class="text-panel">{{ shotTranscribeRow.segment_text || '—' }}</div>
        <div class="field-label">画面描述</div>
        <div class="text-panel">{{ shotTranscribeRow.description || '—' }}</div>
        <div class="field-label">结构化标签</div>
        <TokenChipsReadonly :tokens="shotTranscribeTokens" />
      </template>
    </el-dialog>

    <TokenJoinTemplateDialog v-model="tokenJoinDialogVisible" :workspace="form.workspace" />

    <SearchStrategyDialog
      v-model="vmStrategyDialogVisible"
      :mode="vmStrategyDialogMode"
      :initial-name="vmStrategyInitialName"
      :initial-is-default="vmStrategyInitialIsDefault"
      :bm25-weight="vmStrategyBm25"
      :vector-weight="vmStrategyVector"
      :text-weights="vmStrategyTextWeights"
      :vector-weights="vmStrategyVectorWeights"
      :use-rrf="vmStrategyUseRrf"
      :index-fields="vmIndexFields"
      :text-weight-defaults="vmTextWeightDefaults"
      :vector-weight-defaults="vmVectorWeightDefaults"
      @update:bm25-weight="vmStrategyBm25 = $event"
      @update:vector-weight="vmStrategyVector = $event"
      @update:text-weights="vmStrategyTextWeights = $event"
      @update:vector-weights="vmStrategyVectorWeights = $event"
      @update:use-rrf="vmStrategyUseRrf = $event"
      @save="handleVmStrategySave"
    />

    <el-empty
      v-if="!hasShots && !parsing"
      description="填写脚本后点击「解析 / 转写」生成分镜列表，或从上方选择已转写任务"
      class="empty-state"
    />

    <audio
      ref="sharedAudioRef"
      class="sr-audio"
      preload="none"
      @timeupdate="onAudioTimeUpdate"
      @ended="onAudioEnded"
      @play="onAudioPlay"
      @pause="onAudioPause"
    />
  </div>
</template>

<style scoped>
.video-match-page.video-analysis-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.control-panel {
  border-radius: 8px;
  border: 1px solid #ebeef5;
  flex-shrink: 0;
}

.header-controls {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
}

.vm-header-unified {
  padding-bottom: 10px;
}

.left-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.vm-context-row {
  align-items: center;
}

.vm-inline-group {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
}

.vm-header-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-width: 100%;
}

.vm-pipeline-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.vm-action-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.vm-compose-inline {
  padding-left: 8px;
  border-left: 1px solid var(--el-border-color-lighter);
}

.vm-parse-block {
  margin-top: 12px;
}

.parse-actions-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.vm-search-error-alert {
  margin-top: 10px;
}

.job-status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.vm-group-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.vm-extra-fields {
  margin-bottom: 4px;
}

.template-gear-btn .el-icon {
  font-size: 20px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0;
  padding-left: 8px;
  border-left: 4px solid #409eff;
}

.workspace-select {
  width: 180px;
}

.history-job-select {
  min-width: 260px;
  max-width: 360px;
}

.strategy-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mix-result-path {
  margin-top: 6px;
}

.mix-result-path .path-text {
  margin: 4px 0;
  word-break: break-all;
  font-size: 12px;
}

.mix-result-path .small {
  font-size: 12px;
}

.inline-btn-wrap {
  display: inline-flex;
}

.mix-compose-actions {
  align-items: center;
  gap: 8px;
}

.mix-srt-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 4px;
}

.mix-srt-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.mix-srt-block {
  margin-top: 8px;
}

.mix-compose-status {
  margin-top: 12px;
  max-width: none;
}

.mix-compose-status-body {
  font-size: 13px;
  line-height: 1.5;
}

.mix-compose-status-body .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}

.mix-compose-status-body .lbl {
  color: #909399;
  margin-right: 6px;
}

.mix-compose-status-body .result-link {
  margin-top: 6px;
}

.mix-compose-status-body .mix-err {
  color: #f56c6c;
  margin-top: 6px;
}

.right-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.job-status-bar .job-ref {
  font-size: 13px;
  color: #606266;
  cursor: default;
  margin-right: 4px;
}

.parse-form {
  margin-top: 0;
  max-width: 960px;
}

.form-row-inline {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px 16px;
}

.vm-frame-constraints-row {
  grid-template-columns: 1fr 1fr;
}

@media (max-width: 900px) {
  .form-row-inline {
    grid-template-columns: 1fr;
  }
}

.parse-alert {
  margin-top: 8px;
}

.results-area {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.empty-state {
  margin-top: 40px;
}

.muted {
  color: #9ca3af;
  font-size: 12px;
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

.match-url-link {
  color: var(--el-color-primary);
  word-break: break-all;
}

.match-url-link:hover {
  text-decoration: underline;
}

.match-topn-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.match-hit-meta {
  margin-top: 2px;
}

.shot-op-cell {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px 6px;
}

.va-jump-icon-btn {
  flex-shrink: 0;
}

.hit-rank-table {
  margin-bottom: 12px;
}

.match-detail-body {
  min-height: 100px;
}

.match-detail-dialog.admin-dialog :deep(.el-dialog__body) {
  max-height: calc(100vh - 132px);
  overflow-y: auto;
  padding-right: 4px;
}

.match-detail-alert {
  margin-top: 12px;
}

.desc-grid {
  margin-bottom: 16px;
  margin-top: 16px;
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

.sr-audio {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.audio-cell {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  min-width: 0;
}

.status-pill {
  border: none;
  flex-shrink: 0;
}

.status-tag-admin.el-tag--info {
  --el-tag-bg-color: #f0f5ff;
  --el-tag-border-color: #adc6ff;
  --el-tag-text-color: #2f54eb;
}

.status-tag-admin.el-tag--warning {
  --el-tag-bg-color: #fffbe6;
  --el-tag-border-color: #ffe58f;
  --el-tag-text-color: #d48806;
}

.audio-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.audio-btn-icon {
  font-size: 18px;
}

.btn-inline-icon {
  margin-right: 4px;
  vertical-align: middle;
}

.icon-pulse {
  animation: audio-pulse 0.9s ease-in-out infinite;
}

@keyframes audio-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.12);
    opacity: 0.85;
  }
}

.wave-block {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  flex-shrink: 0;
}

.wave-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 22px;
  padding: 0 2px;
}

.wave-bar {
  width: 3px;
  min-height: 3px;
  border-radius: 1px;
  background: #e4e7ed;
  transition: background 0.15s ease;
}

.wave-bar--hot {
  background: linear-gradient(180deg, #f89898 0%, #f56c6c 100%);
}

:deep(.video-match-table-row .cell) {
  padding-top: 14px;
  padding-bottom: 14px;
  line-height: 1.55;
}
</style>
