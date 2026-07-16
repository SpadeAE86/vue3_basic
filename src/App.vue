<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { checkBackendStatusApi } from '@/api/generate'
import { getVideoAnalysisTaskBadgesApi } from '@/api/video_analysis'
import { useChatStore } from '@/stores/chat'

const VA_BADGE_BASELINE_KEY = 'va_sidebar_task_badge_baseline'

const defaultMenuOpeneds = ['menu-smart-mix', 'menu-creator-helper']

const isCollapsed = ref(false)
const route = useRoute()
const chatStore = useChatStore()
const isBackendConnected = ref(false)
/** 后端从「未连接」变为「已连接」时递增，强制重挂当前路由以拉取数据（无需用户切换子页） */
const routerViewKey = ref(0)
let statusCheckTimer: number
let vaBadgeTimer: number
const isFirstHealthCheck = true
/** 连续健康检查失败次数；单次超时或丢包不致立刻显示「未连接」（匹配/分析抢占用时更稳） */
let healthFailStreak = 0
/** 避免首屏首次连上时误触发 RouterView 重挂（会把当前页状态刷没） */
let suppressReconnectRouterRemount = true

/** 相对基线的待处理+运行中任务数（进入视频分析/看板页会刷新基线以消除角标） */
const vaBadgeCount = ref(0)

const isVaHubRoute = (p: string) => p === '/video-analysis' || p === '/task-board/video-analysis'

async function refreshVaBadge() {
  try {
    const r = await getVideoAnalysisTaskBadgesApi()
    if (!r.success) return
    const c = r.counts || {}
    const total = (c.PENDING || 0) + (c.RUNNING || 0)
    let baseline = 0
    try {
      baseline = parseInt(localStorage.getItem(VA_BADGE_BASELINE_KEY) || '0', 10) || 0
    } catch {
      baseline = 0
    }
    vaBadgeCount.value = Math.max(0, total - baseline)
  } catch {
    /* ignore */
  }
}

function dismissVaBadgeBaselineToCurrent() {
  void getVideoAnalysisTaskBadgesApi().then((r) => {
    if (!r.success) return
    const c = r.counts || {}
    const total = (c.PENDING || 0) + (c.RUNNING || 0)
    try {
      localStorage.setItem(VA_BADGE_BASELINE_KEY, String(total))
    } catch {
      /* ignore */
    }
    vaBadgeCount.value = 0
  })
}

watch(
  () => route.path,
  (p) => {
    if (isVaHubRoute(p)) dismissVaBadgeBaselineToCurrent()
  },
)

watch(isBackendConnected, (now, was) => {
  if (now && was === false) {
    if (suppressReconnectRouterRemount) {
      suppressReconnectRouterRemount = false
      return
    }
    // 如果是对话、画布或力导图等富交互页面，或者当前对话正在进行中，避免重挂路由以防丢失临时状态
    const path = route.path
    if (path === '/chat' || path === '/canvas' || path === '/graph' || chatStore.chatLoading) {
      return
    }
    routerViewKey.value += 1
  }
})

const checkStatus = async () => {
  const ok = await checkBackendStatusApi()
  if (ok) {
    healthFailStreak = 0
    isBackendConnected.value = true
    return
  }
  healthFailStreak += 1
  if (healthFailStreak >= 2) {
    isBackendConnected.value = false
  }
}

function onVaTasksSubmitted() {
  void refreshVaBadge()
}

// Daily Notification Bell State
interface DailyNote {
  id: number
  agent_id: string
  date_str: string
  content: string
  created_at: string | null
}

const recentNotes = ref<DailyNote[]>([])
const loadingNotes = ref(false)
const hasUnreadNotes = ref(false)
const LATEST_SEEN_NOTE_ID_KEY = 'latest_seen_daily_note_id'
let notesTimer: number

async function fetchNotificationNotes() {
  loadingNotes.value = true
  try {
    const res = await fetch(`/api/agent/daily-messages?limit=5&t=${Date.now()}`)
    if (res.ok) {
      const data = await res.json()
      if (data.success && data.data) {
        recentNotes.value = data.data
        
        if (data.data.length > 0) {
          const latestId = data.data[0].id
          const lastSeenIdStr = localStorage.getItem(LATEST_SEEN_NOTE_ID_KEY)
          if (!lastSeenIdStr || parseInt(lastSeenIdStr, 10) < latestId) {
            hasUnreadNotes.value = true
          } else {
            hasUnreadNotes.value = false
          }
        } else {
          hasUnreadNotes.value = false
        }
      }
    }
  } catch (err) {
    console.error('Failed to fetch daily notes for notifications:', err)
  } finally {
    loadingNotes.value = false
  }
}

