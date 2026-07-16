<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { type CollectionItem } from '@/stores/collections'
import MediaCard from '@/components/collections/MediaCard.vue'

const props = withDefaults(defineProps<{
  folders: Array<{ id: string; item_type: string; title: string; path: string; cover_url?: string }>
  files: CollectionItem[]
  fullFiles?: CollectionItem[]
  selectedItemIds: string[]
  cutItemIds?: string[]
  loading: boolean
}>(), {
  cutItemIds: () => [],
  fullFiles: () => []
})

const emit = defineEmits<{
  (e: 'enter-subfolder', path: string): void
  (e: 'click-preview', item: CollectionItem): void
  (e: 'click-header', payload: { item: any; event: MouseEvent }): void
  (e: 'dragstart', payload: { item: CollectionItem; event: DragEvent }): void
  (e: 'dragend'): void
  (e: 'drop-items-on-folder', payload: { destFolderId?: string; destPath?: string }): void
  (e: 'context-menu', event: MouseEvent): void
}>()

const mergedItems = computed(() => {
  return [...props.folders, ...props.files]
})

const dragoverFolderId = ref<string | null>(null)

function getCardDomId(id: string | number) {
  return 'card-' + String(id).replace(/[^a-zA-Z0-9_-]/g, '_')
}

// 响应式瀑布流列分发
const numColumns = ref(4)

function updateNumColumns() {
  const w = window.innerWidth
  if (w >= 1900) numColumns.value = 6
  else if (w >= 1600) numColumns.value = 5
  else if (w >= 1200) numColumns.value = 4
  else if (w >= 900) numColumns.value = 3
  else numColumns.value = 2
}

onMounted(() => {
  updateNumColumns()
  window.addEventListener('resize', updateNumColumns)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateNumColumns)
})

// 贪心算法分配每一列卡片，保证总高度均衡
const columnsData = computed(() => {
  const numCols = numColumns.value
  const cols = Array.from({ length: numCols }, () => [] as any[])
  const colHeights = Array(numCols).fill(0)

  mergedItems.value.forEach(item => {
    // 寻找当前高度最低的列
    let minColIdx = 0
    let minHeight = colHeights[0]
    for (let i = 1; i < numCols; i++) {
      if (colHeights[i] < minHeight) {
        minHeight = colHeights[i]
        minColIdx = i
      }
    }

    // 评估项目高度
    let estimatedHeight = 300 // 默认保底高度
    
    if (item.item_type === 'folder') {
      estimatedHeight = 80
    } else if (item.item_type === 'media' || item.cover_url) {
      const width = item.data?.width || item.data?.image_width
      const height = item.data?.height || item.data?.image_height
      if (width && height) {
        estimatedHeight = (height / width) * 240 + 60
      } else {
        estimatedHeight = 300 // 默认 1:1 或常见图片估计高度
      }
    }

    cols[minColIdx].push(item)
    colHeights[minColIdx] += estimatedHeight
  })

  return cols
})
</script>

<template>
  <div class="local-gallery">
    <!-- 加载中状态 -->
    <div v-if="loading" class="loading-state">
      <el-icon class="is-loading" :size="32"><i-ep-loading /></el-icon>
      <span>正在读取本地目录...</span>
    </div>

    <!-- 空目录状态 -->
    <div v-else-if="folders.length === 0 && files.length === 0" class="empty-state">
      <el-empty description="此文件夹内没有发现支持的图片或视频文件" />
    </div>

    <div
      v-else
      class="gallery-wrapper"
      @contextmenu.prevent="emit('context-menu', $event)"
    >
      <div class="masonry-grid" :style="{ gridTemplateColumns: `repeat(${numColumns}, 1fr)` }">
        <div v-for="(col, colIdx) in columnsData" :key="colIdx" class="masonry-column">
          <div 
            v-for="item in col" 
            :key="item.id" 
            :id="getCardDomId(item.id)"
            :data-item-id="item.id"
            class="masonry-item"
            :class="{ 'is-cut': cutItemIds.includes(item.id) }"
            :draggable="true"
            @dragstart="emit('dragstart', { item, event: $event })"
            @dragend="emit('dragend')"
          >
            <MediaCard
              :item="item as any"
              :is-selected="selectedItemIds.includes(item.id)"
              :preview-list="fullFiles.length > 0 ? fullFiles : files"
              :preview-index="item.item_type === 'folder' ? undefined : (fullFiles.length > 0 ? fullFiles : files).findIndex(f => f.id === item.id)"
              @click-header="ev => emit('click-header', { item, event: ev })"
              @click-preview="item => emit('click-preview', item)"
              @enter-subfolder="path => emit('enter-subfolder', path)"
              @drop-items-on-folder="payload => emit('drop-items-on-folder', payload)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.local-gallery {
  width: 100%;
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

/* 本地子文件夹网格 */
.local-folders-section {
  margin-bottom: 24px;
}

.section-subtitle {
  font-size: 14px;
  font-weight: 600;
  color: #475569;
  margin: 0 0 12px 0;
}

.local-folders-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.local-folder-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
}

.local-folder-card:hover,
.local-folder-card.is-dragover {
  border-color: #6366f1;
  background-color: #f8fafc;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
  transform: translateY(-1px);
}

.local-folder-card .folder-icon {
  font-size: 18px;
  color: #f59e0b; /* Folder yellow */
  flex-shrink: 0;
}

.local-folder-card .folder-title {
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

/* 瀑布流布局 */
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

.masonry-item.is-cut {
  opacity: 0.5;
  filter: grayscale(30%);
  transition: opacity 0.2s ease;
}
</style>
