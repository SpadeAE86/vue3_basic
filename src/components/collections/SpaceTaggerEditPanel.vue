<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useLanguage } from '../../views/composables/useLanguage'
import { ElMessage } from 'element-plus'
import SpaceTaggerPreviewOverlay from './SpaceTaggerPreviewOverlay.vue'

const props = withDefaults(defineProps<{
  files: { name: string; path: string; cover_url: string; tags: string[] }[]
  tagsFrequency: { tag: string; count: number }[]
  bulkAddedTags: Set<string>
  editingCards: Record<string, boolean>
  selectedTagFromFreq?: string
  selectedCategory: string
  searchQuery?: string
  fastMap: Record<string, string>
  sortMode?: 'type' | 'frequency'
  showChinese?: boolean
  singleRollbacks?: Record<string, string[]>
  localServiceReady?: boolean
}>(), {
  localServiceReady: true
})

const emit = defineEmits<{
  (e: 'bulk-add', tag: string, category?: string): void
  (e: 'bulk-remove', tag: string): void
  (e: 'save-single-tags', fileItem: any): void
  (e: 'toggle-edit-card', fileItem: any): void
  (e: 'remove-tag', fileItem: any, tag: string): void
  (e: 'save-overlay-tag', fileItem: any, rawInput: string, category?: string): void
  (e: 'single-interrogate', fileItem: any, mode: 'append' | 'overwrite'): void
  (e: 'single-rollback', fileItem: any): void
  (e: 'update:show-chinese', val: boolean): void
}>()

const bulkActionTag = ref('')
const isSingleInterrogating = ref(false)
const selectedCategoryForAdd = ref('')
const availableCategories = ["motion", "face", "outfit", "hair", "item", "scene", "character", "style", "quality", "body", "camera", "detail", "concept", "General"]

const highlightedTag = computed(() => {
  const q = props.searchQuery?.trim().toLowerCase().replace(/\s+/g, '_') || ''
  const b = bulkActionTag.value.trim().toLowerCase().replace(/\s+/g, '_') || ''
  return q || b || ''
})

function isHighlighted(tag: string): boolean {
  const q = props.searchQuery?.trim().toLowerCase() || ''
  const b = bulkActionTag.value.trim().toLowerCase()
  if (!q && !b) return false
  
  const tagLower = tag.toLowerCase().trim()
  const tagNormalized = tagLower.replace(/\s+/g, '_')
  
  const queryList = [q, b].filter(val => val !== '')
  for (const query of queryList) {
    const queryNorm = query.replace(/\s+/g, '_')
    if (tagNormalized.includes(queryNorm)) {
      return true
    }
    const freqItem = props.tagsFrequency.find(t => t.tag.toLowerCase().trim() === tagNormalized)
    if (freqItem && freqItem.ch_name) {
      if (freqItem.ch_name.toLowerCase().includes(query)) {
        return true
      }
    }
  }
  return false
}

// Sync parent selected tag into input box
watch(() => props.selectedTagFromFreq, (newVal) => {
  if (newVal) {
    bulkActionTag.value = newVal
  }
})

// 同步左侧选中的分类到批量添加的分类下拉框中作为默认值
watch(() => props.selectedCategory, (newVal) => {
  selectedCategoryForAdd.value = newVal || ''
}, { immediate: true })

const allPreviewUrls = computed(() => props.files.map(f => f.cover_url))
const activePreviewIndex = ref<number | null>(null)
const activePreviewFile = computed(() => {
  if (activePreviewIndex.value === null) return null
  return props.files[activePreviewIndex.value] || null
})

const viewerTagVisible = ref(false)

function onImagePreviewShow(fileItem: any) {
  activePreviewIndex.value = props.files.indexOf(fileItem)
  viewerTagVisible.value = true
}