function markNotificationsAsRead() {
  const firstNote = recentNotes.value[0]
  if (firstNote) {
    const latestId = firstNote.id
    localStorage.setItem(LATEST_SEEN_NOTE_ID_KEY, String(latestId))
    hasUnreadNotes.value = false
  }
}

function getAgentName(agentId: string) {
  if (agentId === 'neuro') return '欣怡'
  if (agentId === 'default' || agentId === 'cc') return 'CC'
  return agentId
}

function getAgentAvatar(agentId: string) {
  if (agentId === 'neuro') return '🌸'
  if (agentId === 'default' || agentId === 'cc') return '⚡'
  return '👤'
}

// TTS Playback State for Notifications
const activeNotificationAudio = ref<HTMLAudioElement | null>(null)
const playingNotificationId = ref<number | null>(null)
const loadingNotificationId = ref<number | null>(null)
const ttsUrlCache: Record<string, string> = {}

async function playNotificationTTS(note: DailyNote) {
  const text = note.content
  let voice = 'Vivi'
  try {
    const rolesRes = await fetch(`/api/chat/roles?t=${Date.now()}`)
    if (rolesRes.ok) {
      const allRoles = await rolesRes.json()
      const foundRole = allRoles.find((r: any) => r.id === note.agent_id)
      if (foundRole && foundRole.voice_character) {
        voice = foundRole.voice_character
      }
    }
  } catch (e) {
    console.error('Failed to resolve role voice, fallback to Vivi', e)
  }

  const cacheKey = `${text}_${voice}`

  if (activeNotificationAudio.value) {
    activeNotificationAudio.value.pause()
    activeNotificationAudio.value = null
  }

  if (playingNotificationId.value === note.id) {
    playingNotificationId.value = null
    return
  }

  loadingNotificationId.value = note.id

  try {
    let url: string | undefined = ttsUrlCache[cacheKey]
    if (!url) {
      const res = await fetch('/api/chat/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, speed: 1.0, disable_segmentation: true, byte_stream: true })
      })
      if (!res.ok) throw new Error('TTS 请求失败')
      
      const reader = res.body?.getReader()
      if (!reader) throw new Error('无法读取响应流')
      
      const decoder = new TextDecoder()
      let buffer = ''
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        
        for (const part of parts) {
          const lines = part.split('\n').filter(l => l.startsWith('data: '))
          for (const line of lines) {
            const dataStr = line.slice(6)
            if (dataStr === '[DONE]') continue
            
            try {
              const raw = JSON.parse(dataStr)
              if (raw.event_type === 'merged_audio' && raw.url) {
                url = raw.url
              } else if (raw.event_type === 'error') {
                throw new Error(raw.message || 'TTS 生成错误')
              }
            } catch (e) {
              // 忽略其他事件的解析错误
            }
          }
        }
      }

      if (url) {
        ttsUrlCache[cacheKey] = url
      }
    }

    if (!url) {
      throw new Error('未获取到有效的音频链接')
    }

    loadingNotificationId.value = null
    playingNotificationId.value = note.id

    const audio = new Audio(url)
    activeNotificationAudio.value = audio
    audio.onended = () => {
      if (playingNotificationId.value === note.id) {
        playingNotificationId.value = null
      }
    }
    audio.onerror = () => {
      ElMessage.error('音频加载或播放失败')
      playingNotificationId.value = null
    }
    audio.play()
  } catch (err: any) {
    console.error(err)
    ElMessage.error(err.message || '语音合成失败')
    loadingNotificationId.value = null
    playingNotificationId.value = null
  }
}


onMounted(() => {
  checkStatus()
  statusCheckTimer = window.setInterval(checkStatus, 10000)
  void refreshVaBadge()
  vaBadgeTimer = window.setInterval(refreshVaBadge, 15000)
  void fetchNotificationNotes()
  notesTimer = window.setInterval(fetchNotificationNotes, 300000)
  window.addEventListener('va-tasks-submitted', onVaTasksSubmitted)
})

onUnmounted(() => {
  clearInterval(statusCheckTimer)
  clearInterval(vaBadgeTimer)
  clearInterval(notesTimer)
  window.removeEventListener('va-tasks-submitted', onVaTasksSubmitted)
})
</script>

