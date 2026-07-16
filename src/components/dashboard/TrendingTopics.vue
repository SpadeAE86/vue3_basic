<script setup lang="ts">
interface Topic {
  title: string
  hotness: string
  tag: string
  date: string
}

const props = defineProps<{
  trendTopics: Topic[]
}>()

const emit = defineEmits<{
  (e: 'generate-outline', topic: string): void
}>()
</script>

<template>
  <div class="trends-container">
    <div class="trend-intro-box">
      <span class="trend-spark-icon">✨</span>
      <p class="trend-spark-desc">基于您的偏好标签（#AI视频 #Vlog #知识沉淀），佳怡为您推荐了以下热度趋势：</p>
    </div>
    
    <div class="trends-list">
      <div v-for="(topic, index) in props.trendTopics" :key="index" class="trend-item">
        <div class="trend-num" :class="'rank-' + (index + 1)">0{{ index + 1 }}</div>
        <div class="trend-info">
          <span class="trend-title" :title="topic.title">{{ topic.title }}</span>
          <div class="trend-meta">
            <el-tag size="small" class="t-tag" :type="index === 0 ? 'danger' : 'info'">{{ topic.tag }}</el-tag>
            <span class="t-hotness">🔥 热度: {{ topic.hotness }}</span>
          </div>
        </div>
        <div class="trend-action">
          <el-button 
            type="primary" 
            size="small" 
            round 
            class="action-btn"
            @click="emit('generate-outline', topic.title)"
          >
            大纲
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* --- Topics & Trends Card --- */
.trends-container {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(220, 223, 230, 0.5);
  border-radius: 16px;
  padding: 16px 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 320px;
  max-height: 400px;
}

.trend-intro-box {
  display: flex;
  gap: 10px;
  background: rgba(230, 162, 60, 0.06);
  border-radius: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(230, 162, 60, 0.1);
}

.trend-spark-icon {
  font-size: 16px;
}

.trend-spark-desc {
  font-size: 11px;
  color: #b25e00;
  margin: 0;
  line-height: 1.5;
}

.trends-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.trend-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(235, 238, 245, 0.5);
}

.trend-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.trend-num {
  font-size: 22px;
  font-weight: 800;
  font-family: Consolas, Monaco, monospace;
}

.trend-num.rank-1 { color: #f56c6c; }
.trend-num.rank-2 { color: #e6a23c; }
.trend-num.rank-3 { color: #409eff; }

.trend-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.trend-title {
  font-size: 13px;
  font-weight: 700;
  color: #303133;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trend-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.t-tag {
  font-weight: 600;
}

.t-hotness {
  font-size: 10px;
  color: #909399;
}

.action-btn {
  font-weight: 600;
  font-size: 10.5px;
  padding: 6px 12px;
}
</style>
