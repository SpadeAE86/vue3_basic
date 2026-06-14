<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ArrowLeft, ArrowRight, ChatLineRound, MoreFilled, Download, Delete, Plus } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'

const props = defineProps<{
  currentSessionId: string | null
  roleId: string
}>()

const emit = defineEmits<{
  (e: 'select-session', sessionId: string, roleId: string): void
  (e: 'delete-session', sessionId: string): void
}>()

interface Session {
  session_id: string
  title: string
  updated_at: number
  role_id: string
}

const sessions = ref<Session[]>([])
const page = ref(1)
const hasMore = ref(true)
const loading = ref(false)
const isOpen = ref(true)

async function fetchSessions(reset = false) {
  if (loading.value) return
  
  let targetPage = page.value
  if (reset) {
    targetPage = 1
    hasMore.value = true
  }
  if (!hasMore.value) return
  
  loading.value = true
  try {
    const res = await fetch(`/api/chat/sessions?page=${targetPage}&page_size=20&role_id=${props.roleId}`)
    if (res.ok) {
      const data = await res.json()
      if (reset) {
        const activeSession = sessions.value.find((s: Session) => s.session_id === props.currentSessionId)
        sessions.value = data.sessions
        if (activeSession && !data.sessions.some((s: any) => s.session_id === props.currentSessionId)) {
          sessions.value.unshift(activeSession)
        }
        page.value = 2
      } else {
        sessions.value.push(...data.sessions)
        page.value++
      }
      hasMore.value = data.has_more
    }
  } catch (err) {
    console.error('Failed to fetch sessions:', err)
  } finally {
    loading.value = false
  }
}

watch(() => props.roleId, () => {
  fetchSessions(true)
})

function handleScroll(scrollInfo: { scrollTop: number, scrollHeight: number, clientHeight: number }) {
  if (loading.value || !hasMore.value) return
  const { scrollTop, scrollHeight, clientHeight } = scrollInfo
  if (scrollTop + clientHeight >= scrollHeight * 0.8) {
    fetchSessions()
  }
}

function selectSession(sessionId: string) {
  const sess = sessions.value.find(s => s.session_id === sessionId)
  emit('select-session', sessionId, sess?.role_id || 'default')
}

