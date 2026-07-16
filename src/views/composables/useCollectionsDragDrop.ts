import { ref, type Ref } from 'vue'
import { ElMessage, ElLoading } from 'element-plus'
import { useCollectionsStore, type CollectionItem } from '@/stores/collections'

export function useCollectionsDragDrop(
  selectedItemIds: Ref<any[]>,
  activeFolderIndex: Ref<number | null>,
  localFolders: Ref<any[]>,
  activeFolderId: Ref<string | null>,
  localFolderContents: Ref<any>,
  loadLocalFolder: (options?: { silent?: boolean }) => Promise<void>
) {
  const collectionsStore = useCollectionsStore()
  const isDragging = ref(false)

  // Auto scroll variables during drag
  let autoScrollTimer: number | null = null
  let dragSpeed = 0
  let scrollContainer: HTMLElement | null = null

  function setCustomDragImage(event: DragEvent, count: number, itemCoverUrl?: string) {
    if (!event.dataTransfer) return
    
    const container = document.createElement('div')
    container.style.position = 'absolute'
    container.style.top = '-1000px'
    container.style.left = '-1000px'
    container.style.width = '80px'
    container.style.height = '80px'
    container.style.borderRadius = '12px'
    container.style.background = 'rgba(30, 30, 38, 0.65)'
    container.style.backdropFilter = 'blur(8px)'
    container.style.setProperty('-webkit-backdrop-filter', 'blur(8px)')
    container.style.border = '1px solid rgba(255, 255, 255, 0.2)'
    container.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.25)'
    container.style.display = 'flex'
    container.style.alignItems = 'center'
    container.style.justifyContent = 'center'
    container.style.overflow = 'hidden'
    container.style.zIndex = '-9999'

    if (itemCoverUrl) {
      const img = document.createElement('img')
      img.src = itemCoverUrl
      img.style.width = '100%'
      img.style.height = '100%'
      img.style.objectFit = 'contain'
      container.appendChild(img)
    } else {
      const text = document.createElement('span')
      text.innerText = '📁'
      text.style.fontSize = '24px'
      container.appendChild(text)
    }

    const badge = document.createElement('div')
    badge.innerText = String(count)
    badge.style.position = 'absolute'
    badge.style.top = '4px'
    badge.style.right = '4px'
    badge.style.background = '#ff4d4f'
    badge.style.color = '#ffffff'
    badge.style.fontSize = '11px'
    badge.style.fontWeight = 'bold'
    badge.style.minWidth = '18px'
    badge.style.height = '18px'
    badge.style.borderRadius = '9px'
    badge.style.display = 'flex'
    badge.style.alignItems = 'center'
    badge.style.justifyContent = 'center'
    badge.style.padding = '0 4px'
    badge.style.boxSizing = 'border-box'
    badge.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)'
    container.appendChild(badge)

    document.body.appendChild(container)
    event.dataTransfer.setDragImage(container, 40, 40)
    
    // Clean up temporary DOM node
    setTimeout(() => {
      if (container.parentNode) {
        container.parentNode.removeChild(container)
      }
    }, 0)
  }

  function handleDragStart(item: CollectionItem, event: DragEvent) {
    isDragging.value = true
    
    if (!selectedItemIds.value.includes(item.id)) {
      selectedItemIds.value = [item.id]
    }
    collectionsStore.draggedItemIds = selectedItemIds.value
    
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', JSON.stringify(selectedItemIds.value))
      
      const count = selectedItemIds.value.length
      const coverUrl = item.cover_url || item.data?.url || item.data?.image_url
      setCustomDragImage(event, count, coverUrl)
    }
  }

  function handleDragEnd() {
    isDragging.value = false
    stopAutoScroll()
    setTimeout(() => {
      collectionsStore.draggedItemIds = []
    }, 200)
  }

  function handleLocalDragStart({ item, event }: { item: CollectionItem; event: DragEvent }) {
    handleDragStart(item, event)
  }

  function handleLocalDragEnd() {
    handleDragEnd()
  }

  function handleDragOverGlobal(event: DragEvent) {
    if (!isDragging.value) return
    event.preventDefault()
    
    if (!scrollContainer) {
      scrollContainer = document.querySelector('.app-main') || document.querySelector('.el-main') || document.documentElement
    }
    if (!scrollContainer) return

    const rect = scrollContainer.getBoundingClientRect()
    const relativeY = event.clientY - rect.top
    const triggerZone = 80 // pixels from top/bottom
    
    if (relativeY < triggerZone) {
      dragSpeed = -Math.max(2, Math.min(15, (triggerZone - relativeY) / 4))
      startAutoScroll()
    } else if (relativeY > rect.height - triggerZone) {
      const dist = relativeY - (rect.height - triggerZone)
      dragSpeed = Math.max(2, Math.min(15, dist / 4))
      startAutoScroll()
    } else {
      stopAutoScroll()
    }
  }

  function startAutoScroll() {
    if (autoScrollTimer) return
    autoScrollTimer = window.setInterval(() => {
      if (scrollContainer) {
        scrollContainer.scrollTop += dragSpeed
      }
    }, 16)
  }

  function stopAutoScroll() {
    if (autoScrollTimer) {
      clearInterval(autoScrollTimer)
      autoScrollTimer = null
    }
  }

  async function handleLocalDropOnFolder({ destPath }: { destPath: string }) {
    if (!window.api || !window.api.invoke) return
    
    const filesToMove: string[] = []
    const foldersToCopy: string[] = []
    
    if (selectedItemIds.value.length > 0) {
      selectedItemIds.value.forEach(id => {
        const idStr = String(id)
        if (idStr.startsWith('local-file-')) {
          filesToMove.push(idStr.replace('local-file-', ''))
        } else if (idStr.startsWith('local-folder-')) {
          const folderPath = idStr.replace('local-folder-', '')
          if (folderPath !== destPath) {
            foldersToCopy.push(folderPath)
          }
        }
      })
    }
    
    if (filesToMove.length === 0 && foldersToCopy.length === 0) {
      return
    }

    // --- OPTIMISTIC UI UPDATE ---
    const idsToRemove = new Set(selectedItemIds.value)
    if (localFolderContents.value) {
      localFolderContents.value.files = localFolderContents.value.files.filter(
        (file: any) => !idsToRemove.has(file.id)
      )
      localFolderContents.value.folders = localFolderContents.value.folders.filter(
        (folder: any) => !idsToRemove.has(folder.id)
      )
    }
    selectedItemIds.value = []
    
    try {
      // 1. Move files
      if (filesToMove.length > 0) {
        for (const filePath of filesToMove) {
          await window.api.invoke('localFile:move', {
            srcPath: filePath,
            destDir: destPath
          })
        }
      }
      
      // 2. Copy folders contents
      if (foldersToCopy.length > 0) {
        for (const folderPath of foldersToCopy) {
          await window.api.invoke('localFolder:copyContents', {
            srcPath: folderPath,
            destPath: destPath
          })
        }
      }
      
      let msg = ''
      if (filesToMove.length > 0 && foldersToCopy.length > 0) {
        msg = `成功移动 ${filesToMove.length} 个文件，并复制 ${foldersToCopy.length} 个文件夹的内容`
      } else if (filesToMove.length > 0) {
        msg = `成功移动 ${filesToMove.length} 个文件`
      } else {
        msg = `成功复制 ${foldersToCopy.length} 个文件夹的内容`
      }
      ElMessage.success(msg)
      await loadLocalFolder({ silent: true })
    } catch (err) {
      console.error('文件操作失败:', err)
      ElMessage.error('文件操作部分或全部失败')
      await loadLocalFolder({ silent: true })
    }
  }

  async function handleCloudDropOnFolder(destFolderId: string) {
    const itemIdsToMove = [...selectedItemIds.value]
    if (itemIdsToMove.length === 0) {
      ElMessage.warning('没有选中需要移动的卡片项')
      return
    }
    
    try {
      const resp = await fetch('/api/collections/batch/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_ids: itemIdsToMove,
          parent_folder_id: destFolderId
        })
      })
      const res = await resp.json()
      if (res.success) {
        ElMessage.success(`成功移动 ${itemIdsToMove.length} 个卡片项到文件夹`)
        selectedItemIds.value = []
        await collectionsStore.loadCollections()
      } else {
        ElMessage.error(res.message || '移动失败')
      }
    } catch (err) {
      console.error('移动卡片项失败:', err)
      ElMessage.error('移动操作失败')
    }
  }

  return {
    isDragging,
    handleDragStart,
    handleDragEnd,
    handleLocalDragStart,
    handleLocalDragEnd,
    handleDragOverGlobal,
    stopAutoScroll,
    handleLocalDropOnFolder,
    handleCloudDropOnFolder
  }
}
