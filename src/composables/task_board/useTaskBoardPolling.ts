import { watch, onUnmounted, ref, type Ref } from 'vue'

export function useTaskBoardPolling({
  boardSection,
  imageRows,
  videoRows,
  videoGenRows,
  materialMatchRows,
  vmJobRows,
  loadImage,
  loadVideo,
  loadVideoGen,
  loadMaterialMatches,
  loadVmJobs,
  rowStatusNorm
}: {
  boardSection: Ref<string>
  imageRows: Ref<Record<string, unknown>[]>
  videoRows: Ref<Record<string, unknown>[]>
  videoGenRows: Ref<Record<string, unknown>[]>
  materialMatchRows: Ref<Record<string, unknown>[]>
  vmJobRows: Ref<Record<string, unknown>[]>
  loadImage: (bg: boolean, ids?: string[]) => Promise<void>
  loadVideo: (bg: boolean, ids?: string[]) => Promise<void>
  loadVideoGen: (bg: boolean, ids?: string[]) => Promise<void>
  loadMaterialMatches: (bg: boolean, ids?: string[]) => Promise<void>
  loadVmJobs: (bg: boolean, ids?: string[]) => Promise<void>
  rowStatusNorm: (row: Record<string, unknown>, sec: import('@/views/task_board/taskBoardTypes').BoardSection) => string
}) {
  const durationTick = ref(0)
  let durationLiveTimer: ReturnType<typeof setInterval> | null = null
  let boardHistoryPollTimer: ReturnType<typeof setInterval> | null = null

  function syncRunningDurationTimer() {
    const need =
      (boardSection.value === 'image' && imageRows.value.some((r) => rowStatusNorm(r, 'image') === 'running')) ||
      (boardSection.value === 'video' && videoRows.value.some((r) => rowStatusNorm(r, 'video') === 'running')) ||
      (boardSection.value === 'video_gen' && videoGenRows.value.some((r) => rowStatusNorm(r, 'video_gen') === 'running')) ||
      (boardSection.value === 'video_match_search' && materialMatchRows.value.some((r) => rowStatusNorm(r, 'video_match_search') === 'running')) ||
      (boardSection.value === 'video_match_transcribe' && vmJobRows.value.some((r) => rowStatusNorm(r, 'video_match_transcribe') === 'running'))

    if (need && !durationLiveTimer) {
      durationLiveTimer = setInterval(() => {
        durationTick.value++
      }, 1000)
    } else if (!need && durationLiveTimer) {
      clearInterval(durationLiveTimer)
      durationLiveTimer = null
    }
  }

  function syncBoardHistoryPoll() {
    const section = boardSection.value
    const needPoll =
      (section === 'image' && imageRows.value.some((r) => rowStatusNorm(r, 'image') === 'running')) ||
      (section === 'video' && videoRows.value.some((r) => rowStatusNorm(r, 'video') === 'running')) ||
      (section === 'video_gen' && videoGenRows.value.some((r) => rowStatusNorm(r, 'video_gen') === 'running')) ||
      (section === 'video_match_search' && materialMatchRows.value.some((r) => rowStatusNorm(r, 'video_match_search') === 'running')) ||
      (section === 'video_match_transcribe' && vmJobRows.value.some((r) => rowStatusNorm(r, 'video_match_transcribe') === 'running'))

    if (needPoll && !boardHistoryPollTimer) {
      let isPolling = false
      const tick = async () => {
        if (isPolling) return
        isPolling = true
        const s = boardSection.value
        try {
          if (s === 'image') {
            const running = imageRows.value.filter((r) => rowStatusNorm(r, 'image') === 'running')
            if (running.length) await loadImage(true, running.map(r => String(r.id || r.taskId)))
          } else if (s === 'video') {
            const running = videoRows.value.filter((r) => rowStatusNorm(r, 'video') === 'running')
            if (running.length) await loadVideo(true, running.map(r => String(r.id || r.taskId)))
          } else if (s === 'video_gen') {
            const running = videoGenRows.value.filter((r) => rowStatusNorm(r, 'video_gen') === 'running')
            if (running.length) await loadVideoGen(true, running.map(r => String(r.id || r.taskId)))
          } else if (s === 'video_match_search') {
            const running = materialMatchRows.value.filter((r) => rowStatusNorm(r, 'video_match_search') === 'running')
            if (running.length) await loadMaterialMatches(true, running.map(r => String(r.id || r.taskId)))
          } else if (s === 'video_match_transcribe') {
            const running = vmJobRows.value.filter((r) => rowStatusNorm(r, 'video_match_transcribe') === 'running')
            if (running.length) await loadVmJobs(true, running.map(r => String(r.id || r.taskId)))
          }
        } catch {
          /* ignore */
        } finally {
          isPolling = false
        }
      }
      void tick()
      boardHistoryPollTimer = setInterval(tick, 3000)
    } else if (!needPoll && boardHistoryPollTimer) {
      clearInterval(boardHistoryPollTimer)
      boardHistoryPollTimer = null
    }
  }

  watch([boardSection, imageRows, videoRows, videoGenRows, vmJobRows, materialMatchRows], () => {
    syncRunningDurationTimer()
    syncBoardHistoryPoll()
  }, { deep: true })

  onUnmounted(() => {
    if (durationLiveTimer) clearInterval(durationLiveTimer)
    if (boardHistoryPollTimer) clearInterval(boardHistoryPollTimer)
  })

  return { durationTick }
}

