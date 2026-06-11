<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useCollectionsStore, type CollectionItem } from '@/stores/collections'
import MediaPreviewDialog from '@/components/image/MediaPreviewDialog.vue'
import SidebarSpaces from '@/components/collections/SidebarSpaces.vue'
import MediaCard from '@/components/collections/MediaCard.vue'
import TemplateCard from '@/components/collections/TemplateCard.vue'

const collectionsStore = useCollectionsStore()

// 选中的大分类: 'media' | 'template'
const activeCategory = ref<'media' | 'template'>('media')

// 选中的空间ID (null 代表 "全部")
const selectedSpaceId = ref<string | null>(null)

// ─── 选中高亮与多选 ───
const selectedItemIds = ref<string[]>([])
const lastSelectedIndex = ref<number | null>(null)

function handleHeaderClick(item: CollectionItem, event: MouseEvent) {
  const visibleItems = filteredItems.value
  const index = visibleItems.findIndex(i => i.id === item.id)
  if (index === -1) return

  if (event.shiftKey && lastSelectedIndex.value !== null) {
    const start = Math.min(lastSelectedIndex.value, index)
    const end = Math.max(lastSelectedIndex.value, index)
    for (let i = start; i <= end; i++) {
      const it = visibleItems[i]
      if (it && !selectedItemIds.value.includes(it.id)) {
        selectedItemIds.value.push(it.id)
      }
    }
  } else {
    const idx = selectedItemIds.value.indexOf(item.id)
    if (idx > -1) {
      selectedItemIds.value.splice(idx, 1)
    } else {
      selectedItemIds.value.push(item.id)
    }
    lastSelectedIndex.value = index
  }
}

watch([activeCategory, selectedSpaceId], () => {
  selectedItemIds.value = []
  lastSelectedIndex.value = null
})

// ─── 拖拽分类状态 ───
const isDragging = ref(false)

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
  
  setTimeout(() => {
    document.body.removeChild(container)
  }, 0)
}

function handleDragStart(item: CollectionItem, event: DragEvent) {
  isDragging.value = true
  if (!selectedItemIds.value.includes(item.id)) {
    selectedItemIds.value = [item.id]
  }
  collectionsStore.draggedItemIds = selectedItemIds.value
  const coverUrl = item.cover_url || item.data.url || item.data.image_url
  setCustomDragImage(event, selectedItemIds.value.length, coverUrl)

  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', JSON.stringify(selectedItemIds.value))
    event.dataTransfer.effectAllowed = 'move'
  }
}

function handleDragEnd() {
  isDragging.value = false
  setTimeout(() => {
    collectionsStore.draggedItemIds = []
  }, 200)
}

function clearSelectionIfBlank(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (
    !target.closest('.result-card') &&
    !target.closest('.spaces-sidebar') &&
    !target.closest('.category-tabs') &&
    !target.closest('.el-dialog') &&
    !target.closest('.el-dropdown') &&
    !target.closest('.el-popper') &&
    !target.closest('.el-overlay') &&
    !target.closest('.el-message') &&
    !target.closest('.el-message-box') &&
    !target.closest('.floating-search-panel')
  ) {
    selectedItemIds.value = []
    lastSelectedIndex.value = null
  }
}

// ─── 悬浮搜索框拖拽与过滤状态 ───
const searchQuery = ref('')
const searchDragPosition = ref({ left: 0, top: 0, dragged: false })
const isDraggingSearch = ref(false)
const searchDragStartPos = { x: 0, y: 0 }
const searchDragStartOffset = { left: 0, top: 0 }

function startDragSearch(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (
    target.tagName === 'INPUT' ||
    target.closest('input') ||
    target.tagName === 'BUTTON' ||
    target.closest('button') ||
    target.classList.contains('el-input__clear') ||
    target.closest('.el-input__clear')
  ) {
    return
  }
  e.preventDefault()
  isDraggingSearch.value = true
  const el = document.querySelector('.floating-search-panel') as HTMLElement
  if (el) {
    const rect = el.getBoundingClientRect()
    searchDragPosition.value.left = rect.left
    searchDragPosition.value.top = rect.top
    searchDragPosition.value.dragged = true

    searchDragStartPos.x = e.clientX
    searchDragStartPos.y = e.clientY
    searchDragStartOffset.left = rect.left
    searchDragStartOffset.top = rect.top

    window.addEventListener('mousemove', onDragSearch)
    window.addEventListener('mouseup', stopDragSearch)
  }
}

