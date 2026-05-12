import { ref, onUnmounted, type Ref } from 'vue'
import type { GeneratedItem, GenerateMode } from '@/types/generate'
import { loadHistoryApi, saveHistoryApi, getVideoStatusApi, getImageStatusApi, generateVideoApi, generateImageApi } from '@/api/generate'

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
            if (currentMode.value === 'video') {
              startVideoPolling(item.id, item.taskId)
            } else {
              startImagePolling(item.taskId)
            }
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

  async function startVideoPolling(localRowId: string, taskId: string) {
    if (pollingIntervals[localRowId]) {
      clearInterval(pollingIntervals[localRowId])
    }
    
    const startTime = Date.now()
    const MAX_POLLING_TIME = 15 * 60 * 1000
    
    pollingIntervals[localRowId] = window.setInterval(async () => {
      try {
        if (Date.now() - startTime > MAX_POLLING_TIME) {
          clearInterval(pollingIntervals[localRowId])
          const imgIndex = generatedImages.value.findIndex(img => img.id === localRowId)
          if (imgIndex !== -1) {
            generatedImages.value[imgIndex]!.error = '任务超时：生成时间过长'
            generatedImages.value[imgIndex]!.loading = false
            await saveHistory()
          }
          return
        }

        const data = await getVideoStatusApi(taskId)
        
        const imgIndex = generatedImages.value.findIndex(img => img.id === localRowId)
        if (imgIndex === -1) {
          clearInterval(pollingIntervals[localRowId])
          return
        }
        
        if (data.success && data.data) {
          const status = data.data.status
          if (status === 'succeed' || status === 'succeeded') {
            generatedImages.value[imgIndex]!.url = data.data.video_url
            generatedImages.value[imgIndex]!.loading = false
            clearInterval(pollingIntervals[localRowId])
            await saveHistory()
          } else if (status === 'failed') {
            generatedImages.value[imgIndex]!.error = data.data.error || '视频生成失败'
            generatedImages.value[imgIndex]!.loading = false
            clearInterval(pollingIntervals[localRowId])
            await saveHistory()
          }
        } else {
          generatedImages.value[imgIndex]!.error = data.error || '查询状态失败'
          generatedImages.value[imgIndex]!.loading = false
          clearInterval(pollingIntervals[localRowId])
          await saveHistory()
        }
      } catch (e) {
        console.error('Polling error:', e)
      }
    }, 10000)
  }

  /** 异步生图：轮询 /image/status/{taskId}，与视频接口路径与响应结构不同 */
  function _findImageIndexByTaskId(taskId: string): number {
    return generatedImages.value.findIndex(
      img => img.taskId === taskId || img.id === taskId,
    )
  }

  async function startImagePolling(taskId: string) {
    const key = `img:${taskId}`
    if (pollingIntervals[key]) {
      clearInterval(pollingIntervals[key])
    }

    const startTime = Date.now()
    const MAX_POLLING_TIME = 15 * 60 * 1000

    const tick = async () => {
      try {
        if (Date.now() - startTime > MAX_POLLING_TIME) {
          clearInterval(pollingIntervals[key])
          const imgIndex = _findImageIndexByTaskId(taskId)
          if (imgIndex !== -1) {
            generatedImages.value[imgIndex]!.error = '任务超时：生成时间过长'
            generatedImages.value[imgIndex]!.loading = false
            await saveHistory()
          }
          return
        }

        const data = await getImageStatusApi(taskId)
        const imgIndex = _findImageIndexByTaskId(taskId)
        if (imgIndex === -1) {
          clearInterval(pollingIntervals[key])
          return
        }

        if (!data.success) {
          generatedImages.value[imgIndex]!.error = (data as { error?: string }).error || '查询状态失败'
          generatedImages.value[imgIndex]!.loading = false
          clearInterval(pollingIntervals[key])
          await saveHistory()
          return
        }

        const st = String((data as { status?: string }).status || '').toLowerCase()
        const url = (data as { url?: string | null }).url

        if (st === 'failed' || st === 'error') {
          generatedImages.value[imgIndex]!.error =
            (data as { error?: string | null }).error || '图片生成失败'
          generatedImages.value[imgIndex]!.loading = false
          clearInterval(pollingIntervals[key])
          await saveHistory()
          return
        }

        if (url) {
          generatedImages.value[imgIndex]!.url = url
          generatedImages.value[imgIndex]!.loading = false
          clearInterval(pollingIntervals[key])
          await saveHistory()
          return
        }

        if (st === 'success' || st === 'succeed' || st === 'succeeded') {
          generatedImages.value[imgIndex]!.loading = false
          clearInterval(pollingIntervals[key])
          await saveHistory()
        }
      } catch (e) {
        console.error('Image polling error:', e)
      }
    }

    pollingIntervals[key] = window.setInterval(tick, 3000)
    void tick()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function generateImages(form: any, computedSize: string) {
    if (!form.prompt.trim()) return

    generating.value = true
    
    const newImageId = Math.random().toString(36).substring(2, 15)
    const isI2I = form.referenceMedia.length > 0
    const now = new Date()
    const timeStr = `${now.getMonth() + 1}-${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    
    const isVideo = currentMode.value === 'video'
    
    const newItem: GeneratedItem = {
      id: newImageId,
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
        
        const imgIndex = generatedImages.value.findIndex(img => img.id === newImageId)
        if (imgIndex === -1) return
        
        if (data.success && data.task_id) {
          generatedImages.value[imgIndex]!.taskId = data.task_id
          await saveHistory()
          startVideoPolling(newImageId, data.task_id)
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          reference_image_list: form.referenceMedia.filter((m: any) => m.type === 'image').map((m: any) => m.url).length > 0 
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? form.referenceMedia.filter((m: any) => m.type === 'image').map((m: any) => m.url) 
            : undefined
        })

        const imgIndex = generatedImages.value.findIndex(img => img.id === newImageId)
        if (imgIndex === -1) return
        
        if (data.success) {
          if (data.task_id) {
            generatedImages.value[imgIndex]!.taskId = data.task_id
            generatedImages.value[imgIndex]!.id = data.task_id
          }
          if (data.image_url) {
            generatedImages.value[imgIndex]!.url = data.image_url
            generatedImages.value[imgIndex]!.loading = false
          } else if (data.task_id) {
            // 异步：仅拿到 task_id，需轮询 /image/status 直至 success + url
            generatedImages.value[imgIndex]!.loading = true
            startImagePolling(data.task_id)
          } else {
            generatedImages.value[imgIndex]!.loading = false
          }
        } else {
          generatedImages.value[imgIndex]!.error = data.error || '生成失败'
          generatedImages.value[imgIndex]!.loading = false
        }
        await saveHistory()
      }
    } catch (e: unknown) {
      const err = e as Error
      const msg =
        err?.name === 'AbortError'
          ? '请求超时：生成较慢，请稍后重试'
          : (err?.message || '网络错误')
          
      const imgIndex = generatedImages.value.findIndex(img => img.id === newImageId)
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
    generatedImages.value = generatedImages.value.filter(img => img.id !== id)
    await saveHistory()
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
