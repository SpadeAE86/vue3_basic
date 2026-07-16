<script setup lang="ts">
const props = defineProps<{
  task: {
    id: string
    progress: number
    message: string
  }
  logs: string
}>()

const emit = defineEmits<{
  (e: 'stop-train'): void
}>()
</script>

<template>
  <div class="training-monitor-panel">
    <div class="monitor-header">
      <div class="monitor-title">
        <span class="pulse-dot"></span>
        🚀 LoRA 后台训练监控中 (任务ID: {{ task.id }})
      </div>
      <div class="monitor-actions">
        <el-button type="danger" size="small" plain @click="emit('stop-train')">
          ⏹️ 终止训练
        </el-button>
      </div>
    </div>
    
    <div class="monitor-body">
      <div class="status-row">
        <span class="status-label">当前步骤：</span>
        <span class="status-value">{{ task.message }}</span>
      </div>
      
      <el-progress 
        :percentage="task.progress" 
        status="success"
        striped 
        :duration="10"
      />

      <!-- Collapsible Terminal logs -->
      <div class="logs-container">
        <div class="logs-title">📜 控制台实时日志 (最新150行)：</div>
        <pre class="terminal-logs">{{ logs }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* === LoRA Training Monitor Styles === */
.training-monitor-panel {
  background: rgba(30, 41, 59, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 16px;
  margin: 10px 0 15px 0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.monitor-title {
  color: #f1f5f9;
  font-weight: 600;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background-color: #ef4444;
  border-radius: 50%;
  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(239, 68, 68, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}

.status-row {
  margin-bottom: 10px;
  font-size: 12px;
}

.status-label {
  color: #94a3b8;
}

.status-value {
  color: #38bdf8;
  font-weight: 500;
}

.logs-container {
  margin-top: 14px;
}

.logs-title {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 6px;
}

.terminal-logs {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 12px;
  color: #e2e8f0;
  font-family: Consolas, Monaco, monospace;
  font-size: 11px;
  line-height: 1.4;
  max-height: 200px;
  overflow-y: auto;
  margin: 0;
  white-space: pre-wrap;
}
</style>
