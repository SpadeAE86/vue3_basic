import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { GeneratedItem, GenerateMode } from '@/types/generate'
import { generateUUID } from '@/utils/browser'
import {
  loadHistoryApi,
  saveHistoryApi,
  deleteImageHistoryItemApi,
  deleteVideoHistoryItemApi,
  retryVideoHistoryTaskApi,
  getVideoStatusApi,
  getImageStatusApi,
  generateVideoApi,
  generateImageApi,
} from '@/api/generate'
import { retryImageHistoryTask } from '@/api/taskBoard'

/** 任务看板等处重试成功后通知实验室页，使同一 id 的卡片进入转圈 + 轮询（与 DB 异步任务对齐）。 */
export const IMAGEGEN_RETRY_STARTED_EVENT = 'imagegen:retry-started'

/**
 * 生图/视频生成历史与轮询。
 * 未来若视频也改为「任务中心 + DB 状态」，可复用：status→loading、重试接口、以及下面的 CustomEvent 同步模式。
 */
export function useGenerateHistory(currentMode: Ref<GenerateMode>) {
  const generatedImages = ref<GeneratedItem[]>([])
  const generating = ref(false)
  let pollingIntervals: Record<string, number> = {}

  onUnmounted(() => {
    Object.values(pollingIntervals).forEach(clearInterval)
    window.removeEventListener(IMAGEGEN_RETRY_STARTED_EVENT, onImageRetryStartedFromBoard as EventListener)
  })

  /** 任务看板触发重试后，本页若在单体模式下已展示该卡则同步为 loading 并续轮询 */
  function onImageRetryStartedFromBoard(e: Event) {
    if (currentMode.value !== 'image') return
    const id = (e as CustomEvent<{ id: string }>).detail?.id
    if (!id) return
    const idx = generatedImages.value.findIndex((img) => img.id === id || img.taskId === id)
    if (idx === -1) return
    const row = generatedImages.value[idx]!
    if (row.type.includes('v')) return
    row.loading = true
    row.error = null
    row.url = null
    startImagePolling(id)
  }

  onMounted(() => {
    window.addEventListener(IMAGEGEN_RETRY_STARTED_EVENT, onImageRetryStartedFromBoard as EventListener)
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
          if (!item.loading) return
          const pollKey = currentMode.value === 'video' ? item.taskId : (item.taskId || item.id)
          if (!pollKey) return
          if (currentMode.value === 'video') {
            startVideoPolling(item.id, pollKey)
          } else {
            startImagePolling(pollKey)
          }
        })
      }
    } catch (e) {
      console.error('Failed to load history', e)
    }
  }

  async function saveHistory() {
    // 视频模式：历史由后端 DB 管理，不需要前端全量写回
    if (currentMode.value === 'video') return
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

    // 替换插槽与分隔符以发送纯净提示词
    const cleanPrompt = form.prompt
      .replace(/\{([^:]+):\s*([^}]+)\}/g, (_match: any, _key: any, val: string) => val.trim())
      .replace(/--split--/g, '\n')
    
    // 仅用于本次请求内在列表中定位行；持久化 id 必须与接口返回的 history_id 一致
    const pendingRowKey = generateUUID()
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
      prompt: cleanPrompt,
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
          prompt: cleanPrompt,
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
          // 后端返回的 task_id 是我们自己的 UUID legacy_id，前端用它做轮询
          generatedImages.value[imgIndex]!.id = data.task_id
          generatedImages.value[imgIndex]!.taskId = data.task_id
          startVideoPolling(data.task_id, data.task_id)
        } else {
          generatedImages.value[imgIndex]!.error = data.error || '任务提交失败'
          generatedImages.value[imgIndex]!.loading = false
        }
      } else {
        const data = await generateImageApi({
          prompt: cleanPrompt,
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
    const ids = generatedImages.value.map((img) => img.id)
    generatedImages.value = []
    if (currentMode.value === 'image') {
      await Promise.all(ids.map((id) => deleteImageHistoryItemApi(id)))
    } else {
      // 视频：逐条 DB 删除
      await Promise.all(ids.map((id) => deleteVideoHistoryItemApi(id)))
    }
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
      } else {
        // 视频：DB 删除
        const resp = await deleteVideoHistoryItemApi(id)
        if (!resp.ok) {
          ElMessage.error(`删除失败: HTTP ${resp.status}`)
          return
        }
      }
      generatedImages.value = generatedImages.value.filter(img => img.id !== id)
    } catch (e) {
      console.error('deleteImage failed', e)
      ElMessage.error('删除失败')
    }
  }

  function clearPolling() {
    Object.values(pollingIntervals).forEach(clearInterval)
    pollingIntervals = {}
  }

  /** 失败生图：与服务端 POST /image/history/{id}/retry 一致，复用同一行 id */
  async function retryImageTask(rowId: string) {
    if (currentMode.value === 'image') {
      // 图像重试逻辑
      const idx = generatedImages.value.findIndex((img) => img.id === rowId || img.taskId === rowId)
      if (idx === -1) { ElMessage.warning('列表中找不到该任务'); return }
      const row = generatedImages.value[idx]!
      if (row.type.includes('v')) { ElMessage.warning('视频任务请使用任务看板或后续统一入口重试'); return }
      if (row.loading) { ElMessage.warning('任务进行中'); return }
      if (!row.error) { ElMessage.warning('仅失败任务可重试'); return }
      const canonicalId = row.id
      row.loading = true; row.error = null; row.url = null
      try {
        const res = (await retryImageHistoryTask(canonicalId)) as { success?: boolean; error?: string }
        if (!res?.success) { row.loading = false; row.error = typeof res?.error === 'string' ? res.error : '重试失败'; return }
        startImagePolling(canonicalId)
        ElMessage.success('已重新排队生成')
        await saveHistory()
      } catch (e: unknown) {
        row.loading = false
        row.error = (e as Error)?.message || '重试请求失败'
      }
    } else {
      // 视频重试逻辑
      const idx = generatedImages.value.findIndex((img) => img.id === rowId || img.taskId === rowId)
      if (idx === -1) { ElMessage.warning('列表中找不到该任务'); return }
      const row = generatedImages.value[idx]!
      if (row.loading) { ElMessage.warning('任务进行中'); return }
      if (!row.error) { ElMessage.warning('仅失败任务可重试'); return }
      const canonicalId = row.id
      row.loading = true; row.error = null; row.url = null
      try {
        const res = await retryVideoHistoryTaskApi(canonicalId)
        if (!res?.success) { row.loading = false; row.error = typeof res?.error === 'string' ? res.error : '重试失败'; return }
        startVideoPolling(canonicalId, canonicalId)
        ElMessage.success('已重新排队生成')
      } catch (e: unknown) {
        row.loading = false
        row.error = (e as Error)?.message || '重试请求失败'
      }
    }
  }

  return {
    generatedImages,
    generating,
    loadHistory,
    saveHistory,
    generateImages,
    clearAll,
    deleteImage,
    clearPolling,
    retryImageTask,
  }
}
