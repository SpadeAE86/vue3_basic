<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useCollectionsStore, type CollectionItem } from '@/stores/collections'
import MediaPreviewDialog from '@/components/image/MediaPreviewDialog.vue'
import SidebarSpaces from '@/components/collections/SidebarSpaces.vue'
import MediaCard from '@/components/collections/MediaCard.vue'
import TemplateCard from '@/components/collections/TemplateCard.vue'
import PromptSlotDialog from '@/components/image/PromptSlotDialog.vue'
import FloatingSearchPanel from '@/components/collections/FloatingSearchPanel.vue'
import LocalGallery from '@/components/collections/LocalGallery.vue'
import ImportChoiceDialog from '@/components/collections/ImportChoiceDialog.vue'
import SpaceTaggerDialog from '@/components/collections/SpaceTaggerDialog.vue'
import { uploadToObs } from '@/utils/obs'
import { ElMessage, ElLoading, ElMessageBox } from 'element-plus'

// Composables
import { useCollectionsSelection } from './composables/useCollectionsSelection'
import { useCollectionsPreview } from './composables/useCollectionsPreview'
import { useLocalFolders } from './composables/useLocalFolders'
import { useCollectionsClipboard } from './composables/useCollectionsClipboard'
import { useCollectionsDragDrop } from './composables/useCollectionsDragDrop'
import { useCollectionsContextMenu } from './composables/useCollectionsContextMenu'
import { useCollectionsImport } from './composables/useCollectionsImport'
import { useCollectionsFilterSort } from './composables/useCollectionsFilterSort'

const router = useRouter()
const collectionsStore = useCollectionsStore()

// ─── Composable: Local Folders ───
const {
  localFolders,
  activeFolderIndex,
  localFolderContents,
  localFolderLoading,
  loadLocalFolder,
  removeLocalFolder,
  breadcrumbParts,
  navigateBreadcrumb,
  enterSubfolder
} = useLocalFolders()

const visibleLocalFilesCount = ref(72)
const visibleCloudFilesCount = ref(72)

// ─── Composable: Filter & Sort Actions ───
const {
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
} = useCollectionsFilterSort(activeFolderIndex, visibleCloudFilesCount)

// ─── Composable: Card Selection ───
function getCardDomId(id: string | number) {
  return 'card-' + String(id).replace(/[^a-zA-Z0-9_-]/g, '_')
}

const visibleLocalFiles = computed(() => {
  return localFolderContents.value.files.slice(0, visibleLocalFilesCount.value)
})

const currentGalleryFiles = computed(() => {
  if (activeFolderIndex.value !== null) {
    return localFolderContents.value.files
  }
  return dbFiles.value
})

const {
  selectedItemIds,
  lastSelectedIndex,
  handleHeaderClick,
  clearSelectionIfBlank
} = useCollectionsSelection(currentGalleryFiles, activeFolderIndex, localFolderContents)

// ─── Composable: Clipboard Actions ───
const {
  cutItemIds,
  handleKeyDown,
  handlePasteItems
} = useCollectionsClipboard(
  selectedItemIds,
  activeFolderIndex,
  localFolders,
  activeFolderId,
  localFolderContents,
  loadLocalFolder
)

// ─── Composable: Drag & Drop Actions ───
const {
  isDragging,
  handleDragStart,
  handleDragEnd,
  handleLocalDragStart,
  handleLocalDragEnd,
  handleDragOverGlobal,
  stopAutoScroll,
  handleLocalDropOnFolder,
  handleCloudDropOnFolder
} = useCollectionsDragDrop(
  selectedItemIds,
  activeFolderIndex,
  localFolders,
  activeFolderId,
  localFolderContents,
  loadLocalFolder
)

// ─── Composable: Context Menu Actions ───
const {
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
} = useCollectionsContextMenu(
  selectedItemIds,
  activeFolderIndex,
  activeFolderId,
  selectedSpaceId,
  localFolders,
  localFolderContents,
  loadLocalFolder,
  handleLocalDropOnFolder,
  handleCloudDropOnFolder
)

