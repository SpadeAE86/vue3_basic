<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'

const isCollapsed = ref(false)
const route = useRoute()
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
        :collapse="isCollapsed"
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

        <el-sub-menu index="/tools">
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
          <el-tag type="success" effect="plain" round>v0.1.0</el-tag>
        </div>
      </el-header>

      <el-main class="app-main">
        <RouterView />
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
</style>