function toggleSidebar() {
  isOpen.value = !isOpen.value
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  
  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins} 分钟前`
  if (diffHours < 24) return `${diffHours} 小时前`
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function handleExport(sessionId: string) {
  window.open(`/api/chat/sessions/${sessionId}/export`, '_blank')
}

async function handleDelete(sessionId: string) {
  try {
    await ElMessageBox.confirm(
      '确定要删除这个会话及其全部历史记录吗？',
      '提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    
    const res = await fetch(`/api/chat/sessions/${sessionId}`, {
      method: 'DELETE'
    })
    
    if (res.ok) {
      const data = await res.json()
      if (data.ok) {
        ElMessage.success('会话已删除')
        emit('delete-session', sessionId)
        fetchSessions(true)
      } else {
        ElMessage.error(`删除失败: ${data.error || '未知错误'}`)
      }
    } else {
      ElMessage.error('删除会话接口响应异常')
    }
  } catch (err) {
    if (err !== 'cancel') {
      console.error('Failed to delete session:', err)
      ElMessage.error('删除会话出现异常')
    }
  }
}

function selectNewChat() {
  emit('select-session', '', props.roleId)
}

function addTemporarySession(sid: string, title: string) {
  if (sessions.value.some(s => s.session_id === sid)) return
  sessions.value.unshift({
    session_id: sid,
    title: title,
    updated_at: Math.floor(Date.now() / 1000),
    role_id: props.roleId
  })
}

onMounted(() => {
  fetchSessions(true)
})

defineExpose({
  refresh: () => fetchSessions(true),
  addTemporarySession,
  sessions
})
</script>

<template>
  <div class="sidebar-wrapper" :class="{ 'is-closed': !isOpen }">
    <!-- 折叠/展开按钮 -->
    <button class="toggle-btn" @click="toggleSidebar">
      <el-icon v-if="isOpen"><ArrowRight /></el-icon>
      <el-icon v-else><ArrowLeft /></el-icon>
    </button>
    
    <!-- 侧边栏主体内容 -->
    <div class="sidebar-content">
      <div class="sidebar-header">
        <el-icon class="header-icon"><ChatLineRound /></el-icon>
        <span class="header-title">历史会话</span>
      </div>
      
      <!-- 新建会话固定入口 -->
      <div class="new-chat-wrapper">
        <div
          class="new-chat-item"
          :class="{ 'is-active': currentSessionId === null || currentSessionId === '' }"
          @click="selectNewChat"
        >
          <el-icon class="plus-icon"><Plus /></el-icon>
          <span class="new-chat-title">新建会话</span>
        </div>
      </div>
      
      <el-scrollbar class="scrollbar" @scroll="handleScroll">
        <div class="session-list">
          <div
            v-for="item in sessions"
            :key="item.session_id"
            class="session-item"
            :class="{ 'is-active': item.session_id === currentSessionId }"
            @click="selectSession(item.session_id)"
          >
            <div class="session-item-main">
              <div class="session-title" :title="item.title">{{ item.title }}</div>
              <div class="session-meta">{{ formatTime(item.updated_at) }}</div>
            </div>
            
            <!-- 操作下拉菜单 -->
            <el-dropdown trigger="click" @click.stop class="session-item-actions">
              <span class="actions-trigger" @click.stop>
                <el-icon><MoreFilled /></el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :icon="Download" @click="handleExport(item.session_id)">
                    导出 JSONL
                  </el-dropdown-item>
                  <el-dropdown-item :icon="Delete" class="delete-action" @click="handleDelete(item.session_id)">
                    删除会话
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          
          <!-- 加载状态 -->
          <div v-if="loading" class="loading-state">
            <el-icon class="is-loading"><i-ep-loading /></el-icon>
            <span>正在加载会话...</span>
          </div>
          
          <!-- 空状态 -->
          <div v-if="sessions.length === 0 && !loading" class="empty-state">
            暂无会话历史记录
          </div>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<style scoped>
.sidebar-wrapper {
  position: relative;
  width: 260px;
  height: 100%;
  background: #181825; /* 深邃的高级灰紫暗色系 */
  border-left: 1px solid #313244;
  display: flex;
  flex-direction: column;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  z-index: 100;
}

.sidebar-wrapper.is-closed {
  width: 0;
  border-left: none;
}

.toggle-btn {
  position: absolute;
  left: -28px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 56px;
  background: #181825;
  border: 1px solid #313244;
  border-right: none;
  border-radius: 10px 0 0 10px;
  color: #a6adc8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 110;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
  transition: background 0.2s, color 0.2s, left 0.3s;
}

.toggle-btn:hover {
  background: #313244;
  color: #cdd6f4;
}

.sidebar-content {
  width: 260px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #313244;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #cdd6f4;
  background: #11111b;
  flex-shrink: 0;
}

.header-icon {
  font-size: 18px;
  color: #b4befe;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
}

.scrollbar {
  flex: 1;
  min-height: 0;
}

.session-list {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.session-item {
  position: relative;
  padding: 12px 14px;
  border-radius: 8px;
  cursor: pointer;
  background: #1e1e2e;
  border: 1px solid #313244;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.session-item:hover {
  background: #313244;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.session-item.is-active {
  background: #b4befe;
  border-color: #b4befe;
}

.session-item-main {
  flex: 1;
  min-width: 0;
}

.session-item.is-active .session-title {
  color: #11111b;
  font-weight: 600;
}

.session-item.is-active .session-meta {
  color: #585b70;
}

.session-title {
  font-size: 13px;
  color: #cdd6f4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.session-meta {
  font-size: 11px;
  color: #7f849c;
  margin-top: 6px;
  display: flex;
  justify-content: flex-end;
}

.session-item-actions {
  opacity: 0;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.session-item:hover .session-item-actions,
.session-item.is-active .session-item-actions {
  opacity: 1;
}

.actions-trigger {
  color: #a6adc8;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
}

.actions-trigger:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #cdd6f4;
}

.session-item.is-active .actions-trigger {
  color: #45475a;
}

.session-item.is-active .actions-trigger:hover {
  background: rgba(0, 0, 0, 0.08);
  color: #11111b;
}

:deep(.delete-action) {
  color: #f38ba8 !important;
}
:deep(.delete-action):hover {
  background-color: rgba(243, 139, 168, 0.1) !important;
}

.loading-state, .empty-state {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: #7f849c;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.loading-state .el-icon {
  font-size: 16px;
  color: #b4befe;
}

/* 新建会话入口样式 */
.new-chat-wrapper {
  padding: 12px;
  border-bottom: 1px solid #313244;
  background: #11111b;
  flex-shrink: 0;
}

.new-chat-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px dashed #b4befe;
  color: #b4befe;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.new-chat-item:hover {
  background: rgba(180, 190, 254, 0.15);
  color: #cdd6f4;
  border-color: #cdd6f4;
}

.new-chat-item.is-active {
  background: #b4befe;
  color: #11111b;
  border-style: solid;
  border-color: #b4befe;
  box-shadow: 0 2px 8px rgba(180, 190, 254, 0.3);
}

.plus-icon {
  font-size: 14px;
}
</style>
