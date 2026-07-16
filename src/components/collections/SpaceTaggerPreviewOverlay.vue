<script setup lang="ts">
import { ref, watch, computed, nextTick, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
  activeFile: { name: string; path: string; cover_url: string; tags: string[] } | null
  tagsFrequency: { tag: string; count: number }[]
  filesLength: number
  bulkAddedTags: Set<string>
  isSingleInterrogating: boolean
  fastMap: Record<string, string>
  highlightedTag?: string
  showChinese?: boolean
  selectedCategory?: string
  availableCategories?: string[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'copy-all', tags: string[]): void
  (e: 'copy-tag', tag: string): void
  (e: 'remove-tag', tag: string): void
  (e: 'save-tag', rawTagInput: string, category?: string): void
  (e: 'single-interrogate'): void
  (e: 'update:showChinese', val: boolean): void
}>()

const isAddingOverlayTag = ref(false)
const newOverlayTagInput = ref('')
const lastAddedTag = ref(localStorage.getItem('diy_last_added_tag') || '')

// ─── Autocomplete / Fuzzy Recommendations Logic ───
const autocompleteResults = ref<any[]>([])
const autocompleteIndex = ref(0)

watch(newOverlayTagInput, async (newVal) => {
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
  
  // 保持高亮项在滚动容器视口内可见
  nextTick(() => {
    const container = document.querySelector('.autocomplete-dropdown') as HTMLElement
    if (container) {
      const items = container.querySelectorAll('.autocomplete-item')
      const activeEl = items[autocompleteIndex.value] as HTMLElement
      if (activeEl) {
        const containerTop = container.scrollTop
        const containerBottom = containerTop + container.clientHeight
        const elemTop = activeEl.offsetTop
        const elemBottom = elemTop + activeEl.offsetHeight
        
        if (elemTop < containerTop) {
          container.scrollTop = elemTop
        } else if (elemBottom > containerBottom) {
          container.scrollTop = elemBottom - container.clientHeight
        }
      }
    }
  })
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
  await handleSaveOverlayTag()
}

function selectAutocompleteItem(resItem: any) {
  const tagToAdd = resItem.tag.replace(/_/g, ' ')
  newOverlayTagInput.value = tagToAdd
  autocompleteResults.value = []
  nextTick(() => {
    const input = document.getElementById('lora-viewer-tag-input') as HTMLInputElement
    input?.focus()
  })
}

function onOverlayInputBlur() {
  setTimeout(() => {
    newOverlayTagInput.value = ''
    isAddingOverlayTag.value = false
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

function startAddOverlayTag() {
  isAddingOverlayTag.value = true
  newOverlayTagInput.value = lastAddedTag.value
  nextTick(() => {
    const input = document.getElementById('lora-viewer-tag-input') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  })
}

async function handleSaveOverlayTag() {
  const raw = newOverlayTagInput.value.trim()
  if (raw) {
    emit('save-tag', raw, selectedCategory.value || props.selectedCategory)
    lastAddedTag.value = raw
    localStorage.setItem('diy_last_added_tag', raw)
  }
  newOverlayTagInput.value = ''
  isAddingOverlayTag.value = false
}

// ─── Drag Overlay Logic ───
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
    target.classList.contains('lora-viewer-custom-pill-remove') ||
    target.closest('.lora-viewer-custom-pill-remove')
  ) {
    return
  }
  e.preventDefault()
  isDragging.value = true
  const el = document.querySelector('.lora-preview-tags-vertical-list') as HTMLElement
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
    target.classList.contains('lora-viewer-custom-pill-remove') ||
    target.closest('.lora-viewer-custom-pill-remove')
  ) {
    return
  }

  isDragging.value = true
  const el = document.querySelector('.lora-preview-tags-vertical-list') as HTMLElement
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

const rightTagsStyle = ref<Record<string, string>>({
  left: 'auto',
  right: '40px',
  top: '120px',
  transform: 'none',
  alignItems: 'flex-start'
})

let observer: ResizeObserver | null = null

function updateTagsPosition() {
  const img = document.querySelector('.el-image-viewer__wrapper .el-image-viewer__img') as HTMLImageElement
  if (img) {
    const rect = img.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    let targetLeft = rect.right + 20

    if (viewportWidth - targetLeft < 340) {
      rightTagsStyle.value = {
        left: 'auto',
        right: '40px',
        top: '120px',
        transform: 'none',
        alignItems: 'flex-start'
      }
    } else {
      rightTagsStyle.value = {
        left: `${targetLeft}px`,
        right: 'auto',
        top: `${rect.top}px`,
        transform: 'none',
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

const sortMode = ref<'type' | 'frequency'>('type')
const selectedCategory = ref('')
const isHovered = ref(false)

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (!props.modelValue || !isHovered.value) return
  
  // 避开新建标签输入框的自动完成上下键
  if (document.activeElement?.id === 'lora-viewer-tag-input') {
    return
  }

  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    e.stopPropagation()

    const list = ["", ...availableCategories.value]
    const currentIdx = list.indexOf(selectedCategory.value)
    if (currentIdx === -1) return

    let nextIdx = 0
    if (e.key === 'ArrowDown') {
      nextIdx = (currentIdx + 1) % list.length
    } else {
      nextIdx = (currentIdx - 1 + list.length) % list.length
    }
    selectedCategory.value = list[nextIdx]
    
    ElMessage({
      message: `已过滤类别：${selectedCategory.value || '全部类别'}`,
      type: 'info',
      duration: 1000,
      grouping: true
    })
  }
}

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    dragPosition.value.dragged = false
    setupPositionObserver()
    selectedCategory.value = props.selectedCategory || ''
    window.addEventListener('keydown', handleGlobalKeyDown, true)
    setTimeout(updateTagsPosition, 50)
    setTimeout(updateTagsPosition, 150)
    setTimeout(updateTagsPosition, 300)
  } else {
    cleanupObserver()
    isHovered.value = false
    window.removeEventListener('keydown', handleGlobalKeyDown, true)
  }
}, { immediate: true })

onUnmounted(() => {
  cleanupObserver()
  window.removeEventListener('keydown', handleGlobalKeyDown, true)
})

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



const availableCategories = computed(() => {
  return ["motion", "face", "outfit", "hair", "item", "scene", "character", "style", "quality", "body", "camera", "detail", "concept", "General"]
})

function getTagChineseName(tag: string): string {
  const tagLower = tag.toLowerCase().trim()
  const item = props.tagsFrequency.find(t => t.tag.toLowerCase().trim() === tagLower)
  return item && item.ch_name ? item.ch_name : tag
}

function getSortedTagsForFile(fileTags: string[]) {
  if (!fileTags) return []
  
  // 1. 过滤分类
  let filtered = [...fileTags]
  if (selectedCategory.value) {
    filtered = filtered.filter(tag => {
      const cat = props.fastMap[tag.toLowerCase().trim().replace(/\s+/g, '_')] || 'General'
      return cat === selectedCategory.value
    })
  }

  const freqMap = new Map<string, number>()
  props.tagsFrequency.forEach(item => {
    freqMap.set(item.tag.toLowerCase().trim(), item.count)
  })
  
  const mode = sortMode.value

  // 2. 排序方式
  if (mode === 'type') {
    const categoryOrder = [
      'character', 'outfit', 'hair', 'motion', 'face', 'body', 
      'scene', 'camera', 'style', 'concept', 'detail', 'item', 
      'General', 'quality'
    ]
    return filtered.sort((a, b) => {
      const catA = props.fastMap[a.toLowerCase().trim().replace(/\s+/g, '_')] || 'General'
      const catB = props.fastMap[b.toLowerCase().trim().replace(/\s+/g, '_')] || 'General'
      const idxA = categoryOrder.indexOf(catA)
      const idxB = categoryOrder.indexOf(catB)
      
      if (idxA !== idxB) {
        return idxA - idxB
      }
      
      const countA = freqMap.get(a.toLowerCase().trim()) ?? 1
      const countB = freqMap.get(b.toLowerCase().trim()) ?? 1
      return countB - countA
    })
  } else {
    const total = props.filesLength || 1
    return filtered.sort((a, b) => {
      const countA = freqMap.get(a.toLowerCase().trim()) ?? 1
      const countB = freqMap.get(b.toLowerCase().trim()) ?? 1
      
      const isTriggerA = countA >= total * 0.95 && total > 1
      const isTriggerB = countB >= total * 0.95 && total > 1
      
      if (isTriggerA && !isTriggerB) return 1
      if (!isTriggerA && isTriggerB) return -1
      
      return countA - countB
    })
  }
}

// 13 Attractors color palettes adapted for dark glassmorphism preview panel
const colorThemesOverlay: Record<string, { bg: string, border: string, text: string }> = {
  motion: { bg: 'rgba(251, 146, 60, 0.15)', border: 'rgba(251, 146, 60, 0.3)', text: '#fdba74' },
  face: { bg: 'rgba(244, 63, 94, 0.15)', border: 'rgba(244, 63, 94, 0.3)', text: '#fda4af' },
  outfit: { bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.3)', text: '#d8b4fe' },
  hair: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)', text: '#fde047' },
  item: { bg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.3)', text: '#c7d2fe' },
  scene: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)', text: '#a7f3d0' },
  character: { bg: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.3)', text: '#a5f3fc' },
  style: { bg: 'rgba(244, 114, 182, 0.15)', border: 'rgba(244, 114, 182, 0.3)', text: '#f9a8d4' },
  quality: { bg: 'rgba(234, 179, 8, 0.15)', border: 'rgba(234, 179, 8, 0.3)', text: '#fef08a' },
  body: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', text: '#fca5a5' },
  camera: { bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.3)', text: '#bae6fd' },
  detail: { bg: 'rgba(217, 70, 239, 0.15)', border: 'rgba(217, 70, 239, 0.3)', text: '#f5d0fe' },
  concept: { bg: 'rgba(129, 140, 248, 0.15)', border: 'rgba(129, 140, 248, 0.3)', text: '#c7d2fe' }
}