function onDragSearch(e: MouseEvent) {
  if (!isDraggingSearch.value) return
  const dx = e.clientX - searchDragStartPos.x
  const dy = e.clientY - searchDragStartPos.y
  searchDragPosition.value.left = searchDragStartOffset.left + dx
  searchDragPosition.value.top = searchDragStartOffset.top + dy
}

function stopDragSearch() {
  isDraggingSearch.value = false
  window.removeEventListener('mousemove', onDragSearch)
  window.removeEventListener('mouseup', stopDragSearch)
}

function startTouchDragSearch(e: TouchEvent) {
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  if (!touch) return
  const target = e.target as HTMLElement
  if (
    target.tagName === 'INPUT' ||
    target.closest('input') ||
    target.tagName === 'BUTTON' ||
    target.closest('button') ||
    target.classList.contains('el-input__clear') ||
    target.closest('.el-input__clear')
  ) {
    return
  }
  isDraggingSearch.value = true
  const el = document.querySelector('.floating-search-panel') as HTMLElement
  if (el) {
    const rect = el.getBoundingClientRect()
    searchDragPosition.value.left = rect.left
    searchDragPosition.value.top = rect.top
    searchDragPosition.value.dragged = true

    searchDragStartPos.x = touch.clientX
    searchDragStartPos.y = touch.clientY
    searchDragStartOffset.left = rect.left
    searchDragStartOffset.top = rect.top

    window.addEventListener('touchmove', onTouchDragSearch, { passive: false })
    window.addEventListener('touchend', stopTouchDragSearch)
  }
}

function onTouchDragSearch(e: TouchEvent) {
  if (!isDraggingSearch.value) return
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  if (!touch) return
  const dx = touch.clientX - searchDragStartPos.x
  const dy = touch.clientY - searchDragStartPos.y
  searchDragPosition.value.left = searchDragStartOffset.left + dx
  searchDragPosition.value.top = searchDragStartOffset.top + dy
}

function stopTouchDragSearch() {
  isDraggingSearch.value = false
  window.removeEventListener('touchmove', onTouchDragSearch)
  window.removeEventListener('touchend', stopTouchDragSearch)
}

const searchBoxStyle = computed(() => {
  if (searchDragPosition.value.dragged) {
    return {
      left: `${searchDragPosition.value.left}px`,
      top: `${searchDragPosition.value.top}px`,
      right: 'auto',
      transform: 'none'
    }
  }
  return {
    top: '120px',
    right: '40px',
    position: 'fixed' as const
  }
})

// ─── 大图/视频 弹窗预览 ───
const previewVisible = ref(false)
const previewUrl = ref('')
const previewMediaType = ref('video')
const previewPrompt = ref('')
const previewTags = ref<string[]>([])
const previewSpaceName = ref('')
const previewItem = ref<CollectionItem | null>(null)

function openPreview(item: CollectionItem) {
  previewItem.value = item
  const url = item.data.url || item.data.image_url || ''
  const isVid = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm')
  previewUrl.value = url
  previewMediaType.value = item.data.media_type || (isVid ? 'video' : 'image')
  previewPrompt.value = item.data.prompt || ''
  previewTags.value = item.tags || []
  previewSpaceName.value = getSpaceName(item.space_id)
  previewVisible.value = true
}

async function handleUpdateTags(tags: string[]) {
  if (!previewItem.value) return
  const success = await collectionsStore.updateItemTags(previewItem.value.id, tags)
  if (success) {
    previewTags.value = tags
    previewItem.value.tags = tags
  }
}

onMounted(() => {
  collectionsStore.init()
  document.addEventListener('click', clearSelectionIfBlank)
})

onUnmounted(() => {
  document.removeEventListener('click', clearSelectionIfBlank)
})