// ─── Composable: Preview Dialog ───
const {
  previewVisible,
  previewUrl,
  previewMediaType,
  previewPrompt,
  previewTags,
  previewSpaceName,
  previewItem,
  openPreview,
  handlePrevPreview,
  handleNextPreview,
  handleUpdateTags,
  handlePrefillFromCollections
} = useCollectionsPreview(
  currentGalleryFiles,
  getSpaceName,
  (id, tags) => collectionsStore.updateItemTags(id, tags)
)

// ─── Composable: Import & Upload Actions ───
const {
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
} = useCollectionsImport(
  activeCategory,
  activeSubFilter,
  selectedSpaceId,
  localFolders,
  activeFolderIndex
)





function handleScroll(event: Event) {
  const target = event.target as HTMLElement
  const container = (target === document || (target as any) === window) 
    ? document.documentElement 
    : target
    
  if (!container || !container.scrollHeight) return
  
  const scrollTop = container.scrollTop
  const scrollHeight = container.scrollHeight
  const clientHeight = container.clientHeight
  
  if (scrollHeight <= clientHeight) return
  
  const distanceToBottom = scrollHeight - scrollTop - clientHeight
  const threshold = scrollHeight * 0.3
  
  if (distanceToBottom <= threshold) {
    if (activeFolderIndex.value !== null) {
      if (visibleLocalFilesCount.value < localFolderContents.value.files.length) {
        visibleLocalFilesCount.value += 48
      }
    } else {
      if (visibleCloudFilesCount.value < dbFiles.value.length) {
        visibleCloudFilesCount.value += 48
      }
    }
  }
}

// Watch navigation parameters to reset page sizes
watch(
  [activeFolderIndex, selectedSpaceId, activeCategory, searchQuery, selectedTags, activeFolderId],
  () => {
    visibleLocalFilesCount.value = 72
    visibleCloudFilesCount.value = 72
  }
)

function getScrollParent(node: HTMLElement | null): HTMLElement | null {
  if (!node) return null
  
  const style = window.getComputedStyle(node)
  const overflowY = style.overflowY
  const isScrollable = overflowY === 'auto' || overflowY === 'scroll'
  const hasScrollbar = node.scrollHeight > node.clientHeight
  
  if (isScrollable && hasScrollbar) {
    return node
  }
  
  return getScrollParent(node.parentElement)
}

function scrollToCard(cardEl: HTMLElement) {
  const container = getScrollParent(cardEl) || document.querySelector('.app-main') || document.querySelector('.el-main') || document.documentElement
  if (!container) return
  
  const containerRect = container.getBoundingClientRect()
  const cardRect = cardEl.getBoundingClientRect()
  
  const relativeTop = cardRect.top - containerRect.top
  const targetScrollTop = container.scrollTop + relativeTop - (container.clientHeight / 2) + (cardRect.height / 2)
  
  container.scrollTo({
    top: targetScrollTop,
    behavior: 'smooth'
  })
  
  // Also scroll .app-main and .el-main as fallbacks
  const appMain = document.querySelector('.app-main')
  const elMain = document.querySelector('.el-main')
  
  if (appMain && appMain !== container) {
    const rTop = cardRect.top - appMain.getBoundingClientRect().top
    const tScroll = appMain.scrollTop + rTop - (appMain.clientHeight / 2) + (cardRect.height / 2)
    appMain.scrollTo({ top: tScroll, behavior: 'smooth' })
  }
  if (elMain && elMain !== container && elMain !== appMain) {
    const rTop = cardRect.top - elMain.getBoundingClientRect().top
    const tScroll = elMain.scrollTop + rTop - (elMain.clientHeight / 2) + (cardRect.height / 2)
    elMain.scrollTo({ top: tScroll, behavior: 'smooth' })
  }
}