function isHighlighted(tag: string): boolean {
  if (!props.highlightedTag) return false
  const tagLower = tag.toLowerCase().trim()
  const tagNormalized = tagLower.replace(/\s+/g, '_')
  const q = props.highlightedTag.toLowerCase().trim()
  
  if (tagNormalized.includes(q)) return true
  
  const freqItem = props.tagsFrequency.find(t => t.tag.toLowerCase().trim() === tagNormalized)
  if (freqItem && freqItem.ch_name) {
    if (freqItem.ch_name.toLowerCase().includes(q)) {
      return true
    }
  }
  return false
}

function getTagStyle(tag: string) {
  const tagLower = tag.toLowerCase().trim()
  const total = props.filesLength || 1
  const freqItem = props.tagsFrequency.find(t => t.tag.toLowerCase().trim() === tagLower)
  const count = freqItem ? freqItem.count : 1
  
  const mode = sortMode.value

  // 优先高亮：如果在搜索或者正在批量操作这个标签，在暗色背景下给出显眼的半透明红底亮红框发光效果
  if (isHighlighted(tag)) {
    return {
      backgroundColor: 'rgba(239, 68, 68, 0.4)',  // 半透明红底
      borderColor: '#ef4444',                      // 亮红边框
      borderWidth: '2px',
      color: '#ffffff',                            // 白色文字
      fontWeight: '700',
      boxShadow: '0 0 12px rgba(239, 68, 68, 0.7)',
      transform: 'scale(1.12)',
      zIndex: 5,
      backdropFilter: 'blur(8px)',
      webkitBackdropFilter: 'blur(8px)'
    }
  }

  // 手动新增突出色
  if (props.bulkAddedTags.has(tagLower)) {
    return {
      backgroundColor: 'rgba(251, 191, 36, 0.15)',
      borderColor: 'rgba(251, 191, 36, 0.3)',
      color: '#fcd34d',
      fontWeight: '600',
      backdropFilter: 'blur(8px)',
      webkitBackdropFilter: 'blur(8px)'
    }
  }

  if (mode === 'type') {
    const cat = props.fastMap[tagLower.replace(/\s+/g, '_')] || 'General'
    if (colorThemesOverlay[cat]) {
      return {
        backgroundColor: colorThemesOverlay[cat].bg,
        borderColor: colorThemesOverlay[cat].border,
        color: colorThemesOverlay[cat].text,
        fontWeight: '500',
        backdropFilter: 'blur(8px)',
        webkitBackdropFilter: 'blur(8px)'
      }
    }
    return {
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      borderColor: 'rgba(255, 255, 255, 0.12)',
      color: 'rgba(255, 255, 255, 0.85)',
      backdropFilter: 'blur(8px)',
      webkitBackdropFilter: 'blur(8px)'
    }
  } else {
    // 词频模式
    const ratio = count / total
    
    if (ratio >= 0.95 && total > 1) {
      return {
        backgroundColor: 'rgba(251, 191, 36, 0.15)',
        borderColor: 'rgba(251, 191, 36, 0.3)',
        color: '#fcd34d',
        fontWeight: '600',
        backdropFilter: 'blur(8px)',
        webkitBackdropFilter: 'blur(8px)'
      }
    }
    
    if (ratio <= 0.15 || count <= 2) {
      return {
        backgroundColor: 'rgba(52, 211, 153, 0.15)',
        borderColor: 'rgba(52, 211, 153, 0.3)',
        color: '#a7f3d0',
        backdropFilter: 'blur(8px)',
        webkitBackdropFilter: 'blur(8px)'
      }
    }
    
    if (ratio <= 0.5) {
      return {
        backgroundColor: 'rgba(163, 230, 53, 0.12)',
        borderColor: 'rgba(163, 230, 53, 0.25)',
        color: '#e2f8a0',
        backdropFilter: 'blur(8px)',
        webkitBackdropFilter: 'blur(8px)'
      }
    }
    
    return {
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      borderColor: 'rgba(255, 255, 255, 0.12)',
      color: 'rgba(255, 255, 255, 0.85)',
      backdropFilter: 'blur(8px)',
      webkitBackdropFilter: 'blur(8px)'
    }
  }
}
</script>

