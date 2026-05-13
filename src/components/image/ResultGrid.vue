<script setup lang="ts">
import type { GeneratedItem } from '@/types/generate'
import ResultCard from './ResultCard.vue'

defineProps<{
  items: GeneratedItem[]
}>()

const emit = defineEmits<{
  (e: 'delete', id: string): void
  (e: 'retry', id: string): void
}>()

function getModelLabel(model: string) {
  // This can be mapped if needed, or pass the raw model name
  return model
}
</script>

<template>
  <div class="results-grid">
    <ResultCard
      v-for="img in items"
      :key="img.id"
      :item="img"
      :model-label="getModelLabel(img.model)"
      @delete="emit('delete', $event)"
      @retry="emit('retry', $event)"
    />
  </div>
</template>

<style scoped>
.results-grid {
  column-count: 2;
  column-gap: 20px;
  padding-bottom: 20px;
}

@media (min-width: 1200px) {
  .results-grid {
    column-count: 3;
  }
}

@media (min-width: 1600px) {
  .results-grid {
    column-count: 4;
  }
}
</style>
