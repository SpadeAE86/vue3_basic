<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps<{
  searchQuery: string
  selectedTags: string[]
  filterMode: 'text' | 'tag'
}>()

const emit = defineEmits<{
  (e: 'update:searchQuery', val: string): void
  (e: 'update:selectedTags', val: string[]): void
  (e: 'update:filterMode', val: 'text' | 'tag'): void
}>()

// Local sync states
const localSearchQuery = computed({
  get: () => props.searchQuery,
  set: (val) => emit('update:searchQuery', val)
})

const localFilterMode = computed({
  get: () => props.filterMode,
  set: (val) => emit('update:filterMode', val)
})

// Drag position variables
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

// Tag tree logic
const tagTree = ref<any>(null)
const expandedCategoryPath = ref<string | null>(null)
const tagInputVal = ref('')

async function fetchTagTree() {
  try {
    const resp = await fetch('/api/collections/tag-tree')
    const res = await resp.json()
    if (res.success) {
      tagTree.value = res.tag_tree
    }
  } catch (e) {
    console.error('加载标签树失败:', e)
  }
}

interface FlatCategoryItem {
  name: string
  path: string
  tags: string[]
  isLeaf: boolean
  depth: number
}

const flatCategories = computed(() => {
  const list: FlatCategoryItem[] = []
  if (!tagTree.value) return list
  
  function traverse(tree: any, depth = 0) {
    for (const key in tree) {
      const node = tree[key]
      list.push({
        name: key,
        path: node.path,
        tags: node.tags || [],
        isLeaf: node.is_leaf,
        depth
      })
      if (node.children) {
        traverse(node.children, depth + 1)
      }
    }
  }
  traverse(tagTree.value)
  return list
})

function toggleCategory(path: string) {
  if (expandedCategoryPath.value === path) {
    expandedCategoryPath.value = null
  } else {
    expandedCategoryPath.value = path
    localFilterMode.value = 'tag'
  }
}

function addFilterTag(tag: string) {
  if (!props.selectedTags.includes(tag)) {
    const newTags = [...props.selectedTags, tag]
    emit('update:selectedTags', newTags)
  }
}

function addTagFromInput() {
  const val = tagInputVal.value.trim()
  if (val) {
    if (!props.selectedTags.includes(val)) {
      const newTags = [...props.selectedTags, val]
      emit('update:selectedTags', newTags)
    }
    tagInputVal.value = ''
  }
}

function removeFilterTag(tag: string) {
  const newTags = props.selectedTags.filter(t => t !== tag)
  emit('update:selectedTags', newTags)
}

onMounted(() => {
  fetchTagTree()
})
</script>

<template>
  <div
    class="floating-search-panel"
    :class="{ 'is-dragging': isDraggingSearch }"
    :style="searchBoxStyle"
  >
    <div
      class="search-panel-header"
      @mousedown="startDragSearch"
      @touchstart="startTouchDragSearch"
    >
      <span class="search-title">🔍 搜索过滤</span>
      <span class="drag-handle-dots">⋮⋮</span>
    </div>

    <!-- Mode Toggle Switch -->
    <div class="filter-mode-toggle">
      <button 
        class="mode-toggle-btn" 
        :class="{ active: localFilterMode === 'text' }"
        @click="localFilterMode = 'text'"
      >
        文本搜索
      </button>
      <button 
        class="mode-toggle-btn" 
        :class="{ active: localFilterMode === 'tag' }"
        @click="localFilterMode = 'tag'"
      >
        标签过滤
      </button>
    </div>

    <!-- Search Input Section -->
    <div class="search-input-wrapper">
      <!-- Text Search Input -->
      <el-input
        v-if="localFilterMode === 'text'"
        v-model="localSearchQuery"
        placeholder="搜索标签、标题或提示词..."
        clearable
        size="small"
      >
        <template #prefix>
          <el-icon><i-ep-search /></el-icon>
        </template>
      </el-input>

      <!-- Tag Capsules Filtering Input -->
      <div v-else class="tag-filter-bar">
        <div class="tag-capsules-container">
          <span 
            v-for="tag in selectedTags" 
            :key="tag" 
            class="tag-capsule-filter"
          >
            #{{ tag }}
            <span class="remove-btn" @click.stop="removeFilterTag(tag)">×</span>
          </span>
          <input
            v-model="tagInputVal"
            type="text"
            placeholder="输入标签并回车..."
            class="tag-text-input"
            @keydown.enter.stop="addTagFromInput"
          />
        </div>
      </div>
    </div>

    <!-- Accordion Tag Tree (Only shown in Tag Mode) -->
    <div v-if="localFilterMode === 'tag' && tagTree" class="tag-tree-container">
      <div 
        v-for="cat in flatCategories" 
        :key="cat.path" 
        class="tree-category-node"
      >
        <div 
          class="category-node-header" 
          :class="{ 'is-expanded': expandedCategoryPath === cat.path }"
          @click.stop="toggleCategory(cat.path)"
        >
          <span class="category-name">
            <span class="tree-indent" :style="{ width: `${cat.depth * 8}px` }"></span>
            <span class="folder-icon">{{ cat.isLeaf ? '🏷️' : (expandedCategoryPath === cat.path ? '📂' : '📁') }}</span>
            <span class="cat-label">{{ cat.name }}</span>
          </span>
          <span v-if="cat.tags.length > 0" class="tag-count-badge">
            {{ cat.tags.length }}
          </span>
        </div>
        
        <!-- Expanded Capsules Pills List -->
        <div 
          v-if="expandedCategoryPath === cat.path && cat.tags.length > 0" 
          class="category-tags-pills"
        >
          <button
            v-for="tag in cat.tags"
            :key="tag"
            class="tag-pill-btn"
            :class="{ 'is-active': selectedTags.includes(tag) }"
            @click.stop="addFilterTag(tag)"
          >
            # {{ tag }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.floating-search-panel {
  position: fixed;
  z-index: 1000;
  width: 280px;
  max-height: 500px;
  display: flex;
  flex-direction: column;
  padding: 14px;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 20px;
  border: 1px solid rgba(99, 102, 241, 0.18);
  box-shadow: 0 10px 36px rgba(99, 102, 241, 0.08);
  cursor: default;
  transition: border-color 0.3s, box-shadow 0.3s, max-height 0.3s;
  box-sizing: border-box;
}

