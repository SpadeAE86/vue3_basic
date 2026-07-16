<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useCollectionsStore } from '@/stores/collections'

const props = defineProps<{
  modelValue: boolean
  selectedUrls: string[]
  maxCount: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'select-multiple', urls: string[]): void
}>()

const visible = ref(props.modelValue)
const selectedLocalUrls = ref<string[]>([])
const activeSpaceId = ref<string>('all')
const showUnclassifiedOnly = ref(false) // 全部图片与未分类切换标记

const collectionsStore = useCollectionsStore()

const remainingSlots = computed(() => Math.max(0, props.maxCount - props.selectedUrls.length))

const mediaSpaces = computed(() => {
  return collectionsStore.themeSpaces.filter((s: any) => s.category === 'media')
})

watch(() => props.modelValue, (newVal) => {
  visible.value = newVal
  if (newVal) {
    collectionsStore.init() // 加载收藏列表和分类文件夹
    selectedLocalUrls.value = [] // 重置选择
    activeSpaceId.value = 'all' // 重置分类过滤
    showUnclassifiedOnly.value = false // 重置全部/未分类状态
  }
})

watch(visible, (newVal) => {
  emit('update:modelValue', newVal)
})

const filteredCollectionsItems = computed(() => {
  return collectionsStore.items.filter((item: any) => {
    if (item.item_type !== 'media') return false
    const url = item.data.url || item.data.image_url || ''
    const isVid = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm')
    if (isVid) return false

    // 分类文件夹筛选
    if (activeSpaceId.value === 'all') {
      if (showUnclassifiedOnly.value) {
        return !item.space_id
      }
      return true
    } else {
      return item.space_id === activeSpaceId.value
    }
  })
})

function isAlreadyAdded(item: any) {
  const url = item.data.url || item.data.image_url
  if (!url) return false
  return props.selectedUrls.includes(url)
}

function isLocallySelected(item: any) {
  const url = item.data.url || item.data.image_url
  if (!url) return false
  return selectedLocalUrls.value.includes(url)
}

function toggleSelect(item: any) {
  const url = item.data.url || item.data.image_url
  if (!url) return

  if (isAlreadyAdded(item)) return

  const idx = selectedLocalUrls.value.indexOf(url)
  if (idx > -1) {
    selectedLocalUrls.value.splice(idx, 1)
  } else {
    if (selectedLocalUrls.value.length >= remainingSlots.value) {
      ElMessage.warning(`最多还能再选择 ${remainingSlots.value} 张参考图`)
      return
    }
    selectedLocalUrls.value.push(url)
  }
}

function toggleUnclassifiedOnly() {
  activeSpaceId.value = 'all'
  showUnclassifiedOnly.value = !showUnclassifiedOnly.value
}

function selectAllTab() {
  activeSpaceId.value = 'all'
}

function confirmImport() {
  if (selectedLocalUrls.value.length === 0) return
  emit('select-multiple', selectedLocalUrls.value)
  visible.value = false
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="从灵感收藏空间选择参考图"
    width="1050"
    append-to-body
    destroy-on-close
    class="custom-collection-dialog"
  >
    <div class="dialog-content-layout">
      <!-- 左侧分类文件夹导航 -->
      <div class="folder-sidebar">
        <div class="sidebar-title">分类文件夹</div>
        <div
          class="sidebar-item"
          :class="{ 'is-active': activeSpaceId === 'all' }"
          @click="selectAllTab"
        >
          <div class="sidebar-item-left">
            <el-icon><i-ep-files /></el-icon>
            <span class="space-name-text">
              {{ showUnclassifiedOnly ? '未分类图片' : '全部图片' }}
            </span>
          </div>
          <!-- 切换显示全部与未分类的小图标 -->
          <el-tooltip :content="showUnclassifiedOnly ? '切换显示全部' : '只看未分类'" placement="top">
            <div
              class="unclassified-toggle-btn"
              :class="{ 'is-toggled': showUnclassifiedOnly }"
              @click.stop="toggleUnclassifiedOnly"
            >
              <el-icon><i-ep-filter /></el-icon>
            </div>
          </el-tooltip>
        </div>

        <div class="sidebar-divider" v-if="mediaSpaces.length > 0"></div>

        <div
          v-for="space in mediaSpaces"
          :key="space.id"
          class="sidebar-item"
          :class="{ 'is-active': activeSpaceId === space.id }"
          @click="activeSpaceId = space.id"
          :title="space.name"
        >
          <div class="sidebar-item-left">
            <el-icon><i-ep-folder /></el-icon>
            <span class="space-name-text">{{ space.name }}</span>
          </div>
        </div>
      </div>

      <!-- 右侧瀑布流图片列表 -->
      <div v-loading="collectionsStore.loading" class="grid-container">
        <div class="collections-import-container" v-if="filteredCollectionsItems.length > 0">
          <div class="collections-import-waterfall">
            <div
              v-for="item in filteredCollectionsItems"
              :key="item.id"
              class="import-item-card"
              :class="{
                'is-added': isAlreadyAdded(item),
                'is-selected': isLocallySelected(item)
              }"
              @click="toggleSelect(item)"
            >
              <img :src="item.data.url || item.data.image_url" class="import-item-img" />

              <!-- 已添加蒙版 -->
              <div v-if="isAlreadyAdded(item)" class="import-added-overlay">
                <el-icon class="icon-added"><i-ep-check /></el-icon>
                <span>已添加</span>
              </div>

              <!-- 本地选中指示器 (角标) -->
              <div v-else-if="isLocallySelected(item)" class="import-selected-badge">
                <el-icon><i-ep-check /></el-icon>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="import-empty">
          <el-icon :size="36" color="#94a3b8"><i-ep-info-filled /></el-icon>
          <p v-if="activeSpaceId === 'all'">
            {{ showUnclassifiedOnly ? '暂无未分类的图片素材' : '收藏空间中暂无可用的图片，快去创作和收藏吧！' }}
          </p>
          <p v-else>当前文件夹下暂无图片，快去整理吧！</p>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <div class="slots-info-wrapper">
          <span class="slots-info" v-if="remainingSlots > 0">
            已选 <strong class="highlight-selected">{{ selectedLocalUrls.length }}</strong> 张，还可以选择 <strong class="highlight-remaining">{{ remainingSlots - selectedLocalUrls.length }}</strong> / {{ remainingSlots }} 张
          </span>
          <span class="slots-info limit-reached" v-else>
            已达到参考素材最大限制 ({{ maxCount }}张)
          </span>
        </div>
        <div class="footer-btns">
          <el-button @click="visible = false" round>取消</el-button>
          <el-button
            type="primary"
            :disabled="selectedLocalUrls.length === 0"
            @click="confirmImport"
            class="confirm-btn"
            round
          >
            确认导入
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-content-layout {
  display: flex;
  gap: 20px;
  min-height: 420px;
}

