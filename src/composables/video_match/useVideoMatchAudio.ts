import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { synthesizeShotAudioApi, type VideoMatchShotDto } from '@/api/video_match'

export function useVideoMatchAudio(currentJobId: import('vue').Ref<string | null>, shots: import('vue').Ref<VideoMatchShotDto[]>) {
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

  return { sharedAudioRef, playingRowKey, isAudioPlaying, audioProgressPct, synthBusyByShotId, rowAudioKey, onAudioTimeUpdate, onAudioPlay, onAudioPause, onAudioEnded, togglePlayObs, rowIsActivelyPlaying, onSynthesizeAudio }
}