function handleSwitch(val: number) {
  activePreviewIndex.value = val
  nextTick(() => {
    const el = document.getElementById('image-card-' + val)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
}

function handleBulkAddAction() {
  const tag = bulkActionTag.value.trim()
  if (!tag) {
    ElMessage.warning('请输入目标标签')
    return
  }
  emit('bulk-add', tag, selectedCategoryForAdd.value)
  bulkActionTag.value = ''
  selectedCategoryForAdd.value = ''
}

function handleBulkRemoveAction() {
  const tag = bulkActionTag.value.trim()
  if (!tag) {
    ElMessage.warning('请输入目标标签')
    return
  }
  emit('bulk-remove', tag)
  bulkActionTag.value = ''
}

async function handleCopyTag(tag: string) {
  try {
    await navigator.clipboard.writeText(tag)
    ElMessage.success(`已复制标签: ${tag}`)
  } catch (err) {
    console.error(err)
    ElMessage.error('复制失败')
  }
}

function hasRollback(path: string): boolean {
  return !!(props.singleRollbacks && props.singleRollbacks[path])
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

function getSortedTagsForFile(fileTags: string[]) {
  const freqMap = new Map<string, number>()
  props.tagsFrequency.forEach(item => {
    freqMap.set(item.tag.toLowerCase().trim(), item.count)
  })

  const mode = props.sortMode || 'type'

  if (mode === 'type') {
    // 严格按指定类别顺序排序，把重要内容放在一起并前置
    const categoryOrder = [
      'character', 'outfit', 'hair', 'motion', 'face', 'body', 
      'scene', 'camera', 'style', 'concept', 'detail', 'item', 
      'General', 'quality'
    ]
    return [...fileTags].sort((a, b) => {
      const catA = props.fastMap[a.toLowerCase().trim().replace(/\s+/g, '_')] || 'General'
      const catB = props.fastMap[b.toLowerCase().trim().replace(/\s+/g, '_')] || 'General'
      const idxA = categoryOrder.indexOf(catA)
      const idxB = categoryOrder.indexOf(catB)
      
      if (idxA !== idxB) {
        return idxA - idxB
      }
      
      // 同类内让频次更高的靠前
      const countA = freqMap.get(a.toLowerCase().trim()) ?? 1
      const countB = freqMap.get(b.toLowerCase().trim()) ?? 1
      return countB - countA
    })
  } else {
    // 按词频显示模式：词频越低排在越前面，95% 以上超高频触发词排在最后面
    const total = props.files.length || 1
    return [...fileTags].sort((a, b) => {
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

// 13 Attractors color palettes for premium tags styling
const colorThemes: Record<string, { bg: string, border: string, text: string }> = {
  motion: { bg: '#fff7ed', border: '#ffedd5', text: '#c2410c' }, // Orange
  face: { bg: '#fff1f2', border: '#ffe4e6', text: '#be123c' }, // Rose
  outfit: { bg: '#faf5ff', border: '#f3e8ff', text: '#6b21a8' }, // Purple
  hair: { bg: '#fffbeb', border: '#fef3c7', text: '#b45309' }, // Amber
  item: { bg: '#eef2ff', border: '#e0e7ff', text: '#3730a3' }, // Indigo
  scene: { bg: '#f0fdf4', border: '#dcfce7', text: '#15803d' }, // Green
  character: { bg: '#ecfeff', border: '#cffafe', text: '#0e7490' }, // Cyan
  style: { bg: '#fff5f7', border: '#ffe4e9', text: '#b83b5e' }, // Smoked Pink
  quality: { bg: '#fffdf5', border: '#fef9c3', text: '#854d0e' }, // Gold/Yellow
  body: { bg: '#fff5f5', border: '#fed7d7', text: '#9b2c2c' }, // Coral/Red
  camera: { bg: '#f0f9ff', border: '#e0f2fe', text: '#0369a1' }, // Light Blue
  detail: { bg: '#fdf4ff', border: '#fae8ff', text: '#86198f' }, // Fuchsia
  concept: { bg: '#e0e7ff', border: '#c7d2fe', text: '#4338ca' } // Violet
}

function getTagStyle(tag: string) {
  const tagLower = tag.toLowerCase().trim()
  const tagNormalized = tagLower.replace(/\s+/g, '_')
  const total = props.files.length || 1
  const freqItem = props.tagsFrequency.find(t => t.tag.toLowerCase().trim() === tagLower)
  const count = freqItem ? freqItem.count : 1
  
  const mode = props.sortMode || 'type'

  // 优先高亮：如果是正在被搜索或者正在批量操作的标签，给出醒目的红框发光黄色背景
  if (isHighlighted(tag)) {
    return {
      backgroundColor: '#fef08a', // 亮黄色背景
      borderColor: '#ef4444',     // 红色边框
      borderWidth: '2px',
      color: '#9f1239',           // 暗红色文字
      fontWeight: '700',
      boxShadow: '0 0 10px rgba(239, 68, 68, 0.45)',
      transform: 'scale(1.12)',
      zIndex: 5
    }
  }

  // 支持 bulk-add 手动新增置顶提示色
  if (props.bulkAddedTags.has(tagLower)) {
    return {
      backgroundColor: '#fffbeb',
      borderColor: '#fde047',
      color: '#d97706',
      fontWeight: '600'
    }
  }

  if (mode === 'type') {
    // 类别上色模式
    const cat = props.fastMap[tagLower.replace(/\s+/g, '_')] || 'General'
    if (colorThemes[cat]) {
      return {
        backgroundColor: colorThemes[cat].bg,
        borderColor: colorThemes[cat].border,
        color: colorThemes[cat].text,
        fontWeight: '500'
      }
    }
    return {
      backgroundColor: '#f8fafc',
      borderColor: '#cbd5e1',
      color: '#475569',
      fontWeight: '500'
    }
  } else {
    // 词频显示模式：越低越绿，越高越白，95%以上黄
    const ratio = count / total
    
    // 95%以上标黄在最后面
    if (ratio >= 0.95 && total > 1) {
      return {
        backgroundColor: '#fffbeb',
        borderColor: '#fde047',
        color: '#d97706',
        fontWeight: '600'
      }
    }
    
    // 极低频越绿
    if (ratio <= 0.15 || count <= 2) {
      return {
        backgroundColor: '#f0fdf4',
        borderColor: '#bbf7d0',
        color: '#16a34a',
        fontWeight: '500'
      }
    }
    
    // 中低频淡绿
    if (ratio <= 0.5) {
      return {
        backgroundColor: '#f4fbf7',
        borderColor: '#dcf6e7',
        color: '#15803d',
        fontWeight: '500'
      }
    }
    
    // 词频越高越偏白
    return {
      backgroundColor: '#ffffff',
      borderColor: '#e5e7eb',
      color: '#374151',
      fontWeight: '500'
    }
  }
}

const { showChinese } = useLanguage()
const showChineseModel = showChinese

function getTagChineseName(tag: string): string {
  const tagLower = tag.toLowerCase().trim()
  const item = props.tagsFrequency.find(t => t.tag.toLowerCase().trim() === tagLower)
  return item && item.ch_name ? item.ch_name : tag
}

// Category filter logic for card tags display
function shouldShowTag(tag: string) {
  if (!props.selectedCategory) return true
  const tagLower = tag.toLowerCase().trim()
  const cat = props.fastMap[tagLower.replace(/\s+/g, '_')] || 'General'
  return cat === props.selectedCategory
}

function handleTagsStringChange(fileItem: any, event: any) {
  const value = event.target.value
  fileItem.tags = value.split(',').map((t: string) => t.trim()).filter((t: string) => t !== '')
}

async function triggerSingleInterrogate(fileItem: any) {
  if (!props.localServiceReady) {
    ElMessage.error('本地 AI 服务未启动，无法使用反推功能！')
    return
  }
  if (isSingleInterrogating.value) return
  isSingleInterrogating.value = true
  try {
    emit('single-interrogate', fileItem, 'append')
  } finally {
    isSingleInterrogating.value = false
  }
}

function handleAddTopTagToItem(fileItem: any) {
  const tagToAdd = bulkActionTag.value ? bulkActionTag.value.trim() : ''
  if (!tagToAdd) {
    ElMessage.warning('请在上方填入标签')
    return
  }
  emit('save-overlay-tag', fileItem, tagToAdd, selectedCategoryForAdd.value || undefined)
}
</script>

<template>
  <div class="right-edit-panel">
    
    <div class="bulk-actions-box">
      <h4>⚡ 批量操作 (全空间)</h4>
      <div class="bulk-input-row">
        <el-input 
          v-model="bulkActionTag" 
          placeholder="在此输入或点击左侧选择标签" 
          clearable 
          class="bulk-tag-input"
        />
        <el-select
          v-model="selectedCategoryForAdd"
          placeholder="分类(可选)"
          clearable
          style="width: 110px;"
        >
          <el-option label="自动分类" value="" />
          <el-option
            v-for="cat in availableCategories"
            :key="cat"
            :label="cat"
            :value="cat"
          />
        </el-select>
        <el-button type="success" plain @click="handleBulkAddAction">批量添加</el-button>
        <el-button type="danger" plain @click="handleBulkRemoveAction">批量剔除</el-button>
      </div>
    </div>

    <div class="image-list-scroll">
      <div 
        v-for="(fileItem, index) in files" 
        :key="fileItem.path" 
        :id="'image-card-' + index"
        class="image-tag-item-card"
      >
        <div class="card-img-wrapper">
          <el-image
            :src="fileItem.cover_url"
            fit="contain"
            class="card-img"
            :preview-src-list="allPreviewUrls"
            :initial-index="files.indexOf(fileItem)"
            preview-teleported
            @show="onImagePreviewShow(fileItem)"
            @switch="handleSwitch"
          >
            <template #viewer>
              <SpaceTaggerPreviewOverlay
                v-model="viewerTagVisible"
                :active-file="activePreviewFile"
                :tags-frequency="tagsFrequency"
                :files-length="files.length"
                :bulk-added-tags="bulkAddedTags"
                :is-single-interrogating="isSingleInterrogating"
                :fast-map="fastMap"
                :highlighted-tag="highlightedTag"
                v-model:show-chinese="showChineseModel"
                :selected-category="selectedCategory"
                :available-categories="availableCategories"
                @copy-all="handleCopyAllTags"
                @copy-tag="handleCopyTag"
                @remove-tag="tag => emit('remove-tag', activePreviewFile, tag)"
                @save-tag="(rawInput, category) => emit('save-overlay-tag', activePreviewFile, rawInput, category)"
                @single-interrogate="triggerSingleInterrogate(activePreviewFile)"
              />
            </template>
          </el-image>
        </div>
        <div class="card-tag-editor-area">
          <div class="card-header-line">
            <span class="file-name" :title="fileItem.name">{{ fileItem.name }}</span>
            <div class="card-header-actions" style="display: flex; gap: 6px; align-items: center;">
              <el-button
                v-if="hasRollback(fileItem.path)"
                type="warning"
                size="small"
                plain
                @click="emit('single-rollback', fileItem)"
              >
                回滚
              </el-button>
              
              <el-popover trigger="click" placement="top" :width="180" :teleported="true">
                <template #reference>
                  <el-button
                    type="primary"
                    size="small"
                    plain
                  >
                    反推
                  </el-button>
                </template>
                <div style="font-size: 13px; margin-bottom: 10px; color: #475569;">选择单张反推方式：</div>
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                  <el-button 
                    size="small" 
                    type="primary" 
                    @click="emit('single-interrogate', fileItem, 'append')"
                  >
                    仅新增
                  </el-button>
                  <el-button 
                    size="small" 
                    type="danger" 
                    plain 
                    @click="emit('single-interrogate', fileItem, 'overwrite')"
                  >
                    覆盖
                  </el-button>
                </div>
              </el-popover>

              <el-button 
                :type="editingCards[fileItem.path] ? 'success' : 'primary'" 
                size="small" 
                plain 
                @click="emit('toggle-edit-card', fileItem)"
              >
                {{ editingCards[fileItem.path] ? '保存' : '编辑' }}
              </el-button>
            </div>
          </div>
          <textarea 
            v-if="editingCards[fileItem.path]"
            class="tags-textarea" 
            :value="fileItem.tags.join(', ')" 
            @input="e => handleTagsStringChange(fileItem, e)"
            placeholder="用逗号分隔标签，例如: 1girl, solo, smile..."
          ></textarea>
          <div v-else class="parsed-badges-row">
            <!-- Render only tags belonging to selectedCategory if specified -->
            <span 
              v-for="t in getSortedTagsForFile(fileItem.tags)" 
              :key="t" 
              class="tag-badge"
              v-show="shouldShowTag(t)"
              :style="getTagStyle(t)"
              :title="`出现次数: ${tagsFrequency.find(f => f.tag.toLowerCase().trim() === t.toLowerCase().trim())?.count ?? 1} 次 (点击右侧 × 快速删除)`"
            >
              {{ showChinese ? getTagChineseName(t) : t.replace(/_/g, ' ') }}
              <span class="tag-badge-remove" @click.stop="emit('remove-tag', fileItem, t)">×</span>
            </span>
            
            <!-- Quick add tag from top input -->
            <span 
              class="tag-badge add-trigger-badge" 
              @click.stop="handleAddTopTagToItem(fileItem)"
              title="点击快捷添加上方输入的标签到此卡片"
            >
              +
            </span>
          </div>
        </div>
      </div>
      
      <div v-if="files.length === 0" class="empty-files">
        暂无已打标图片，请点击上方“一键反推打标”开始生成标注文件。
      </div>
    </div>

  </div>
</template>

<style scoped>
.right-edit-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}

.bulk-actions-box {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bulk-actions-box h4 {
  margin: 0;
  font-size: 14px;
  color: #166534;
  font-weight: 600;
}

.bulk-input-row {
  display: flex;
  gap: 10px;
}

.bulk-tag-input {
  flex: 1;
}

.image-list-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 4px;
}

.image-tag-item-card {
  display: flex;
  gap: 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  padding: 12px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.card-img-wrapper {
  width: 120px;
  height: 120px;
  border-radius: 6px;
  overflow: hidden;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-img {
  width: 100%;
  height: 100%;
}

.card-tag-editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-header-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.file-name {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.tags-textarea {
  flex: 1;
  height: 50px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px;
  font-size: 13px;
  font-family: inherit;
  color: #1e293b;
  resize: none;
  transition: border-color 0.2s ease;
  background: #f8fafc;
}

.tags-textarea:focus {
  outline: none;
  border-color: #6366f1;
  background: #ffffff;
}

.parsed-badges-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 90px;
  overflow-y: auto;
  padding-bottom: 4px;
}

.tag-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  transition: all 0.15s ease;
  cursor: default;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tag-badge:hover {
  filter: brightness(0.95);
}

.tag-badge-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0;
  overflow: hidden;
  opacity: 0;
  transition: all 0.15s ease;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.4);
  font-weight: bold;
  font-size: 10px;
}

.tag-badge:hover .tag-badge-remove {
  width: 8px;
  opacity: 1;
  margin-left: 2px;
}

.tag-badge-remove:hover {
  color: #ef4444 !important;
}

.empty-files {
  color: #94a3b8;
  font-size: 14px;
  text-align: center;
  margin-top: 100px;
}

.add-trigger-badge {
  border: 1px dashed #6366f1;
  color: #6366f1;
  background-color: rgba(99, 102, 241, 0.05);
  cursor: pointer !important;
  font-weight: bold;
  font-size: 12px;
  opacity: 0;
  transform: scale(0.9);
  pointer-events: none;
  transition: all 0.2s ease;
}

.parsed-badges-row:hover .add-trigger-badge {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}

.add-trigger-badge:hover {
  background-color: #6366f1 !important;
  color: #ffffff !important;
  border-style: solid;
  transform: scale(1.05) !important;
}
</style>