<template>
  <el-container class="app-container">
    <!-- 侧边栏 -->
    <el-aside :width="isCollapsed ? '64px' : '220px'" class="app-aside">
      <div class="aside-header">
        <img alt="Logo" src="@/assets/logo.svg" class="aside-logo" />
        <span v-show="!isCollapsed" class="aside-title">QuickStart</span>
      </div>

      <el-menu
        :default-active="route.path"
        :default-openeds="defaultMenuOpeneds"
        :collapse="isCollapsed"
        :collapse-transition="false"
        router
        class="aside-menu"
      >
        <el-menu-item index="/">
          <el-icon><i-ep-home-filled /></el-icon>
          <template #title>首页</template>
        </el-menu-item>

        <el-menu-item index="/about">
          <el-icon><i-ep-info-filled /></el-icon>
          <template #title>关于</template>
        </el-menu-item>

        <el-menu-item index="/graph">
          <el-icon><i-ep-share /></el-icon>
          <template #title>力导图</template>
        </el-menu-item>

        <el-menu-item index="/chat">
          <el-icon><i-ep-chat-dot-round /></el-icon>
          <template #title>Agent 调试</template>
        </el-menu-item>

        <el-menu-item index="/role-cards">
          <el-icon><i-ep-postcard /></el-icon>
          <template #title>角色卡</template>
        </el-menu-item>

        <el-sub-menu index="menu-creator-helper">
          <template #title>
            <el-icon><i-ep-magic-stick /></el-icon>
            <span>创作助手</span>
          </template>
          <el-menu-item index="/canvas">
            <el-icon><i-ep-grid /></el-icon>
            <template #title>工程画布</template>
          </el-menu-item>
          <el-menu-item index="/image">
            <el-icon><i-ep-picture /></el-icon>
            <template #title>提示词对比</template>
          </el-menu-item>
          <el-menu-item index="/collections">
            <el-icon><i-ep-star /></el-icon>
            <template #title>收藏空间</template>
          </el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="menu-smart-mix">
          <template #title>
            <el-icon><i-ep-film /></el-icon>
            <span>智能混剪</span>
          </template>
          <el-menu-item index="/video-analysis">
            <el-icon><i-ep-video-play /></el-icon>
            <template #title>
              <span class="menu-title-row">
                <span>视频分析</span>
                <el-badge
                  v-if="vaBadgeCount > 0 && !isCollapsed"
                  :value="vaBadgeCount"
                  :max="99"
                  class="sidebar-menu-badge"
                />
              </span>
            </template>
          </el-menu-item>
          <el-menu-item index="/video-match">
            <el-icon><i-ep-compass /></el-icon>
            <template #title>视频匹配</template>
          </el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="menu-task-board">
          <template #title>
            <el-icon><i-ep-grid /></el-icon>
            <span>任务看板</span>
          </template>
          <el-menu-item index="/task-board/image">
            <el-icon><i-ep-picture /></el-icon>
            <template #title>图像生成</template>
          </el-menu-item>
          <el-menu-item index="/task-board/video-gen">
            <el-icon><i-ep-video-play /></el-icon>
            <template #title>视频生成</template>
          </el-menu-item>
          <el-menu-item index="/task-board/video-analysis">
            <el-icon><i-ep-video-camera /></el-icon>
            <template #title>
              <span class="menu-title-row">
                <span>视频分析</span>
                <el-badge
                  v-if="vaBadgeCount > 0 && !isCollapsed"
                  :value="vaBadgeCount"
                  :max="99"
                  class="sidebar-menu-badge"
                />
              </span>
            </template>
          </el-menu-item>
          <el-menu-item index="/task-board/video-match-tag">
            <el-icon><i-ep-price-tag /></el-icon>
            <template #title>抽标签记录</template>
          </el-menu-item>
          <el-menu-item index="/task-board/video-match-transcribe">
            <el-icon><i-ep-magic-stick /></el-icon>
            <template #title>脚本转写</template>
          </el-menu-item>
          <el-menu-item index="/task-board/video-match-search">
            <el-icon><i-ep-compass /></el-icon>
            <template #title>素材匹配</template>
          </el-menu-item>
          <el-menu-item index="/task-board/lora">
            <el-icon><i-ep-setting /></el-icon>
            <template #title>LoRA 看板</template>
          </el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="menu-tools">
          <template #title>
            <el-icon><i-ep-setting /></el-icon>
            <span>系统管理</span>
          </template>
          <el-menu-item index="/scheduler">
            <el-icon><i-ep-clock /></el-icon>
            <template #title>定时任务</template>
          </el-menu-item>
          <el-menu-item index="/tools/settings">
            <el-icon><i-ep-operation /></el-icon>
            <template #title>全局设置</template>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>

      <!-- 折叠按钮 -->
      <div class="aside-footer" @click="isCollapsed = !isCollapsed">
        <el-icon :size="18">
          <i-ep-d-arrow-left v-if="!isCollapsed" />
          <i-ep-d-arrow-right v-else />
        </el-icon>
        <span v-show="!isCollapsed" class="collapse-text">收起</span>
      </div>
    </el-aside>

    <!-- 主内容区 -->
    <el-container class="app-main-container">
      <el-header class="app-header">
        <div class="header-left">
          <span class="page-title">{{ route.meta.title || '首页' }}</span>
        </div>
        <div class="header-right">
          <!-- Agent 晚间留言板 消息中心 -->
          <el-popover
            placement="bottom-end"
            :width="350"
            trigger="click"
            popper-style="padding: 0; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.15); border: 1px solid rgba(220, 223, 230, 0.6);"
            @before-enter="markNotificationsAsRead"
          >
            <template #reference>
              <div class="bell-notification-trigger">
                <el-badge :is-dot="hasUnreadNotes" class="notification-badge">
                  <el-icon :size="20" class="header-bell-icon"><i-ep-bell /></el-icon>
                </el-badge>
              </div>
            </template>
            
            <div class="notification-popover-content">
              <div class="popover-header">
                <span class="popover-title">Agent 晚间留言</span>
                <el-button 
                  v-if="recentNotes.length > 0"
                  type="primary" 
                  link 
                  size="small"
                  @click="markNotificationsAsRead"
                >
                  清除红点
                </el-button>
              </div>
              <div v-loading="loadingNotes" class="popover-body">
                <div v-if="recentNotes.length === 0" class="empty-notifications">
                  <el-empty :image-size="60" description="暂无留言" />
                </div>
                <div v-else class="notification-list">
                  <div 
                    v-for="note in recentNotes" 
                    :key="note.id" 
                    class="notification-item"
                  >
                    <div class="notification-item-header">
                      <div class="agent-avatar-mini">{{ getAgentAvatar(note.agent_id) }}</div>
                      <span class="agent-name-mini">{{ getAgentName(note.agent_id) }}</span>
                      <span class="notification-date">{{ note.date_str }}</span>
                      
                      <!-- TTS Read Aloud Icon -->
                      <div 
                        class="tts-play-btn" 
                        :class="{ 'is-active': loadingNotificationId === note.id || playingNotificationId === note.id }" 
                        @click.stop="playNotificationTTS(note)"
                        title="朗读此条留言"
                      >
                        <el-icon v-if="loadingNotificationId === note.id" class="is-loading"><i-ep-loading /></el-icon>
                        <el-icon v-else-if="playingNotificationId === note.id"><i-ep-video-pause /></el-icon>
                        <el-icon v-else><i-ep-microphone /></el-icon>
                      </div>
                    </div>
                    <div class="notification-item-body">
                      {{ note.content }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="popover-footer">
                <router-link to="/scheduler" class="view-all-link">
                  进入系统管理查看全部日程与留言
                </router-link>
              </div>
            </div>
          </el-popover>

          <el-tooltip
            :content="isBackendConnected ? '后端已连接' : '后端未连接'"
            placement="bottom"
          >
            <div class="status-indicator">
              <span class="status-dot" :class="{ 'is-connected': isBackendConnected }"></span>
              <span class="status-text">{{ isBackendConnected ? '已连接' : '未连接' }}</span>
            </div>
          </el-tooltip>
          <el-tag type="success" effect="plain" round>v0.1.0</el-tag>
        </div>
      </el-header>

      <el-main class="app-main">
        <router-view v-slot="{ Component }">
          <keep-alive :max="10">
            <component :is="Component" :key="route.path + '_' + routerViewKey" />
          </keep-alive>
        </router-view>
        <el-backtop target=".app-main" :right="24" :bottom="24" />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-container {
  height: 100vh;
  overflow: hidden;
}

/* --- 侧边栏 --- */
.app-aside {
  background: #1d1e2c;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  overflow: hidden;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.aside-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  height: 60px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.aside-logo {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.aside-title {
  font-size: 16px;
  font-weight: 600;
  color: #e0e0e0;
  white-space: nowrap;
  letter-spacing: 0.5px;
}

.aside-menu {
  flex: 1;
  border-right: none;
  background: transparent;
  --el-menu-bg-color: transparent;
  --el-menu-text-color: #a0a3bd;
  --el-menu-hover-bg-color: rgba(99, 102, 241, 0.12);
  --el-menu-hover-text-color: #818cf8;
  --el-menu-active-color: #818cf8;
  --el-menu-item-height: 46px;
}

.aside-menu:not(.el-menu--collapse) {
  width: 100%;
}

.aside-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  cursor: pointer;
  color: #636780;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  transition: color 0.2s;
  white-space: nowrap;
}

