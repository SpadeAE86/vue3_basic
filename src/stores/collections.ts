import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

export interface CollectionItem {
  id: string
  space_id?: string
  item_type: 'media' | 'template' | 'prompt'
  title: string
  cover_url?: string
  data: Record<string, any>
  tags?: string[]
  created_at: string
}

export interface ThemeSpace {
  id: string
  name: string
  category: 'media' | 'template' | 'prompt'
  description?: string
  space_tags?: string[]
  created_at: string
}

export const useCollectionsStore = defineStore('collections', () => {
  const items = ref<CollectionItem[]>([])
  const themeSpaces = ref<ThemeSpace[]>([])
  const loading = ref(false)
  const taggingTasks = ref<Record<string, { status: string; error?: string }>>({})
  const draggedItemIds = ref<string[]>([])
  const showUnclassifiedOnly = ref(false)

  // 加载所有收藏记录
  async function loadCollections() {
    try {
      const resp = await fetch('/api/collections')
      const res = await resp.json()
      if (res.success) {
        items.value = res.items || []
      }
    } catch (e) {
      console.error('加载收藏列表失败:', e)
    }
  }

  // 加载所有主题空间
  async function loadThemeSpaces() {
    try {
      const resp = await fetch('/api/collections/theme-spaces')
      const res = await resp.json()
      if (res.success) {
        themeSpaces.value = res.theme_spaces || []
      }
    } catch (e) {
      console.error('加载主题分类失败:', e)
    }
  }

  // 初始化加载所有数据
  async function init() {
    loading.value = true
    await Promise.all([loadCollections(), loadThemeSpaces()])
    loading.value = false
  }

  // 判断是否收藏
  function isFavorited(itemType: string, uniqueKey: string): boolean {
    if (!uniqueKey) return false
    return items.value.some((item) => {
      if (item.item_type !== itemType) return false
      
      const d = item.data || {}
      if (itemType === 'media') {
        const url = d.url || d.image_url || ''
        return url === uniqueKey
      } else if (itemType === 'template') {
        const text = d.template_text || d.content || ''
        return text === uniqueKey || item.title === uniqueKey
      } else if (itemType === 'prompt') {
        const promptText = d.prompt || ''
        return promptText === uniqueKey
      }
      return false
    })
  }

  // 触发点亮或取消收藏 (Toggle)
  async function toggleFavorite(
    itemType: 'media' | 'template' | 'prompt',
    title: string,
    coverUrl: string | undefined,
    dataPayload: Record<string, any>,
    spaceId?: string
  ) {
    try {
      const resp = await fetch('/api/collections/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: itemType,
          title,
          cover_url: coverUrl,
          data: dataPayload,
          space_id: spaceId
        })
      })
      const res = await resp.json()
      if (res.success) {
        await loadCollections()
        if (res.favorited) {
          if (itemType === 'prompt' || itemType === 'template') {
            ElMessage.success('收藏成功')
          } else {
            ElMessage.success(`"${title}" 已收藏`)
          }
        } else {
          ElMessage.info(`已取消收藏 "${title}"`)
        }
        return res.favorited as boolean
      } else {
        ElMessage.error(res.message || '操作失败')
      }
    } catch (e) {
      console.error('收藏切换操作失败:', e)
      ElMessage.error('网络或服务器异常，操作失败')
    }
    return false
  }

  // 创建主题分类空间
  async function createThemeSpace(
    name: string,
    category: 'media' | 'template' | 'prompt',
    description?: string,
    spaceTags?: string[]
  ) {
    try {
      const resp = await fetch('/api/collections/theme-spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category,
          description,
          space_tags: spaceTags || []
        })
      })
      const res = await resp.json()
      if (res.success) {
        await loadThemeSpaces()
        ElMessage.success(`主题空间 "${name}" 创建成功`)
        return true
      }
    } catch (e) {
      console.error('创建主题空间失败:', e)
      ElMessage.error('创建主题空间失败')
    }
    return false
  }

  // 删除主题分类空间
  async function deleteThemeSpace(spaceId: string) {
    try {
      const resp = await fetch(`/api/collections/theme-spaces/${encodeURIComponent(spaceId)}`, {
        method: 'DELETE'
      })
      const res = await resp.json()
      if (res.success) {
        await init()
        ElMessage.success('已删除主题空间，其下收藏项已释放')
        return true
      }
    } catch (e) {
      console.error('删除主题空间失败:', e)
      ElMessage.error('删除主题空间失败')
    }
    return false
  }

  // 移入/移出主题空间
  async function moveToSpace(itemId: string, spaceId: string | null) {
    try {
      const resp = await fetch(`/api/collections/${encodeURIComponent(itemId)}/space`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ space_id: spaceId })
      })
      const res = await resp.json()
      if (res.success) {
        await loadCollections()
        ElMessage.success(spaceId ? '成功分类归属' : '已移出该空间')
        return true
      }
    } catch (e) {
      console.error('操作归属关系失败:', e)
      ElMessage.error('分类操作失败')
    }
    return false
  }

  // 更新主题分类空间
  async function updateThemeSpace(
    spaceId: string,
    name: string,
    description?: string,
    spaceTags?: string[]
  ) {
    try {
      const resp = await fetch(`/api/collections/theme-spaces/${encodeURIComponent(spaceId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, space_tags: spaceTags || [] })
      })
      const res = await resp.json()
      if (res.success) {
        await loadThemeSpaces()
        ElMessage.success(`主题空间已更新为 "${name}"`)
        return true
      }
    } catch (e) {
      console.error('更新主题空间失败:', e)
      ElMessage.error('更新主题空间失败')
    }
    return false
  }

  // 批量移入/移出主题空间
  async function batchMoveToSpace(itemIds: string[], spaceId: string | null) {
    try {
      const resp = await fetch('/api/collections/batch/space', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: itemIds, space_id: spaceId })
      })
      const res = await resp.json()
      if (res.success) {
        await loadCollections()
        return true
      }
    } catch (e) {
      console.error('批量操作分类失败:', e)
      ElMessage.error('批量分类归类失败')
    }
    return false
  }

  // 更新自定义标签
  async function updateItemTags(itemId: string, tags: string[]) {
    try {
      const resp = await fetch(`/api/collections/${encodeURIComponent(itemId)}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags })
      })
      const res = await resp.json()
      if (res.success) {
        await loadCollections()
        return true
      }
    } catch (e) {
      console.error('更新标签失败:', e)
      ElMessage.error('标签更新失败')
    }
    return false
  }

  async function checkAutoTagStatus(itemId: string) {
    try {
      const resp = await fetch(`/api/collections/${encodeURIComponent(itemId)}/auto-tag/status`)
      const res = await resp.json()
      if (res.success) {
        taggingTasks.value[itemId] = { status: res.status, error: res.error }
        if (res.status === 'SUCCESS') {
          await loadCollections()
        }
        return res.status
      }
    } catch (e) {
      console.error('获取打标状态失败:', e)
    }
    return 'FAILED'
  }

  function pollTask(itemId: string) {
    const interval = setInterval(async () => {
      const status = await checkAutoTagStatus(itemId)
      if (status === 'SUCCESS' || status === 'FAILED' || status === 'IDLE') {
        clearInterval(interval)
      }
    }, 1500)
  }

  // 智能自动打标 (异步后台任务模式)
  async function autoTagItem(itemId: string) {
    try {
      taggingTasks.value[itemId] = { status: 'PENDING' }
      const resp = await fetch(`/api/collections/${encodeURIComponent(itemId)}/auto-tag`, {
        method: 'POST'
      })
      const res = await resp.json()
      if (res.success) {
        pollTask(itemId)
        return true
      } else {
        taggingTasks.value[itemId] = { status: 'FAILED', error: res.detail || '启动打标失败' }
        ElMessage.error(res.detail || '启动打标失败')
      }
    } catch (e) {
      console.error('自动打标失败:', e)
      taggingTasks.value[itemId] = { status: 'FAILED', error: '自动打标请求失败' }
      ElMessage.error('自动打标请求失败')
    }
    return false
  }

  return {
    items,
    themeSpaces,
    loading,
    taggingTasks,
    draggedItemIds,
    showUnclassifiedOnly,
    init,
    loadCollections,
    loadThemeSpaces,
    isFavorited,
    toggleFavorite,
    createThemeSpace,
    updateThemeSpace,
    deleteThemeSpace,
    moveToSpace,
    batchMoveToSpace,
    updateItemTags,
    autoTagItem
  }
})
