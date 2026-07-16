import { ref, computed, type Ref } from 'vue'
import { ElMessage, ElLoading } from 'element-plus'
import { useCollectionsStore } from '@/stores/collections'
import { uploadToObs } from '@/utils/obs'

export function useCollectionsImport(
  activeCategory: Ref<'media' | 'template'>,
  activeSubFilter: Ref<'all' | 'inspiration' | 'prompt' | 'beautify'>,
  selectedSpaceId: Ref<string | null>,
  localFolders: Ref<any[]>,
  activeFolderIndex: Ref<number | null>
) {
  const collectionsStore = useCollectionsStore()

  const isImportingMedia = ref(false)
  const fileInputRef = ref<HTMLInputElement | null>(null)
  const isImportDialogVisible = ref(false)
  const importChoiceVisible = ref(false)

  const defaultImportSubtype = computed(() => {
    if (activeSubFilter.value === 'prompt') return 'prompt'
    if (activeSubFilter.value === 'beautify') return 'beautify'
    return 'inspiration'
  })

  function handleImportClick() {
    if (activeCategory.value === 'media') {
      if (window.api && window.api.invoke) {
        importChoiceVisible.value = true
      } else {
        fileInputRef.value?.click()
      }
    } else {
      isImportDialogVisible.value = true
    }
  }

  async function handleDropLocalFiles({ paths, spaceId }: { paths: string[]; spaceId: string | null }) {
    if (!window.api || !window.api.invoke) {
      ElMessage.warning('拖拽导入本地文件仅在桌面客户端（Electron）中可用。')
      return
    }
    if (!paths || paths.length === 0) return
    
    const loadingInstance = ElLoading.service({
      lock: true,
      text: `正在上传并收藏 ${paths.length} 个本地文件...`,
      background: 'rgba(0, 0, 0, 0.7)'
    })
    
    let successCount = 0
    let failCount = 0
    
    for (const localPath of paths) {
      try {
        const bytes = await window.api.invoke('localFile:readBytes', localPath)
        const name = localPath.split(/[\\/]/).pop() || 'file'
        const ext = name.split('.').pop()?.toLowerCase() || ''
        const isVideo = ['mp4', 'webm', 'ogg'].includes(ext)
        const mimeType = isVideo ? `video/${ext}` : `image/${ext}`
        
        const blob = new Blob([bytes], { type: mimeType })
        const file = new File([blob], name, { type: mimeType })
        
        const url = await uploadToObs(file, 'collections_import')
        if (!url) {
          throw new Error('上传后的媒体文件链接为空')
        }
        
        const success = await collectionsStore.toggleFavorite(
          'media',
          name,
          url,
          {
            url: url,
            media_type: isVideo ? 'video' : 'image',
            model: 'by upload',
            prompt: ''
          },
          spaceId || undefined
        )
        
        if (success) {
          successCount++
        } else {
          failCount++
        }
      } catch (err) {
        console.error(`上传本地文件失败: ${localPath}`, err)
        failCount++
      }
    }
    
    loadingInstance.close()
    
    if (successCount > 0) {
      ElMessage.success(`成功上传并收藏 ${successCount} 个文件`)
    }
    if (failCount > 0) {
      ElMessage.error(`${failCount} 个文件上传失败`)
    }
  }

  async function handleImportChoice(choice: 'files' | 'folder') {
    importChoiceVisible.value = false
    if (!window.api || !window.api.invoke) return
    
    try {
      const channel = choice === 'folder' ? 'localImport:selectFolder' : 'localImport:selectFiles'
      const res = await window.api.invoke(channel)
      if (res) {
        if (res.type === 'folder') {
          const { path: dirPath, name } = res
          const exists = localFolders.value.some(f => f.basePath === dirPath)
          if (exists) {
            ElMessage.warning('该文件夹已添加')
            const idx = localFolders.value.findIndex(f => f.basePath === dirPath)
            activeFolderIndex.value = idx
            return
          }
          localFolders.value.push({
            name,
            basePath: dirPath,
            currentPath: dirPath
          })
          activeFolderIndex.value = localFolders.value.length - 1
          ElMessage.success(`成功关联本地文件夹: ${name}`)
        } else if (res.type === 'files') {
          await handleDropLocalFiles({ paths: res.paths, spaceId: selectedSpaceId.value })
        }
      }
    } catch (err) {
      console.error('导入本地文件/文件夹失败:', err)
      ElMessage.error('导入失败')
    }
  }

  async function handleFileSelected(event: Event) {
    const target = event.target as HTMLInputElement
    const files = target.files
    if (!files || files.length === 0) return
    
    const file = files[0]
    if (!file) return
    isImportingMedia.value = true
    
    try {
      const url = await uploadToObs(file, 'collections_import')
      if (!url) {
        throw new Error('上传后的媒体文件链接为空')
      }
      const isVideo = file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mp4') || file.name.toLowerCase().endsWith('.webm')
      const success = await collectionsStore.toggleFavorite(
        'media',
        file.name,
        url,
        {
          url: url,
          media_type: isVideo ? 'video' : 'image',
          model: 'by upload',
          prompt: ''
        },
        selectedSpaceId.value || undefined
      )
      if (success) {
        ElMessage.success('导入文件并收藏成功')
      }
    } catch (err: any) {
      console.error('导入失败:', err)
      ElMessage.error(err.message || '导入文件失败')
    } finally {
      isImportingMedia.value = false
      target.value = ''
    }
  }

  async function handleImportTemplateSaved(name: string, content: string, subtype?: 'inspiration' | 'prompt' | 'beautify') {
    isImportDialogVisible.value = false
    try {
      const success = await collectionsStore.toggleFavorite(
        'template',
        name,
        '',
        {
          prompt: content,
          subtype: subtype || defaultImportSubtype.value
        },
        selectedSpaceId.value || undefined
      )
      if (success) {
        ElMessage.success('导入灵感/模板成功')
      }
    } catch (err: any) {
      console.error('导入模板失败:', err)
      ElMessage.error('导入模板失败')
    }
  }

  return {
    isImportingMedia,
    fileInputRef,
    isImportDialogVisible,
    importChoiceVisible,
    defaultImportSubtype,
    handleImportClick,
    handleImportChoice,
    handleFileSelected,
    handleImportTemplateSaved,
    handleDropLocalFiles
  }
}
