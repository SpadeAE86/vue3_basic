import { ref, onUnmounted, type Ref } from 'vue'
import type { GeneratedItem, GenerateMode } from '@/types/generate'
import { ElMessage } from 'element-plus'
import {
  loadHistoryApi,
  saveHistoryApi,
  deleteImageHistoryItemApi,
  getVideoStatusApi,
  generateVideoApi,
  generateImageApi
} from '@/api/generate'

export function useGenerateHistory(currentMode: Ref<GenerateMode>) {
  const generatedImages = ref<GeneratedItem[]>([])
  const generating = ref(false)
  let pollingIntervals: Record<string, number> = {}

  onUnmounted(() => {
    Object.values(pollingIntervals).forEach(clearInterval)
  })

  async function loadHistory() {
    try {
      const data = await loadHistoryApi(currentMode.value)
      if (data.success && data.history) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        generatedImages.value = data.history.map((item: any) => ({
          ...item,
          loading: item.status === 'running' || item.status === 'pending',
          error: item.error || null
        }))
        
        generatedImages.value.forEach(item => {
          if (item.loading && item.taskId) {
            startPolling(item.id, item.taskId)
          }
        })
      }
    } catch (e) {
      console.error('Failed to load history', e)
    }
  }

  async function saveHistory() {
    try {
      const historyToSave = generatedImages.value
        .map(img => ({
          id: img.id,
          prompt: img.prompt,
          model: img.model,
          size: img.size,
          resolution: img.resolution,
          ratio: img.ratio,
          duration: img.duration,
          url: img.url || undefined,
          time: img.time,
          type: img.type,
          referenceMedia: img.referenceMedia,
          error: img.error || undefined,
          taskId: img.taskId,
          status: img.loading ? 'running' : (img.error ? 'failed' : 'success')
        }))
      
      const response = await saveHistoryApi(currentMode.value, historyToSave)
      if (!response.ok) {
        console.error('Failed to save history: HTTP', response.status)
      }
    } catch (e) {
      console.error('Failed to save history', e)
    }
  }

  async function startPolling(imgId: string, taskId: string) {
    if (pollingIntervals[imgId]) {
      clearInterval(pollingIntervals[imgId])
    }
    
    const startTime = Date.now()
    const MAX_POLLING_TIME = 15 * 60 * 1000
    
    pollingIntervals[imgId] = window.setInterval(async () => {
      try {
        if (Date.now() - startTime > MAX_POLLING_TIME) {
          clearInterval(pollingIntervals[imgId])
          const imgIndex = generatedImages.value.findIndex(img => img.id === imgId)
          if (imgIndex !== -1) {
            generatedImages.value[imgIndex]!.error = '任务超时：生成时间过长'
            generatedImages.value[imgIndex]!.loading = false
            await saveHistory()
          }
          return
        }

        const data = await getVideoStatusApi(taskId)
        
        const imgIndex = generatedImages.value.findIndex(img => img.id === imgId)
        if (imgIndex === -1) {
          clearInterval(pollingIntervals[imgId])
          return
        }
        
        if (data.success && data.data) {
          const status = data.data.status
          if (status === 'succeed' || status === 'succeeded') {
            generatedImages.value[imgIndex]!.url = data.data.video_url
            generatedImages.value[imgIndex]!.loading = false
            clearInterval(pollingIntervals[imgId])
            await saveHistory()
          } else if (status === 'failed') {
            generatedImages.value[imgIndex]!.error = data.data.error || '视频生成失败'
            generatedImages.value[imgIndex]!.loading = false
            clearInterval(pollingIntervals[imgId])
            await saveHistory()
          }
        } else {
          generatedImages.value[imgIndex]!.error = data.error || '查询状态失败'
          generatedImages.value[imgIndex]!.loading = false
          clearInterval(pollingIntervals[imgId])
          await saveHistory()
        }
      } catch (e) {
        console.error('Polling error:', e)
      }
    }, 10000)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function generateImages(form: any, computedSize: string) {
    if (!form.prompt.trim()) return

    generating.value = true
    
    // 仅用于本次请求内在列表中定位行；持久化 id 必须与接口返回的 history_id 一致
    const pendingRowKey = crypto.randomUUID()
    const isI2I = form.referenceMedia.length > 0
    const now = new Date()
    const timeStr = `${now.getMonth() + 1}-${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    
    const isVideo = currentMode.value === 'video'
    
    const newItem: GeneratedItem = {
      id: pendingRowKey,
      model: isVideo ? form.videoModel : form.imageModel,
      url: null,
      loading: true,
      error: null,
      prompt: form.prompt,
      size: isVideo ? undefined : computedSize,
      resolution: isVideo ? form.videoResolution : undefined,
      ratio: form.ratio,
      duration: isVideo ? form.videoDuration : undefined,
      time: timeStr,
      type: isVideo ? (isI2I ? 'i2v' : 't2v') : (isI2I ? 'i2i' : 't2i'),
       
      referenceMedia: isI2I ? [...form.referenceMedia] : undefined
    }
    
    generatedImages.value.unshift(newItem)

    try {
      if (isVideo) {
        const data = await generateVideoApi({
          prompt: form.prompt,
          model: form.videoModel,
          resolution: form.videoResolution,
          ratio: form.ratio,
          duration: form.videoDuration,
          generate_audio: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          reference_image_list: form.referenceMedia.filter((m: any) => m.type === 'image').map((m: any) => m.url),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          reference_video_list: form.referenceMedia.filter((m: any) => m.type === 'video').map((m: any) => m.url),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          reference_audio_list: form.referenceMedia.filter((m: any) => m.type === 'audio').map((m: any) => m.url)
        })
        
        const imgIndex = generatedImages.value.findIndex(img => img.id === pendingRowKey)
        if (imgIndex === -1) return
        
        if (data.success && data.task_id) {
          generatedImages.value[imgIndex]!.taskId = data.task_id
          await saveHistory()
          startPolling(pendingRowKey, data.task_id)
        } else {
          generatedImages.value[imgIndex]!.error = data.error || '任务提交失败'
          generatedImages.value[imgIndex]!.loading = false
          await saveHistory()
        }
      } else {
        const data = await generateImageApi({
          prompt: form.prompt,
          size: computedSize,
          model: form.imageModel,
          ratio: form.ratio,
          resolution: form.sizeLevel,
          type: isI2I ? 'i2i' : 't2i',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          reference_image_list: form.referenceMedia.filter((m: any) => m.type === 'image').map((m: any) => m.url).length > 0 
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? form.referenceMedia.filter((m: any) => m.type === 'image').map((m: any) => m.url) 
            : undefined
        })

        const imgIndex = generatedImages.value.findIndex(img => img.id === pendingRowKey)
        if (imgIndex === -1) return

        if (typeof data.history_id === 'string' && data.history_id.length > 0) {
          generatedImages.value[imgIndex]!.id = data.history_id
        }
        
        if (data.success) {
          generatedImages.value[imgIndex]!.url = data.image_url
        } else {
          generatedImages.value[imgIndex]!.error = data.error || '生成失败'
        }
        generatedImages.value[imgIndex]!.loading = false
        await saveHistory()
      }
    } catch (e: unknown) {
      const err = e as Error
      const msg =
        err?.name === 'AbortError'
          ? '请求超时：生成较慢，请稍后重试'
          : (err?.message || '网络错误')
          
      const imgIndex = generatedImages.value.findIndex(img => img.id === pendingRowKey)
      if (imgIndex !== -1) {
        generatedImages.value[imgIndex]!.error = msg
        generatedImages.value[imgIndex]!.loading = false
        await saveHistory()
      }
    } finally {
      generating.value = false
    }
  }

  async function clearAll() {
    generatedImages.value = []
    await saveHistory()
  }

  async function deleteImage(id: string) {
    try {
      if (currentMode.value === 'image') {
        const resp = await deleteImageHistoryItemApi(id)
        if (!resp.ok) {
          const err = await resp.json().catch(() => null)
          const d = err?.detail
          let msg = '删除失败'
          if (typeof d === 'string') msg = d
          else if (Array.isArray(d))
            msg = d.map((x: { msg?: string }) => x.msg).filter(Boolean).join('; ') || msg
          else msg = `HTTP ${resp.status}`
          ElMessage.error(msg)
          return
        }
      }
      generatedImages.value = generatedImages.value.filter(img => img.id !== id)
      if (currentMode.value === 'video') {
        await saveHistory()
      }
    } catch (e) {
      console.error('deleteImage failed', e)
      ElMessage.error('删除失败')
    }
  }

  function clearPolling() {
    Object.values(pollingIntervals).forEach(clearInterval)
    pollingIntervals = {}
  }

  return {
    generatedImages,
    generating,
    loadHistory,
    saveHistory,
    generateImages,
    clearAll,
    deleteImage,
    clearPolling
  }
}
