<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import type { ChatEvent } from '@/types/chat'
import UserBubble from './UserBubble.vue'
import AssistantBubble from './AssistantBubble.vue'
import ThinkingBlock from './ThinkingBlock.vue'
import ToolBlock from './ToolBlock.vue'

const props = defineProps<{
  events: ChatEvent[]
}>()

const scrollRef = ref<InstanceType<typeof import('element-plus')['ElScrollbar']>>()

// 新事件来了自动滚到底
watch(
  () => props.events.length,
  async () => {
    await nextTick()
    scrollRef.value?.setScrollTop(99999)
  },
)
</script>

<template>
  <el-scrollbar ref="scrollRef" class="event-stream">
    <div class="event-list">
      <template v-for="event in events" :key="event.id">
        <!-- 用户消息 -->
        <UserBubble v-if="event.type === 'user'" :event="event" />

        <!-- 思考过程 -->
        <ThinkingBlock v-else-if="event.type === 'thinking'" :event="event" />

        <!-- 工具调用 / 工具结果 -->
        <ToolBlock v-else-if="event.type === 'tool_call' || event.type === 'tool_result'" :event="event" />

        <!-- Agent 回复 -->
        <AssistantBubble v-else-if="event.type === 'assistant'" :event="event" />

        <!-- 状态 / 错误 -->
        <div v-else-if="event.type === 'status'" class="status-line">
          <span class="status-dot" />
          {{ event.content }}
        </div>
        <div v-else-if="event.type === 'error'" class="error-line">
          ❌ {{ event.content }}
        </div>
      </template>

      <!-- 空状态 -->
      <div v-if="events.length === 0" class="empty-hint">
        <el-icon :size="48" color="#ccc"><i-ep-chat-dot-round /></el-icon>
        <p>发送一条消息开始对话</p>
      </div>
    </div>
  </el-scrollbar>
</template>

<style scoped>
.event-stream {
  flex: 1;
  min-height: 0;
}

.event-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  min-height: 100%;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
  justify-content: center;
  padding: 4px 0;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #67c23a;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

.error-line {
  font-size: 13px;
  color: #f56c6c;
  text-align: center;
  padding: 4px 0;
}

.empty-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #c0c4cc;
  font-size: 14px;
}
</style>
