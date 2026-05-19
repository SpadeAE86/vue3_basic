/**
 * useVideoMatchCompose.ts
 * 负责视频匹配页面的混剪生成与轮询逻辑
 */
import { ref, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { startMixComposeApi as createVideoComposeJob, getMixComposeApi as checkJobStatus } from '@/api/video_match'

export function useVideoMatchCompose(selectedHistory: any, loadHistoryJobs: any) {
  const isComposing = ref(false)
  const composePollInterval = ref<number | null>(null)

  const clearComposePoll = () => {
    if (composePollInterval.value) {
      clearInterval(composePollInterval.value)
      composePollInterval.value = null
    }
  }

  const startComposePoll = (jobId: string) => {
    clearComposePoll()
    composePollInterval.value = window.setInterval(async () => {
      try {
        const res = await checkJobStatus(jobId)
        if (res) {
          // getMixComposeApi returns MixComposeJobDto directly (no .job wrapper)
          const st = res.status
          if (st === 'completed') {
            clearComposePoll()
            isComposing.value = false
            ElMessage.success('混剪任务已完成')
            loadHistoryJobs()
          } else if (st === 'failed' || st === 'error') {
            clearComposePoll()
            isComposing.value = false
            ElMessage.error('混剪任务失败')
          }
        }
      } catch (e) {
        console.error('Polling compose job status error', e)
        clearComposePoll()
        isComposing.value = false
      }
    }, 5000)
  }

  const doVideoCompose = async (formPayload: any, originalTaskPayload: any) => {
    if (!selectedHistory.value) {
      ElMessage.warning('没有可用于混剪的搜索记录ID')
      return
    }
    
    // 从 searchStrategyWeights 中提取所需参数如果需要
    const bgmType = formPayload.bgmType
    const outputFileName = formPayload.outputFileName || 'auto_compose.mp4'

    isComposing.value = true
    try {
      // startMixComposeApi takes (jobId, opts?): compose_id is returned at the top level
      const res = await createVideoComposeJob(selectedHistory.value, {
        prefer_srt: false,
      })
      if (res && res.compose_id) {
        ElMessage.success('已提交混剪任务，正在后台处理')
        startComposePoll(res.compose_id)
      } else {
        isComposing.value = false
        ElMessage.error('提交混剪任务失败: 缺少 compose_id')
      }
    } catch (e: any) {
      isComposing.value = false
      console.error(e)
      ElMessage.error('提交混剪任务异常: ' + (e.message || String(e)))
    }
  }

  onUnmounted(() => {
    clearComposePoll()
  })

  return {
    isComposing,
    doVideoCompose,
    clearComposePoll
  }
}
