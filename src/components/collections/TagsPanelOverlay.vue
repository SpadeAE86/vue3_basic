<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted, watch } from 'vue'
import { useCollectionsStore, type CollectionItem } from '@/stores/collections'

const props = defineProps<{
  item: CollectionItem
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
}>()

const collectionsStore = useCollectionsStore()

// ─── 标签面板显隐控制 ───
function closePanel() {
  emit('update:visible', false)
}

function openPanel() {
  emit('update:visible', true)
}

// ─── 局部标签编辑状态 ───
const isAddingTag = ref(false)
const newViewerTagInput = ref('')
const activeEditingTag = ref<string | null>(null)
const editingTagInput = ref('')

// ─── 动态计算标签面板位置 ───
const rightTagsStyle = ref<Record<string, string>>({
  left: 'auto',
  right: '40px',
  top: '50%',
  transform: 'translateY(-50%)',
  alignItems: 'flex-start'
})

let observer: ResizeObserver | null = null

function updateTagsPosition() {
  const img = document.querySelector('.el-image-viewer__wrapper .el-image-viewer__img') as HTMLImageElement
  if (img) {
    const rect = img.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    // 距离图边缘 20px
    let targetLeft = rect.right + 20

    // 检查右边缘空间（面板宽度 320px，至少预留 340px）
    if (viewportWidth - targetLeft < 340) {
      rightTagsStyle.value = {
        left: 'auto',
        right: '40px',
        top: '50%',
        transform: 'translateY(-50%)',
        alignItems: 'flex-start'
      }
    } else {
      rightTagsStyle.value = {
        left: `${targetLeft}px`,
        right: 'auto',
        top: `${rect.top + rect.height / 2 - 120}px`,
        transform: 'translateY(-50%)',
        alignItems: 'flex-start'
      }
    }
  }
}

function setupPositionObserver() {
  cleanupObserver()
  nextTick(() => {
    const img = document.querySelector('.el-image-viewer__wrapper .el-image-viewer__img') as HTMLImageElement
    if (img) {
      updateTagsPosition()
      observer = new ResizeObserver(() => {
        updateTagsPosition()
      })
      observer.observe(img)

      const canvas = document.querySelector('.el-image-viewer__canvas')
      if (canvas) {
        observer.observe(canvas)
      }
    }
  })
}

function cleanupObserver() {
  if (observer) {
    observer.disconnect()
    observer = null
  }
}

// ─── 标签面板拖拽与定位逻辑 ───
const isDragging = ref(false)
const dragStartPos = { x: 0, y: 0 }
const dragStartOffset = { left: 0, top: 0 }
const dragPosition = ref({ left: 0, top: 0, dragged: false })

function startDragTagsPanel(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'BUTTON' ||
    target.closest('button') ||
    target.closest('input') ||
    target.classList.contains('viewer-custom-pill-remove') ||
    target.closest('.viewer-custom-pill-remove')
  ) {
    return
  }
  e.preventDefault()
  isDragging.value = true
  const el = document.querySelector('.result-preview-tags-vertical-list') as HTMLElement
  if (el) {
    const rect = el.getBoundingClientRect()
    dragPosition.value.left = rect.left
    dragPosition.value.top = rect.top
    dragPosition.value.dragged = true

    dragStartPos.x = e.clientX
    dragStartPos.y = e.clientY
    dragStartOffset.left = rect.left
    dragStartOffset.top = rect.top

    window.addEventListener('mousemove', onDragTagsPanel)
    window.addEventListener('mouseup', stopDragTagsPanel)
  }
}

function onDragTagsPanel(e: MouseEvent) {
  if (!isDragging.value) return
  const dx = e.clientX - dragStartPos.x
  const dy = e.clientY - dragStartPos.y

  dragPosition.value.left = dragStartOffset.left + dx
  dragPosition.value.top = dragStartOffset.top + dy
}

function stopDragTagsPanel() {
  isDragging.value = false
  window.removeEventListener('mousemove', onDragTagsPanel)
  window.removeEventListener('mouseup', stopDragTagsPanel)
}

