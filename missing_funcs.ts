async function loadImage(silent = false, targetIds?: string[]) {
  if (!silent) loading.value = true
  try {
    const data = await fetchImageHistoryForBoard(targetIds?.length ? { ids: targetIds.join(',') } : undefined)
    if (data?.success && Array.isArray(data.history)) {
      if (targetIds?.length) {
        data.history.forEach((newItem: Record<string, unknown>) => {
          const idx = imageRows.value.findIndex((r) => r.id === newItem.id || r.taskId === newItem.taskId)
          if (idx !== -1) Object.assign(imageRows.value[idx], newItem)
        })
      } else {
        imageRows.value = data.history as Record<string, unknown>[]
      }
    } else if (!targetIds?.length) {
      imageRows.value = []
    }
  } finally {
    if (!silent) loading.value = false
  }
}

async function loadVideo(silent = false, targetIds?: string[]) {
  if (!silent) loading.value = true
  try {
    const params = {
      workspace: workspaceFilter.value || undefined,
      ids: targetIds?.length ? targetIds.join(',') : undefined
    }
    const data = await fetchVideoAnalysisHistoryForBoard(params)
    if (data?.success && Array.isArray(data.history)) {
      if (targetIds?.length) {
        data.history.forEach((newItem: Record<string, unknown>) => {
          const idx = videoRows.value.findIndex((r) => r.id === newItem.id || r.taskId === newItem.taskId)
          if (idx !== -1) Object.assign(videoRows.value[idx], newItem)
        })
      } else {
        videoRows.value = data.history as Record<string, unknown>[]
      }
    } else if (!targetIds?.length) {
      videoRows.value = []
    }
  } finally {
    if (!silent) loading.value = false
  }
}

async function loadMaterialMatches(silent = false, targetIds?: string[]) {
  if (!silent) loading.value = true
  try {
    const ws = workspaceFilter.value.trim() || undefined
    const params: { limit: number; workspace?: string; ids?: string } = { limit: 100, workspace: ws }
    if (targetIds?.length) params.ids = targetIds.join(',')
    const data = await fetchMaterialMatchesForBoard(params)
    if (data?.success && Array.isArray(data.matches)) {
      if (targetIds?.length) {
        data.matches.forEach((newItem: Record<string, unknown>) => {
          const idx = materialMatchRows.value.findIndex((r) => r.id === newItem.id || r.taskId === newItem.taskId)
          if (idx !== -1) Object.assign(materialMatchRows.value[idx], newItem)
        })
      } else {
        materialMatchRows.value = data.matches as Record<string, unknown>[]
      }
    } else if (!targetIds?.length) {
      materialMatchRows.value = []
    }
  } finally {
    if (!silent) loading.value = false
  }
}

async function loadVmJobs(silent = false, targetIds?: string[]) {
  if (!silent) loading.value = true
  try {
    const ws = workspaceFilter.value.trim() || undefined
    const params: { workspace?: string; limit: number; ids?: string } = {
      limit: 100,
      workspace: ws,
    }
    if (targetIds?.length) params.ids = targetIds.join(',')
    const data = await fetchVideoMatchJobsForBoard(params)
    if (data?.success && Array.isArray(data.jobs)) {
      if (targetIds?.length) {
        data.jobs.forEach((newItem: Record<string, unknown>) => {
          const idx = vmJobRows.value.findIndex((r) => r.id === newItem.id || r.taskId === newItem.taskId)
          if (idx !== -1) Object.assign(vmJobRows.value[idx], newItem)
        })
      } else {
        vmJobRows.value = data.jobs as Record<string, unknown>[]
      }
    } else if (!targetIds?.length) {
      vmJobRows.value = []
    }
  } finally {
    if (!silent) loading.value = false
  }
}