<template>
  <div
    v-if="modelValue && activeFile"
    class="lora-preview-tags-vertical-list"
    :class="{ 'is-dragging': isDragging }"
    :style="tagsPanelStyle"
    @mousedown.stop="startDragTagsPanel"
    @touchstart.stop="startTouchDragTagsPanel"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Panel Header -->
    <div class="lora-tags-panel-header">
      <span class="lora-preview-label">训练标注管理</span>
      <div class="lora-header-actions" style="display: flex; align-items: center; gap: 8px;">
        <!-- 中英别名切换 -->
        <el-button
          type="warning"
          link
          size="small"
          :title="props.showChinese ? '显示英文名' : '显示中文名'"
          @click.stop="emit('update:showChinese', !props.showChinese)"
        >
          <span style="font-weight: 700; font-size: 11px; color: #a7f3d0; background: rgba(52,211,153,0.1); padding: 2px 4px; border-radius: 3px;">{{ props.showChinese ? '中' : '英' }}</span>
        </el-button>

        <!-- 过滤分类下拉 -->
        <el-dropdown trigger="click" popper-class="lora-glass-dropdown" @command="cat => selectedCategory = cat" @click.stop>
          <el-button type="info" link size="small" title="过滤类别">
            <el-icon style="color: #93c5fd;"><i-ep-filter /></el-icon>
            <span v-if="selectedCategory" :style="{ color: colorThemesOverlay[selectedCategory]?.text || '#93c5fd' }" style="font-size: 9px; margin-left: 2px; max-width: 50px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ selectedCategory }}</span>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="" style="color: #ffffff; font-weight: bold; background: transparent;">全部类别</el-dropdown-item>
              <el-dropdown-item 
                v-for="cat in availableCategories" 
                :key="cat" 
                :command="cat"
                :class="{ 'is-active': selectedCategory === cat }"
                :style="{ color: colorThemesOverlay[cat]?.text || '#cbd5e1', fontWeight: selectedCategory === cat ? '600' : 'normal' }"
              >
                {{ cat }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <!-- 排序方式切换 -->
        <el-button
          type="primary"
          link
          size="small"
          :title="sortMode === 'type' ? '当前排序：按类型' : '当前排序：按词频'"
          @click.stop="sortMode = sortMode === 'type' ? 'frequency' : 'type'"
        >
          <el-icon v-if="sortMode === 'type'" style="color: #fca5a5;"><i-ep-sort /></el-icon>
          <el-icon v-else style="color: #fca5a5;"><i-ep-operation /></el-icon>
        </el-button>

        <el-button
          type="primary"
          link
          size="small"
          title="复制全部标签 (逗号分隔)"
          @click.stop="emit('copy-all', activeFile.tags)"
        >
          <el-icon style="color: #e2e8f0;"><i-ep-document-copy /></el-icon>
        </el-button>
        <el-button
          type="info"
          link
          size="small"
          class="lora-tags-panel-close-btn"
          @click.stop="emit('update:modelValue', false)"
        >
          隐藏
        </el-button>
      </div>
    </div>

    <div class="lora-viewer-filename-section" :title="activeFile.name">
      <span class="lora-filename-pill">
        <el-icon><i-ep-picture /></el-icon> {{ activeFile.name.length > 15 ? activeFile.name.slice(0, 15) + '...' : activeFile.name }}
      </span>
    </div>

    <!-- Tags Container -->
    <div class="lora-viewer-vertical-tags-container" @wheel.stop>
      <span
        v-for="tag in getSortedTagsForFile(activeFile.tags)"
        :key="tag"
        class="lora-viewer-custom-pill"
        :style="getTagStyle(tag)"
        title="点击复制标签"
        @click.stop="emit('copy-tag', tag)"
      >
        # {{ props.showChinese ? getTagChineseName(tag) : tag }}
        <span class="lora-viewer-custom-pill-remove" @click.stop="emit('remove-tag', tag)">×</span>
      </span>
    </div>

    <!-- Actions row -->
    <div class="lora-viewer-tag-actions-row" @wheel.stop>
      <div v-if="isAddingOverlayTag" class="lora-viewer-add-tag-form" style="position: relative; width: 100%;">
        <input
          id="lora-viewer-tag-input"
          v-model="newOverlayTagInput"
          class="lora-viewer-add-tag-input"
          placeholder="新标签..."
          @keyup.enter="handleSaveOverlayTag"
          @keydown.down.prevent.stop="navigateAutocomplete(1)"
          @keydown.up.prevent.stop="navigateAutocomplete(-1)"
          @keydown.tab.prevent.stop="selectHighlightedAutocomplete"
          @keydown.stop
          @blur="onOverlayInputBlur"
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
              'is-existing': activeFile.tags.includes(res.tag.replace(/_/g, ' '))
            }"
            @mousedown.prevent
            @click="selectAutocompleteItem(res)"
          >
            <span class="tag-left" v-html="highlightMatch(res.tag, newOverlayTagInput)"></span>
            <span class="tag-right">
              <span v-if="res.ch_name" class="tag-ch-name" :title="res.ch_name">{{ res.ch_name }}</span>
              <span class="tag-count">{{ formatCount(res.count) }}</span>
            </span>
          </div>
        </div>
      </div>
      <button v-else class="lora-viewer-add-tag-btn" @click.stop="startAddOverlayTag" title="添加标签">
        <el-icon><i-ep-plus /></el-icon>
      </button>

      <!-- Magic wand single interrogation -->
      <button
        class="lora-viewer-ai-tag-btn"
        :class="{ 'is-loading': isSingleInterrogating }"
        :disabled="isSingleInterrogating"
        @click.stop="emit('single-interrogate')"
        title="一键反推新增标签 (WD14)"
      >
        <el-icon><i-ep-magic-stick /></el-icon>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ─── Lora Floating Draggable Tags List Styles ─── */