.folder-sidebar {
  width: 160px;
  flex-shrink: 0;
  border-right: 1px solid #f1f5f9;
  padding-right: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-title {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 8px;
  padding-left: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #475569;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.sidebar-item:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.sidebar-item.is-active {
  background: rgba(99, 102, 241, 0.08);
  color: #6366f1;
  font-weight: 600;
}

.sidebar-item-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.space-name-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.unclassified-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s;
  margin-left: 4px;
}

.unclassified-toggle-btn:hover {
  background: rgba(15, 23, 42, 0.08);
  color: #6366f1;
}

.unclassified-toggle-btn.is-toggled {
  color: #6366f1;
  background: rgba(99, 102, 241, 0.12);
}

.sidebar-divider {
  height: 1px;
  background: #f1f5f9;
  margin: 6px 10px;
}

.grid-container {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.collections-import-container {
  max-height: 520px;
  overflow-y: auto;
  padding: 4px;
}

/* 美化滚动条 */
.collections-import-container::-webkit-scrollbar {
  width: 6px;
}
.collections-import-container::-webkit-scrollbar-track {
  background: transparent;
}
.collections-import-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
.collections-import-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.collections-import-waterfall {
  /* 1. 废除原有的多列布局 */
  /* column-count: 3; */
  /* column-gap: 16px; */

  /* 2. 启用响应式弹性网格 */
  display: grid;
  /* 自动根据右侧容器宽度计算列数，每列至少 180px，剩下的自动等分撑满 */
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  align-items: start; /* 确保高度不一的卡片不会被强行拉伸对齐 */
}

.import-item-card {
  break-inside: avoid;
  margin-bottom: 16px;
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid #e2e8f0;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  background: #f8fafc;
  display: inline-block;
  width: 100%;
}

.import-item-card:hover:not(.is-added) {
  border-color: #6366f1;
  transform: translateY(-3px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.12);
}

.import-item-img {
  width: 100%;
  height: auto;
  display: block;
  transition: transform 0.25s;
}

.import-item-card:hover:not(.is-added) .import-item-img {
  transform: scale(1.03);
}

/* 已添加状态 */
.import-item-card.is-added {
  cursor: not-allowed;
  border-color: #cbd5e1;
}

.import-added-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(241, 245, 249, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  gap: 6px;
  backdrop-filter: blur(1.5px);
  -webkit-backdrop-filter: blur(1.5px);
}

.icon-added {
  font-size: 18px;
  background: #cbd5e1;
  color: #ffffff;
  border-radius: 50%;
  padding: 4px;
}

/* 本地选中状态 */
.import-item-card.is-selected {
  border-color: #6366f1;
  box-shadow: 0 0 0 1px #6366f1;
}

.import-selected-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  background: #6366f1;
  color: #ffffff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.4);
  border: 1.5px solid #ffffff;
  animation: popIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 3;
}

@keyframes popIn {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.import-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: #94a3b8;
  font-size: 13px;
  gap: 12px;
}

/* 弹窗底部样式 */
.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #f1f5f9;
}

.slots-info-wrapper {
  font-size: 12px;
  color: #64748b;
}

.highlight-selected {
  color: #6366f1;
  font-weight: 600;
  font-size: 14px;
}

.highlight-remaining {
  color: #059669;
  font-weight: 600;
}

.limit-reached {
  color: #ef4444;
  font-weight: 500;
}

.footer-btns {
  display: flex;
  gap: 12px;
}

.confirm-btn {
  background: #6366f1 !important;
  border-color: #6366f1 !important;
  font-weight: 500;
}

.confirm-btn:hover {
  background: #4f46e5 !important;
  border-color: #4f46e5 !important;
}

.confirm-btn:disabled {
  background: #c7d2fe !important;
  border-color: #c7d2fe !important;
  cursor: not-allowed;
}
</style>
