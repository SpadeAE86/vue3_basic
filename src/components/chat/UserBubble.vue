<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import type { ChatEvent } from '@/types/chat'

const props = defineProps<{
  event: ChatEvent
  isExpanded: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-expand'): void
}>()

const bubbleContentRef = ref<HTMLElement | null>(null)
const isLongMessage = ref(false)

function checkHeight() {
  nextTick(() => {
    if (bubbleContentRef.value) {
      // 获取内部文字的真实高度 (如果已折叠，用 scrollHeight 检测真实高度)
      const textEl = bubbleContentRef.value.querySelector('.bubble-text')
      if (textEl) {
        isLongMessage.value = textEl.scrollHeight > 260
      } else {
        isLongMessage.value = bubbleContentRef.value.scrollHeight > 260
      }
    }
  })
}

watch(() => props.event.content, checkHeight)

onMounted(() => {
  checkHeight()
  setTimeout(checkHeight, 150)
})
</script>

<template>
  <div class="bubble user-bubble">
    <div
      ref="bubbleContentRef"
      class="bubble-content"
      :class="{
        'is-long': isLongMessage,
        'is-collapsed': isLongMessage && !isExpanded
      }"
    >
      <div class="bubble-scroll-container">
        <div class="bubble-text">{{ event.content }}</div>
      </div>
      
      <!-- 渐变阴影遮罩 -->
      <div v-if="isLongMessage && !isExpanded" class="fade-overlay" />
      
      <!-- 折叠/展开控制 -->
      <div v-if="isLongMessage" class="toggle-container" :class="{ 'is-sticky': isExpanded }">
        <button class="toggle-btn" @click.stop="emit('toggle-expand')">
          {{ isExpanded ? '收起全文' : '展开全文' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-bubble {
  display: flex;
  justify-content: flex-end;
}

.bubble-content {
  position: relative;
  max-width: 75%;
  padding: 10px 14px;
  border-radius: 12px 12px 2px 12px;
  background: #6366f1;
  color: #fff;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
  transition: max-height 0.25s ease;
}

.bubble-content.is-collapsed {
  max-height: 260px;
  display: flex;
  flex-direction: column;
  padding-bottom: 28px; /* 留出底部控制按钮空间 */
}

.bubble-content.is-collapsed .bubble-scroll-container {
  max-height: 100%;
  overflow-y: auto;
}

/* 滚动条美化 */
.bubble-scroll-container::-webkit-scrollbar {
  width: 4px;
}
.bubble-scroll-container::-webkit-scrollbar-track {
  background: transparent;
}
.bubble-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}
.bubble-scroll-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

.fade-overlay {
  position: absolute;
  bottom: 28px;
  left: 1px;
  right: 1px;
  height: 40px;
  background: linear-gradient(to top, #6366f1 20%, rgba(99, 102, 241, 0) 100%);
  pointer-events: none;
  z-index: 4;
}

.toggle-container {
  position: absolute;
  bottom: 4px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 5;
  background: #6366f1;
  padding-top: 4px;
  padding-bottom: 4px;
  border-radius: 0 0 12px 12px;
}

.toggle-container.is-sticky {
  position: sticky;
  bottom: 12px;
  left: 0;
  right: 0;
  margin-top: 10px;
  background: rgba(99, 102, 241, 0.95);
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  width: fit-content;
  margin-left: auto;
  margin-right: auto;
  padding: 4px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.toggle-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}
</style>
