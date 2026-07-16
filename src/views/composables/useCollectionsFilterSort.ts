import { ref, computed, type Ref } from 'vue'
import { useCollectionsStore, type CollectionItem } from '@/stores/collections'

export function useCollectionsFilterSort(
  activeFolderIndex: Ref<number | null>,
  visibleCloudFilesCount: Ref<number>
) {
  const collectionsStore = useCollectionsStore()

  // 选中的大分类: 'media' | 'template'
  const activeCategory = ref<'media' | 'template'>('media')

  // 模板子分类筛选: 'all' | 'inspiration' | 'prompt' | 'beautify'
  const activeSubFilter = ref<'all' | 'inspiration' | 'prompt' | 'beautify'>('all')

  // 选中的空间ID (null表示全部收藏)
  const selectedSpaceId = ref<string | null>(null)
  const activeFolderId = ref<string | null>(null)

  // 悬浮搜索框拖拽与过滤状态
  const filterMode = ref<'text' | 'tag'>('text')
  const selectedTags = ref<string[]>([])
  const searchQuery = ref('')

  // 响应式瀑布流列数
  const numColumns = ref(4)

  function updateNumColumns() {
    const w = window.innerWidth
    if (w >= 1900) numColumns.value = 6
    else if (w >= 1600) numColumns.value = 5
    else if (w >= 1200) numColumns.value = 4
    else if (w >= 900) numColumns.value = 3
    else numColumns.value = 2
  }

  function getItemSubType(item: CollectionItem): 'inspiration' | 'prompt' | 'beautify' {
    if (item.item_type === 'inspiration') return 'inspiration'
    return item.data?.subtype || 'inspiration'
  }

  function handleSpaceSelect(spaceId: string | null) {
    selectedSpaceId.value = spaceId
    activeFolderIndex.value = null
  }

  // 切换大分类时维持可共享的空间，不可共享时尝试关联同名空间，否则才切回全部收藏
  function handleCategoryChange(category: 'media' | 'template') {
    const oldSpaceId = selectedSpaceId.value
    activeCategory.value = category
    activeSubFilter.value = 'all'
    
    if (category === 'template') {
      activeFolderIndex.value = null
    }
    
    if (oldSpaceId) {
      const space = collectionsStore.themeSpaces.find(s => s.id === oldSpaceId)
      if (space) {
        const isVisible = 
          space.category === 'inspiration' ||
          (category === 'media' && space.category === 'media') ||
          (category === 'template' && (space.category === 'template' || space.category === 'prompt'))
        
        if (!isVisible) {
          // 尝试寻找目标大分类下同名的主题空间进行关联切换
          const sameNameSpace = collectionsStore.themeSpaces.find(s => 
            s.name === space.name &&
            s.id !== space.id &&
            (
              (category === 'media' && s.category === 'media') ||
              (category === 'template' && (s.category === 'template' || s.category === 'prompt'))
            )
          )
          if (sameNameSpace) {
            selectedSpaceId.value = sameNameSpace.id
          } else {
            selectedSpaceId.value = null
          }
        }
      } else {
        selectedSpaceId.value = null
      }
    }
  }

  // 根据当前分类和选中的空间筛选收藏项
  const filteredItems = computed(() => {
    let filtered = collectionsStore.items.filter(item => {
      const itemSpace = item.space_id ? collectionsStore.themeSpaces.find(s => s.id === item.space_id) : null
      const isInsideInspirationSpace = itemSpace?.category === 'inspiration'

      if (activeCategory.value === 'media') {
        if (item.item_type !== 'media' && item.item_type !== 'folder' && !item.cover_url && !isInsideInspirationSpace) return false
      } else {
        if (item.item_type !== 'template' && item.item_type !== 'prompt' && item.item_type !== 'inspiration' && item.item_type !== 'folder') return false
        
        // Secondary sub-type filter
        if (activeSubFilter.value !== 'all') {
          const subtype = getItemSubType(item)
          if (subtype !== activeSubFilter.value) return false
        }
      }
      
      // 如果选中的是全部，支持过滤未分类，并且不显示属于灵感空间的内容
      if (selectedSpaceId.value === null) {
        if (isInsideInspirationSpace) return false
        if (collectionsStore.showUnclassifiedOnly) {
          if (item.space_id) return false
        }
      } else {
        if (item.space_id !== selectedSpaceId.value) return false
      }

      // Virtual folder filtering logic
      const parentFolderId = item.data?.parent_folder_id || null
      if (activeFolderId.value === null) {
        // Root level: show items that are not in a folder, plus all folder items at root
        return parentFolderId === null
      } else {
        // Subfolder level: only show items in active folder
        return parentFolderId === activeFolderId.value
      }
    })

    if (filterMode.value === 'text') {
      // 文本搜索模式：按输入内容实时搜索
      if (searchQuery.value.trim()) {
        const q = searchQuery.value.trim().toLowerCase()
        filtered = filtered.filter(item => {
          const matchesTag = (item.tags || []).some(t => t.toLowerCase().includes(q))
          const matchesTitle = (item.title || '').toLowerCase().includes(q)
          const matchesPrompt = (item.data?.prompt || '').toLowerCase().includes(q)
          return matchesTag || matchesTitle || matchesPrompt
        })
      }
    } else {
      // 标签过滤模式：必须同时包含选中的所有 selectedTags
      if (selectedTags.value.length > 0) {
        filtered = filtered.filter(item => {
          const itemTags = (item.tags || []).map(t => t.toLowerCase())
          return selectedTags.value.every(filterTag => 
            itemTags.includes(filterTag.toLowerCase())
          )
        })
      }
    }

    // Sort cards: 1. Folders, 2. Brainstorm, 3. Step, 4. Graph, 5. Normal prompts/media
    filtered.sort((a, b) => {
      const getTypePriority = (item: CollectionItem) => {
        const isFolder = item.item_type === 'folder'
        if (isFolder) return 0
        
        const isBrainstorm = (item.title && item.title.includes('脑暴')) || (item.data?.chat_session_id && item.item_type !== 'graph' && !item.data?.checklist && !item.data?.accept_status)
        if (isBrainstorm) return 1
        
        const isStep = item.data?.checklist !== undefined || item.data?.accept_status !== undefined
        if (isStep) return 2
        
        const isGraph = item.item_type === 'graph'
        if (isGraph) return 3
        
        return 4
      }
      
      const prioA = getTypePriority(a)
      const prioB = getTypePriority(b)
      if (prioA !== prioB) {
        return prioA - prioB
      }
      
      const timeA = new Date((a as any).updated_at || a.created_at || 0).getTime()
      const timeB = new Date((b as any).updated_at || b.created_at || 0).getTime()
      return timeB - timeA
    })

    return filtered
  })

  const dbFolders = computed(() => {
    return filteredItems.value.filter(item => item.item_type === 'folder')
  })

  const dbFiles = computed(() => {
    return filteredItems.value.filter(item => item.item_type !== 'folder')
  })

  const visibleDbFiles = computed(() => {
    return dbFiles.value.slice(0, visibleCloudFilesCount.value)
  })

  const visibleFilteredItems = computed(() => {
    return [...dbFolders.value, ...visibleDbFiles.value]
  })

  // 按照各列当前估计高度做贪心分发，维持均衡的瀑布流外观
  // 采用纯静态物理尺寸估计，避免动态加载宽高导致 DOM 节点跨列抖动及无限重新挂载/重载
  const dbColumnsData = computed(() => {
    const numCols = numColumns.value
    const cols = Array.from({ length: numCols }, () => [] as any[])
    const colHeights = Array(numCols).fill(0)

    visibleFilteredItems.value.forEach(item => {
      // 找到当前高度最低的列
      let minColIdx = 0
      let minHeight = colHeights[0]
      for (let i = 1; i < numCols; i++) {
        if (colHeights[i] < minHeight) {
          minHeight = colHeights[i]
          minColIdx = i
        }
      }

      // 评估项目渲染高度
      let estimatedHeight = 300 // 默认保底高度
      
      if (item.item_type === 'folder') {
        estimatedHeight = 80
      } else if (item.item_type === 'template' || item.item_type === 'prompt' || item.item_type === 'inspiration') {
        if (item.cover_url) {
          estimatedHeight = 300
        } else {
          estimatedHeight = 150
        }
      } else if (item.item_type === 'media' || item.cover_url) {
        const width = item.data?.width || item.data?.image_width
        const height = item.data?.height || item.data?.image_height
        if (width && height) {
          estimatedHeight = (height / width) * 240 + 60
        } else {
          estimatedHeight = 300 // 默认正方形比例
        }
      }

      cols[minColIdx].push(item)
      colHeights[minColIdx] += estimatedHeight
    })

    return cols
  })

  return {
    activeCategory,
    activeSubFilter,
    selectedSpaceId,
    activeFolderId,
    filterMode,
    selectedTags,
    searchQuery,
    filteredItems,
    getItemSubType,
    handleSpaceSelect,
    handleCategoryChange,

    dbFolders,
    dbFiles,
    visibleFilteredItems,
    numColumns,
    updateNumColumns,
    dbColumnsData
  }
}
