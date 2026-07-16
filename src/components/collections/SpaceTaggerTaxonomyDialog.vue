<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useLanguage } from '../../views/composables/useLanguage'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
  taxonomy: Record<string, any>
  history: Record<string, { tag: string; cluster_id: number; concept_name: string }[]>
  tagsFrequency: { tag: string; count: number }[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'reassign', payload: { tag: string; targetCategory: string }): void
}>()

const activeTab = ref('')
const { showChinese, toggleLanguage } = useLanguage()
const dragOverTab = ref<string | null>(null)
const searchQuery = ref('')

// Get all category paths (e.g., "hair", "outfit", etc.)
const categories = computed(() => {
  // Sort category paths so that our attractors are presented nicely (dissolved detail)
  const order = ["motion", "face", "outfit", "hair", "item", "scene", "character", "style", "quality", "body", "camera", "concept"]
  const keys = Object.keys(props.taxonomy)
  return keys.sort((a, b) => {
    const idxA = order.indexOf(a)
    const idxB = order.indexOf(b)
    if (idxA > -1 && idxB > -1) return idxA - idxB
    if (idxA > -1) return -1
    if (idxB > -1) return 1
    return a.localeCompare(b)
  }).filter(c => c !== 'detail') // 防御性移除 detail
})

// Set default active tab once categories are loaded
watch(categories, (newVal) => {
  if (newVal.length > 0 && !activeTab.value) {
    activeTab.value = newVal[0]
  }
}, { immediate: true })

// Get sorted list of tags for the currently active tab
const currentTags = computed(() => {
  const path = activeTab.value
  
  // Create frequency lookup map
  const freqMap = new Map<string, number>()
  props.tagsFrequency.forEach(item => {
    freqMap.set(item.tag.toLowerCase().trim(), item.count)
  })

  let enriched: any[] = []
  
  if (path === 'General') {
    const categorizedTags = new Set<string>()
    Object.keys(props.history).forEach(cat => {
      if (cat !== 'General' && cat !== 'detail') {
        (props.history[cat] || []).forEach(h => {
          categorizedTags.add(h.tag.toLowerCase().trim())
        })
      }
    })
    
    props.tagsFrequency.forEach(item => {
      const tagLower = item.tag.toLowerCase().trim()
      if (!categorizedTags.has(tagLower)) {
        enriched.push({
          tag: item.tag,
          concept_name: '',
          count: item.count
        })
      }
    })
  } else {
    const list = props.history[path] || []
    enriched = list.map(item => {
      const count = freqMap.get(item.tag.toLowerCase().trim()) ?? 0
      return {
        tag: item.tag,
        concept_name: item.concept_name,
        count
      }
    })
  }
  
  // Filter by searchQuery if present
  let result = enriched
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    result = result.filter(item => 
      item.tag.toLowerCase().includes(q) || 
      (item.concept_name && item.concept_name.toLowerCase().includes(q))
    )
  }
  
  return result.sort((a, b) => {
    const isA = isHolyMedoid(a.tag)
    const isB = isHolyMedoid(b.tag)
    if (isA && !isB) return -1
    if (!isA && isB) return 1
    return b.count - a.count
  })
})

// Copy tag value on click
async function handleCopy(tag: string) {
  try {
    await navigator.clipboard.writeText(tag)
    ElMessage.success(`已复制标签: ${tag}`)
  } catch (e) {
    ElMessage.error('复制失败')
  }
}

// Drag start handler for tag cards
function onDragStart(e: DragEvent, tag: string) {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tag)
  }
}

// Drag over handler for Category Tabs
function onDragOver(e: DragEvent, category: string) {
  e.preventDefault()
  dragOverTab.value = category
}

// Drag leave handler
function onDragLeave() {
  dragOverTab.value = null
}

// Drop handler to trigger reassign
function onDrop(e: DragEvent, targetCategory: string) {
  e.preventDefault()
  dragOverTab.value = null
  const tag = e.dataTransfer?.getData('text/plain')
  if (tag) {
    emit('reassign', { tag, targetCategory })
  }
}

