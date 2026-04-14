<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import type { ChatEvent } from '@/types/chat'

const props = defineProps<{ event: ChatEvent }>()

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

const renderedHtml = computed(() => {
  if (!props.event.content) return ''
  return md.render(props.event.content)
})
</script>

<template>
  <div class="bubble assistant-bubble">
    <div class="avatar">A</div>
    <div class="bubble-body">
      <!-- 流式时显示光标 -->
      <div class="markdown-body" v-html="renderedHtml" />
      <span v-if="event.streaming" class="cursor-blink">▍</span>
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
  border-radius: 8px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
}

.bubble-body {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 2px 12px 12px 12px;
  background: #fff;
  border: 1px solid #ebeef5;
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
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
