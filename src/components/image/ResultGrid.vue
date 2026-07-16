<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { GeneratedItem } from '@/types/generate'
import ResultCard from './ResultCard.vue'

const props = defineProps<{
  items: GeneratedItem[]
}>()

const emit = defineEmits<{
  (e: 'delete', id: string): void
  (e: 'retry', id: string): void
}>()

const visibleLimit = ref(12)
const sensor = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

const visibleItems = computed(() => {
  return props.items.slice(0, visibleLimit.value)
})

// 监听首张卡片 ID：如果 ID 发生变化（如生成新图或切换模式），重置加载限制
const firstItemId = computed(() => props.items[0]?.id)
watch(firstItemId, () => {
  visibleLimit.value = 12
})

// --- 动态列分配逻辑，保证横向水平排序，且为真瀑布流 ---
const columnCount = ref(3)

function updateColumnCount() {
  const width = window.innerWidth
  if (width >= 1600) {
    columnCount.value = 4
  } else if (width >= 1200) {
    columnCount.value = 3
  } else {
    columnCount.value = 2
  }
}

const columns = computed(() => {
  const cols: GeneratedItem[][] = Array.from({ length: columnCount.value }, () => [])
  visibleItems.value.forEach((item, index) => {
    cols[index % columnCount.value]!.push(item)
  })
  return cols
})

onMounted(() => {
  updateColumnCount()
  window.addEventListener('resize', updateColumnCount)

  observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) {
      if (visibleLimit.value < props.items.length) {
        visibleLimit.value = Math.min(visibleLimit.value + 12, props.items.length)
      }
    }
  }, {
    rootMargin: '30%' // 距离底部 30% 时提前加载下一批，确保滚动顺滑
  })

  if (sensor.value) {
    observer.observe(sensor.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', updateColumnCount)
  if (observer) {
    observer.disconnect()
  }
})

function getModelLabel(model: string) {
  return model
}
</script>

<template>
  <div class="results-container">
    <div class="results-columns">
      <div
        class="results-column"
        v-for="(col, colIdx) in columns"
        :key="colIdx"
      >
        <ResultCard
          v-for="img in col"
          :key="img.id"
          :item="img"
          :model-label="getModelLabel(img.model)"
          :preview-list="visibleItems"
          :preview-index="visibleItems.findIndex(i => i.id === img.id)"
          @delete="emit('delete', $event)"
          @retry="emit('retry', $event)"
        />
      </div>
    </div>
    <!-- 滚动感应器：用于触发加载下一批卡片，放在 grid 外部避免影响瀑布流列布局 -->
    <div ref="sensor" class="scroll-sensor" style="height: 10px; margin-top: 10px;"></div>
  </div>
</template>

<style scoped>
.results-columns {
  display: flex;
  gap: 20px;
  padding-bottom: 20px;
}

.results-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0; /* 允许 flex 容器内部元素正常缩放 */
}
</style>
