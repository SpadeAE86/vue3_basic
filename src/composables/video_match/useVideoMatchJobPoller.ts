import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { createVideoMatchJobApi, getVideoMatchJobApi, getVideoMatchShotDetailApi, listVideoMatchJobsApi, rematchVideoMatchShotApi, searchVideoMatchJobApi, extractTagsVideoMatchJobApi, synthesizeShotAudioApi, type VideoMatchJobResponse, type VideoMatchJobSummary, type VideoMatchShotDto } from '@/api/video_match'
import { getVideoAnalysisWorkspacesApi } from '@/api/video_analysis'
import type { WorkspaceOption } from '@/types/videoAnalysis'
import { tagsJsonToSearchTokens, DEFAULT_TOKEN_JOIN_AND_FIELDS } from '@/utils/matchTagsFromSegment'
import { stashVideoAnalysisPrefillFromMatch } from '@/utils/videoAnalysisSessionCache'
import { VIDEO_FRAME_SIZE_OPTIONS, VIDEO_FRAME_ORIENTATION_OPTIONS, videoFrameSizeOptionsForOrientation, normalizeZhijiCarSelectValue } from '@/constants/zhijiCarModels'
import { shotStatusLabel, shotSearchStatusNorm, shotStatusTagType, shotTop1VideoUrl, top1UrlDisplay, shotMatchFailedVm, canJumpVideoAnalysisFromVmShot, shotRankedVideoUrls } from '@/utils/videoMatchHelpers'

export function useVideoMatchJobPoller(form: import('vue').Ref<any>, workspaceOptions: import('vue').Ref<WorkspaceOption[]>, selectedStrategy: import('vue').Ref<string>, router: import('vue-router').Router, strategies: import('vue').Ref<any[]>, tokenJoinAndFields: import('vue').Ref<string[]>) {
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
const extractStatus = ref<string | null>(null)
const extractError = ref<string | null>(null)
const enableRoadRunFallback = ref(false)
/** 与任务看板一致：跳转视频分析时带入工作区与策略权重 */
const matchJobWorkspace = ref('v1')
const jobStrategySnapshot = ref<Record<string, unknown> | null>(null)


const historyJobs = ref<VideoMatchJobSummary[]>([])
const historyJobId = ref<string | null>(null)


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
  const andFields = [...tokenJoinAndFields.value]
  const tokens = tagsJsonToSearchTokens((row.tags_json ?? {}) as Record<string, unknown>, andFields)
  if (row.segment_text?.trim()) {
    tokens.unshift({ id: Date.now().toString(), text: row.segment_text.trim(), join: 'OR', type: 'keyword' })
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
    enableRoadRunFallback: enableRoadRunFallback.value,
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

function shortJobIdForDisplay(id: string | number) {
  const t = String(id || '').trim()
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
      historyJobs.value = res.jobs.map((j: any) => ({ ...j, id: String(j.id) }))
      
      // Restore the selected job from sessionStorage if it exists in the fetched list
      try {
        const lastJobId = sessionStorage.getItem('videoMatch:lastJobId:v1')
        if (lastJobId && historyJobs.value.some((j: VideoMatchJobSummary) => String(j.id) === lastJobId)) {
          historyJobId.value = lastJobId
          void onHistoryJobChange(lastJobId)
        }
      } catch { /* ignore */ }
    }
  } catch {
    historyJobs.value = []
  }
}