.lora-preview-tags-vertical-list {
  position: fixed;
  z-index: 10000;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 80vh;
  padding: 14px;
  box-sizing: border-box;
  background: rgba(30, 30, 38, 0.65);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  width: 320px;
  transition: left 0.15s ease, right 0.15s ease, top 0.15s ease;
  cursor: grab;
}

.lora-preview-tags-vertical-list.is-dragging {
  transition: none !important;
  cursor: grabbing !important;
}

.lora-preview-tags-vertical-list::-webkit-scrollbar {
  display: none;
}
.lora-preview-tags-vertical-list {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.lora-tags-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.lora-preview-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.05em;
}

.lora-tags-panel-close-btn {
  color: rgba(255, 255, 255, 0.8) !important;
  flex-shrink: 0;
  padding: 0;
  height: auto;
}

.lora-tags-panel-close-btn:hover {
  color: #fff !important;
}

.lora-viewer-filename-section {
  display: flex;
  width: 100%;
}

.lora-filename-pill {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e2e8f0;
  padding: 5px 10px;
  border-radius: 20px;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  box-sizing: border-box;
}

.lora-viewer-vertical-tags-container {
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

.lora-viewer-vertical-tags-container::-webkit-scrollbar {
  display: none;
}
.lora-viewer-vertical-tags-container {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.lora-viewer-custom-pill {
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  border: 1px solid transparent;
  width: 100%;
  box-sizing: border-box;
  font-weight: 500;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.lora-viewer-custom-pill-remove {
  cursor: pointer;
  color: rgba(0, 0, 0, 0.4);
  font-weight: bold;
  font-size: 13px;
  margin-left: auto;
  transition: color 0.15s;
  display: flex;
  align-items: center;
}

.lora-viewer-custom-pill-remove:hover {
  color: #ef4444;
}

.lora-viewer-tag-actions-row {
  position: relative;
  z-index: 999;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 4px;
}

.lora-viewer-ai-tag-btn {
  flex: 1;
  height: 28px;
  border-radius: 14px;
  border: 1px solid rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.15);
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

.lora-viewer-ai-tag-btn:hover:not(:disabled) {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.3);
  color: #fff;
}

.lora-viewer-ai-tag-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.lora-viewer-ai-tag-btn.is-loading {
  border-color: transparent !important;
  background: rgba(30, 30, 38, 0.65) !important;
  overflow: hidden;
  animation: magic-wand-glow 2s infinite ease-in-out;
  opacity: 1 !important;
  cursor: wait;
}

.lora-viewer-ai-tag-btn.is-loading::after {
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

.lora-viewer-ai-tag-btn.is-loading::before {
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

.lora-viewer-ai-tag-btn.is-loading .el-icon {
  position: relative;
  z-index: 2;
  animation: magic-wave 1s infinite ease-in-out;
  color: #a7f3d0 !important;
}

.lora-viewer-add-tag-btn {
  flex: 1;
  height: 28px;
  border-radius: 14px;
  border: 1px dashed rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  backdrop-filter: blur(8px);
}

.lora-viewer-add-tag-btn:hover {
  border-color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.lora-viewer-add-tag-form {
  display: flex;
  flex: 1;
}

.lora-viewer-add-tag-input {
  width: 100%;
  height: 28px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: #fff;
  border-radius: 14px;
  padding: 0 10px;
  font-size: 11px;
  outline: none;
  box-sizing: border-box;
  backdrop-filter: blur(8px);
}

.lora-viewer-add-tag-input:focus {
  border-color: #a78bfa;
  background: rgba(255, 255, 255, 0.15);
}

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

@keyframes magic-wand-glow {
  0%, 100% { box-shadow: 0 0 5px rgba(16, 185, 129, 0.2), 0 0 15px rgba(16, 185, 129, 0.1); }
  50% { box-shadow: 0 0 15px rgba(16, 185, 129, 0.5), 0 0 30px rgba(16, 185, 129, 0.3); }
}

@keyframes magic-rotation {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes magic-wave {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-2px) rotate(-8deg); }
  75% { transform: translateY(1px) rotate(8deg); }
}

</style>

<style>
/* ─── Popper Dropdown Global Glassmorphism Style ─── */
.lora-glass-dropdown {
  background: rgba(20, 26, 38, 0.92) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  border-radius: 8px !important;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6) !important;
}

.lora-glass-dropdown .el-dropdown-menu {
  background: transparent !important;
  padding: 6px 0 !important;
  border: none !important;
}

.lora-glass-dropdown .el-dropdown-menu__item {
  transition: all 0.2s ease !important;
  padding: 8px 16px !important;
  background: transparent !important;
}

.lora-glass-dropdown .el-dropdown-menu__item:hover,
.lora-glass-dropdown .el-dropdown-menu__item:focus {
  background: rgba(255, 255, 255, 0.08) !important;
}

.lora-glass-dropdown .el-dropdown-menu__item.is-active {
  background: rgba(255, 255, 255, 0.15) !important;
  font-weight: 600 !important;
}
</style>
