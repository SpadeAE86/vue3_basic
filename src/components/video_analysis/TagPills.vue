<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'

type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'
type TagEffect = 'dark' | 'light' | 'plain'

const props = withDefaults(
  defineProps<{
    label?: string
    tags?: string[]
    emptyText?: string
    // show first N tags in compact mode
    max?: number
    // render "+N" tail when tags exceed max
    showMore?: boolean

    size?: 'large' | 'default' | 'small'
    type?: TagType
    effect?: TagEffect
    round?: boolean

    clickable?: boolean
    // style tokens (CSS variables)
    borderRadius?: string
    gap?: string
  }>(),
  {
    tags: () => [],
    emptyText: '-',
    max: undefined,
    showMore: true,
    size: 'small',
    type: 'primary',
    effect: 'plain',
    round: true,
    clickable: true,
    borderRadius: '10px',
    gap: '8px',
  },
)

const normalized = computed(() => (props.tags ?? []).filter(Boolean))
const displayed = computed(() => {
  if (!props.max || props.max <= 0) return normalized.value
  return normalized.value.slice(0, props.max)
})
const moreCount = computed(() => {
  if (!props.max || props.max <= 0) return 0
  return Math.max(0, normalized.value.length - props.max)
})

async function copy(text: string) {
  if (!props.clickable) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    ElMessage.warning('复制失败')
  }
}
</script>

<template>
  <div
    class="tag-pills"
    :style="{
      '--pill-radius': borderRadius,
      '--pill-gap': gap,
    }"
  >
    <span v-if="label" class="tag-label">{{ label }}</span>

    <div class="pill-wall">
      <template v-if="displayed.length">
        <el-tag
          v-for="t in displayed"
          :key="t"
          :size="size"
          :type="type"
          :effect="effect"
          :round="round"
          class="pill"
          :class="{ clickable }"
          @click.stop="copy(t)"
        >
          {{ t }}
        </el-tag>

        <el-tag
          v-if="showMore && moreCount > 0"
          :size="size"
          type="info"
          effect="plain"
          :round="round"
          class="pill more"
        >
          +{{ moreCount }}
        </el-tag>
      </template>
      <span v-else class="empty">{{ emptyText }}</span>
    </div>
  </div>
</template>

<style scoped>
.tag-pills {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.tag-label {
  color: #6b7280;
  font-size: 12px;
  line-height: 22px;
  white-space: nowrap;
}

.pill-wall {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pill-gap);
}

.pill {
  border-radius: var(--pill-radius);
}

.pill.clickable {
  cursor: pointer;
}

.empty {
  color: #9ca3af;
  font-size: 12px;
  line-height: 22px;
}
</style>

