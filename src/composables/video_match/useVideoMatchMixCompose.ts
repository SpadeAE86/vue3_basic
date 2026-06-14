import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { startMixComposeApi, getMixComposeApi, type VideoMatchShotDto } from '@/api/video_match'

export function useVideoMatchMixCompose(
  composing: any,
currentJobId: import('vue').Ref<string | null>, shots: import('vue').Ref<VideoMatchShotDto[]>, canMixCompose: import('vue').Ref<boolean>, mixComposeDisabledHint: import('vue').Ref<string>) {
let composePollTimer: any = null

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

  return { composing, composePollTimer, mixPreferSrt, lastMixCompose, clearComposePoll, isAbsoluteHttpUrl, mixComposeResultHref, copyMixOutputPath, downloadMixSrtFile, onMixCompose }
}