// 根据当前分类和选中的空间筛选收藏项
const filteredItems = computed(() => {
  let filtered = collectionsStore.items.filter(item => {
    if (activeCategory.value === 'media') {
      if (item.item_type !== 'media') return false
    } else {
      if (item.item_type !== 'template' && item.item_type !== 'prompt') return false
    }
    
    // 如果选中的是全部，支持过滤未分类
    if (selectedSpaceId.value === null) {
      if (collectionsStore.showUnclassifiedOnly) {
        return !item.space_id
      }
      return true
    } else {
      return item.space_id === selectedSpaceId.value
    }
  })

  // 按搜索框搜索 tag/title/prompt
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    filtered = filtered.filter(item => {
      const matchesTag = (item.tags || []).some(t => t.toLowerCase().includes(q))
      const matchesTitle = (item.title || '').toLowerCase().includes(q)
      const matchesPrompt = (item.data?.prompt || '').toLowerCase().includes(q)
      return matchesTag || matchesTitle || matchesPrompt
    })
  }

  return filtered
})

// 归属的主题空间名称映射
function getSpaceName(spaceId?: string) {
  if (!spaceId) return ''
  const space = collectionsStore.themeSpaces.find(s => s.id === spaceId)
  return space ? space.name : ''
}

// 切换大分类时重置选中的空间
function handleCategoryChange(category: 'media' | 'template') {
  activeCategory.value = category
  selectedSpaceId.value = null
}
</script>

<template>
  <div class="collections-page">
    <!-- 头部导航 -->
    <header class="collections-header">
      <div class="header-left">
        <h1 class="page-title">✨ 我的灵感收藏空间</h1>
        <p class="page-subtitle">沉淀创意片段，分类规划您的图像、视频与提示词模板空间。</p>
      </div>

      <div class="category-tabs">
        <button 
          class="tab-btn" 
          :class="{ active: activeCategory === 'media' }"
          @click="handleCategoryChange('media')"
        >
          <el-icon><i-ep-picture /></el-icon>
          <span>多媒体画廊</span>
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeCategory === 'template' }"
          @click="handleCategoryChange('template')"
        >
          <el-icon><i-ep-memo /></el-icon>
          <span>提示词模板</span>
        </button>
      </div>
    </header>

    <div class="collections-content">
      <!-- 左边栏：主题空间 -->
      <SidebarSpaces
        v-model:selectedSpaceId="selectedSpaceId"
        :active-category="activeCategory"
        :selected-item-ids="selectedItemIds"
        @clear-selection="selectedItemIds = []; lastSelectedIndex = null;"
      />

      <!-- 主区域：瀑布流与卡片网格 -->
      <main class="main-gallery">
        <!-- 列表状态 -->
        <div v-if="collectionsStore.loading" class="loading-state">
          <el-icon class="is-loading" :size="32"><i-ep-loading /></el-icon>
          <span>加载数据中...</span>
        </div>

        <div v-else-if="filteredItems.length === 0" class="empty-state">
          <el-empty description="当前空间空空如也，快去画布或提示词对比页面点亮星星收藏吧！" />
        </div>

        <div v-else class="gallery-wrapper">
          <!-- 1. 多媒体画廊 (媒体瀑布流) -->
          <div v-if="activeCategory === 'media'" class="masonry-grid">
            <div 
              v-for="item in filteredItems" 
              :key="item.id" 
              class="masonry-item"
              draggable="true"
              @dragstart="handleDragStart(item, $event)"
              @dragend="handleDragEnd"
            >
              <MediaCard
                :item="item"
                :is-selected="selectedItemIds.includes(item.id)"
                @click-header="handleHeaderClick(item, $event)"
                @click-preview="openPreview"
              />
            </div>
          </div>

          <!-- 2. 提示词模板展示 -->
          <div v-else-if="activeCategory === 'template'" class="templates-grid">
            <div 
              v-for="item in filteredItems" 
              :key="item.id" 
              class="template-card-container"
              draggable="true"
              @dragstart="handleDragStart(item, $event)"
              @dragend="handleDragEnd"
            >
              <TemplateCard
                :item="item"
                :is-selected="selectedItemIds.includes(item.id)"
                @click-header="handleHeaderClick(item, $event)"
              />
            </div>
          </div>
        </div>
      </main>
    </div>

    <MediaPreviewDialog
      v-model="previewVisible"
      :url="previewUrl"
      :media-type="previewMediaType"
      :prompt="previewPrompt"
      :tags="previewTags"
      :space-name="previewSpaceName"
      @update-tags="handleUpdateTags"
    />

    <!-- Floating Draggable Search Panel -->
    <div
      class="floating-search-panel"
      :class="{ 'is-dragging': isDraggingSearch }"
      :style="searchBoxStyle"
      @mousedown="startDragSearch"
      @touchstart="startTouchDragSearch"
    >
      <div class="search-panel-header">
        <span class="search-title">🔍 搜索过滤</span>
        <span class="drag-handle-dots">⋮⋮</span>
      </div>
      <div class="search-input-wrapper">
        <el-input
          v-model="searchQuery"
          placeholder="搜索标签、标题或提示词..."
          clearable
          size="small"
        >
          <template #prefix>
            <el-icon><i-ep-search /></el-icon>
          </template>
        </el-input>
      </div>
    </div>
  </div>
