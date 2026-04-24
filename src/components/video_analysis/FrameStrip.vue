<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    urls?: string[]
    max?: number
    height?: number
    gap?: number
    radius?: number
    activeIndex?: number
  }>(),
  {
    urls: () => [],
    max: 8,
    height: 44,
    gap: 8,
    radius: 10,
    activeIndex: 0,
  },
)

const emit = defineEmits<{
  (e: 'select', index: number): void
}>()

const list = computed(() => (props.urls ?? []).filter(Boolean))
const shown = computed(() => list.value.slice(0, props.max))
const more = computed(() => Math.max(0, list.value.length - shown.value.length))
</script>

<template>
  <div
    v-if="list.length"
    class="strip"
    :style="{
      '--h': `${height}px`,
      '--gap': `${gap}px`,
      '--r': `${radius}px`,
    }"
  >
    <div class="track">
      <div
        v-for="(u, i) in shown"
        :key="u + '_' + i"
        class="thumb"
        :class="{ active: i === activeIndex }"
        @mouseenter.stop="emit('select', i)"
        @click.stop="emit('select', i)"
        :title="`帧 ${i + 1}`"
      >
        <el-image :src="u" fit="cover" class="img" />
      </div>

      <div v-if="more > 0" class="more" :title="`还有 ${more} 帧（打开详情查看）`">
        +{{ more }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.strip {
  width: 100%;
}

.track {
  display: flex;
  align-items: center;
  gap: var(--gap);
  overflow-x: auto;
  padding-bottom: 2px;
}

.thumb {
  flex: 0 0 auto;
  width: calc(var(--h) * 1.6);
  height: var(--h);
  border-radius: var(--r);
  overflow: hidden;
  border: 1px solid rgba(229, 231, 235, 0.9);
  opacity: 0.88;
  transition: opacity 0.15s, transform 0.15s, border-color 0.15s;
  cursor: pointer;
}

.thumb:hover {
  opacity: 1;
  transform: translateY(-1px);
}

.thumb.active {
  opacity: 1;
  border-color: rgba(99, 102, 241, 0.55);
}

.img {
  width: 100%;
  height: 100%;
  display: block;
}

.more {
  flex: 0 0 auto;
  height: var(--h);
  padding: 0 10px;
  border-radius: var(--r);
  border: 1px dashed rgba(209, 213, 219, 0.9);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #6b7280;
  background: rgba(243, 244, 246, 0.7);
  user-select: none;
}
</style>