function historyJobLabel(j: VideoMatchJobSummary) {
  const sn = `#${j.id} `
  const t = (j.title || j.topic || '未命名').trim()
  const ts = j.created_at ? j.created_at.replace('T', ' ').slice(0, 19) : ''
  const ws = (j.workspace ?? '').trim()
  const wsTag = ws ? `[${ws}] ` : ''
  return ts ? `${sn}${wsTag}${ts} · ${t}` : `${sn}${wsTag}${t}`
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
    extractStatus.value = res.extract_status ?? null
    extractError.value = res.extract_error ?? null
    syncMatchJobContext(res)
    form.value.script = scriptClean
    if (res.job_id) try { sessionStorage.setItem('videoMatch:lastJobId:v1', res.job_id) } catch { /* ignore */ }
    ElMessage.success(res.mock ? '转写完成（服务端返回 mock）' : '转写完成')

    // Automatically generate audio after parsing
    if (shots.value && shots.value.length > 0) {
      ElMessage.info('正在自动生成分镜音频...')
      const audioPromises = shots.value.map(async (shot) => {
        if (shot.id != null && !(shot.obs_audio_url || '').trim()) {
          try {
            const audioRes = await synthesizeShotAudioApi(currentJobId.value!, shot.id)
            if (audioRes.success && audioRes.shot) {
              Object.assign(shot, audioRes.shot)
            }
          } catch (e) {
            console.error('Shot audio generation failed:', e)
          }
        }
      })
      await Promise.all(audioPromises)
    }

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

const isExtracting = ref(false)
const onExtract = async () => {
  if (!currentJobId.value) return
  isExtracting.value = true
  try {
    const res = await extractTagsVideoMatchJobApi(currentJobId.value)
    if (res.success) {
      ElMessage.success('已触发一键抽取标签，后台处理中')
      // 自动轮询直到所有分镜 extract_status 不再是 running/extracting
      const jid = currentJobId.value
      const poll = setInterval(async () => {
        try {
          const snap = await getVideoMatchJobApi(jid)
          if (snap.success && snap.shots) {
            shots.value = snap.shots
            extractStatus.value = snap.extract_status ?? null
            extractError.value = snap.extract_error ?? null
            const allDone = snap.shots.every((s: any) => {
              const x = (s.extract_status || '').toLowerCase()
              return x === 'done' || x === 'failed' || x === '' || x === 'pending' || !x
            })
            // 只要没有 running/extracting 就停止轮询
            const anyRunning = snap.shots.some((s: any) => {
              const x = (s.extract_status || '').toLowerCase()
              return x === 'running' || x === 'extracting'
            })
            if (!anyRunning) {
              clearInterval(poll)
              isExtracting.value = false
            }
          }
        } catch { /* polling best-effort */ }
      }, 1500)
      // 最长轮询 2 分钟
      setTimeout(() => { clearInterval(poll); isExtracting.value = false }, 120_000)
    } else {
      ElMessage.error(res.error || '抽取标签触发失败')
      isExtracting.value = false
    }
  } catch (e: any) {
    ElMessage.error(e.message || '抽取标签请求出错')
    isExtracting.value = false
  }
}

/** 一键全流程：解析 → 抽取标签 → 匹配 */
const isFullPipeline = ref(false)
const onFullPipeline = async () => {
  if (isFullPipeline.value) return
  const scriptClean = (typeof form.value.script === 'string' ? form.value.script : '').trim()
  if (!scriptClean) {
    ElMessage.warning('口播脚本不能为空')
    return
  }
  if (!selectedStrategy.value.trim()) {
    ElMessage.warning('请先选择搜索策略')
    return
  }
  isFullPipeline.value = true
  try {
    // Step 1: 解析/转写
    ElMessage.info('全流程 1/4：解析转写中...')
    await onParse()
    if (!currentJobId.value || parseStatus.value !== 'done') {
      ElMessage.error('解析失败，全流程中止')
      return
    }
    // Step 2: 生成朗读 (Auto-generate Audio)
    ElMessage.info('全流程 2/4：生成音频中...')
    if (shots.value && shots.value.length > 0) {
      const audioPromises = shots.value.map(async (shot) => {
        if (shot.id != null && !(shot.obs_audio_url || '').trim()) {
          try {
            const res = await synthesizeShotAudioApi(currentJobId.value!, shot.id)
            if (res.success && res.shot) {
              Object.assign(shot, res.shot)
            }
          } catch (e) {
            console.error('Shot audio generation failed:', e)
          }
        }
      })
      await Promise.all(audioPromises)
    }
    // Step 3: 抽取标签
    ElMessage.info('全流程 3/4：抽取标签中...')
    await onExtract()
    // Step 3: 匹配
    ElMessage.info('全流程 4/4：视频匹配中...')
    await onMatch()
    ElMessage.success('全流程完成！')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '全流程中断')
  } finally {
    isFullPipeline.value = false
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
      enable_road_run_fallback: enableRoadRunFallback.value,
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
    extractStatus.value = res.extract_status ?? null
    extractError.value = res.extract_error ?? null
    syncMatchJobContext(res)
  }
}

  return { parsing, matching, composing, currentJobId, shots, parseStatus, parseError, searchTotalMs, jobSearchStatus, jobSearchError, extractStatus, extractError, matchJobWorkspace, jobStrategySnapshot, historyJobs, historyJobId, matchDetailVisible, matchDetailLoading, matchDetailPayload, matchDetailRow, matchDetailLocalOnly, matchDetailHitRows, shotTranscribeVisible, shotTranscribeRow, vmShotRematchingId, hasShots, canMatch, canMixCompose, mixComposeDisabledHint, formatMatchDetailJson, normalizeMatchHitRows, syncMatchJobContext, openShotTranscribe, rematchVmShot, goVideoAnalysisFromVmShot, openMatchDetail, normalizeVideoMatchScriptInbound, applyVideoMatchJobInputsToForm, shortJobIdForDisplay, pipelineStatusZh, loadHistoryJobs, historyJobLabel, onHistoryJobChange, fetchWorkspaces, onParse, onMatch, refreshJob, onExtract, isExtracting, isFullPipeline, onFullPipeline, enableRoadRunFallback }
}