// 12 Attractors color palettes for premium tags styling (dissolved detail)
const colorThemes: Record<string, { bg: string, border: string, text: string }> = {
  motion: { bg: '#fff7ed', border: '#ffedd5', text: '#c2410c' }, // Orange
  face: { bg: '#fff1f2', border: '#ffe4e6', text: '#be123c' }, // Rose
  outfit: { bg: '#faf5ff', border: '#f3e8ff', text: '#6b21a8' }, // Purple
  hair: { bg: '#fffbeb', border: '#fef3c7', text: '#b45309' }, // Amber
  item: { bg: '#eef2ff', border: '#e0e7ff', text: '#3730a3' }, // Indigo
  scene: { bg: '#f0fdf4', border: '#dcfce7', text: '#15803d' }, // Green
  character: { bg: '#ecfeff', border: '#cffafe', text: '#0e7490' }, // Cyan
  style: { bg: '#fdf4ff', border: '#fae8ff', text: '#86198f' }, // Fuchsia (originally detail pink)
  quality: { bg: '#fffdf5', border: '#fef9c3', text: '#854d0e' }, // Gold/Yellow
  body: { bg: '#fff5f5', border: '#fed7d7', text: '#9b2c2c' }, // Coral/Red
  camera: { bg: '#f0f9ff', border: '#e0f2fe', text: '#0369a1' }, // Light Blue
  concept: { bg: '#e0e7ff', border: '#c7d2fe', text: '#4338ca' } // Violet
}

function getTabStyle(cat: string) {
  const theme = colorThemes[cat]
  if (!theme) {
    // For General tab
    return activeTab.value === cat 
      ? { backgroundColor: '#475569', borderColor: '#475569', color: '#ffffff', fontWeight: 'bold' }
      : { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0', color: '#475569' }
  }
  if (activeTab.value === cat) {
    return {
      backgroundColor: theme.text,
      borderColor: theme.text,
      color: '#ffffff',
      fontWeight: 'bold'
    }
  } else {
    return {
      backgroundColor: theme.bg,
      borderColor: theme.border,
      color: theme.text
    }
  }
}

function getTagStyle(cat: string) {
  const theme = colorThemes[cat]
  if (!theme) {
    // For General tab
    return { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#475569' }
  }
  return {
    backgroundColor: theme.bg,
    borderColor: theme.border,
    color: theme.text
  }
}

function getFilteredCount(cat: string) {
  if (cat === 'General') {
    const categorizedTags = new Set<string>()
    Object.keys(props.history).forEach(c => {
      if (c !== 'General' && c !== 'detail') {
        (props.history[c] || []).forEach(h => {
          categorizedTags.add(h.tag.toLowerCase().trim())
        })
      }
    })
    
    const uncatList = props.tagsFrequency.filter(item => {
      return !categorizedTags.has(item.tag.toLowerCase().trim())
    })
    
    if (!searchQuery.value.trim()) {
      return uncatList.length
    }
    const q = searchQuery.value.toLowerCase().trim()
    return uncatList.filter(item => {
      return item.tag.toLowerCase().includes(q)
    }).length
  }

  const list = props.history[cat] || []
  if (!searchQuery.value.trim()) {
    return list.length
  }
  const q = searchQuery.value.toLowerCase().trim()
  return list.filter(item => {
    const tagMatch = item.tag.toLowerCase().includes(q)
    const cnMatch = item.concept_name && item.concept_name.toLowerCase().includes(q)
    return tagMatch || cnMatch
  }).length
}

const editingTag = ref('')
const editingValue = ref('')

function startEdit(item: any, event: Event) {
  event.stopPropagation()
  editingTag.value = item.tag
  editingValue.value = item.concept_name && item.concept_name !== '未分类别名' && item.concept_name !== '萌芽概念'
    ? item.concept_name
    : item.tag.replace(/_/g, ' ')
}

async function saveEdit(item: any) {
  const newName = editingValue.value.trim()
  if (!newName) {
    editingTag.value = ''
    return
  }
  
  const oldName = item.concept_name
  item.concept_name = newName
  editingTag.value = ''
  
  try {
    const response = await fetch('/api/tagger/update-translation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tag: item.tag,
        ch_name: newName
      })
    })
    const resData = await response.json()
    if (!resData.success) {
      throw new Error(resData.message || '更新失败')
    }
    ElMessage.success(`成功更新标签翻译为: ${newName}`)
  } catch (e: any) {
    ElMessage.error(e.message || '更新翻译失败')
    item.concept_name = oldName
  }
}

