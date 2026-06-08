<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useChatStore } from '@/stores/chat'
import { ChatDotRound } from '@element-plus/icons-vue'
import EventStream from '@/components/chat/EventStream.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import type { MediaFile } from '@/components/image/MediaUploader.vue'

const chatStore = useChatStore()
const { events, chatLoading } = storeToRefs(chatStore)

function onSend(text: string, referenceMedia: MediaFile[] = [], model: string = 'gpt-5.4') {
  chatStore.handleSend(text, referenceMedia, model)
}
</script>

<template>
  <div class="canvas-agent-sidebar">
    <div class="sidebar-header">
      <el-icon class="sidebar-icon"><ChatDotRound /></el-icon>
      <span class="sidebar-title">Agent 画布协同</span>
      <el-switch
        v-model="chatStore.debugMode"
        active-text="调试"
        class="debug-switch"
        inline-prompt
        style="--el-switch-on-color: #f59e0b; margin-left: auto;"
      />
    </div>
    
    <!-- 对话事件流 -->
    <div class="sidebar-stream">
      <EventStream :events="events" />
    </div>

    <!-- 输入框 -->
    <div class="sidebar-input">
      <ChatInput :disabled="chatLoading" @send="onSend" />
    </div>
  </div>
</template>

<style scoped>
.canvas-agent-sidebar {
  width: 320px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  height: 100%;
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  flex-shrink: 0;
}

.sidebar-icon {
  font-size: 18px;
  color: #6366f1;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.sidebar-stream {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: #fafafa;
}

.sidebar-input {
  border-top: 1px solid #e2e8f0;
  background: #ffffff;
  flex-shrink: 0;
}
</style>