.aside-footer:hover {
  color: #818cf8;
}

.collapse-text {
  font-size: 13px;
}

/* --- 顶栏 --- */
.app-header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: #ffffff;
  border-bottom: 1px solid #ebeef5;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.page-title {
  font-size: 17px;
  font-weight: 600;
  color: #303133;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* --- 主内容 --- */
.app-main {
  background: #f5f7fa;
  overflow-y: auto;
  padding: 20px;
}

/* --- 状态指示器 --- */
.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 16px;
  background: #f5f7fa;
  cursor: default;
  transition: all 0.3s ease;
}

.status-indicator:hover {
  background: #ebeef5;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #f56c6c;
  box-shadow: 0 0 4px rgba(245, 108, 108, 0.5);
  transition: all 0.3s ease;
}

.status-dot.is-connected {
  background-color: #67c23a;
  box-shadow: 0 0 4px rgba(103, 194, 58, 0.5);
}

.status-text {
  font-size: 13px;
  color: #606266;
}

.menu-title-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.sidebar-menu-badge :deep(.el-badge__content) {
  border: none;
  background-color: rgba(129, 140, 248, 0.28);
  color: #c7d2fe;
  font-size: 11px;
  font-weight: 500;
  height: 18px;
  line-height: 18px;
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  box-shadow: none;
  vertical-align: middle;
  position: relative;
  top: 0;
}

