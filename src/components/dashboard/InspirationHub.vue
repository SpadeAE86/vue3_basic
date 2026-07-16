<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useCollectionsStore } from '@/stores/collections'

const router = useRouter()
const collectionsStore = useCollectionsStore()

const quickJotTitle = ref('')

const latestCollections = computed(() => {
  return [...collectionsStore.items]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3)
})

async function submitQuickJot() {
  if (!quickJotTitle.value.trim()) {
    ElMessage.warning('请输入灵感标题或创意内容')
    return
  }
  
  const jotTitle = quickJotTitle.value.trim()
  quickJotTitle.value = ''
  
  // 1. Fetch user's recently active Agent session
  let recentRoleId = 'default'
  try {
    const resp = await fetch('/api/chat/sessions?page=1&page_size=1')
    const data = await resp.json()
    if (data.sessions && data.sessions.length > 0) {
      recentRoleId = data.sessions[0].role_id || 'default'
    }
  } catch (e) {
    console.error('获取最近会话角色失败:', e)
  }

  // 2. Generate a new session ID
  const newSid = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)

  // 3. Create theme space with category 'inspiration'
  // Store session_id and role_id in description JSON
  const descriptionJson = JSON.stringify({ chat_session_id: newSid, role_id: recentRoleId })
  
  try {
    const spaceId = await collectionsStore.createThemeSpace(
      jotTitle,
      'inspiration',
      descriptionJson
    )
    if (!spaceId) {
      ElMessage.error('创建灵感空间失败')
      return
    }
    
    // Notify the user immediately
    ElMessage.success('💡 灵感已保存！Agent 正在后台进行脑暴规划，可点击左侧分类空间或去讨论查看实时进度。')
    
    // Set localStorage active session keys to auto-select this session in Agent Debug page
    localStorage.setItem('agent_debug_active_session_id', newSid)
    localStorage.setItem('agent_debug_active_role_id', recentRoleId)
    
    // Trigger background brain-storming on the persistent collections store (non-blocking)
    void collectionsStore.runBackgroundBrainstorm(newSid, recentRoleId, jotTitle, spaceId)
  } catch (err) {
    console.error('Submit quick jot error:', err)
    ElMessage.error('保存灵感失败')
  }
}

function navigateTo(path: string) {
  void router.push(path)
}
</script>

<template>
  <div class="inspiration-container">
    <!-- Overview stats -->
    <div class="inspiration-summary">
      <div class="summary-box">
        <span class="sum-count">{{ collectionsStore.themeSpaces.length }}</span>
        <span class="sum-lbl">分类主题空间</span>
      </div>
      <div class="summary-box">
        <span class="sum-count">{{ collectionsStore.items.length }}</span>
        <span class="sum-lbl">已沉淀灵感资产</span>
      </div>
    </div>

    <!-- Quick jot box -->
    <div class="quick-jot-box">
      <span class="jot-title">⚡ 闪念速记</span>
      <div class="jot-form">
        <el-input 
          v-model="quickJotTitle" 
          placeholder="记录一瞬间的想法或选题点子，将存为“灵感”..." 
          size="small"
          class="jot-input"
          @keyup.enter="submitQuickJot"
        />
        <div class="jot-actions">
          <span class="jot-type-tag">💡 自动存为灵感</span>
          <el-button type="primary" size="small" @click="submitQuickJot">保存</el-button>
        </div>
      </div>
    </div>

    <!-- Recent items list -->
    <div class="recent-inspiration-list">
      <div class="list-title">最近收藏</div>
      <div v-if="latestCollections.length === 0" class="empty-list">
        暂无已沉淀的素材，在系统各处点击 🌟 即可收藏到这里。
      </div>
      <div v-else class="inspiration-list">
        <div 
          v-for="item in latestCollections" 
          :key="item.id" 
          class="inspiration-item-row"
          @click="navigateTo('/collections')"
        >
          <span class="item-tag-icon">
            <span v-if="item.item_type === 'media'">🎨</span>
            <span v-else-if="item.data?.subtype === 'inspiration'">💡</span>
            <span v-else-if="item.data?.subtype === 'beautify' || item.title.includes('大纲')">✨</span>
            <span v-else>📝</span>
          </span>
          <div class="item-info-col">
            <span class="item-title-text" :title="item.title">{{ item.title }}</span>
            <span class="item-date">{{ new Date(item.created_at).toLocaleString() }}</span>
          </div>
          <el-icon class="arrow-icon"><i-ep-arrow-right /></el-icon>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inspiration-container {
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
}

.inspiration-summary {
  display: flex;
  justify-content: space-around;
  background: rgba(99, 102, 241, 0.05);
  border-radius: 10px;
  padding: 10px 0;
}

.summary-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.sum-count {
  font-size: 18px;
  font-weight: 800;
  color: #6366f1;
}

.sum-lbl {
  font-size: 10px;
  color: #909399;
}

.quick-jot-box {
  background: #f8fafc;
  border-radius: 10px;
  padding: 12px;
  border: 1px dashed rgba(200, 200, 200, 0.5);
}

.jot-title {
  font-size: 11px;
  font-weight: 700;
  color: #475569;
  margin-bottom: 8px;
  display: block;
}

.jot-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.jot-input :deep(.el-input__wrapper) {
  background-color: #ffffff;
}

.jot-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.jot-type-tag {
  font-size: 11px;
  color: #6366f1;
  font-weight: 600;
}

.recent-inspiration-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.list-title {
  font-size: 11px;
  font-weight: 700;
  color: #909399;
  border-bottom: 1px solid rgba(235, 238, 245, 0.6);
  padding-bottom: 6px;
}

.empty-list {
  font-size: 11px;
  color: #c0c4cc;
  text-align: center;
  padding: 15px 0;
  line-height: 1.5;
}

.inspiration-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.inspiration-item-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.inspiration-item-row:hover {
  background: rgba(99, 102, 241, 0.05);
  border-color: rgba(99, 102, 241, 0.1);
}

.item-tag-icon {
  font-size: 14px;
}

.item-info-col {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.item-title-text {
  font-size: 12px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-date {
  font-size: 9px;
  color: #b0b3b8;
  margin-top: 2px;
}

.arrow-icon {
  font-size: 12px;
  color: #c0c4cc;
}
</style>