function handlePreviewItemSwitched(item: CollectionItem) {
  if (activeFolderIndex.value !== null) {
    const files = localFolderContents.value.files
    const index = files.findIndex(f => f.id === item.id)
    if (index > -1 && index >= visibleLocalFilesCount.value - 8) {
      visibleLocalFilesCount.value = Math.min(files.length, index + 48)
    }
  } else {
    const files = dbFiles.value
    const index = files.findIndex(f => f.id === item.id)
    if (index > -1 && index >= visibleCloudFilesCount.value - 8) {
      visibleCloudFilesCount.value = Math.min(files.length, index + 48)
    }
  }
  
  nextTick(() => {
    const scrollIntoViewFn = () => {
      const targetId = getCardDomId(item.id)
      let cardEl = document.getElementById(targetId)
      
      if (!cardEl) {
        // Fallback: search by DOM index order
        const isLocal = activeFolderIndex.value !== null
        const files = isLocal ? localFolderContents.value.files : dbFiles.value
        const fileIdx = files.findIndex(f => f.id === item.id)
        if (fileIdx > -1) {
          const numFolders = isLocal 
            ? localFolderContents.value.folders.length 
            : dbFolders.value.length
            
          const allCards = document.querySelectorAll('.masonry-grid .masonry-item, .templates-grid .template-card-container')
          const fallbackCard = allCards[numFolders + fileIdx] as HTMLElement
          if (fallbackCard) {
            cardEl = fallbackCard
          }
        }
      }
      
      if (cardEl) {
        scrollToCard(cardEl)
      }
    }
    // Perform scroll immediately
    scrollIntoViewFn()
    // Retry after 100ms to guarantee alignment after masonry layout updates
    setTimeout(scrollIntoViewFn, 100)
  })
}

// Watch previewItem to dynamically page files and scroll them into view
watch(previewItem, (newItem) => {
  if (!newItem) return
  handlePreviewItemSwitched(newItem)
})

function onPreviewItemSwitchedEvent(e: Event) {
  const item = (e as CustomEvent).detail as CollectionItem
  if (item) {
    handlePreviewItemSwitched(item)
  }
}

onMounted(() => {
  collectionsStore.init()
  updateNumColumns()
  document.addEventListener('click', clearSelectionIfBlank)
  window.addEventListener('local-folder-changed', loadLocalFolder)
  window.addEventListener('keydown', handleKeyDown)
  document.addEventListener('dragover', handleDragOverGlobal)
  document.addEventListener('dragend', stopAutoScroll)
  document.addEventListener('drop', stopAutoScroll)
  window.addEventListener('scroll', handleScroll, { capture: true })
  window.addEventListener('preview-item-switched', onPreviewItemSwitchedEvent)
  window.addEventListener('resize', updateNumColumns)
})

onUnmounted(() => {
  document.removeEventListener('click', clearSelectionIfBlank)
  window.removeEventListener('local-folder-changed', loadLocalFolder)
  window.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('dragover', handleDragOverGlobal)
  document.removeEventListener('dragend', stopAutoScroll)
  document.removeEventListener('drop', stopAutoScroll)
  window.removeEventListener('scroll', handleScroll, { capture: true })
  window.removeEventListener('preview-item-switched', onPreviewItemSwitchedEvent)
  window.removeEventListener('resize', updateNumColumns)
})

// Context Menu & Folders
import ContextMenu from '@/components/collections/ContextMenu.vue'
const dragoverLocalBreadcrumbPath = ref<string | null>(null)
const dragoverCloudBreadcrumb = ref(false)



watch([activeCategory, selectedSpaceId, activeFolderIndex], () => {
  selectedItemIds.value = []
  lastSelectedIndex.value = null
  activeFolderId.value = null
})

// 归属的主题空间名称映射
function getSpaceName(spaceId?: string | null) {
  if (!spaceId) return ''
  const space = collectionsStore.themeSpaces.find(s => s.id === spaceId)
  return space ? space.name : ''
}

