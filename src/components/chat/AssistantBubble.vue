<script setup lang="ts">
import { ref, onMounted, watch, nextTick, computed } from 'vue'
// @ts-ignore
import MarkdownIt from 'markdown-it'
import type { ChatEvent } from '@/types/chat'

const props = defineProps<{
  event: ChatEvent
  isExpanded: boolean
  avatarUrl?: string
  avatarName?: string
}>()

const emit = defineEmits<{
  (e: 'toggle-expand'): void
}>()

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

const renderedHtml = computed(() => {
  if (!props.event.content) return ''
  return md.render(props.event.content)
})

const bubbleBodyRef = ref<HTMLElement | null>(null)
const isLongMessage = ref(false)

function checkHeight() {
  nextTick(() => {
    if (bubbleBodyRef.value) {
      const textEl = bubbleBodyRef.value.querySelector('.markdown-body')
      if (textEl) {
        isLongMessage.value = textEl.scrollHeight > 260
      } else {
        isLongMessage.value = bubbleBodyRef.value.scrollHeight > 260
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
  <div class="bubble assistant-bubble">
    <div class="avatar">
      <img v-if="avatarUrl" :src="avatarUrl" class="avatar-img" />
      <template v-else-if="avatarName">{{ avatarName.charAt(0).toUpperCase() }}</template>
      <template v-else>A</template>
    </div>
    <div
      ref="bubbleBodyRef"
      class="bubble-body"
      :class="{
        'is-long': isLongMessage,
        'is-collapsed': isLongMessage && !isExpanded
      }"
    >
      <!-- 滚动文本容器 -->
      <div class="bubble-scroll-container">
        <div class="markdown-body" v-html="renderedHtml" />
        <span v-if="event.streaming" class="cursor-blink">▍</span>
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
.assistant-bubble {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.avatar {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bubble-body {
  position: relative;
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 2px 12px 12px 12px;
  background: #fff;
  border: 1px solid #ebeef5;
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: max-height 0.25s ease;
}

.bubble-body.is-collapsed {
  max-height: 260px;
  display: flex;
  flex-direction: column;
  padding-bottom: 28px; /* 留出底部控制按钮空间 */
}

.bubble-body.is-collapsed .bubble-scroll-container {
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
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
}
.bubble-scroll-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}

.fade-overlay {
  position: absolute;
  bottom: 28px;
  left: 1px;
  right: 1px;
  height: 40px;
  background: linear-gradient(to top, #fff 20%, rgba(255, 255, 255, 0) 100%);
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
  background: #fff;
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
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  width: fit-content;
  margin-left: auto;
  margin-right: auto;
  padding: 4px 12px;
  border: 1px solid #ebeef5;
}

.toggle-btn {
  background: none;
  border: none;
  color: #6366f1;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: rgba(99, 102, 241, 0.08);
  color: #4f46e5;
}

/* markdown 基础样式 */
.markdown-body :deep(p) {
  margin: 0 0 8px 0;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}
.markdown-body :deep(code) {
  background: #f0f0f5;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', monospace;
}
.markdown-body :deep(pre) {
  background: #1e1e2e;
  color: #cdd6f4;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}
.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}
.markdown-body :deep(ul), .markdown-body :deep(ol) {
  padding-left: 20px;
  margin: 4px 0;
}

.cursor-blink {
  animation: blink 1s infinite;
  color: #6366f1;
  font-weight: 300;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>
