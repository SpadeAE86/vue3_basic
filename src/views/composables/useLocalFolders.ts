import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

export interface LocalFolder {
  name: string
  basePath: string
  currentPath: string
}

export function useLocalFolders() {
  const localFolders = ref<LocalFolder[]>([])
  const activeFolderIndex = ref<number | null>(null)
  const localFolderContents = ref<{ folders: any[]; files: any[] }>({ folders: [], files: [] })
  const localFolderLoading = ref(false)

  const activeFolderCurrentPath = computed(() => {
    if (activeFolderIndex.value === null) return null
    return localFolders.value[activeFolderIndex.value]?.currentPath || null
  })

  // Load imported folders cache
  onMounted(() => {
    const saved = localStorage.getItem('diy_local_folders')
    if (saved) {
      try {
        localFolders.value = JSON.parse(saved)
      } catch (err) {
        console.error('Failed to parse diy_local_folders:', err)
      }
    }
  })

  // Cache changes
  watch(localFolders, (newVal) => {
    localStorage.setItem('diy_local_folders', JSON.stringify(newVal))
  }, { deep: true })

  async function loadLocalFolder(options?: { silent?: boolean }) {
    if (activeFolderIndex.value === null) return
    const folder = localFolders.value[activeFolderIndex.value]
    if (!folder) return
    
    if (!window.api || !window.api.invoke) {
      ElMessage.warning('本地文件夹读取仅在桌面客户端（Electron）中可用。')
      return
    }

    if (!options?.silent) {
      localFolderLoading.value = true
    }
    try {
      const res = await window.api.invoke('localFolder:read', folder.currentPath)
      if (res) {
        localFolderContents.value = res
      }
    } catch (err) {
      console.error('Read local folder failed:', err)
      ElMessage.error('读取文件夹失败')
    } finally {
      if (!options?.silent) {
        localFolderLoading.value = false
      }
    }
  }

  // Reload folder contents when index or path changes
  watch([activeFolderIndex, activeFolderCurrentPath], () => {
    if (activeFolderIndex.value !== null) {
      loadLocalFolder()
    } else {
      localFolderContents.value = { folders: [], files: [] }
    }
  })

  function removeLocalFolder(index: number) {
    localFolders.value.splice(index, 1)
    if (activeFolderIndex.value === index) {
      activeFolderIndex.value = null
    } else if (activeFolderIndex.value !== null && activeFolderIndex.value > index) {
      activeFolderIndex.value -= 1
    }
  }

  const breadcrumbParts = computed(() => {
    if (activeFolderIndex.value === null) return []
    const folder = localFolders.value[activeFolderIndex.value]
    if (!folder) return []

    const base = folder.basePath
    const curr = folder.currentPath
    
    const parts: Array<{ name: string; path: string }> = []
    
    // Normalize path separators
    const normBase = base.replace(/\\/g, '/')
    const normCurr = curr.replace(/\\/g, '/')
    
    parts.push({ name: folder.name, path: base })
    
    if (normCurr.startsWith(normBase) && normCurr !== normBase) {
      const relative = normCurr.slice(normBase.length).replace(/^\//, '')
      const subdirs = relative.split('/')
      let accumulated = normBase
      for (const sub of subdirs) {
        accumulated += '/' + sub
        parts.push({ name: sub, path: accumulated })
      }
    }
    return parts
  })

  function navigateBreadcrumb(idx: number) {
    if (activeFolderIndex.value === null) return
    const parts = breadcrumbParts.value
    const target = parts[idx]
    if (target) {
      localFolders.value[activeFolderIndex.value].currentPath = target.path
    }
  }

  function enterSubfolder(path: string) {
    if (activeFolderIndex.value === null) return
    localFolders.value[activeFolderIndex.value].currentPath = path
  }

  return {
    localFolders,
    activeFolderIndex,
    localFolderContents,
    localFolderLoading,
    loadLocalFolder,
    removeLocalFolder,
    breadcrumbParts,
    navigateBreadcrumb,
    enterSubfolder
  }
}