function handleCardClick(item: CollectionItem) {
  if (item.item_type === 'template' || item.item_type === 'prompt' || item.item_type === 'inspiration') {
    if (item.data?.chat_session_id) {
      router.push(`/chat?role_id=${item.data.role_id || 'default'}&session_id=${item.data.chat_session_id}`)
    } else {
      const subtype = getItemSubType(item)
      if (subtype !== 'beautify') {
        router.push(`/collections/prompt-space/${item.id}`)
      }
    }
  }
}
</script>

<template>
  <div class="collections-page">
    <!-- 头部导航 -->
    <header class="collections-header">
      <div class="header-left">
        <div class="title-capsules-row">
          <h1 class="page-title">✨ 我的灵感收藏空间</h1>
          <div v-if="activeCategory === 'media'" class="capsules-wrapper">
            <button 
              class="capsule-btn" 
              :class="{ active: activeFolderIndex === null }"
              @click="activeFolderIndex = null"
            >
              收藏空间
            </button>
            <div 
              v-for="(folder, index) in localFolders" 
              :key="folder.basePath"
              class="capsule-btn local-capsule"
              :class="{ active: activeFolderIndex === index }"
              @click="activeFolderIndex = index"
            >
              <el-icon class="folder-icon-mini"><i-ep-folder /></el-icon>
              <span class="folder-name">{{ folder.name }}</span>
              <button class="remove-btn" @click.stop="removeLocalFolder(index)">
                <el-icon><i-ep-close /></el-icon>
              </button>
            </div>
          </div>
        </div>
        
        <p class="page-subtitle" v-if="activeFolderIndex === null">
          沉淀创意片段，分类规划您的图像、视频与提示词模板空间。
        </p>
        <div v-else class="breadcrumbs">
          <span 
            v-for="(part, idx) in breadcrumbParts" 
            :key="part.path" 
            class="breadcrumb-item"
          >
            <span 
              class="breadcrumb-link" 
              :class="{ 'is-dragover': dragoverLocalBreadcrumbPath === part.path }"
              @click="navigateBreadcrumb(idx)"
              @dragover.prevent
              @dragenter.prevent="dragoverLocalBreadcrumbPath = part.path"
              @dragleave="dragoverLocalBreadcrumbPath = null"
              @drop="handleLocalDropOnFolder({ destPath: part.path }); dragoverLocalBreadcrumbPath = null"
            >{{ part.name }}</span>
            <span v-if="idx < breadcrumbParts.length - 1" class="breadcrumb-separator">/</span>
          </span>
        </div>
      </div>

      <div class="header-right">
        <!-- 隐藏的隐藏文件选择输入 -->
        <input 
          type="file" 
          ref="fileInputRef" 
          style="display: none" 
          accept="image/*,video/*" 
          @change="handleFileSelected"
        />

        <el-button 
          type="primary" 
          size="small" 
          plain 
          class="import-btn"
          @click="handleImportClick"
          :loading="isImportingMedia"
        >
          <el-icon><i-ep-upload /></el-icon>
          <span>导入</span>
        </el-button>

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
            <span>灵感源泉</span>
          </button>
        </div>
      </div>
    </header>

    <div class="collections-content">
      <!-- 左边栏：主题空间 -->
      <SidebarSpaces
        :selectedSpaceId="selectedSpaceId"
        :active-category="activeCategory"
        :selected-item-ids="selectedItemIds"
        @update:selectedSpaceId="handleSpaceSelect"
        @clear-selection="selectedItemIds = []; lastSelectedIndex = null;"
        @drop-local-files="handleDropLocalFiles"
      />

      <!-- 主区域：瀑布流与卡片网格 -->
      <main class="main-gallery">
        <!-- Secondary Sub-Filter tabs row for 灵感源泉 -->
        <div v-if="activeCategory === 'template'" class="sub-filter-row">
          <button 
            class="sub-filter-btn" 
            :class="{ active: activeSubFilter === 'all' }"
            @click="activeSubFilter = 'all'"
          >
            全部 ({{ totalTemplateCount }})
          </button>
          <button 
            class="sub-filter-btn" 
            :class="{ active: activeSubFilter === 'inspiration' }"
            @click="activeSubFilter = 'inspiration'"
          >
            💡 灵感 ({{ inspirationCount }})
          </button>
          <button 
            class="sub-filter-btn" 
            :class="{ active: activeSubFilter === 'prompt' }"
            @click="activeSubFilter = 'prompt'"
          >
            📝 提示词 ({{ promptTemplateCount }})
          </button>
          <button 
            class="sub-filter-btn" 
            :class="{ active: activeSubFilter === 'beautify' }"
            @click="activeSubFilter = 'beautify'"
          >
            ✨ 美化 ({{ beautifyCount }})
          </button>
        </div>

        <!-- 列表状态 -->
        <div v-if="collectionsStore.loading" class="loading-state">
          <el-icon class="is-loading" :size="32"><i-ep-loading /></el-icon>
          <span>加载数据中...</span>
        </div>

        <div v-else class="gallery-wrapper" @contextmenu.prevent="handleContextMenu">
          <!-- Database Collections Folder Breadcrumbs -->
          <div v-if="activeFolderIndex === null && activeFolderId !== null" class="folder-breadcrumbs">
            <el-button 
              type="primary" 
              link
              @click="activeFolderId = null"
              class="breadcrumb-back-btn"
              :class="{ 'is-dragover': dragoverCloudBreadcrumb }"
              @dragover.prevent
              @dragenter.prevent="dragoverCloudBreadcrumb = true"
              @dragleave="dragoverCloudBreadcrumb = false"
              @drop="handleCloudDropOnFolder(''); dragoverCloudBreadcrumb = false"
            >
              <el-icon><i-ep-arrow-left /></el-icon> 返回上级 (拖至此移出文件夹)
            </el-button>
            <span class="breadcrumb-separator">/</span>
            <span class="current-folder-name">{{ getFolderName(activeFolderId) }}</span>
          </div>

          <!-- Empty state if no items -->
          <div v-if="filteredItems.length === 0" class="empty-state">
            <el-empty description="当前空间空空如也，右击可以创建新文件夹，或拖拽文件进行整理" />
          </div>

          <div v-else>
            <!-- 1. 多媒体画廊 (媒体瀑布流) -->
            <div v-if="activeCategory === 'media'">
              <!-- 本地文件夹画廊 -->
              <LocalGallery
                v-if="activeFolderIndex !== null"
                :folders="localFolderContents.folders"
                :files="visibleLocalFiles"
                :full-files="localFolderContents.files"
                :selected-item-ids="selectedItemIds"
                :cut-item-ids="cutItemIds"
                :loading="localFolderLoading"
                @enter-subfolder="enterSubfolder"
                @click-preview="openPreview"
                @click-header="({ item, event }) => handleHeaderClick(item, event)"
                @dragstart="handleLocalDragStart"
                @dragend="handleLocalDragEnd"
                @context-menu="handleContextMenu"
                @drop-items-on-folder="handleLocalDropOnFolder"
              />
              
              <!-- 数据库收藏空间画廊 -->
              <div v-else class="masonry-grid" :style="{ gridTemplateColumns: `repeat(${numColumns}, 1fr)` }">
                <div v-for="(col, colIdx) in dbColumnsData" :key="colIdx" class="masonry-column">
                  <div 
                    v-for="item in col" 
                    :key="item.id" 
                    :id="getCardDomId(item.id)"
                    :data-item-id="item.id"
                    class="masonry-item"
                    :class="{ 'is-cut': cutItemIds.includes(item.id) }"
                    draggable="true"
                    @dragstart="handleDragStart(item, $event)"
                    @dragend="handleDragEnd"
                  >
                    <MediaCard
                      :item="item"
                      :is-selected="selectedItemIds.includes(item.id)"
                      :selected-space-id="selectedSpaceId"
                      :preview-list="dbFiles"
                      :preview-index="item.item_type === 'folder' ? undefined : dbFiles.findIndex(f => f.id === item.id)"
                      @click-header="ev => handleHeaderClick(item, ev)"
                      @click-preview="openPreview"
                      @enter-virtual-folder="id => activeFolderId = id"
                      @drop-items-on-folder="payload => handleCloudDropOnFolder(payload.destFolderId)"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- 2. 提示词模板展示 -->
            <div v-else-if="activeCategory === 'template'" class="templates-grid">
              <div 
                v-for="(item, index) in visibleFilteredItems" 
                :key="item.id" 
                :id="getCardDomId(item.id)"
                class="template-card-container"
                :class="{ 'is-cut': cutItemIds.includes(item.id) }"
                draggable="true"
                @dragstart="handleDragStart(item, $event)"
                @dragend="handleDragEnd"
              >
                <MediaCard
                  v-if="item.cover_url || item.item_type === 'folder'"
                  :item="item"
                  :is-selected="selectedItemIds.includes(item.id)"
                  :selected-space-id="selectedSpaceId"
                  :preview-list="dbFiles"
                  :preview-index="item.item_type === 'folder' ? undefined : dbFiles.findIndex(f => f.id === item.id)"
                  @click-header="ev => handleHeaderClick(item, ev)"
                  @click-preview="openPreview"
                  @enter-virtual-folder="id => activeFolderId = id"
                  @drop-items-on-folder="payload => handleCloudDropOnFolder(payload.destFolderId)"
                />
                <TemplateCard
                  v-else
                  :item="item"
                  :is-selected="selectedItemIds.includes(item.id)"
                  :selected-space-id="selectedSpaceId"
                  @click-header="ev => handleHeaderClick(item, ev)"
                  @click="handleCardClick(item)"
                />
              </div>
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
      :reference-media="previewItem?.data?.referenceMedia"
      :show-carousel="true"
      @update-tags="handleUpdateTags"
      @prefill="handlePrefillFromCollections"
      @prev="handlePrevPreview"
      @next="handleNextPreview"
    />

    <ImportChoiceDialog
      v-model="importChoiceVisible"
      @choice="handleImportChoice"
    />

    <!-- Floating Draggable Search Panel -->
    <FloatingSearchPanel
      v-model:searchQuery="searchQuery"
      v-model:selectedTags="selectedTags"
      v-model:filterMode="filterMode"
    />

    <!-- 灵感源泉导入/新建弹窗，复用插槽模板编辑器 -->
    <PromptSlotDialog
      v-model:visible="isImportDialogVisible"
      :is-new="true"
      initial-name=""
      mode="collections"
      :initial-subtype="defaultImportSubtype"
      @saved="handleImportTemplateSaved"
    />

    <!-- Context Menu Component -->
    <ContextMenu
      v-model:visible="contextMenuVisible"
      :x="contextMenuX"
      :y="contextMenuY"
      :options="contextMenuOptions"
      @action="handleContextMenuAction"
    />

    <!-- LoRA Tagger Workspace Dialog -->
    <SpaceTaggerDialog
      v-model:visible="taggerVisible"
      :dir-path="taggerDirPath"
      :folder-id="taggerFolderId"
      :folder-title="taggerFolderTitle"
    />
  </div>