/* 自定义回到顶部按钮为扁平化的现代方形，与截图一致 */
:deep(.el-backtop) {
  border-radius: 4px !important;
  background-color: #ffffff !important;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08) !important;
  border: 1px solid #ebeef5 !important;
  width: 40px !important;
  height: 40px !important;
  color: #606266 !important;
  transition: all 0.3s;
}

:deep(.el-backtop:hover) {
  background-color: #f5f7fa !important;
  color: #6366f1 !important;
}
/* --- Notification Bell Styles --- */
.bell-notification-trigger {
  margin-right: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  transition: all 0.3s;
}

.bell-notification-trigger:hover {
  background: rgba(99, 102, 241, 0.08);
}

.header-bell-icon {
  color: #606266;
  transition: color 0.3s;
}

.bell-notification-trigger:hover .header-bell-icon {
  color: #6366f1;
}

.notification-popover-content {
  display: flex;
  flex-direction: column;
  background: #ffffff;
}

.popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f2f2f6;
  background: #fdfdfd;
}

.popover-title {
  font-size: 14px;
  font-weight: 700;
  color: #303133;
}

.popover-body {
  max-height: 300px;
  overflow-y: auto;
  padding: 8px 16px;
}

.empty-notifications {
  padding: 30px 0;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.notification-item {
  padding: 8px 0;
  border-bottom: 1px solid #f2f2f6;
}

.notification-item:last-child {
  border-bottom: none;
}

.notification-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.agent-avatar-mini {
  font-size: 16px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
}

.agent-name-mini {
  font-size: 12px;
  font-weight: 600;
  color: #303133;
}

.notification-date {
  font-size: 11px;
  font-family: Consolas, Monaco, monospace;
  color: #909399;
  margin-left: auto;
}

.notification-item-body {
  font-size: 12px;
  line-height: 1.5;
  color: #606266;
  white-space: pre-wrap;
  text-align: justify;
}

.popover-footer {
  padding: 10px 16px;
  border-top: 1px solid #f2f2f6;
  background: #fbfbfb;
  text-align: center;
}

.view-all-link {
  font-size: 11.5px;
  color: #6366f1;
  text-decoration: none;
  font-weight: 600;
}

.view-all-link:hover {
  text-decoration: underline;
}

/* --- TTS Read Aloud Button --- */
.tts-play-btn {
  margin-left: 8px;
  cursor: pointer;
  color: #909399;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 50%;
  transition: all 0.2s;
  background: #f1f5f9;
  width: 20px;
  height: 20px;
}
.tts-play-btn:hover {
  color: #6366f1;
  background: rgba(99, 102, 241, 0.12);
}
.notification-item:hover .tts-play-btn {
  display: inline-flex;
}
.tts-play-btn.is-active {
  display: inline-flex;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.12);
}
</style>