.floating-search-panel:hover {
  border-color: rgba(99, 102, 241, 0.35);
  box-shadow: 0 14px 44px rgba(99, 102, 241, 0.14);
}

.floating-search-panel.is-dragging {
  border-color: #6366f1;
  box-shadow: 0 18px 56px rgba(99, 102, 241, 0.24);
  transition: none !important;
}

.search-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  width: 100%;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
}

.floating-search-panel.is-dragging .search-panel-header {
  cursor: grabbing;
}

.search-title {
  font-size: 11px;
  font-weight: 700;
  color: #4f46e5;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.drag-handle-dots {
  color: #94a3b8;
  font-size: 14px;
  letter-spacing: 1.5px;
}

.filter-mode-toggle {
  display: flex;
  background-color: rgba(226, 232, 240, 0.5);
  border-radius: 10px;
  padding: 3px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.mode-toggle-btn {
  flex: 1;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  border: none;
  background: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-toggle-btn.active {
  background-color: #ffffff;
  color: #4f46e5;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.search-input-wrapper {
  width: 100%;
  flex-shrink: 0;
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

.tag-filter-bar {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  padding: 6px 8px;
  min-height: 32px;
  box-sizing: border-box;
}

.tag-capsules-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.tag-capsule-filter {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: linear-gradient(135deg, #e0e7ff 0%, #e0f2fe 100%);
  color: #4338ca;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(99, 102, 241, 0.05);
  animation: scaleUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.tag-capsule-filter .remove-btn {
  cursor: pointer;
  color: #6366f1;
  font-weight: bold;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  transition: background 0.2s, color 0.2s;
}

.tag-capsule-filter .remove-btn:hover {
  background: #4f46e5;
  color: #ffffff;
}

.tag-text-input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 11px;
  color: #1e293b;
  flex: 1;
  min-width: 80px;
  padding: 2px 0;
}

.tag-tree-container {
  margin-top: 12px;
  overflow-y: auto;
  max-height: 330px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 4px;
}

.tag-tree-container::-webkit-scrollbar {
  width: 6px;
}
.tag-tree-container::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.02);
}
.tag-tree-container::-webkit-scrollbar-thumb {
  background: rgba(99, 102, 241, 0.25);
  border-radius: 3px;
}
.tag-tree-container::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 102, 241, 0.45);
}

.tree-category-node {
  background: rgba(248, 250, 252, 0.5);
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.02);
  overflow: hidden;
  transition: all 0.2s ease;
}

.tree-category-node:hover {
  background: rgba(248, 250, 252, 0.8);
}

.category-node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.category-node-header:hover {
  background-color: rgba(99, 102, 241, 0.05);
}

.category-node-header.is-expanded {
  background-color: rgba(99, 102, 241, 0.08);
  border-bottom: 1px solid rgba(99, 102, 241, 0.05);
}

.category-name {
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.tree-indent {
  display: inline-block;
  flex-shrink: 0;
}

.folder-icon {
  margin-right: 6px;
  font-size: 13px;
}

.cat-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-count-badge {
  background-color: rgba(99, 102, 241, 0.12);
  color: #4f46e5;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 999px;
}

.category-tags-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.6);
  border-top: 1px dashed rgba(99, 102, 241, 0.08);
  animation: fadeInSlide 0.2s ease-out forwards;
}

.tag-pill-btn {
  border: 1px solid rgba(203, 213, 225, 0.6);
  background: #ffffff;
  color: #475569;
  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.tag-pill-btn:hover {
  background: rgba(99, 102, 241, 0.05);
  border-color: rgba(99, 102, 241, 0.3);
  color: #4f46e5;
}

.tag-pill-btn.is-active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: #ffffff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.25);
}

@keyframes scaleUp {
  0% { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes fadeInSlide {
  0% { opacity: 0; transform: translateY(-8px); }
  100% { opacity: 1; transform: translateY(0); }
}
</style>