</template>

<style scoped>
.collections-page {
  padding: 24px;
  max-width: 1800px;
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

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.import-btn {
  border-radius: 20px;
  padding: 6px 16px;
  font-weight: 600;
  font-size: 13px;
  height: 32px;
  border-color: #6366f1;
  color: #6366f1;
  transition: all 0.2s ease;
}

.import-btn:hover {
  background-color: #f5f3ff;
  color: #4f46e5;
  border-color: #4f46e5;
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
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  align-items: start;
}

@media (min-width: 1600px) {
  .masonry-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}
@media (min-width: 1900px) {
  .masonry-grid {
    grid-template-columns: repeat(6, 1fr);
  }
}
@media (max-width: 1200px) {
  .masonry-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 900px) {
  .masonry-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.masonry-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.masonry-item {
  width: 100%;
}

/* Template Grid layout */
.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  align-items: start;
}

.template-card-container {
  display: flex;
  width: 100%;
}



/* Secondary Sub-Filter Row styles */
.sub-filter-row {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  background-color: rgba(241, 245, 249, 0.6);
  backdrop-filter: blur(10px);
  padding: 6px 12px;
  border-radius: 12px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  width: fit-content;
}

.sub-filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 8px;
  border: none;
  font-size: 12.5px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  background: none;
  transition: all 0.2s ease;
}

