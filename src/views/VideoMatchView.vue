<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { Headset, Microphone, VideoPlay, RefreshRight } from '@element-plus/icons-vue'
import {
  createVideoMatchJobApi,
  getVideoMatchJobApi,
  getVideoMatchShotDetailApi,
  getMixComposeApi,
  listVideoMatchJobsApi,
  searchVideoMatchJobApi,
  startMixComposeApi,
  synthesizeShotAudioApi,
  type VideoMatchJobSummary,
  type VideoMatchShotDto,
} from '@/api/video_match'
import {
  getVideoAnalysisWorkspacesApi,
  getSearchStrategiesApi,
  deleteSearchStrategyApi,
  type SearchStrategy,
} from '@/api/video_analysis'
import type { WorkspaceOption } from '@/types/videoAnalysis'
import { mockVideoMatchJobResponse } from '@/fixtures/mockVideoMatchShots'
import SearchStrategySelect from '@/components/video_analysis/SearchStrategySelect.vue'
import TokenChipsReadonly from '@/components/video_match/TokenChipsReadonly.vue'
import { tagsJsonToSearchTokens } from '@/utils/matchTagsFromSegment'

const defaultClientMock =
  import.meta.env.VITE_VIDEO_MATCH_MOCK === '1' ||
  import.meta.env.VITE_VIDEO_MATCH_MOCK === 'true'

const form = ref({
  script: '',
  topic: '',
  title: '',
  car_model: '',
  workspace: 'v1',
})

const workspaceOptions = ref<WorkspaceOption[]>([
  { key: 'v1', label: '经典分析 v1', description: '', is_default: true },
])

const clientMock = ref(defaultClientMock)
const serverMock = ref(false)
const parsing = ref(false)
const matching = ref(false)
const composing = ref(false)
/** 与后端 ``mix_compose.mock`` 一致：true 只写占位 output_url，不调真实混剪（通常很快结束） */
const mixComposeUseMock = ref(true)
const mixRunUsedMock = ref(false)
const currentJobId = ref<string | null>(null)
const shots = ref<VideoMatchShotDto[]>([])
const parseStatus = ref<string | null>(null)
const parseError = ref<string | null>(null)
const searchTotalMs = ref<number | null>(null)
const jobSearchStatus = ref<string | null>(null)
const jobSearchError = ref<string | null>(null)

/** 口播预览：共享一个 audio 元素，按行切换 src */
const sharedAudioRef = ref<HTMLAudioElement | null>(null)
const playingRowKey = ref<string | null>(null)
const isAudioPlaying = ref(false)
const audioProgressPct = ref(0)
const synthBusyByShotId = reactive<Record<number, boolean>>({})

let composePollTimer: ReturnType<typeof setInterval> | null = null

