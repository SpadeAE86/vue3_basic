<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useChatStore } from '@/stores/chat'
import { useWorkspaceStore } from '@/stores/workspace'
import { getChatSessions } from '@/api/chat.api'
import { ChatDotRound } from '@element-plus/icons-vue'
import EventStream from '@/components/chat/EventStream.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import type { MediaFile } from '@/components/image/MediaUploader.vue'

const route = useRoute()
const chatStore = useChatStore()
const workspaceStore = useWorkspaceStore()
const { events, chatLoading } = storeToRefs(chatStore)

const isGraphPage = computed(() => route.path === '/graph')

// 会话列表及选中的会话 ID
const chatSessions = ref<any[]>([])
const selectedSessionId = ref<string>('')

// 全局会话列表不做过滤
const filteredSessions = computed(() => {
  return chatSessions.value
})

async function loadChatSessions() {
  try {
    const res = await getChatSessions()
    chatSessions.value = res.sessions || []
  } catch (e) {
    console.error('加载会话列表失败:', e)
  }
}

// 切换会话
async function handleSessionChange(val: string) {
  selectedSessionId.value = val
  const key = 'agent_active_session_id'
  
  if (val) {
    localStorage.setItem(key, val)
    await chatStore.loadChatHistory(val)
  } else {
    localStorage.removeItem(key)
    chatStore.events = []
  }
}

// 发送消息
function onSend(text: string, referenceMedia: MediaFile[] = [], model: string = 'gpt-5.4') {
  let sid = selectedSessionId.value
  if (!sid) {
    // 软创建：前端先自动生成一个 session_id 并写入 localStorage，防止并发问题
    sid = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)
    selectedSessionId.value = sid
    localStorage.setItem('agent_active_session_id', sid)
    chatStore.activeSessionId = null // 重置以触发 SSE 返回 session_id 时的绑定
  }
  
  chatStore.handleSend(
    text, 
    referenceMedia, 
    model, 
    sid, 
    workspaceStore.selectedWorkspaceId || undefined, 
    workspaceStore.selectedGraphName || undefined
  )
}

// 监听路由路径、选中的图名及工程ID变化，恢复对应的会话状态
watch(
  [() => route.path, () => workspaceStore.selectedGraphName, () => workspaceStore.selectedWorkspaceId],
  async ([path, graphName, wsId]) => {
    await loadChatSessions()
    
    // 如果是工程画布页，预先加载下 workspaces
    if (path === '/canvas') {
      await workspaceStore.loadWorkspaces()
    }
    
    const saved = localStorage.getItem('agent_active_session_id') || ''
    selectedSessionId.value = saved
    if (saved) {
      await chatStore.loadChatHistory(saved)
    } else {
      chatStore.events = []
    }
  },
  { immediate: true }
)

// 监听新创建的会话 ID 并保存
watch(
  () => chatStore.activeSessionId,
  (newSid) => {
    if (newSid && selectedSessionId.value !== newSid) {
      selectedSessionId.value = newSid
      localStorage.setItem('agent_active_session_id', newSid)
      loadChatSessions()
    }
  }
)

// 当 AI 完成生成新历史等任务时，重新加载会话下拉框数据
watch(
  () => chatStore.chatLoading,
  async (newLoading) => {
    if (!newLoading) {
      await loadChatSessions()
    }
  }
)
</script>

<template>
  <div class="canvas-agent-sidebar">
    <div class="sidebar-header">
      <el-icon class="sidebar-icon"><ChatDotRound /></el-icon>
      <span class="sidebar-title">Agent {{ isGraphPage ? '力导' : '画布' }}协同</span>
      
      <!-- 选择会话下拉框 -->
      <el-select
        v-model="selectedSessionId"
        size="small"
        placeholder="切换会话"
        class="session-select"
        @change="handleSessionChange"
        :teleported="false"
      >
        <el-option
          value=""
          label="+ 新建会话"
          class="new-session-option"
        />
        <el-option
          v-for="item in filteredSessions"
          :key="item.session_id"
          :label="item.title || item.session_id"
          :value="item.session_id"
        />
      </el-select>

      <el-switch
        v-model="chatStore.debugMode"
        active-text="调试"
        class="debug-switch"
        inline-prompt
        style="--el-switch-on-color: #f59e0b;"
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
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  flex-shrink: 0;
  min-height: 52px;
}

.sidebar-icon {
  font-size: 16px;
  color: #6366f1;
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 会话选择器 - 紧凑设计 */
.session-select {
  flex: 1;
  min-width: 0;
  max-width: 110px;
  margin-left: auto;
}

:deep(.session-select .el-select__wrapper) {
  background: rgba(99, 102, 241, 0.06);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 20px;
  box-shadow: none;
  padding: 2px 10px;
  font-size: 12px;
  color: #4f46e5;
  min-height: 26px;
}

:deep(.session-select .el-select__wrapper:hover) {
  border-color: rgba(99, 102, 241, 0.5);
  background: rgba(99, 102, 241, 0.1);
}

:deep(.session-select .el-select__wrapper.is-focused) {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12);
}

:deep(.session-select .el-select__placeholder),
:deep(.session-select .el-select__selected-item) {
  font-size: 12px;
  color: #4f46e5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.session-select .el-select__suffix .el-icon) {
  color: #6366f1;
  font-size: 11px;
}

.debug-switch {
  flex-shrink: 0;
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

.new-session-option {
  color: #6366f1 !important;
  font-weight: 600;
  border-bottom: 1px dashed #e2e8f0;
}
</style>