.sub-filter-btn:hover:not(.active) {
  color: #334155;
  background-color: rgba(0, 0, 0, 0.03);
}

.sub-filter-btn.active {
  background-color: #ffffff;
  color: #6366f1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.15);
}

/* ─── Capsules Styles ─── */
.title-capsules-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.title-capsules-row .page-title {
  margin: 0;
}

.capsules-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.capsule-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  border-radius: 14px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
}

.capsule-btn:hover {
  background-color: #f1f5f9;
  border-color: #94a3b8;
  color: #1e293b;
}

.capsule-btn.active {
  background-color: #eef2ff;
  color: #6366f1;
  border-color: #c7d2fe;
  box-shadow: 0 1px 2px rgba(99, 102, 241, 0.05);
}

.folder-icon-mini {
  font-size: 13px;
  color: #f59e0b;
}

.local-capsule {
  padding-right: 6px;
}

.local-capsule .folder-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
  border-radius: 50%;
  transition: all 0.2s ease;
  width: 0;
  opacity: 0;
  overflow: hidden;
  margin-left: 0;
}

.local-capsule:hover .remove-btn {
  width: 16px;
  opacity: 1;
  margin-left: 4px;
}

.remove-btn:hover {
  background-color: rgba(0, 0, 0, 0.05);
  color: #ef4444;
}

