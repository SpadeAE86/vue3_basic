<script setup lang="ts">
const props = defineProps<{
  platforms: Array<{
    name: string
    icon: string
    followers: number
    views: number
    likes: number
    target: number
    status: string
    color: string
    textCol: string
  }>
  isSyncing: boolean
  syncProgress: number
  syncMessage: string
}>()

const emit = defineEmits<{
  (e: 'sync'): void
}>()
</script>

<template>
  <div class="metrics-wrapper">
    <div class="card-header-row">
      <span class="section-title">自媒体多账号看板</span>
      <el-button 
        type="primary" 
        size="small" 
        :loading="props.isSyncing" 
        @click="emit('sync')"
      >
        <el-icon class="btn-icon" v-if="!props.isSyncing"><i-ep-refresh /></el-icon>同步各平台
      </el-button>
    </div>
    
    <!-- Platform card grids -->
    <div class="platform-grid-container">
      <div class="platform-grid">
        <el-row :gutter="20">
          <el-col v-for="plat in props.platforms" :key="plat.name" :span="12" class="platform-col">
            <div class="platform-card" :style="{ borderLeft: `4px solid ${plat.textCol}` }">
              <div class="plat-header">
                <div class="plat-avatar-wrapper" :style="{ backgroundColor: plat.color }">
                  <span class="plat-icon">{{ plat.icon }}</span>
                </div>
                <div class="plat-name-info">
                  <span class="plat-title">{{ plat.name }}</span>
                  <el-tag size="small" type="success" effect="plain" class="plat-tag">{{ plat.status }}</el-tag>
                </div>
              </div>
              <div class="plat-metrics">
                <div class="metric-item">
                  <span class="metric-label">粉丝总量</span>
                  <span class="metric-num">{{ plat.followers.toLocaleString() }}</span>
                </div>
                <div class="metric-item">
                  <span class="metric-label">今日播放/阅读</span>
                  <span class="metric-num">{{ plat.views.toLocaleString() }}</span>
                </div>
              </div>
              <div class="plat-goal-progress">
                <div class="progress-labels">
                  <span class="progress-lbl">目标完成率</span>
                  <span class="progress-lbl">{{ Math.round((plat.followers / plat.target) * 100) }}%</span>
                </div>
                <el-progress 
                  :percentage="Math.min(Math.round((plat.followers / plat.target) * 100), 100)" 
                  :color="plat.textCol" 
                  :show-text="false"
                  :stroke-width="6"
                />
              </div>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- Simulated Sync Loader Overlay -->
      <div v-if="props.isSyncing" class="sync-overlay">
        <div class="sync-loader-content">
          <div class="loading-spinner">🌸</div>
          <div class="sync-title">多账号数据同步中</div>
          <el-progress :percentage="props.syncProgress" class="sync-progress-bar" color="#6366f1" />
          <div class="sync-status-msg">{{ props.syncMessage }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.metrics-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  min-height: 28px;
}

.section-title {
  font-size: 15px;
  font-weight: 700;
  color: #303133;
}

.platform-grid-container {
  position: relative;
  flex: 1;
}

.platform-grid {
  margin-bottom: -20px;
}

.platform-col {
  margin-bottom: 20px;
}

.platform-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(220, 223, 230, 0.5);
  border-radius: 16px;
  padding: 16px 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  overflow: hidden;
}

.platform-card:hover {
  background: #ffffff;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.04);
  transform: translateY(-2px);
}

.plat-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.plat-avatar-wrapper {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.plat-icon {
  font-size: 18px;
}

.plat-name-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.plat-title {
  font-size: 13px;
  font-weight: 700;
  color: #303133;
}

.plat-tag {
  border-radius: 4px;
  font-size: 10px;
}

.plat-metrics {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid rgba(235, 238, 245, 0.6);
  border-bottom: 1px solid rgba(235, 238, 245, 0.6);
  padding: 10px 0;
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-label {
  font-size: 10px;
  color: #909399;
}

.metric-num {
  font-size: 15px;
  font-weight: 800;
  color: #303133;
}

.plat-goal-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #909399;
}

/* Simulated Sync Overlay */
.sync-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(6px);
  z-index: 10;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.05);
  border: 1px solid rgba(220, 223, 230, 0.5);
}

.sync-loader-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 75%;
  text-align: center;
}

.loading-spinner {
  font-size: 36px;
  animation: float 2s infinite ease-in-out;
  margin-bottom: 12px;
}

@keyframes float {
  0% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-8px) rotate(180deg); }
  100% { transform: translateY(0px) rotate(360deg); }
}

.sync-title {
  font-size: 14px;
  font-weight: 700;
  color: #303133;
  margin-bottom: 10px;
}

.sync-progress-bar {
  width: 100%;
  margin-bottom: 10px;
}

.sync-status-msg {
  font-size: 11px;
  color: #909399;
}

.btn-icon {
  margin-right: 4px;
}
</style>
