<script setup lang="ts">
const props = defineProps<{
  chronologicalTimelineItems: Array<{
    id: string
    isCurrentTime?: boolean
    time: string
    hour: number
    minute: number
    name: string
    status?: string
    duration?: string | null
    error?: string | null
    desc?: string
    job_id?: string
  }>
  currentTimeStr: string
  loadingTimeline: boolean
}>()

const emit = defineEmits<{
  (e: 'trigger-job', jobId: string): void
}>()

function getStatusType(status?: string) {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'primary'
  return 'info'
}

function getStatusLabel(status?: string) {
  if (status === 'success') return '成功'
  if (status === 'failed') return '失败'
  if (status === 'running') return '执行中'
  if (status === 'planned') return '已规划'
  return status || ''
}
</script>

<template>
  <div class="timeline-widget-card" v-loading="props.loadingTimeline">
    <div class="timeline-scroll-container">
      <div class="timeline-list">
        <div 
          v-for="item in props.chronologicalTimelineItems" 
          :key="item.id" 
          :class="item.isCurrentTime ? 'timeline-current-row' : 'timeline-event-row'"
        >
          <!-- Time label -->
          <div class="timeline-time-label" :class="{ 'red-text': item.isCurrentTime }">
            {{ item.time }}
          </div>
          
          <!-- Vertical node divider -->
          <div class="timeline-center-divider">
            <div v-if="item.isCurrentTime" class="pulsing-red-dot"></div>
            <div 
              v-else 
              class="event-status-dot" 
              :class="item.status"
            >
              <el-icon v-if="item.status === 'success'" size="10"><i-ep-check /></el-icon>
              <el-icon v-else-if="item.status === 'failed'" size="10"><i-ep-close /></el-icon>
              <el-icon v-else-if="item.status === 'running'" class="is-loading" size="10"><i-ep-loading /></el-icon>
              <el-icon v-else size="10"><i-ep-clock /></el-icon>
            </div>
            <div class="vertical-connecting-line"></div>
          </div>
          
          <!-- Right details card -->
          <div v-if="item.isCurrentTime" class="current-time-divider-line">
            <span class="divider-tag">当前时刻</span>
            <div class="pulse-line"></div>
          </div>
          
          <div v-else class="event-details-card" :class="item.status">
            <el-popover placement="top" :width="300" trigger="hover">
              <template #reference>
                <div class="details-card-body">
                  <span class="job-name-txt">{{ item.name }}</span>
                  <el-tag :type="getStatusType(item.status)" size="small" effect="dark" class="status-tag">
                    {{ getStatusLabel(item.status) }}
                  </el-tag>
                </div>
              </template>
              
              <div class="popover-detail">
                <div class="pop-title">{{ item.name }}</div>
                <div class="pop-meta">
                  <p><strong>计划启动时间:</strong> {{ item.time }}</p>
                  <p><strong>当前运行状态:</strong> 
                    <el-tag :type="getStatusType(item.status)" size="small">{{ getStatusLabel(item.status) }}</el-tag>
                  </p>
                  <p v-if="item.duration"><strong>上一次耗时:</strong> {{ item.duration }}</p>
                  <p v-if="item.error" class="text-error"><strong>报错日志:</strong> {{ item.error }}</p>
                  <p v-if="item.desc"><strong>任务简介:</strong> {{ item.desc }}</p>
                </div>
                <div class="pop-actions" v-if="item.job_id && item.status !== 'running' && !item.job_id.startsWith('mock-')">
                  <el-button type="primary" size="small" @click="emit('trigger-job', item.job_id)">立即执行一次</el-button>
                </div>
              </div>
            </el-popover>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-widget-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(220, 223, 230, 0.5);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
  min-height: 320px;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
}

.timeline-scroll-container {
  overflow-y: auto;
  flex: 1;
  padding-right: 8px;
}

.timeline-list {
  position: relative;
  display: flex;
  flex-direction: column;
}

.timeline-event-row, .timeline-current-row {
  display: flex;
  align-items: stretch;
  min-height: 60px;
  position: relative;
}

.timeline-time-label {
  width: 50px;
  font-size: 12px;
  font-weight: 700;
  color: #909399;
  text-align: right;
  padding-top: 2px;
  font-family: Consolas, Monaco, monospace;
}

.timeline-time-label.red-text {
  color: #f56c6c;
}

.timeline-center-divider {
  width: 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  margin: 0 10px;
}

.vertical-connecting-line {
  width: 2px;
  background-color: rgba(220, 223, 230, 0.8);
  flex: 1;
}

.timeline-event-row:last-child .vertical-connecting-line {
  display: none;
}

.event-status-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  z-index: 2;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  transition: all 0.3s;
}

.event-status-dot.success {
  border-color: #67c23a;
  color: #67c23a;
  background: rgba(103, 194, 58, 0.1);
}

.event-status-dot.failed {
  border-color: #f56c6c;
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.1);
}

.event-status-dot.running {
  border-color: #409eff;
  color: #409eff;
  background: rgba(64, 158, 255, 0.1);
}

.event-status-dot.planned {
  border-color: #e6a23c;
  color: #e6a23c;
  background: rgba(230, 162, 60, 0.1);
}

.pulsing-red-dot {
  width: 10px;
  height: 10px;
  background: #f56c6c;
  border-radius: 50%;
  z-index: 2;
  box-shadow: 0 0 8px #f56c6c;
  margin-top: 5px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(245, 108, 108, 0.7); }
  70% { transform: scale(1.3); opacity: 0.5; box-shadow: 0 0 0 6px rgba(245, 108, 108, 0); }
  100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(245, 108, 108, 0); }
}

.current-time-divider-line {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 10px;
  height: 20px;
}

.divider-tag {
  background: #f56c6c;
  color: #ffffff;
  font-size: 9px;
  font-weight: bold;
  padding: 1px 6px;
  border-radius: 4px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.1);
  box-shadow: 0 2px 5px rgba(245, 108, 108, 0.3);
}

.pulse-line {
  flex: 1;
  height: 1px;
  border-bottom: 2px dashed #f56c6c;
  opacity: 0.65;
}

.event-details-card {
  flex: 1;
  background: #ffffff;
  border: 1px solid rgba(220, 223, 230, 0.7);
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 14px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 6px rgba(0,0,0,0.01);
  display: flex;
  align-items: center;
}

.event-details-card:hover {
  transform: translateX(4px);
  border-color: rgba(99, 102, 241, 0.25);
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
}

.event-details-card.success { border-left: 3px solid #67c23a; }
.event-details-card.failed { border-left: 3px solid #f56c6c; }
.event-details-card.running { border-left: 3px solid #409eff; }
.event-details-card.planned { border-left: 3px solid #e6a23c; }

.details-card-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.job-name-txt {
  font-size: 12.5px;
  font-weight: 600;
  color: #303133;
}

.status-tag {
  border-radius: 4px;
  font-size: 10px;
}

.popover-detail {
  padding: 8px 4px;
}

.pop-title {
  font-size: 14px;
  font-weight: 700;
  color: #303133;
  margin-bottom: 10px;
  border-bottom: 1px solid #ebeef5;
  padding-bottom: 6px;
}

.pop-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 11.5px;
  color: #606266;
  line-height: 1.5;
}

.pop-meta p {
  margin: 0;
}

.text-error {
  color: #f56c6c;
}

.pop-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}
</style>
