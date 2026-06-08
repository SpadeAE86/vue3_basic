<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import type { ChatEvent } from '@/types/chat'
import UserBubble from './UserBubble.vue'
import AssistantBubble from './AssistantBubble.vue'
import ThinkingBlock from './ThinkingBlock.vue'
import ToolBlock from './ToolBlock.vue'
import { useChatStore } from '@/stores/chat'

const props = defineProps<{
  events: ChatEvent[]
}>()

const chatStore = useChatStore()
const scrollRef = ref<InstanceType<typeof import('element-plus')['ElScrollbar']>>()
const expandedEventId = ref<string | null>(null)

function toggleExpand(id: string) {
  if (expandedEventId.value === id) {
    expandedEventId.value = null
  } else {
    expandedEventId.value = id
  }
}

// 聚合处理连续的工具事件（非调试模式下）
const processedEvents = computed(() => {
  if (chatStore.debugMode) {
    return props.events
  }

  const result: any[] = []
  let tempGroup: ChatEvent[] = []

  for (const event of props.events) {
    if (event.type === 'tool_call' || event.type === 'tool_result') {
      tempGroup.push(event)
    } else {
      if (tempGroup.length > 0) {
        result.push(packageCollapsedTools(tempGroup))
        tempGroup = []
      }
      result.push(event)
    }
  }

  if (tempGroup.length > 0) {
    result.push(packageCollapsedTools(tempGroup))
  }

  return result
})

function packageCollapsedTools(group: ChatEvent[]) {
  const calls = group.filter(e => e.type === 'tool_call')
  const callCount = calls.length || 1 // 兜底至少为1
  const toolNames = Array.from(new Set(calls.map(e => e.toolName).filter(Boolean))) as string[]

  const firstEvent = group[0]
  const id = firstEvent ? firstEvent.id : Math.random().toString(36).substring(2, 9)
  const timestamp = firstEvent ? firstEvent.timestamp : Date.now()

  return {
    id: `collapsed_${id}`,
    type: 'collapsed_tools',
    content: '',
    timestamp,
    callCount,
    toolNames,
    subEvents: group
  }
}

function getCollapsedTitle(event: any) {
  const names = event.toolNames || []
  if (names.length === 1) {
    if (names[0] === 'read_image') {
      return `Agent 已阅读 ${event.callCount} 张画布图片`
    }
    if (names[0] === 'get_canvas_graph') {
      return `Agent 已获取画布拓扑结构`
    }
    return `Agent 已执行 ${event.callCount} 次 ${names[0]} 操作`
  }
  return `Agent 已执行 ${event.callCount} 次工具操作`
}

// 新事件（渲染行数变化）来了自动滚到底
watch(
  () => processedEvents.value.length,
  async () => {
    await nextTick()
    scrollRef.value?.setScrollTop(99999)
  },
)
</script>

<template>
  <el-scrollbar ref="scrollRef" class="event-stream">
    <div class="event-list">
      <template v-for="event in processedEvents" :key="event.id">
        <!-- 历史会话已压缩的分割线 -->
        <div v-if="event.type === 'compressed'" class="compaction-divider-block">
          <div class="compaction-divider">
            <span class="compaction-divider-line"></span>
            <span class="compaction-divider-text">
              <el-icon><i-ep-scissor /></el-icon> 历史会话已压缩，前序内容已载入短期记忆
            </span>
            <span class="compaction-divider-line"></span>
          </div>
          <div v-if="event.content" class="compaction-summary-box">
            <div class="compaction-summary-title" @click="toggleExpand(event.id)">
              <span class="title-text">
                <el-icon style="margin-right: 4px; vertical-align: middle;"><i-ep-document /></el-icon>
                <span style="vertical-align: middle;">查看压缩上下文摘要</span>
              </span>
              <el-icon class="expand-icon" :class="{ rotated: expandedEventId === event.id }">
                <i-ep-arrow-right />
              </el-icon>
            </div>
            <Transition name="slide">
              <div v-show="expandedEventId === event.id" class="compaction-summary-content">
                {{ event.content }}
              </div>
            </Transition>
          </div>
        </div>

        <!-- 用户消息 -->
        <UserBubble
          v-else-if="event.type === 'user'"
          :event="event"
          :is-expanded="expandedEventId === event.id"
          @toggle-expand="toggleExpand(event.id)"
        />

        <!-- 思考过程 -->
        <ThinkingBlock v-else-if="event.type === 'thinking'" :event="event" />

        <!-- 合并的工具操作卡片 -->
        <div v-else-if="event.type === 'collapsed_tools'" class="collapsed-tools-card">
          <div class="collapsed-header" @click="toggleExpand(event.id)">
            <span class="collapsed-icon">⚙️</span>
            <div class="collapsed-meta">
              <span class="collapsed-title">{{ getCollapsedTitle(event) }}</span>
              <span class="collapsed-summary" v-if="event.toolNames.length > 0">
                ({{ event.toolNames.join(', ') }})
              </span>
            </div>
            <el-icon class="expand-icon" :class="{ rotated: expandedEventId === event.id }">
              <i-ep-arrow-right />
            </el-icon>
          </div>
          <Transition name="slide">
            <div v-show="expandedEventId === event.id" class="collapsed-body">
              <ToolBlock 
                v-for="subEvt in event.subEvents" 
                :key="subEvt.id" 
                :event="subEvt" 
              />
            </div>
          </Transition>
        </div>

        <!-- 工具调用 / 工具结果 -->
        <ToolBlock v-else-if="event.type === 'tool_call' || event.type === 'tool_result'" :event="event" />

        <!-- Agent 回复 -->
        <AssistantBubble
          v-else-if="event.type === 'assistant'"
          :event="event"
          :is-expanded="expandedEventId === event.id"
          @toggle-expand="toggleExpand(event.id)"
        />

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