</template>

<style scoped>
.collections-page {
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1e293b;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: calc(100vh - 120px);
}

.collections-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 20px;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 6px 0;
}

.page-subtitle {
  font-size: 13px;
  color: #64748b;
  margin: 0;
}

.category-tabs {
  display: flex;
  background-color: #f1f5f9;
  border-radius: 20px;
  padding: 4px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  border-radius: 16px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  background: none;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.tab-btn:hover:not(.active) {
  color: #334155;
  background-color: rgba(255, 255, 255, 0.5);
}

.tab-btn.active {
  background-color: #ffffff;
  color: #6366f1;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1);
}

.collections-content {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 24px;
  align-items: start;
}

/* Main gallery layout */
.main-gallery {
  min-height: 400px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: #64748b;
  font-size: 14px;
  gap: 12px;
}

.gallery-wrapper {
  width: 100%;
}

/* Masonry Grid waterfall flow */
.masonry-grid {
  columns: 4;
  column-gap: 16px;
}

@media (max-width: 1200px) {
  .masonry-grid {
    columns: 3;
  }
}
@media (max-width: 900px) {
  .masonry-grid {
    columns: 2;
  }
}

.masonry-item {
  break-inside: avoid;
  margin-bottom: 16px;
}

/* Template Grid layout */
.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.template-card-container {
  display: flex;
  width: 100%;
}

/* ─── Floating Draggable Search Panel Styles ─── */
.floating-search-panel {
  position: fixed;
  z-index: 1000;
  width: 240px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 16px;
  border: 1px solid rgba(99, 102, 241, 0.15);
  box-shadow: 0 8px 32px rgba(99, 102, 241, 0.1);
  cursor: grab;
  user-select: none;
  transition: border-color 0.3s, box-shadow 0.3s;
  box-sizing: border-box;
}

.floating-search-panel:hover {
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: 0 12px 40px rgba(99, 102, 241, 0.15);
}

.floating-search-panel.is-dragging {
  cursor: grabbing;
  border-color: #6366f1;
  box-shadow: 0 16px 48px rgba(99, 102, 241, 0.25);
  transition: none !important;
}

.search-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  width: 100%;
}

.search-title {
  font-size: 11px;
  font-weight: 600;
  color: #4f46e5;
  letter-spacing: 0.05em;
}

.drag-handle-dots {
  color: #94a3b8;
  font-size: 12px;
  letter-spacing: 1px;
}

.search-input-wrapper {
  width: 100%;
}

.search-input-wrapper :deep(.el-input__wrapper) {
  background-color: rgba(255, 255, 255, 0.6) !important;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.05) !important;
}

.search-input-wrapper :deep(.el-input__wrapper.is-focus) {
  border-color: #6366f1 !important;
  box-shadow: 0 0 0 1px #6366f1 !important;
}
</style>