function startTouchDragTagsPanel(e: TouchEvent) {
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  if (!touch) return

  const target = e.target as HTMLElement
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'BUTTON' ||
    target.closest('button') ||
    target.closest('input') ||
    target.classList.contains('viewer-custom-pill-remove') ||
    target.closest('.viewer-custom-pill-remove')
  ) {
    return
  }

  isDragging.value = true
  const el = document.querySelector('.result-preview-tags-vertical-list') as HTMLElement
  if (el) {
    const rect = el.getBoundingClientRect()
    dragPosition.value.left = rect.left
    dragPosition.value.top = rect.top
    dragPosition.value.dragged = true

    dragStartPos.x = touch.clientX
    dragStartPos.y = touch.clientY
    dragStartOffset.left = rect.left
    dragStartOffset.top = rect.top

    window.addEventListener('touchmove', onTouchDragTagsPanel, { passive: false })
    window.addEventListener('touchend', stopTouchDragTagsPanel)
  }
}

function onTouchDragTagsPanel(e: TouchEvent) {
  if (!isDragging.value) return
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  if (!touch) return
  const dx = touch.clientX - dragStartPos.x
  const dy = touch.clientY - dragStartPos.y

  dragPosition.value.left = dragStartOffset.left + dx
  dragPosition.value.top = dragStartOffset.top + dy
}

function stopTouchDragTagsPanel() {
  isDragging.value = false
  window.removeEventListener('touchmove', onTouchDragTagsPanel)
  window.removeEventListener('touchend', stopTouchDragTagsPanel)
}

const tagsPanelStyle = computed(() => {
  if (dragPosition.value.dragged) {
    return {
      left: `${dragPosition.value.left}px`,
      top: `${dragPosition.value.top}px`,
      right: 'auto',
      transform: 'none'
    }
  }
  return rightTagsStyle.value
})

// ─── AI 打标任务轮询 ───
const isAiTagging = computed(() => {
  const task = collectionsStore.taggingTasks[props.item.id]
  return task?.status === 'PENDING' || task?.status === 'RUNNING'
})

async function handleAiAutoTag() {
  if (isAiTagging.value) return
  const success = await collectionsStore.autoTagItem(props.item.id, true)
  if (success) {
    nextTick(() => {
      updateTagsPosition()
    })
  }
}

// ─── 标签编辑/保存/删除 ───
const lastAddedTag = ref(localStorage.getItem('diy_last_added_tag') || '')

async function handleCopyTag(tag: string) {
  try {
    await navigator.clipboard.writeText(tag)
    ElMessage.success(`已复制标签: ${tag}`)
  } catch (err) {
    console.error(err)
    ElMessage.error('复制失败')
  }
}

async function handleCopyAllTags(tags: string[]) {
  if (!tags || tags.length === 0) {
    ElMessage.warning('标签列表为空')
    return
  }
  try {
    await navigator.clipboard.writeText(tags.join(', '))
    ElMessage.success('已复制全部标签为逗号分隔文本')
  } catch (err) {
    console.error(err)
    ElMessage.error('复制失败')
  }
}

function startAddViewerTag() {
  isAddingTag.value = true
  newViewerTagInput.value = lastAddedTag.value
  nextTick(() => {
    const input = document.getElementById(`viewer-tag-input-${props.item.id}`) as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  })
}

function startEditViewerTag(tag: string) {
  activeEditingTag.value = tag
  editingTagInput.value = tag
  nextTick(() => {
    const input = document.getElementById(`viewer-tag-edit-${props.item.id}-${tag}`) as HTMLInputElement
    input?.focus()
    input?.select()
  })
}

async function handleSaveEditedViewerTag(oldTag: string) {
  const newTag = editingTagInput.value.trim()
  if (newTag && newTag !== oldTag) {
    const currentTags = [...(props.item.tags || [])]
    const idx = currentTags.indexOf(oldTag)
    if (idx > -1) {
      if (!currentTags.includes(newTag)) {
        currentTags[idx] = newTag
        await collectionsStore.updateItemTags(props.item.id, currentTags)
      }
    }
  } else if (!newTag) {
    await handleRemoveViewerTag(oldTag)
  }
  activeEditingTag.value = null
}

