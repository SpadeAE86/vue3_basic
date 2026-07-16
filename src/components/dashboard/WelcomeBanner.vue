<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  timeGreeting: { text: string; class: string; sub: string }
  latestNote: any
  loadingNote: boolean
}>()

const emit = defineEmits<{
  (e: 'open-growth'): void
}>()

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

function formatNoteContent(content: string) {
  if (!content) return ''
  return content.replace(/\n/g, '<br>')
}
</script>

<template>
  <div class="welcome-banner" :class="props.timeGreeting.class">
    <div class="banner-overlay"></div>
    <div class="banner-content">
      <div class="welcome-text-area">
        <h1 class="welcome-title">{{ props.timeGreeting.text }}，自媒体创作人</h1>
        <p class="welcome-subtitle">{{ props.timeGreeting.sub }}</p>
        <div class="banner-actions">
          <el-button 
            type="default" 
            round 
            class="banner-btn" 
            @click="emit('open-growth')"
          >
            <el-icon class="btn-icon"><i-ep-postcard /></el-icon>今日成长规划
          </el-button>
        </div>
      </div>
      
      <!-- Agent Greeting Card -->
      <div v-loading="props.loadingNote" class="agent-greeting-card">
        <div v-if="props.latestNote" class="greeting-card-content">
          <div class="card-header">
            <span class="avatar-circle">{{ getAgentAvatar(props.latestNote.agent_id) }}</span>
            <div class="header-info">
              <span class="note-agent-name">{{ getAgentName(props.latestNote.agent_id) }}</span>
              <span class="note-date">{{ props.latestNote.date_str }} 晚安留言</span>
            </div>
          </div>
          <div class="card-body" v-html="formatNoteContent(props.latestNote.content)"></div>
        </div>
        <div v-else class="greeting-card-empty">
          <div class="empty-icon">🌸</div>
          <p class="empty-text">欣怡昨晚尚未投递留言卡片，当定时归档整理任务运行后，日常寄语与晚安信会显示在此处哦。</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* --- Welcome Banner --- */
.welcome-banner {
  position: relative;
  border-radius: 20px;
  padding: 30px;
  color: #ffffff;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.05);
  margin-bottom: 24px;
  display: flex;
  transition: all 0.5s ease;
}

.welcome-banner.morning {
  background: linear-gradient(135deg, #ff7e5f, #feb47b, #86a8e7);
}
.welcome-banner.noon {
  background: linear-gradient(135deg, #2193b0, #6dd5ed, #a8c0ff);
}
.welcome-banner.afternoon {
  background: linear-gradient(135deg, #1f4068, #162447, #e43f5a);
}
.welcome-banner.evening {
  background: linear-gradient(135deg, #3d3b75, #5b5b9c, #2b1055);
}

.banner-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(2px);
  z-index: 1;
}

.banner-content {
  position: relative;
  z-index: 2;
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  gap: 30px;
}

.welcome-text-area {
  max-width: 55%;
}

.welcome-title {
  font-size: 26px;
  font-weight: 800;
  margin: 0 0 10px 0;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.welcome-subtitle {
  font-size: 13.5px;
  line-height: 1.5;
  opacity: 0.9;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  margin-bottom: 18px;
}

.banner-actions {
  display: flex;
  gap: 12px;
}

.banner-btn {
  background: rgba(255, 255, 255, 0.2) !important;
  border: 1px solid rgba(255, 255, 255, 0.3) !important;
  color: #ffffff !important;
  font-weight: 600;
  transition: all 0.3s;
}

.banner-btn:hover {
  background: rgba(255, 255, 255, 0.35) !important;
  transform: translateY(-2px);
}

.btn-icon {
  margin-right: 4px;
}

/* --- Agent Greeting Card in Banner --- */
.agent-greeting-card {
  width: 40%;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.25);
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  min-height: 160px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
}

.greeting-card-content {
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.avatar-circle {
  font-size: 22px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
}

.header-info {
  display: flex;
  flex-direction: column;
}

.note-agent-name {
  font-size: 14px;
  font-weight: 700;
  color: #ffffff;
}

.note-date {
  font-size: 10px;
  opacity: 0.8;
  color: #ffffff;
  margin-top: 1px;
}

.card-body {
  font-size: 12px;
  line-height: 1.6;
  color: #ffffff;
  max-height: 120px;
  overflow-y: auto;
  text-align: justify;
}

.greeting-card-empty {
  text-align: center;
  padding: 10px;
}

.empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.empty-text {
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.85;
  margin: 0;
}
</style>
