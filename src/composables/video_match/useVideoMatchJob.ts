/**
 * useVideoMatchJob.ts
 * 负责视频匹配页面的任务加载、状态刷新和字段解析逻辑
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listVideoMatchJobsApi as listJobs, getVideoMatchJobApi as getJobPayload } from '@/api/video_match'

export function useVideoMatchJob() {
  const loading = ref(false)
  const isRefreshing = ref(false)
  const historyJobs = ref<any[]>([])
  const selectedHistory = ref<string>('')
  
  const selectedStrategy = ref('all')
  const formPayload = ref<any>({
    topic: '',
    duration: '',
    style: '',
    bgmType: '',
    targetPlatform: 'xiaohongshu',
    tokenString: '',
    voiceProvider: 'edge-tts'
  })
  const searchTokens = ref<any[]>([])
  const matchHitRows = ref<any[]>([])

  const loadHistoryJobs = async () => {
    try {
      loading.value = true
      const res = await listJobs(null, null)
      if (res && res.jobs) {
        historyJobs.value = res.jobs.map((j: any) => ({
          label: `[${(j.job_id || j.id || "").slice(-6)}] ${j.created_at} - ${j.status}`,
          value: j.job_id,
          raw: j
        }))
      }
    } catch (e: any) {
      console.error(e)
      ElMessage.error('加载历史任务失败: ' + String(e))
    } finally {
      loading.value = false
    }
  }

  const refreshHistoryJobs = async () => {
    isRefreshing.value = true
    await loadHistoryJobs()
    isRefreshing.value = false
    ElMessage.success('任务列表已刷新')
  }

  const handleHistoryChange = async (val: string) => {
    if (!val) {
      matchHitRows.value = []
      searchTokens.value = []
      formPayload.value = {
        topic: '',
        duration: '',
        style: '',
        bgmType: '',
        targetPlatform: 'xiaohongshu',
        tokenString: '',
        voiceProvider: 'edge-tts'
      }
      return
    }
    
    loading.value = true
    try {
      const payloadData = await getJobPayload(val)
      if (payloadData && payloadData.payload) {
        const payload = payloadData.payload
        formPayload.value = {
          topic: payload.topic || '',
          duration: payload.duration || '',
          style: payload.style || '',
          bgmType: payload.bgm_type || '',
          targetPlatform: payload.target_platform || 'xiaohongshu',
          tokenString: '',
          voiceProvider: payload.voice_provider || 'edge-tts'
        }
        
        // Parse search tokens
        if (payload.search_tokens && Array.isArray(payload.search_tokens)) {
          searchTokens.value = payload.search_tokens.map((t: any) => ({
            id: String(Date.now() + Math.random()),
            value: t.value || t.content || t,
            category: t.category || 'auto',
            weight: typeof t.weight === 'number' ? t.weight : 1.0,
            original: t
          }))
          formPayload.value.tokenString = searchTokens.value.map(t => t.value).join(' ')
        } else if (payload.generated_script && payload.generated_script.shots) {
          // Fallback parsing from script shots
          const tokens: any[] = []
          payload.generated_script.shots.forEach((shot: any) => {
            if (shot.visual_keywords && Array.isArray(shot.visual_keywords)) {
              shot.visual_keywords.forEach((k: string) => {
                tokens.push({
                  id: String(Date.now() + Math.random()),
                  value: k,
                  category: 'visual',
                  weight: 1.0,
                  original: k
                })
              })
            }
          })
          searchTokens.value = tokens
          formPayload.value.tokenString = tokens.map(t => t.value).join(' ')
        }
        
        ElMessage.success('任务参数和Tokens已加载')
      } else {
        ElMessage.warning('该任务没有Payload记录或已过期')
      }
    } catch (e: any) {
      console.error(e)
      ElMessage.error('获取任务 Payload 失败: ' + String(e))
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    isRefreshing,
    historyJobs,
    selectedHistory,
    selectedStrategy,
    formPayload,
    searchTokens,
    matchHitRows,
    loadHistoryJobs,
    refreshHistoryJobs,
    handleHistoryChange
  }
}