// ─── Autocomplete / Fuzzy Recommendations Logic ───
const autocompleteResults = ref<any[]>([])
const autocompleteIndex = ref(0)

watch(newViewerTagInput, async (newVal) => {
  const query = newVal.trim()
  if (!query) {
    autocompleteResults.value = []
    autocompleteIndex.value = 0
    return
  }
  try {
    const res = await fetch(`/api/tagger/danbooru?query=${encodeURIComponent(query)}&limit=15`)
    const data = await res.json()
    if (data.success) {
      autocompleteResults.value = data.results || []
      autocompleteIndex.value = 0
    }
  } catch (err) {
    console.error('Failed to fetch danbooru tags:', err)
  }
})

function navigateAutocomplete(dir: number) {
  if (autocompleteResults.value.length === 0) return
  const len = autocompleteResults.value.length
  autocompleteIndex.value = (autocompleteIndex.value + dir + len) % len
}

function selectHighlightedAutocomplete() {
  if (autocompleteResults.value.length > 0) {
    const item = autocompleteResults.value[autocompleteIndex.value]
    if (item) {
      selectAutocompleteItem(item)
    }
  }
}

async function handleSelectAutocomplete() {
  if (autocompleteResults.value.length > 0 && autocompleteIndex.value >= 0) {
    const item = autocompleteResults.value[autocompleteIndex.value]
    if (item) {
      selectAutocompleteItem(item)
      return
    }
  }
  await handleSaveViewerTag()
}

function selectAutocompleteItem(resItem: any) {
  const tagToAdd = resItem.tag.replace(/_/g, ' ')
  // Adopt suggestion into the input box instead of saving immediately
  newViewerTagInput.value = tagToAdd
  autocompleteResults.value = []
  nextTick(() => {
    const input = document.getElementById(`viewer-tag-input-${props.item.id}`) as HTMLInputElement
    input?.focus()
  })
}

async function onViewerInputBlur() {
  setTimeout(() => {
    // Click away should NOT automatically submit. Just close and clean up.
    newViewerTagInput.value = ''
    isAddingTag.value = false
    autocompleteResults.value = []
  }, 200)
}

function highlightMatch(text: string, query: string) {
  if (!query) return text
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  const idx = t.indexOf(q)
  if (idx > -1) {
    const originalMatch = text.slice(idx, idx + query.length)
    return text.slice(0, idx) + `<strong style="text-decoration: underline;">${originalMatch}</strong>` + text.slice(idx + query.length)
  }
  return text
}

function formatCount(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M'
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'k'
  }
  return String(count)
}

async function handleSaveViewerTag() {
  const raw = newViewerTagInput.value.trim()
  if (raw) {
    const parts = raw.split(/[,，;；\n\r]+/).map(s => s.trim()).filter(Boolean)
    const currentTags = [...(props.item.tags || [])]
    let changed = false
    const addedTags: string[] = []
    const existingTags: string[] = []
    for (const p of parts) {
      const cleaned = p.replace(/_/g, ' ')
      if (currentTags.includes(cleaned)) {
        existingTags.push(cleaned)
      } else {
        currentTags.push(cleaned)
        changed = true
        addedTags.push(cleaned)
      }
    }
    if (existingTags.length > 0 && addedTags.length === 0) {
      ElMessage.warning(`标签 "${existingTags.join(', ')}" 已存在`)
    }
    if (changed) {
      const success = await collectionsStore.updateItemTags(props.item.id, currentTags)
      if (success !== false) {
        lastAddedTag.value = raw
        localStorage.setItem('diy_last_added_tag', raw)
        ElMessage.success(`标签 "${addedTags.join(', ')}" 添加成功`)
      }
    }
  }
  newViewerTagInput.value = ''
  isAddingTag.value = false
}

async function handleRemoveViewerTag(tag: string) {
  const currentTags = (props.item.tags || []).filter(t => t !== tag)
  await collectionsStore.updateItemTags(props.item.id, currentTags)
}

function getSpaceName(spaceId?: string) {
  if (!spaceId) return ''
  const space = collectionsStore.themeSpaces.find(s => s.id === spaceId)
  return space ? space.name : ''
}

