<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { checkBackendStatusApi } from '@/api/generate'
import { getVideoAnalysisTaskBadgesApi } from '@/api/video_analysis'

const VA_BADGE_BASELINE_KEY = 'va_sidebar_task_badge_baseline'

const defaultMenuOpeneds = ['menu-smart-mix']

const isCollapsed = ref(false)
const route = useRoute()
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

onMounted(() => {
  checkStatus()
  statusCheckTimer = window.setInterval(checkStatus, 10000)
  void refreshVaBadge()
  vaBadgeTimer = window.setInterval(refreshVaBadge, 15000)
  window.addEventListener('va-tasks-submitted', onVaTasksSubmitted)
})

onUnmounted(() => {
  clearInterval(statusCheckTimer)
  clearInterval(vaBadgeTimer)
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

        <el-menu-item index="/image">
          <el-icon><i-ep-picture /></el-icon>
          <template #title>提示词对比</template>
        </el-menu-item>

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
          <el-menu-item index="/task-board/video-match-transcribe">
            <el-icon><i-ep-magic-stick /></el-icon>
            <template #title>脚本转写</template>
          </el-menu-item>
          <el-menu-item index="/task-board/video-match-search">
            <el-icon><i-ep-compass /></el-icon>
            <template #title>素材匹配</template>
          </el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="menu-tools">
          <template #title>
            <el-icon><i-ep-setting /></el-icon>
            <span>工具</span>
          </template>
          <el-menu-item index="/tools/settings">
            <el-icon><i-ep-operation /></el-icon>
            <template #title>设置</template>
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
        <RouterView :key="routerViewKey" />
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
</style>