const holyMedoids = new Set([
  "sitting", "standing", "lying", "squatting", "pose", "holding", "gesture",
  "smile", "blushing", "open_mouth", "facial_expression",
  "skirt", "dress", "shirt", "socks", "boots", "leotard", "gloves", "choker", "ribbon", "lace",
  "long_hair", "short_hair", "bangs", "ponytail", "twintails",
  "object", "weapon", "phone", "bag", "sword", "cup", "jewelry", "prop",
  "outdoors", "nature", "sky", "classroom", "scenery", "chalkboard", "blackboard", "board",
  "1girl", "solo", "1boy", "group",
  "breasts", "skin", "legs", "hand", "feet", "abs", "armpits",
  "masterpiece", "highres", "absurdres",
  "looking_at_viewer", "close_up", "pov", "from_above",
  "cyberpunk", "fantasy", "scifi"
].map(t => t.toLowerCase().trim()))

function isHolyMedoid(tag: string) {
  if (!tag) return false
  const clean = tag.toLowerCase().trim().replace(/ /g, '_').replace(/-/g, '_')
  return holyMedoids.has(clean)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    width="800px"
    top="10vh"
    destroy-on-close
    append-to-body
    custom-class="lora-taxonomy-dialog"
  >
    <template #header>
      <div class="taxonomy-dialog-header">
        <span class="title-text">🗂️ Danbooru 标签分类索引面板</span>
        <div class="header-right-actions">
          <el-input
            v-model="searchQuery"
            placeholder="搜索当前类目标签..."
            size="small"
            clearable
            class="taxonomy-search-input"
          >
            <template #prefix>
              <el-icon><i-ep-search /></el-icon>
            </template>
          </el-input>
          
          <div 
            class="compact-lang-toggle" 
            @click="toggleLanguage" 
            :title="showChinese ? '切换为英文标签' : '切换为中文别名'"
          >
            <span :class="{ active: showChinese }">中</span>
            <span class="divider">/</span>
            <span :class="{ active: !showChinese }">EN</span>
          </div>
        </div>
      </div>
    </template>

    <div class="taxonomy-dialog-body">
      <div class="drag-instructions">
        💡 <b>分类调整说明</b>：您可以按住并拖动任意下方的标签卡片，直接拖拽移动到上方的类目 Tab 上释放，即可快速完成重分类与语义投影刷新。
      </div>

      <div class="tabs-container">
        <div 
          v-for="cat in categories" 
          :key="cat"
          class="custom-category-tab"
          :class="{ 
            'is-active': activeTab === cat,
            'is-dragover': dragOverTab === cat
          }"
          :style="getTabStyle(cat)"
          @click="activeTab = cat"
          @dragover="e => onDragOver(e, cat)"
          @dragleave="onDragLeave"
          @drop="e => onDrop(e, cat)"
        >
          <span class="tab-label">{{ cat }}</span>
          <el-badge :value="getFilteredCount(cat)" class="tab-badge" type="info" />
        </div>
      </div>

      <div class="tags-grid-scroller">
        <div 
          v-for="item in currentTags" 
          :key="item.tag"
          class="custom-tag-card"
          :class="{ 'is-holy-medoid': isHolyMedoid(item.tag) }"
          :style="getTagStyle(activeTab)"
          :draggable="!isHolyMedoid(item.tag)"
          @dragstart="e => !isHolyMedoid(item.tag) && onDragStart(e, item.tag)"
          @click="handleCopy(item.tag)"
          :title="isHolyMedoid(item.tag) ? `点击复制 | 🔒 骨干明灯词（分类已锁死保护）` : `双击/点击复制 | 当前数据集中出现 ${item.count} 次`"
        >
          <div class="tag-card-content">
            <span class="tag-symbol">#</span>
            <span v-if="editingTag !== item.tag" class="tag-name">
              {{ showChinese && item.concept_name && item.concept_name !== '未分类别名' && item.concept_name !== '萌芽概念' ? item.concept_name : item.tag.replace(/_/g, ' ') }}
            </span>
            <el-input
              v-else
              v-model="editingValue"
              size="small"
              class="editing-input-inline"
              @keyup.enter="saveEdit(item)"
              @blur="saveEdit(item)"
              @click.stop
            />
            <span 
              v-if="showChinese && editingTag !== item.tag" 
              class="tag-edit-btn" 
              @click="e => startEdit(item, e)"
              title="就地修改中文中译"
            >
              ✏️
            </span>
          </div>
          <div class="tag-card-footer">
            <span class="freq-indicator" v-if="item.count > 0">{{ item.count }} 次</span>
            <svg 
              v-if="isHolyMedoid(item.tag)" 
              class="holy-lock-svg" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="#6366f1" 
              stroke-width="2.5" 
              stroke-linecap="round" 
              stroke-linejoin="round"
              title="骨干先验已锁定保护"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
        </div>
        <div v-if="currentTags.length === 0" class="empty-taxonomy-tags">
          该类目下暂无已分类标签，拖入新标签在此建库。
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.taxonomy-dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 95%;
}

