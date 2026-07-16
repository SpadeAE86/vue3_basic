import { ref, computed, type Ref } from 'vue'
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import { useCollectionsStore, type CollectionItem } from '@/stores/collections'

export function useCollectionsContextMenu(
  selectedItemIds: Ref<any[]>,
  activeFolderIndex: Ref<number | null>,
  activeFolderId: Ref<string | null>,
  selectedSpaceId: Ref<string | null>,
  localFolders: Ref<any[]>,
  localFolderContents: Ref<any>,
  loadLocalFolder: (options?: { silent?: boolean }) => Promise<void>,
  handleLocalDropOnFolder: (payload: { destPath: string }) => Promise<void>,
  handleCloudDropOnFolder: (destFolderId: string) => Promise<void>
) {
  const collectionsStore = useCollectionsStore()

  // Context Menu State
  const contextMenuVisible = ref(false)
  const contextMenuX = ref(0)
  const contextMenuY = ref(0)

  // LoRA Tagger Dialog State
  const taggerVisible = ref(false)
  const taggerDirPath = ref<string | null>(null)
  const taggerFolderId = ref<string | null>(null)
  const taggerFolderTitle = ref<string | null>(null)

  function openTagger({ dirPath = null, folderId = null, folderTitle = null }: { dirPath?: string | null; folderId?: string | null; folderTitle?: string | null }) {
    taggerDirPath.value = dirPath
    taggerFolderId.value = folderId
    taggerFolderTitle.value = folderTitle
    taggerVisible.value = true
  }

  function handleContextMenu(event: MouseEvent) {
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, .el-dialog, .el-message-box')) return
    
    contextMenuX.value = event.clientX
    contextMenuY.value = event.clientY
    contextMenuVisible.value = true
  }

  function getFolderName(folderId: string) {
    const folder = collectionsStore.items.find(item => item.id === folderId)
    return folder ? folder.title : '文件夹'
  }

  function getItemSubType(item: CollectionItem): 'inspiration' | 'prompt' | 'beautify' {
    if (item.item_type === 'inspiration') return 'inspiration'
    return item.data?.subtype || 'inspiration'
  }

  const contextMenuOptions = computed(() => {
    const opts = [
      { label: '新建文件夹', action: 'create_folder', icon: 'i-ep-folder-add' }
    ]
    
    // 1. Check if we are inside a folder
    if (activeFolderIndex.value !== null) {
      opts.push({
        label: '一键反推本文件夹 (WD14)',
        action: 'interrogate_current_local',
        icon: 'i-ep-magic-stick'
      })
      opts.push({
        label: '管理本文件夹打标',
        action: 'manage_current_local_tags',
        icon: 'i-ep-price-tag'
      })
    } else if (activeFolderId.value !== null) {
      opts.push({
        label: '一键反推本文件夹 (WD14)',
        action: 'interrogate_current_cloud',
        icon: 'i-ep-magic-stick'
      })
      opts.push({
        label: '管理本文件夹打标',
        action: 'manage_current_cloud_tags',
        icon: 'i-ep-price-tag'
      })
    }
    
    // 2. Check if a folder card is selected
    if (selectedItemIds.value.length === 1) {
      const selId = selectedItemIds.value[0]
      if (String(selId).startsWith('local-folder-')) {
        opts.push({
          label: '一键反推选中文件夹 (WD14)',
          action: 'interrogate_selected_local',
          icon: 'i-ep-magic-stick'
        })
        opts.push({
          label: '管理选中文件夹打标',
          action: 'manage_selected_local_tags',
          icon: 'i-ep-price-tag'
        })
        opts.push({
          label: '复制文件夹',
          action: 'copy_selected_local_folder',
          icon: 'i-ep-document-copy'
        })
        opts.push({
          label: '重命名文件夹',
          action: 'rename_selected_local_folder',
          icon: 'i-ep-edit'
        })
        opts.push({
          label: '删除文件夹',
          action: 'delete_selected_local_folder',
          icon: 'i-ep-delete'
        })
      } else {
        const dbFolder = collectionsStore.items.find(
          item => item.id === selId && item.item_type === 'folder'
        )
        if (dbFolder) {
          opts.push({
            label: '一键反推选中文件夹 (WD14)',
            action: 'interrogate_selected_cloud',
            icon: 'i-ep-magic-stick'
          })
          opts.push({
            label: '管理选中文件夹打标',
            action: 'manage_selected_cloud_tags',
            icon: 'i-ep-price-tag'
          })
        }
      }
    }

    // 3. File operations for local files (Copy/Delete)
    if (selectedItemIds.value.length > 0) {
      const allLocalFiles = selectedItemIds.value.every(id => String(id).startsWith('local-file-'))
      if (allLocalFiles) {
        opts.push({
          label: selectedItemIds.value.length === 1 ? '复制文件' : '复制选中文件',
          action: 'copy_selected_local_files',
          icon: 'i-ep-document-copy'
        })
        opts.push({
          label: selectedItemIds.value.length === 1 ? '删除文件' : '删除选中文件',
          action: 'delete_selected_local_files',
          icon: 'i-ep-delete'
        })
      }
    }
    
    // 4. Move options
    if (selectedItemIds.value.length > 0) {
      if (activeFolderIndex.value !== null) {
        const localFoldersData = localFolderContents.value?.folders || []
        localFoldersData.forEach((folder: any) => {
          if (selectedItemIds.value.length === 1 && selectedItemIds.value[0] === `local-folder-${folder.path}`) {
            return
          }
          opts.push({
            label: `移动至: ${folder.title || folder.name}`,
            action: `move_to_local:${folder.path}`,
            icon: 'i-ep-position'
          })
        })
      } else {
        const dbFolders = collectionsStore.items.filter(
          item => item.item_type === 'folder' && item.space_id === selectedSpaceId.value
        )
        dbFolders.forEach(folder => {
          if (selectedItemIds.value.includes(folder.id)) return
          opts.push({
            label: `移动至: ${folder.title}`,
            action: `move_to_cloud:${folder.id}`,
            icon: 'i-ep-position'
          })
        })
      }
    }
    return opts
  })

  async function handleContextMenuAction(action: string) {
    if (action.startsWith('move_to_local:')) {
      const destPath = action.replace('move_to_local:', '')
      await handleLocalDropOnFolder({ destPath })
    } else if (action.startsWith('move_to_cloud:')) {
      const destFolderId = action.replace('move_to_cloud:', '')
      await handleCloudDropOnFolder(destFolderId)
    } else if (action === 'interrogate_current_local' || action === 'manage_current_local_tags') {
      if (activeFolderIndex.value !== null) {
        openTagger({ dirPath: localFolders.value[activeFolderIndex.value].currentPath })
      }
    } else if (action === 'interrogate_current_cloud' || action === 'manage_current_cloud_tags') {
      if (activeFolderId.value !== null) {
        openTagger({ folderId: activeFolderId.value, folderTitle: getFolderName(activeFolderId.value) })
      }
    } else if (action === 'interrogate_selected_local' || action === 'manage_selected_local_tags') {
      if (selectedItemIds.value.length === 1) {
        const selId = selectedItemIds.value[0]
        const path = String(selId).replace('local-folder-', '')
        openTagger({ dirPath: path })
      }
    } else if (action === 'interrogate_selected_cloud' || action === 'manage_selected_cloud_tags') {
      if (selectedItemIds.value.length === 1) {
        const selId = selectedItemIds.value[0]
        const dbFolder = collectionsStore.items.find(item => item.id === selId)
        if (dbFolder) {
          openTagger({ folderId: selId, folderTitle: dbFolder.title })
        }
      }
    } else if (action === 'copy_selected_local_folder') {
      if (selectedItemIds.value.length === 1 && window.api && window.api.invoke) {
        const srcPath = String(selectedItemIds.value[0]).replace('local-folder-', '')
        try {
          await window.api.invoke('localFolder:copy', { srcPath })
          ElMessage.success('复制文件夹成功')
          selectedItemIds.value = []
          await loadLocalFolder()
        } catch (err) {
          console.error(err)
          ElMessage.error('复制文件夹失败')
        }
      }
    } else if (action === 'delete_selected_local_folder') {
      if (selectedItemIds.value.length === 1 && window.api && window.api.invoke) {
        const path = String(selectedItemIds.value[0]).replace('local-folder-', '')
        try {
          await ElMessageBox.confirm('确定要永久删除此本地文件夹及其所有内容吗？', '删除文件夹警告', {
            confirmButtonText: '确定删除',
            cancelButtonText: '取消',
            type: 'warning'
          })
          await window.api.invoke('localFolder:delete', { dirPath: path })
          ElMessage.success('删除文件夹成功')
          selectedItemIds.value = []
          await loadLocalFolder()
        } catch (err) {
          if (err !== 'cancel') {
            console.error(err)
            ElMessage.error('删除文件夹失败')
          }
        }
      }
    } else if (action === 'rename_selected_local_folder') {
      if (selectedItemIds.value.length === 1 && window.api && window.api.invoke) {
        const srcPath = String(selectedItemIds.value[0]).replace('local-folder-', '')
        const folderName = srcPath.split(/[\\/]/).pop() || ''
        try {
          const { value: newName } = await ElMessageBox.prompt('请输入新的文件夹名称', '重命名文件夹', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            inputValue: folderName,
            inputPattern: /\S+/,
            inputErrorMessage: '文件夹名称不能为空'
          })
          if (!newName || newName === folderName) return
          
          const separator = srcPath.includes('\\') ? '\\' : '/'
          const parentPath = srcPath.substring(0, srcPath.lastIndexOf(separator))
          const destPath = `${parentPath}${separator}${newName.trim()}`
          
          await window.api.invoke('localFolder:rename', { srcPath, destPath })
          ElMessage.success('重命名文件夹成功')
          selectedItemIds.value = []
          await loadLocalFolder()
        } catch (err) {
          if (err !== 'cancel') {
            console.error(err)
            ElMessage.error('重命名文件夹失败')
          }
        }
      }
    } else if (action === 'copy_selected_local_files') {
      if (selectedItemIds.value.length > 0 && window.api && window.api.invoke) {
        const filePaths: string[] = []
        selectedItemIds.value.forEach(id => {
          const idStr = String(id)
          if (idStr.startsWith('local-file-')) {
            filePaths.push(idStr.replace('local-file-', ''))
          }
        })
        if (filePaths.length === 0) return
        
        const loadingInstance = ElLoading.service({ text: '正在复制文件...' })
        try {
           for (const filePath of filePaths) {
             await window.api.invoke('localFile:copy', { srcPath: filePath, destDir: filePath.substring(0, filePath.lastIndexOf(filePath.includes('\\') ? '\\' : '/')) })
           }
           ElMessage.success(`成功复制 ${filePaths.length} 个文件`)
           selectedItemIds.value = []
           await loadLocalFolder()
        } catch (err) {
          console.error(err)
          ElMessage.error('复制文件失败')
        } finally {
          loadingInstance.close()
        }
      }
    } else if (action === 'delete_selected_local_files') {
      if (selectedItemIds.value.length > 0 && window.api && window.api.invoke) {
        const filePaths: string[] = []
        selectedItemIds.value.forEach(id => {
          const idStr = String(id)
          if (idStr.startsWith('local-file-')) {
            filePaths.push(idStr.replace('local-file-', ''))
          }
        })
        if (filePaths.length === 0) return
        
        try {
          await ElMessageBox.confirm(`确定要永久删除选中的 ${filePaths.length} 个媒体文件及其打标文本吗？`, '删除文件确认', {
            confirmButtonText: '确定删除',
            cancelButtonText: '取消',
            type: 'warning'
          })
          
          // --- OPTIMISTIC UI UPDATE ---
          const idsToRemove = new Set(selectedItemIds.value)
          if (localFolderContents.value) {
            localFolderContents.value.files = localFolderContents.value.files.filter(
              (file: any) => !idsToRemove.has(file.id)
            )
          }
          const deletedCount = filePaths.length
          selectedItemIds.value = []
          
          try {
            for (const filePath of filePaths) {
              await window.api.invoke('localFile:delete', { filePath })
            }
            ElMessage.success(`成功删除 ${deletedCount} 个文件`)
            await loadLocalFolder({ silent: true })
          } catch (err) {
            console.error(err)
            ElMessage.error('删除文件失败')
            await loadLocalFolder({ silent: true })
          }
        } catch {}
      }
    } else if (action === 'create_folder') {
      try {
        const { value: folderName } = await ElMessageBox.prompt('请输入文件夹名称', '新建文件夹', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          inputPattern: /\S+/,
          inputErrorMessage: '文件夹名称不能为空'
        })
        
        if (!folderName) return
        
        if (activeFolderIndex.value !== null) {
          const currentLocalFolderPath = localFolders.value[activeFolderIndex.value].currentPath
          if (window.api && window.api.invoke) {
            try {
              await window.api.invoke('localFolder:create', {
                parentPath: currentLocalFolderPath,
                name: folderName
              })
              ElMessage.success(`文件夹 "${folderName}" 创建成功`)
              await loadLocalFolder()
            } catch (err) {
              console.error(err)
              ElMessage.error('创建本地文件夹失败')
            }
          }
        } else {
          try {
            const resp = await fetch('/api/collections/folders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: folderName,
                space_id: selectedSpaceId.value || undefined
              })
            })
            const res = await resp.json()
            if (res.success) {
              ElMessage.success(`文件夹 "${folderName}" 创建成功`)
              await collectionsStore.loadCollections()
            } else {
              ElMessage.error(res.message || '创建文件夹失败')
            }
          } catch (err) {
            console.error(err)
            ElMessage.error('创建文件夹失败')
          }
        }
      } catch {
        // Prompt cancelled
      }
    }
  }

  return {
    contextMenuVisible,
    contextMenuX,
    contextMenuY,
    taggerVisible,
    taggerDirPath,
    taggerFolderId,
    taggerFolderTitle,
    handleContextMenu,
    contextMenuOptions,
    handleContextMenuAction
  }
}
