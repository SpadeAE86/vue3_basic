<script setup lang="ts">
import type { SearchToken } from '@/components/video_analysis/TagSearchBar.vue'
import { tagType, tagEffect, getTagStyle } from '@/composables/search/useSearchTokenVisual'

const props = withDefaults(
  defineProps<{
    tokens?: SearchToken[]
    maxPreviewChars?: number
    radius?: string
  }>(),
  {
    tokens: () => [],
    maxPreviewChars: 24,
    radius: '999px',
  },
)

function previewText(t: SearchToken) {
  const s = t.text ?? ''
  const max = props.maxPreviewChars
  return s.length > max ? `${s.slice(0, max)}…` : s
}
</script>

<template>
  <div v-if="!tokens.length" class="muted">暂无结构化标签</div>
  <div v-else class="token-box">
    <el-tag
      v-for="(t, idx) in tokens"
      :key="t.id"
      :type="tagType(t)"
      :effect="tagEffect(t)"
      :round="true"
      class="token ro"
      :style="getTagStyle(t, radius)"
    >
      <span v-if="idx !== 0" class="join">{{ t.join ?? 'AND' }}</span>
      <span v-if="t.not" class="not">NOT</span>
      <el-tooltip :content="t.text" placement="top" :show-after="280">
        <span class="txt">{{ previewText(t) }}</span>
      </el-tooltip>
    </el-tag>
  </div>
</template>

<style scoped>
.muted {
  font-size: 13px;
  color: #909399;
}

.token-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.token.ro {
  cursor: default;
  user-select: text;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.token.ro :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.join {
  font-size: 11px;
  opacity: 0.75;
  line-height: 1;
}

.not {
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.txt {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1;
}
</style>
