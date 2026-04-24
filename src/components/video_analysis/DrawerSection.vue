<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title?: string
    padding?: string
    gap?: string
    bg?: string
    border?: string
    radius?: string
  }>(),
  {
    padding: '10px 10px',
    gap: '8px',
    bg: 'transparent',
    border: 'none',
    radius: '12px',
  },
)
</script>

<template>
  <section
    class="sec"
    :style="{
      padding,
      background: bg,
      border,
      borderRadius: radius,
      '--sec-gap': gap,
    }"
  >
    <div v-if="title" class="title">{{ title }}</div>
    <div class="body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.sec {
  display: flex;
  flex-direction: column;
  gap: var(--sec-gap);
}

.title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
</style>

