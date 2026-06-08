<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ChatEvent } from '@/types/chat'

const props = defineProps<{ event: ChatEvent }>()

const expanded = ref(true)

// 当完成思考（streaming 变为 false）时，自动折叠
watch(
  () => props.event.streaming,
  (isStreaming) => {
    if (!isStreaming) {
      expanded.value = false
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="thinking-block" @click="expanded = !expanded">
    <div class="thinking-header">
      <span class="thinking-icon">💭</span>
      <span class="thinking-label">思考中...</span>
      <el-icon class="expand-icon" :class="{ rotated: expanded }">
        <i-ep-arrow-right />
      </el-icon>
    </div>
    <Transition name="slide">
      <div v-show="expanded" class="thinking-body">
        {{ event.content }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.thinking-block {
  margin-left: 40px;
  padding: 6px 12px;
  border-radius: 8px;
  background: #f8f8fc;
  border: 1px dashed #e0e0ea;
  cursor: pointer;
  transition: background 0.2s;
}

.thinking-block:hover {
  background: #f0f0f8;
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
}

.thinking-icon {
  font-size: 14px;
}

.thinking-label {
  flex: 1;
}

.expand-icon {
  transition: transform 0.2s;
  font-size: 12px;
}

.expand-icon.rotated {
  transform: rotate(90deg);
}

.thinking-body {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #ebeef5;
  font-size: 13px;
  color: #777;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 折叠动画 */
.slide-enter-active, .slide-leave-active {
  transition: all 0.2s ease;
  max-height: 500px;
  overflow: hidden;
}
.slide-enter-from, .slide-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
  padding-top: 0;
}
</style>