/* Breadcrumbs */
.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #64748b;
  margin-top: 6px;
  flex-wrap: wrap;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.breadcrumb-link {
  cursor: pointer;
  transition: color 0.2s;
  font-weight: 500;
}

.breadcrumb-link:hover {
  color: #6366f1;
  text-decoration: underline;
}

.breadcrumb-separator {
  color: #cbd5e1;
  user-select: none;
}

/* Virtual Folder Breadcrumbs */
.folder-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #64748b;
}

.breadcrumb-back-btn {
  font-size: 13.5px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
  color: #6366f1 !important;
}

.breadcrumb-back-btn:hover {
  text-decoration: underline;
}

.breadcrumb-separator {
  color: #cbd5e1;
}

.current-folder-name {
  font-weight: 600;
  color: #1e293b;
}

/* Breadcrumbs Drag Over Hover Highlight styles */
.breadcrumb-link {
  transition: all 0.2s ease;
  padding: 2px 4px;
  border-radius: 4px;
}

.breadcrumb-link.is-dragover {
  background-color: rgba(99, 102, 241, 0.15) !important;
  color: #6366f1 !important;
  border: 1px dashed #6366f1;
  transform: scale(1.05);
}

.breadcrumb-back-btn {
  transition: all 0.2s ease;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid transparent !important;
}

.breadcrumb-back-btn.is-dragover {
  background-color: rgba(99, 102, 241, 0.15) !important;
  color: #6366f1 !important;
  border: 1px dashed #6366f1 !important;
  transform: scale(1.03);
}

/* Removed Intermediate Import Choice Dialog Styles - moved to ImportChoiceDialog.vue */
.masonry-item.is-cut,
.template-card-container.is-cut {
  opacity: 0.5;
  filter: grayscale(30%);
  transition: opacity 0.2s ease;
}
</style>
