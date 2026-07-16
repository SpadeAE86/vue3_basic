import { ref, type Ref } from 'vue'
import { ElMessage, ElLoading } from 'element-plus'
import { useCollectionsStore } from '@/stores/collections'

export function useCollectionsClipboard(
  selectedItemIds: Ref<any[]>,
  activeFolderIndex: Ref<number | null>,
  localFolders: Ref<any[]>,
  activeFolderId: Ref<string | null>,
  localFolderContents: Ref<any>,
  loadLocalFolder: (options?: { silent?: boolean }) => Promise<void>
) {
  const cutItemIds = ref<any[]>([])
  const collectionsStore = useCollectionsStore()

  function handleKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, [contenteditable="true"]')) return
    
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === 'x') {
        if (selectedItemIds.value.length > 0) {
          cutItemIds.value = [...selectedItemIds.value]
          ElMessage.info(`已剪切 ${cutItemIds.value.length} 个项目，可在目标文件夹中按 Ctrl + V 粘贴`)
          event.preventDefault()
        }
      } else if (event.key.toLowerCase() === 'v') {
        if (cutItemIds.value.length > 0) {
          void handlePasteItems()
          event.preventDefault()
        }
      }
    }
  }

  async function handlePasteItems() {
    if (cutItemIds.value.length === 0) return
    
    const hasLocal = cutItemIds.value.some(id => String(id).startsWith('local-'))
    const hasCloud = cutItemIds.value.some(id => !String(id).startsWith('local-'))
    
    if (hasLocal) {
      if (activeFolderIndex.value === null) {
        ElMessage.warning('不能在根目录粘贴本地项目')
        return
      }
      const destPath = localFolders.value[activeFolderIndex.value].currentPath
      
      const filesToMove: string[] = []
      const foldersToMove: string[] = []
      
      cutItemIds.value.forEach(id => {
        const idStr = String(id)
        if (idStr.startsWith('local-file-')) {
          filesToMove.push(idStr.replace('local-file-', ''))
        } else if (idStr.startsWith('local-folder-')) {
          foldersToMove.push(idStr.replace('local-folder-', ''))
        }
      })

      // --- OPTIMISTIC UI UPDATE ---
      const idsToRemove = new Set(cutItemIds.value)
      if (localFolderContents.value) {
        localFolderContents.value.files = localFolderContents.value.files.filter(
          (file: any) => !idsToRemove.has(file.id)
        )
        localFolderContents.value.folders = localFolderContents.value.folders.filter(
          (folder: any) => !idsToRemove.has(folder.id)
        )
      }
      const movedCount = filesToMove.length + foldersToMove.length
      cutItemIds.value = []
      selectedItemIds.value = []
      
      try {
        // 1. Move files
        for (const filePath of filesToMove) {
          await window.api.invoke('localFile:move', {
            srcPath: filePath,
            destDir: destPath
          })
        }
        
        // 2. Move folders
        for (const srcPath of foldersToMove) {
          const folderName = srcPath.split(/[\\/]/).pop() || ''
          const separator = srcPath.includes('\\') ? '\\' : '/'
          const targetPath = `${destPath}${separator}${folderName}`
          if (srcPath !== targetPath) {
            await window.api.invoke('localFolder:rename', {
              srcPath,
              destPath: targetPath
            })
          }
        }
        
        ElMessage.success(`成功粘贴 ${movedCount} 个本地项目`)
        await loadLocalFolder({ silent: true })
      } catch (err) {
        console.error(err)
        ElMessage.error('粘贴部分或全部本地项目失败')
        await loadLocalFolder({ silent: true })
      }
    }
    
    if (hasCloud) {
      const destFolderId = activeFolderId.value
      const itemIdsToMove = cutItemIds.value.filter(id => !String(id).startsWith('local-'))
      
      const loadingInstance = ElLoading.service({ text: '正在粘贴云端项目...' })
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
          ElMessage.success(`成功粘贴 ${itemIdsToMove.length} 个云端项目`)
          cutItemIds.value = []
          selectedItemIds.value = []
          await collectionsStore.loadCollections()
        } else {
          ElMessage.error(res.message || '粘贴云端项目失败')
        }
      } catch (err) {
        console.error(err)
        ElMessage.error('粘贴云端项目失败')
      } finally {
        loadingInstance.close()
      }
    }
  }

  return {
    cutItemIds,
    handleKeyDown,
    handlePasteItems
  }
}