// ─── 监听显隐状态，自动初始化 Observer ───
watch(() => props.visible, (newVal) => {
  if (newVal) {
    dragPosition.value.dragged = false
    setupPositionObserver()
    // 兜底多次延迟更新
    setTimeout(updateTagsPosition, 50)
    setTimeout(updateTagsPosition, 150)
    setTimeout(updateTagsPosition, 300)
  } else {
    cleanupObserver()
  }
}, { immediate: true })

onUnmounted(() => {
  cleanupObserver()
})
</script>

<template>
  <div @mousedown.stop @touchstart.stop>
    <!-- Right Floating Draggable Tags Panel (Glassmorphism) -->
    <div
      v-show="visible"
      class="result-preview-tags-vertical-list"
      :class="{ 'is-dragging': isDragging }"
      :style="tagsPanelStyle"
      @mousedown.stop="startDragTagsPanel"
      @touchstart.stop="startTouchDragTagsPanel"
    >
      <!-- Panel Header with Title and Close Button ("隐藏" text) -->
      <div class="tags-panel-header">
        <span class="result-preview-label">标签管理</span>
        <div class="header-action-buttons" style="display: flex; align-items: center; gap: 8px;">
          <el-button
            type="primary"
            link
            size="small"
            title="复制全部标签 (逗号分隔)"
            @click.stop="handleCopyAllTags(item.tags || [])"
          >
            <el-icon><i-ep-document-copy /></el-icon>
          </el-button>
          <el-button
            type="info"
            link
            size="small"
            class="tags-panel-close-btn"
            @click.stop="closePanel"
          >
            隐藏
          </el-button>
        </div>
      </div>

      <!-- Folder Space Tag (Read-only) -->
      <div class="viewer-vertical-space-section">
        <span class="viewer-space-pill">
          <el-icon><i-ep-folder /></el-icon> {{ getSpaceName(item.space_id) || '未分类' }}
        </span>
      </div>

      <!-- Content Tags List (vertical) -->
      <div class="viewer-vertical-tags-container" @wheel.stop>
        <span
          v-for="tag in (item.tags || [])"
          :key="tag"
          class="viewer-custom-pill"
          title="点击复制，双击编辑此标签"
          @click.stop="handleCopyTag(tag)"
          @dblclick.stop="startEditViewerTag(tag)"
        >
          <template v-if="activeEditingTag === tag">
            <input
              :id="'viewer-tag-edit-' + item.id + '-' + tag"
              v-model="editingTagInput"
              class="viewer-free-tag-edit-input"
              @keyup.enter="handleSaveEditedViewerTag(tag)"
              @blur="handleSaveEditedViewerTag(tag)"
              @click.stop
            />
          </template>
          <template v-else>
            # {{ tag }}
            <span class="viewer-custom-pill-remove" @click.stop="handleRemoveViewerTag(tag)">×</span>
          </template>
        </span>
      </div>

      <!-- Actions row (Add Tag on the left, AI Tagging on the right) -->
      <div class="viewer-tag-actions-row" @wheel.stop>
        <!-- Add Tag button / input -->
        <div v-if="isAddingTag" class="viewer-add-tag-form" style="position: relative; width: 100%;">
          <input
            :id="'viewer-tag-input-' + item.id"
            v-model="newViewerTagInput"
            class="viewer-add-tag-input"
            placeholder="新标签..."
            @keyup.enter="handleSelectAutocomplete"
            @keydown.down.prevent.stop="navigateAutocomplete(1)"
            @keydown.up.prevent.stop="navigateAutocomplete(-1)"
            @keydown.tab.prevent.stop="selectHighlightedAutocomplete"
            @keydown.stop
            @blur="onViewerInputBlur"
            @click.stop
          />
          <!-- Autocomplete Dropdown -->
          <div v-if="autocompleteResults.length > 0" class="autocomplete-dropdown" @wheel.stop>
            <div
              v-for="(res, idx) in autocompleteResults"
              :key="res.tag"
              class="autocomplete-item"
              :class="{
                'is-highlighted': idx === autocompleteIndex,
                'is-existing': (item.tags || []).includes(res.tag.replace(/_/g, ' '))
              }"
              @mousedown.prevent
              @click="selectAutocompleteItem(res)"
            >
              <span class="tag-left" v-html="highlightMatch(res.tag, newViewerTagInput)"></span>
              <span class="tag-right">
                <span v-if="res.ch_name" class="tag-ch-name" :title="res.ch_name">{{ res.ch_name }}</span>
                <span class="tag-count">{{ formatCount(res.count) }}</span>
              </span>
            </div>
          </div>
        </div>
        <button v-else class="viewer-add-tag-btn" @click.stop="startAddViewerTag" title="添加标签">
          <el-icon><i-ep-plus /></el-icon>
        </button>

        <!-- AI tagging button -->
        <button
          class="viewer-ai-tag-btn"
          :class="{ 'is-loading': isAiTagging }"
          :disabled="isAiTagging"
          @click.stop="handleAiAutoTag"
          title="AI 读图自动打标 (doubao-vision)"
        >
          <el-icon><i-ep-magic-stick /></el-icon>
        </button>
      </div>
    </div>

    <!-- Right Edge Activation FAB -->
    <div
      v-show="!visible"
      class="result-preview-tags-trigger-fab"
      @click.stop="openPanel"
      title="显示标签"
    >
      <el-icon><i-ep-price-tag /></el-icon>
    </div>
  </div>
