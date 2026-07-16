<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  tagsFrequency: { tag: string; count: number }[]
  filesLength: number
  bulkAddedTags: Set<string>
  categories: string[]
  selectedCategory: string
  searchQuery: string
  fastMap: Record<string, string>
}>()

const emit = defineEmits<{
  (e: 'select-tag', tag: string): void
  (e: 'update:selectedCategory', val: string): void
  (e: 'update:searchQuery', val: string): void
}>()

const isDescending = ref(true)

// Advanced filtering: Category filtering + Text filtering
const filteredTags = computed(() => {
  let base = props.tagsFrequency
  
  if (props.selectedCategory) {
    base = base.filter(t => {
      const tagLower = t.tag.toLowerCase().trim()
      const cat = props.fastMap[tagLower.replace(/\s+/g, '_')] || 'General'
      return cat === props.selectedCategory
    })
  }
  
  if (!props.searchQuery) return base
  const query = props.searchQuery.toLowerCase().trim()
  return base.filter(t => {
    const tagMatch = t.tag.toLowerCase().includes(query)
    const chMatch = t.ch_name && t.ch_name.toLowerCase().includes(query)
    return tagMatch || chMatch
  })
})

const sortedFreqTags = computed(() => {
  const base = [...filteredTags.value]
  if (isDescending.value) {
    return base.sort((a, b) => b.count - a.count)
  } else {
    return base.sort((a, b) => a.count - b.count)
  }
})

function getTagTitle(tag: string) {
  const tagLower = tag.toLowerCase().trim()
  const freqItem = props.tagsFrequency.find(t => t.tag.toLowerCase().trim() === tagLower)
  const count = freqItem ? freqItem.count : 1
  return `出现次数: ${count} 次`
}

function handleSelectTag(tag: string) {
  emit('select-tag', tag)
}
</script>

<template>
  <div class="left-freq-panel">
    <div class="panel-title-row">
      <div class="panel-header-line">
        <h3 class="panel-title-text">📊 标签频次 ({{ filteredTags.length }})</h3>
        
        <!-- Category Filter Capsule Dropdown -->
        <el-select
          :model-value="selectedCategory"
          @update:model-value="val => emit('update:selectedCategory', val)"
          placeholder="全部类型"
          size="small"
          class="category-capsule-select"
          style="width: 110px;"
        >
          <el-option label="全部类型" value="" />
          <el-option 
            v-for="cat in categories" 
            :key="cat" 
            :label="cat" 
            :value="cat" 
          />
        </el-select>

        <el-tooltip :content="isDescending ? '当前：高频优先（点击切换为低频优先）' : '当前：低频优先（点击切换为高频优先）'" placement="top">
          <el-button 
            type="info" 
            size="small" 
            circle 
            plain 
            @click="isDescending = !isDescending"
            class="sort-btn"
          >
            <el-icon>
              <i-ep-sort-down v-if="isDescending" />
              <i-ep-sort-up v-else />
            </el-icon>
          </el-button>
        </el-tooltip>
      </div>
      <el-input 
        :model-value="searchQuery" 
        @input="val => emit('update:searchQuery', val)"
        placeholder="搜索标签..." 
        size="small" 
        class="tag-search"
        clearable 
      />
    </div>
    
    <div class="freq-list-scroll">
      <div 
        v-for="item in sortedFreqTags" 
        :key="item.tag" 
        class="freq-item-row"
        @click="handleSelectTag(item.tag)"
        :title="getTagTitle(item.tag)"
      >
        <span class="freq-tag-name">{{ item.tag }}</span>
        <el-tag size="small" type="info" effect="dark" class="freq-badge">{{ item.count }}</el-tag>
      </div>
      <div v-if="filteredTags.length === 0" class="empty-freq">
        没有找到标签统计结果
      </div>
    </div>
  </div>
</template>

<style scoped>
.left-freq-panel {
  width: 280px;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 16px;
}

.panel-title-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel-header-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 6px;
}

.panel-title-text {
  margin: 0;
  font-size: 13px;
  color: #334155;
  font-weight: 600;
  white-space: nowrap;
}

/* Category capsule dropdown styling */
.category-capsule-select :deep(.el-select__wrapper) {
  border-radius: 20px !important;
  background: rgba(99, 102, 241, 0.08) !important;
  border: 1px solid rgba(99, 102, 241, 0.2) !important;
  color: #4f46e5 !important;
  font-weight: 600;
  padding-left: 8px;
  padding-right: 4px;
}

.category-capsule-select :deep(.el-select__placeholder) {
  color: #4f46e5 !important;
}

.sort-btn {
  padding: 4px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tag-search {
  width: 100%;
}

.freq-list-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 4px;
}

.freq-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f1f5f9;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.freq-item-row:hover {
  background: #e2e8f0;
  border-color: #6366f1;
}

.freq-tag-name {
  font-size: 13px;
  color: #1e293b;
  font-weight: 500;
}

.freq-badge {
  font-weight: 600;
}

.empty-freq {
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
  margin-top: 40px;
}
</style>
