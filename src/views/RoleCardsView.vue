<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()
const roles = ref<any[]>([])
const loading = ref(false)

const createDialogVisible = ref(false)
const newRoleName = ref('')
const createLoading = ref(false)

async function fetchRoles() {
  loading.value = true
  try {
    const res = await fetch(`/api/chat/roles?t=${Date.now()}`)
    if (res.ok) {
      roles.value = await res.json()
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('获取角色列表失败')
  } finally {
    loading.value = false
  }
}

async function handleCreateRole() {
  if (!newRoleName.value.trim()) {
    ElMessage.warning('请输入角色名称')
    return
  }
  createLoading.value = true
  try {
    const res = await fetch('/api/chat/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newRoleName.value.trim() })
    })
    const data = await res.json()
    if (data.ok && data.role) {
      ElMessage.success('角色创建成功')
      createDialogVisible.value = false
      newRoleName.value = ''
      // 跳转到该角色的角色空间
      router.push(`/roles/${data.role.id}`)
    } else {
      ElMessage.error(data.error || '创建失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('网络请求失败')
  } finally {
    createLoading.value = false
  }
}

function getFirstSentence(text: string) {
  if (!text) return ''
  const match = text.trim().match(/^[^。！？.!?]+(?:[。！？.!?])?/)
  return match ? match[0] : text
}

function getRoleGradient(roleId: string) {
  if (!roleId) return 'linear-gradient(135deg, #e9d5ff 0%, #fbcfe8 100%)'
  
  const gradients = [
    'linear-gradient(135deg, #f3e8ff 0%, #fae8ff 50%, #e0e7ff 100%)', // Soft Lavender
    'linear-gradient(135deg, #ffedd5 0%, #ffd6e8 100%)', // Soft Rose Sunset
    'linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%)', // Soft Sky Cyan
    'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', // Soft Mint Green
    'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', // Soft Cream Gold
    'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)', // Light Amethyst
  ]
  
  let hash = 0
  for (let i = 0; i < roleId.length; i++) {
    hash = roleId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % gradients.length
  return gradients[index]
}

onMounted(() => {
  fetchRoles()
})
</script>

<template>
  <div class="role-cards-container" v-loading="loading">
    <div class="cards-grid">
      <!-- 已有角色卡 -->
      <div 
        v-for="role in roles" 
        :key="role.id" 
        class="role-card-vertical"
        @click="router.push(`/roles/${role.id}`)"
      >
        <!-- 背景图 -->
        <div v-if="role.portrait_url" class="portrait-background" :style="{ backgroundImage: `url(${role.portrait_url})` }" />
        <div v-else class="default-portrait-bg" :style="{ background: getRoleGradient(role.id) }">
          <el-icon class="default-portrait-silhouette"><i-ep-picture /></el-icon>
          <span class="placeholder-text">点击完善角色背景</span>
        </div>

        <!-- 底部面板 (名字与简介常驻，操作按钮 Hover 淡入) -->
        <div class="card-bottom-panel" @click.stop>
          <div class="card-info-layout">
            <!-- 左侧：名字与人设 -->
            <div class="card-text-side" @click="router.push(`/roles/${role.id}`)">
              <h3 class="role-name">{{ role.name }}</h3>
              <p class="role-desc" :title="role.description">
                {{ getFirstSentence(role.description) || '暂无详细设定简介，点击进入空间配置。' }}
              </p>
            </div>
            
            <!-- 右侧：按钮操作排 (Hover 展现) -->
            <div class="card-actions-side">
              <el-tooltip content="去对话" placement="top">
                <div class="icon-btn primary" @click="router.push(`/chat?role_id=${role.id}`)">
                  <el-icon><i-ep-chat-dot-round /></el-icon>
                </div>
              </el-tooltip>

              <el-tooltip content="配置角色人设/相册" placement="top">
                <div class="icon-btn" @click="router.push(`/roles/${role.id}`)">
                  <el-icon><i-ep-setting /></el-icon>
                </div>
              </el-tooltip>
            </div>
          </div>
        </div>
      </div>

      <!-- 空白新建卡 -->
      <div class="role-card-vertical is-create" @click="createDialogVisible = true">
        <div class="create-card-content">
          <el-icon class="create-icon"><i-ep-plus /></el-icon>
          <span class="create-text">新建角色卡</span>
        </div>
      </div>
    </div>

    <!-- 创建角色 Dialog -->
    <el-dialog
      v-model="createDialogVisible"
      title="新建角色卡"
      width="400px"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item label="角色名称" required>
          <el-input v-model="newRoleName" placeholder="例如：我的傲娇伙伴、编程助手" maxlength="20" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="handleCreateRole">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.role-cards-container {
  padding: 24px;
  background: #fafbfe;
  min-height: calc(100vh - 64px);
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.role-card-vertical {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  aspect-ratio: 2 / 3;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.4s ease;
  width: 100%;
  cursor: pointer;
  background-color: #fff;
}

.role-card-vertical:hover {
  transform: scale(1.02);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

/* 背景图与立绘 */
.portrait-background {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  position: absolute;
  top: 0;
  left: 0;
  transform: scale(1);
  filter: brightness(0.95) contrast(0.95);
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.role-card-vertical:hover .portrait-background {
  transform: scale(1.03);
  filter: brightness(1.02) contrast(1);
}

.default-portrait-bg {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #a78bfa;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.role-card-vertical:hover .default-portrait-bg {
  color: #8b5cf6;
  filter: brightness(0.92) contrast(1.05);
}

.default-portrait-silhouette {
  font-size: 40px;
  opacity: 0.6;
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.role-card-vertical:hover .default-portrait-silhouette {
  transform: scale(1.1);
  opacity: 0.95;
  filter: drop-shadow(0 0 12px rgba(139, 92, 246, 0.6));
}

.placeholder-text {
  opacity: 0.75;
  transition: all 0.4s ease;
}

.role-card-vertical:hover .placeholder-text {
  opacity: 1;
  transform: scale(1.05);
}

/* 底部面板 (名字与简介常驻，操作按钮 Hover 淡入) */
.card-bottom-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 32px 20px 20px 20px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.2) 65%, rgba(0, 0, 0, 0) 100%);
  z-index: 10;
  display: flex;
  flex-direction: column;
  color: #ffffff;
  transition: all 0.3s ease;
}

/* Hover 时加深阴影遮罩 */
.card-bottom-panel::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 65%, rgba(0, 0, 0, 0) 100%);
  z-index: -1;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.role-card-vertical:hover .card-bottom-panel::after {
  opacity: 1;
}

.card-info-layout {
  position: relative;
  width: 100%;
}

.card-text-side {
  width: 100%;
  padding-right: 84px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
}

.role-name {
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
  margin: 0;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.role-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

.card-actions-side {
  position: absolute;
  right: 0;
  bottom: -2px;
  display: flex;
  gap: 8px;
  opacity: 0;
  transform: scale(0.85) translateY(4px);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
}

.role-card-vertical:hover .card-actions-side {
  opacity: 1;
  transform: scale(1) translateY(0);
  pointer-events: auto;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.4);
  transform: scale(1.15);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
}

.icon-btn.primary {
  background: rgba(139, 92, 246, 0.8);
  border-color: rgba(139, 92, 246, 0.4);
}

.icon-btn.primary:hover {
  background: rgba(139, 92, 246, 0.95);
  border-color: rgba(139, 92, 246, 0.8);
}

/* 新建角色卡 */
.role-card-vertical.is-create {
  border: 2px dashed #cbd5e1;
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
  aspect-ratio: 2 / 3;
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.role-card-vertical.is-create:hover {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.05);
  transform: scale(1.02);
  box-shadow: 0 8px 20px rgba(139, 92, 246, 0.1);
}

.create-card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.create-icon {
  font-size: 32px;
  color: #94a3b8;
  transition: all 0.3s;
}

.role-card-vertical.is-create:hover .create-icon {
  color: #8b5cf6;
  transform: scale(1.1);
}

.create-text {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  transition: all 0.3s;
}

.role-card-vertical.is-create:hover .create-text {
  color: #8b5cf6;
}
</style>