</template>

<style scoped>
/* ─── Right Floating Vertical Tags List Styles ─── */
.result-preview-tags-vertical-list {
  position: fixed;
  z-index: 10;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 80vh;
  padding: 14px;
  box-sizing: border-box;
  background: rgba(30, 30, 38, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  width: 320px;
  transition: left 0.15s ease, right 0.15s ease, top 0.15s ease;
  cursor: grab;
}

.result-preview-tags-vertical-list.is-dragging {
  transition: none !important;
  cursor: grabbing !important;
}

/* Hide scrollbar for Chrome, Safari and Opera */
.result-preview-tags-vertical-list::-webkit-scrollbar {
  display: none;
}

/* Hide scrollbar for IE, Edge and Firefox */
.result-preview-tags-vertical-list {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}

/* Panel Header */
.tags-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 4px;
}

.tags-panel-close-btn {
  color: rgba(255, 255, 255, 0.75) !important;
  flex-shrink: 0;
  padding: 0;
  height: auto;
}

.tags-panel-close-btn:hover {
  color: #fff !important;
}

.result-preview-label {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.06em;
}

.viewer-vertical-space-section {
  display: flex;
  justify-content: flex-start;
  width: 100%;
}

.viewer-vertical-tags-container {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-content: start;
  gap: 8px;
  width: 100%;
  flex: 1;
  overflow-y: auto;
  max-height: calc(80vh - 140px);
  padding-right: 2px;
}

.viewer-vertical-tags-container::-webkit-scrollbar {
  display: none;
}
.viewer-vertical-tags-container {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.viewer-space-pill {
  background: rgba(167, 139, 250, 0.12);
  border: 1px solid rgba(167, 139, 250, 0.25);
  color: #c7d2fe;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  backdrop-filter: blur(8px);
  width: 100%;
  box-sizing: border-box;
}

.viewer-custom-pill {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.85);
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: all 0.2s ease;
  width: 100%;
  box-sizing: border-box;
}

.viewer-custom-pill:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.viewer-custom-pill-remove {
  cursor: pointer;
  color: rgba(255, 255, 255, 0.45);
  font-weight: normal;
  font-size: 14px;
  margin-left: auto;
  transition: color 0.15s;
  display: flex;
  align-items: center;
}

.viewer-custom-pill-remove:hover {
  color: #f87171;
}

.viewer-tag-actions-row {
  position: relative;
  z-index: 999;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 4px;
}

.viewer-ai-tag-btn {
  flex: 1;
  height: 28px;
  border-radius: 14px;
  border: 1px solid rgba(16, 185, 129, 0.25);
  background: rgba(16, 185, 129, 0.1);
  color: #a7f3d0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  backdrop-filter: blur(8px);
  position: relative;
  box-sizing: border-box;
}