const lastMixCompose = ref<{
  compose_id: string
  biz_id: string | number
  status: string
  result_obs_url?: string | null
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
  if (clientMock.value) {
    ElMessage.info('请关闭「前端 Mock」后生成朗读')
    return
  }
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

/** 分镜详情：HTTP trace（任务看板同款）+ 标签只读 */
const matchDetailVisible = ref(false)
const matchDetailLoading = ref(false)
const matchDetailPayload = ref<Record<string, unknown> | null>(null)
const matchDetailRow = ref<VideoMatchShotDto | null>(null)
const matchDetailLocalOnly = ref(false)

const matchDetailTokens = computed(() =>
  tagsJsonToSearchTokens((matchDetailRow.value?.tags_json ?? {}) as Record<string, unknown>),
)

function formatMatchDetailJson(v: unknown) {
  try {
    return JSON.stringify(v ?? null, null, 2)
  } catch {
    return String(v)
  }
}

async function openMatchDetail(row: VideoMatchShotDto) {
  matchDetailRow.value = row
  matchDetailVisible.value = true
  matchDetailPayload.value = null
  matchDetailLocalOnly.value = false

  if (row.id == null || clientMock.value || !currentJobId.value) {
    matchDetailLocalOnly.value = true
    matchDetailPayload.value = {}
    return
  }

  matchDetailLoading.value = true
  try {
    const res = await getVideoMatchShotDetailApi(currentJobId.value, row.id)
    if (res.success && res.detail) {
      matchDetailPayload.value = res.detail
    } else {
      matchDetailPayload.value = { error: res.error || '加载失败' }
    }
  } catch (e) {
    matchDetailPayload.value = { error: e instanceof Error ? e.message : '请求异常' }
  } finally {
    matchDetailLoading.value = false
  }
}

const hasShots = computed(() => shots.value.length > 0)
const canMatch = computed(
  () =>
    hasShots.value &&
    !!currentJobId.value &&
    !clientMock.value &&
    parseStatus.value === 'done' &&
    !!selectedStrategy.value.trim(),
)

const canMixCompose = computed(() => {
  if (!currentJobId.value || clientMock.value) return false
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
  if (clientMock.value) return '请关闭「前端 Mock」后再试'
  if (!currentJobId.value) return '请先创建或载入任务'
  if (parseStatus.value !== 'done') return '请先完成口播解析'
  if (!shots.value.length) return '暂无分镜'
  if ((jobSearchStatus.value || '').toLowerCase() !== 'done') return '请先点击「匹配」并完成素材检索'
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
  if (s === 'done') return 'success'
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
  if (st === 'running') return '进行中'
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

async function loadHistoryJobs() {
  if (clientMock.value) return
  try {
    const res = await listVideoMatchJobsApi({
      parse_status: 'done',
      workspace: form.value.workspace.trim() || undefined,
      limit: 50,
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
  return ts ? `${ts} · ${t} · ${tail}` : `${t} · ${tail}`
}

async function onHistoryJobChange(id: string | null | undefined) {
  const sid = id == null ? '' : String(id)
  if (!sid || clientMock.value) return
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

function cloneMock() {
  return structuredClone(mockVideoMatchJobResponse) as typeof mockVideoMatchJobResponse
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function onParse() {
  if (!form.value.script.trim()) {
    ElMessage.warning('口播脚本不能为空')
    return
  }

  parsing.value = true
  parseError.value = null
  searchTotalMs.value = null
  jobSearchStatus.value = null
  jobSearchError.value = null
  try {
    if (clientMock.value) {
      await delay(450)
      const m = cloneMock()
      currentJobId.value = m.job_id ?? null
      shots.value = m.shots ?? []
      parseStatus.value = m.parse_status ?? 'done'
      jobSearchStatus.value = m.search_status ?? 'pending'
      ElMessage.success('前端 Mock：已填充分镜列表')
      return
    }

    const res = await createVideoMatchJobApi({
      script: form.value.script.trim(),
      topic: form.value.topic.trim() || undefined,
      title: form.value.title.trim() || undefined,
      car_model: form.value.car_model.trim() || undefined,
      workspace: form.value.workspace.trim() || 'v1',
      mock: serverMock.value,
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
    const tip = res.mock ? '后端 Mock：解析完成' : '转写完成'
    ElMessage.success(tip)
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
    if (clientMock.value) {
      await delay(600)
      const topHits = [
        { _id: 'mock_h_1', _score: 1.2, history_id: 'x', video_path: 'https://mock.obs/example1.mp4' },
        { _id: 'mock_h_2', _score: 1.0, history_id: 'y', video_path: 'https://mock.obs/example2.mp4' },
      ]
      let acc = 0
      shots.value = shots.value.map((row, i) => {
        const ms = 80 + i * 12
        acc += ms
        return {
          ...row,
          match_top_hits_json: topHits,
          match_elapsed_ms: ms,
          top1_obs_url: topHits[0]!.video_path ?? null,
          top5_video_urls: topHits.map((h) => h.video_path).filter(Boolean) as string[],
          match_hit_count: topHits.length,
          search_status: 'done',
        }
      })
      searchTotalMs.value = Math.round(acc)
      jobSearchStatus.value = 'done'
      ElMessage.success('前端 Mock：匹配完成')
      return
    }

    const jid = currentJobId.value!
    pollTimer = setInterval(async () => {
      try {
        const snap = await getVideoMatchJobApi(jid)
        if (snap.success && snap.shots?.length) {
          shots.value = snap.shots
          if (snap.search_status) jobSearchStatus.value = snap.search_status
          if (snap.search_total_ms != null) searchTotalMs.value = snap.search_total_ms
          const allDone = snap.shots.every((s) => (s.search_status || '') === 'done')
          if (allDone && pollTimer != null) {
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
      ElMessage.error(jobSearchError.value)
      return
    }

    shots.value = res.shots ?? shots.value
    searchTotalMs.value = res.search_total_ms ?? null
    jobSearchStatus.value = res.search_status ?? 'done'
    jobSearchError.value = res.search_error ?? null
    ElMessage.success(
      `匹配完成${res.search_total_ms != null ? `，总耗时 ${Number(res.search_total_ms).toFixed(0)} ms` : ''}`,
    )
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
  mixRunUsedMock.value = mixComposeUseMock.value
  lastMixCompose.value = null
  try {
    const start = await startMixComposeApi(currentJobId.value, {
      mock: mixComposeUseMock.value,
    })
    if (!start.compose_id || !start.biz_id) {
      ElMessage.error(start.detail || '启动混剪失败')
      composing.value = false
      return
    }
    lastMixCompose.value = {
      compose_id: start.compose_id,
      biz_id: start.biz_id,
      status: start.status || 'pending',
      result_obs_url: null,
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
          result_obs_url: st.result_obs_url ?? null,
          error_message: st.error_message ?? null,
        }
        if (st.status === 'done') {
          clearComposePoll()
          composing.value = false
          if (mixRunUsedMock.value) {
            ElMessage.success('已完成（Mock：仅写入占位 output_url；关闭「混剪 Mock」可走真实混剪）')
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
  if (!currentJobId.value || clientMock.value) return
  const res = await getVideoMatchJobApi(currentJobId.value)
  if (res.success && res.shots) {
    shots.value = res.shots
    parseStatus.value = res.parse_status ?? null
    parseError.value = res.parse_error ?? null
    jobSearchStatus.value = res.search_status ?? null
    searchTotalMs.value = res.search_total_ms ?? null
    jobSearchError.value = res.search_error ?? null
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

function onStrategyCreate() {
  ElMessage.info('请前往「视频分析」页使用「搜索策略」新建并保存，再回到此处刷新列表')
}

watch(
  () => form.value.workspace,
  () => {
    void loadHistoryJobs()
  },
)

function rowClassName() {
  return 'video-match-table-row'
}

onMounted(async () => {
  await fetchWorkspaces()
  await loadStrategies()
  await loadHistoryJobs()
})

onUnmounted(() => {
  clearComposePoll()
  sharedAudioRef.value?.pause()
})
</script>

<template>
  <div class="video-match-page video-analysis-container">
    <el-card class="control-panel" shadow="never" :body-style="{ padding: '12px 20px' }">
      <div class="header-controls">
        <div class="left-controls">
          <h3 class="section-title">视频匹配</h3>
          <el-select
            v-model="historyJobId"
            filterable
            clearable
            placeholder="载入已转写任务"
            class="history-job-select"
            size="small"
            :disabled="clientMock"
            @change="onHistoryJobChange"
          >
            <el-option
              v-for="j in historyJobs"
              :key="j.id"
              :label="historyJobLabel(j)"
              :value="j.id"
            />
          </el-select>
          <el-select v-model="form.workspace" size="small" class="workspace-select" title="Workspace">
            <el-option
              v-for="ws in workspaceOptions"
              :key="ws.key"
              :label="ws.label"
              :value="ws.key"
            />
          </el-select>
          <div class="strategy-row">
            <SearchStrategySelect
              v-model="selectedStrategy"
              :strategies="strategies"
              placeholder="选择搜索策略"
              @refresh="loadStrategies"
              @delete="onStrategyDelete"
              @create="onStrategyCreate"
            />
            <el-tooltip
              content="开启=仅占位 output_url、不调混剪服务；关闭=发起真实混剪 HTTP（需配置 mix_compose.api_base 等）"
              placement="top"
            >
              <span class="inline-btn-wrap mix-mock-switch">
                <el-switch v-model="mixComposeUseMock" size="small" active-text="混剪 Mock" />
              </span>
            </el-tooltip>
            <el-tooltip
              :disabled="canMixCompose"
              placement="top"
              :content="mixComposeDisabledHint || '提交混剪（后台转码 + 拼轨 + 下发）'"
            >
              <span class="inline-btn-wrap">
                <el-button
                  type="primary"
                  plain
                  :disabled="!canMixCompose || composing"
                  :loading="composing"
                  @click="onMixCompose"
                >
                  混剪合成
                </el-button>
              </span>
            </el-tooltip>
            <el-button
              type="success"
              :disabled="!canMatch || matching"
              :loading="matching"
              @click="onMatch"
            >
              匹配
            </el-button>
          </div>
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
              <div v-if="lastMixCompose.error_message" class="mix-err">{{ lastMixCompose.error_message }}</div>
            </div>
          </el-alert>
          <div class="mock-controls">
            <el-switch v-model="clientMock" active-text="前端 Mock" />
            <el-switch
              v-model="serverMock"
              :disabled="clientMock"
              active-text="后端 Mock"
            />
          </div>
        </div>
        <div class="right-controls">
          <el-tooltip
            v-if="currentJobId"
            placement="bottom"
            :content="'任务 ID（video_match_job 主键，用于持久化与刷新）：' + currentJobId"
          >
            <el-tag type="info" size="small" effect="plain" class="job-id-tag">{{ currentJobId }}</el-tag>
          </el-tooltip>
          <el-tag v-if="parseStatus" size="small" type="success" effect="plain">{{ parseStatus }}</el-tag>
          <el-tag v-if="jobSearchStatus" size="small" type="warning" effect="plain">{{ jobSearchStatus }}</el-tag>
          <el-button v-if="currentJobId && !clientMock" size="small" @click="refreshJob">刷新</el-button>
        </div>
      </div>

      <el-form class="parse-form" label-width="72px" @submit.prevent="onParse">
        <el-form-item label="口播脚本" required>
          <el-input
            v-model="form.script"
            type="textarea"
            :rows="4"
            placeholder="例如：智己LS6，城市道路，展示一键泊车功能..."
          />
        </el-form-item>
        <div class="form-row-inline">
          <el-form-item label="主题">
            <el-input v-model="form.topic" placeholder="选填" />
          </el-form-item>
          <el-form-item label="标题">
            <el-input v-model="form.title" placeholder="选填" />
          </el-form-item>
          <el-form-item label="车型">
            <el-input v-model="form.car_model" placeholder="选填" />
          </el-form-item>
        </div>
        <el-form-item>
          <el-button type="primary" :loading="parsing" @click="onParse">
            {{ parsing ? '转写中...' : '解析 / 转写' }}
          </el-button>
        </el-form-item>
      </el-form>

      <el-alert v-if="parseError" type="error" :closable="false" show-icon class="parse-alert">
        {{ parseError }}
      </el-alert>
      <el-alert v-if="jobSearchError" type="warning" :closable="false" show-icon class="parse-alert">
        {{ jobSearchError }}
      </el-alert>
      <div v-if="searchTotalMs != null" class="timing-bar">
        最近一次匹配总耗时：<strong>{{ searchTotalMs.toFixed(0) }}</strong>
        ms；「本镜 ms」为该分镜整条检索链路耗时（OpenSearch、补时长、mget、解析视频 URL 等，含并发排队）。首条分镜常更慢，多半是冷启动（如云上首次建 search pipeline、连接预热）。
      </div>
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
        <el-table-column min-width="200" show-overflow-tooltip>
          <template #header>
            <span>口播文案</span>
          </template>
          <template #default="{ row }">
            <div class="shot-text-cell">
              <el-tag
                :type="shotStatusTagType(shotSearchStatusNorm(row))"
                effect="light"
                size="small"
                class="status-pill status-tag-admin"
              >
                {{ shotStatusLabel(shotSearchStatusNorm(row)) }}
              </el-tag>
              <span class="shot-text" :title="row.segment_text">{{ row.segment_text }}</span>
            </div>
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
                  :disabled="clientMock || row.id == null"
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
        <el-table-column label="匹配结果" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tooltip
              v-if="row.match_top_hits_json?.length"
              :content="
                '命中数 ' +
                (row.match_hit_count ?? row.match_top_hits_json.length) +
                '，展示 URL 为首个可解析地址（非严格等于 _score 第一）' +
                (row.top1_obs_url ? ' · 首条：' + row.top1_obs_url : '') +
                (row.top5_video_urls?.length
                  ? ' · 去重 Top：' + row.top5_video_urls.slice(0, 5).join(' · ')
                  : '')
              "
            >
              <span class="result-url">{{ row.top1_obs_url || '—' }}</span>
            </el-tooltip>
            <span v-else class="muted">{{ row.top1_obs_url || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openMatchDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="matchDetailVisible"
      title="分镜详情（结构化标签 + 匹配 HTTP）"
      width="920px"
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
          title="当前为本地 / Mock 或未落库分镜：仅展示标签。解析落库并执行「素材匹配」后，可查看 OpenSearch 请求与响应摘要。"
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
          <pre class="code-block">{{ formatMatchDetailJson(matchDetailPayload.requestBody) }}</pre>

          <div class="field-label">Response Headers</div>
          <pre class="code-block muted">{{ formatMatchDetailJson(matchDetailPayload.responseHeaders) }}</pre>

          <div class="field-label">Response Body</div>
          <pre class="code-block">{{ formatMatchDetailJson(matchDetailPayload.responseBody) }}</pre>

          <p v-if="matchDetailPayload.note" class="hint">{{ matchDetailPayload.note }}</p>
        </template>
      </div>
    </el-dialog>

    <el-empty
      v-if="!hasShots && !parsing"
      description="填写脚本后点击「解析 / 转写」生成分镜列表（可开 Mock 验证界面）"
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

.mix-mock-switch {
  margin-right: 4px;
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

.mix-compose-status {
  margin-top: 10px;
  max-width: 760px;
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

.mock-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.right-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.job-id-tag {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.parse-form {
  margin-top: 12px;
  max-width: 960px;
}

.form-row-inline {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px 16px;
}

@media (max-width: 900px) {
  .form-row-inline {
    grid-template-columns: 1fr;
  }
}

.parse-alert {
  margin-top: 8px;
}

.timing-bar {
  margin-top: 10px;
  font-size: 13px;
  color: #606266;
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

.result-url {
  font-size: 12px;
  color: #409eff;
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

.shot-text-cell {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.shot-text {
  flex: 1;
  min-width: 0;
  line-height: 1.5;
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