.title-text {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.header-right-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.taxonomy-search-input {
  width: 160px;
  transition: width 0.3s ease;
}

.taxonomy-search-input :deep(.el-input__wrapper) {
  border-radius: 20px;
}

.taxonomy-search-input:focus-within {
  width: 210px;
}

.compact-lang-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 0 10px;
  cursor: pointer;
  font-size: 11px;
  font-weight: bold;
  color: #94a3b8;
  user-select: none;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  height: 24px;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02);
}

.compact-lang-toggle:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #64748b;
  transform: translateY(-0.5px);
}

.compact-lang-toggle span.active {
  color: #6366f1;
  text-shadow: 0 0 1px rgba(99, 102, 241, 0.3);
}

.compact-lang-toggle .divider {
  margin: 0 3px;
  color: #cbd5e1;
  font-weight: normal;
}

.taxonomy-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 60vh;
  overflow: hidden;
}

.drag-instructions {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.tabs-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 10px;
}

.custom-category-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.custom-category-tab:hover {
  background: #e2e8f0;
  border-color: #94a3b8;
}

.custom-category-tab.is-active {
  background: #6366f1;
  border-color: #4f46e5;
  color: #ffffff;
}

.custom-category-tab.is-dragover {
  background: #10b981 !important;
  border-color: #059669 !important;
  color: #ffffff !important;
  transform: scale(1.08);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.tab-label {
  font-size: 12px;
  font-weight: 600;
}

.tab-badge {
  transform: scale(0.85);
}

.tags-grid-scroller {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
  padding: 4px;
  max-height: calc(60vh - 160px);
}

.custom-tag-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 12px;
  cursor: grab;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}

.custom-tag-card:hover {
  border-color: #6366f1;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(99, 102, 241, 0.1);
}

.custom-tag-card:active {
  cursor: grabbing;
}

.tag-card-content {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag-symbol {
  color: #6366f1;
  font-weight: bold;
  font-size: 13px;
}

.tag-name {
  font-size: 12px;
  color: #1e293b;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 110px;
}

.tag-card-footer {
  display: flex;
  justify-content: flex-end;
}

.freq-indicator {
  font-size: 9px;
  color: #94a3b8;
  background: #f8fafc;
  padding: 1px 4px;
  border-radius: 4px;
}

.empty-taxonomy-tags {
  grid-column: 1 / -1;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  margin-top: 60px;
}

.custom-tag-card {
  position: relative;
}

.tag-edit-btn {
  opacity: 0;
  margin-left: 6px;
  cursor: pointer;
  font-size: 11px;
  transition: opacity 0.2s ease, transform 0.2s ease;
  user-select: none;
}

.custom-tag-card:hover .tag-edit-btn {
  opacity: 0.7;
}

.tag-edit-btn:hover {
  opacity: 1 !important;
  transform: scale(1.2);
}

.editing-input-inline {
  width: 90px;
  height: 20px;
  margin-left: 4px;
}

.editing-input-inline :deep(.el-input__wrapper) {
  padding: 0 4px;
  height: 20px;
  font-size: 11px;
  border-radius: 4px;
}

.custom-tag-card.is-holy-medoid {
  border-width: 1.5px !important;
  border-style: dashed !important;
  box-shadow: 0 0 8px rgba(99, 102, 241, 0.15) !important;
  background: radial-gradient(circle at top right, #ffffff 70%, #f5f3ff 100%) !important;
  cursor: copy !important;
}

.custom-tag-card.is-holy-medoid:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25) !important;
}

.custom-tag-card.is-holy-medoid .tag-symbol {
  text-shadow: 0 0 4px rgba(99, 102, 241, 0.5);
  font-size: 14px;
}

.tag-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.holy-lock-svg {
  width: 12px;
  height: 12px;
  opacity: 0.75;
  transition: opacity 0.2s ease;
  user-select: none;
}

.custom-tag-card:hover .holy-lock-svg {
  opacity: 1;
}
</style>