.viewer-ai-tag-btn:hover:not(:disabled) {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.2);
  color: #fff;
}

.viewer-ai-tag-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Magic Wand Flowing Border Light & Icon Waving animations */
@keyframes magic-wand-glow {
  0%, 100% {
    box-shadow: 0 0 4px rgba(16, 185, 129, 0.2);
  }
  50% {
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.6);
  }
}

@keyframes magic-rotation {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes magic-wave {
  0%, 100% {
    transform: rotate(0deg) scale(1);
  }
  25% {
    transform: rotate(-15deg) scale(1.1);
  }
  75% {
    transform: rotate(15deg) scale(1.1);
  }
}

.viewer-ai-tag-btn.is-loading {
  border-color: transparent !important;
  background: rgba(30, 30, 38, 0.65) !important;
  overflow: hidden;
  animation: magic-wand-glow 2s infinite ease-in-out;
  opacity: 1 !important;
  cursor: wait;
}

.viewer-ai-tag-btn.is-loading::after {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: conic-gradient(from 0deg, transparent 50%, rgba(167, 243, 208, 0.6) 80%, #10b981 95%, transparent 100%);
  animation: magic-rotation 1.5s infinite linear;
  border-radius: 50%;
  z-index: 0;
  pointer-events: none;
}

.viewer-ai-tag-btn.is-loading::before {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  right: 1px;
  bottom: 1px;
  background: rgba(30, 30, 38, 0.95);
  border-radius: 13px;
  z-index: 1;
}

.viewer-ai-tag-btn.is-loading .el-icon {
  position: relative;
  z-index: 2;
  animation: magic-wave 1s infinite ease-in-out;
  color: #a7f3d0 !important;
}

.viewer-add-tag-btn {
  flex: 1;
  height: 28px;
  border-radius: 14px;
  border: 1px dashed rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  backdrop-filter: blur(8px);
}

.viewer-add-tag-btn:hover {
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.viewer-add-tag-form {
  display: flex;
  flex: 1;
}

.viewer-add-tag-input {
  width: 100%;
  height: 28px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  border-radius: 14px;
  padding: 0 10px;
  font-size: 11px;
  outline: none;
  box-sizing: border-box;
  backdrop-filter: blur(8px);
}

.viewer-add-tag-input:focus {
  border-color: #a78bfa;
  background: rgba(255, 255, 255, 0.12);
}

.viewer-free-tag-edit-input {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: #fff;
  border-radius: 12px;
  padding: 0 6px;
  font-size: 11px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.viewer-free-tag-edit-input:focus {
  border-color: #10b981;
}

/* Right Edge Activation FAB */
.result-preview-tags-trigger-fab {
  position: fixed;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(30, 30, 38, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #a7f3d0;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.result-preview-tags-trigger-fab:hover {
  background: rgba(30, 30, 38, 0.65);
  transform: translateY(-50%) scale(1.1);
  color: #fff;
}

/* Autocomplete Dropdown Styles */
.autocomplete-dropdown {
  position: absolute;
  left: 0;
  width: 292px;
  bottom: 34px;
  background: rgba(20, 20, 25, 0.95);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  max-height: 250px;
  overflow-y: auto;
  z-index: 10002;
}

.autocomplete-dropdown::-webkit-scrollbar {
  display: none;
}
.autocomplete-dropdown {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.autocomplete-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
  transition: all 0.15s;
}

.autocomplete-item:last-child {
  border-bottom: none;
}

.autocomplete-item.is-highlighted {
  background: rgba(167, 139, 250, 0.25);
  color: #fff;
}

.autocomplete-item.is-existing {
  background: rgba(251, 191, 36, 0.15);
  color: #fde047;
}

.autocomplete-item.is-existing.is-highlighted {
  background: rgba(251, 191, 36, 0.3);
}

.tag-left {
  text-align: left;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  color: rgba(255, 255, 255, 0.45);
}

.tag-ch-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  text-align: right;
  color: rgba(255, 255, 255, 0.6);
}

.tag-count {
  font-size: 9px;
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 4px;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.7);
}
</style>
