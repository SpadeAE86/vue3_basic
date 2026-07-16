<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getImageStatusApi } from '@/api/generate'

// 导入子组件
import RoleVisualPanel from '@/components/role/RoleVisualPanel.vue'
import RoleConfigPanel from '@/components/role/RoleConfigPanel.vue'
import RoleTabsPanel from '@/components/role/RoleTabsPanel.vue'
import AvatarCropDialog from '@/components/role/AvatarCropDialog.vue'
import CollectionsImportDialog from '@/components/role/CollectionsImportDialog.vue'
import AiGenerateDialog from '@/components/role/AiGenerateDialog.vue'

const route = useRoute()
const router = useRouter()
const roleId = computed(() => route.params.role_id as string)

const isFromChat = computed(() => route.query.from === 'chat')
const backText = computed(() => isFromChat.value ? '返回 Agent 对话' : '返回角色列表')
const backTitle = computed(() => isFromChat.value ? '返回 Agent 对话' : '返回角色列表')

function goBack() {
  if (isFromChat.value) {
    router.push(`/chat?role_id=${roleId.value}`)
  } else {
    router.push('/role-cards')
  }
}

const roleMeta = ref<any>(null)
const userSettings = ref('')
const identityContent = ref('')
const soulContent = ref('')
const habbitContent = ref('')

const saveLoading = ref(false)
const loading = ref(false)

// 相册与预览状态
const galleryImages = ref<any[]>([])
const selectedGalleryImage = ref<{ filename: string; url: string } | null>(null)
const isImporting = ref(false)

// 弹窗可见性
const collectionsDialogVisible = ref(false)
const cropDialogVisible = ref(false)
const aiGenerateDialogVisible = ref(false)

// 生图任务追踪
const generatingTasks = ref<Array<{ taskId: string; prompt: string }>>([])
const pollingIntervals: Record<string, number> = {}

onUnmounted(() => {
  Object.values(pollingIntervals).forEach(clearInterval)
})

function handleTaskSubmitted(task: { taskId: string; prompt: string }) {
  generatingTasks.value.push(task)
  startImagePolling(task.taskId)
}

async function startImagePolling(taskId: string) {
  if (pollingIntervals[taskId]) {
    clearInterval(pollingIntervals[taskId])
  }
  
  const startTime = Date.now()
  const MAX_POLLING_TIME = 15 * 60 * 1000 // 15 minutes
  
  const tick = async () => {
    try {
      if (Date.now() - startTime > MAX_POLLING_TIME) {
        clearInterval(pollingIntervals[taskId])
        delete pollingIntervals[taskId]
        generatingTasks.value = generatingTasks.value.filter(t => t.taskId !== taskId)
        ElMessage.error('生图任务超时')
        return
      }
      
      const data = await getImageStatusApi(taskId)
      if (!data.success) {
        clearInterval(pollingIntervals[taskId])
        delete pollingIntervals[taskId]
        generatingTasks.value = generatingTasks.value.filter(t => t.taskId !== taskId)
        ElMessage.error(data.error || '获取生图状态失败')
        return
      }
      
      const st = String(data.status || '').toLowerCase()
      const url = data.url
      
      if (st === 'failed' || st === 'error') {
        clearInterval(pollingIntervals[taskId])
        delete pollingIntervals[taskId]
        generatingTasks.value = generatingTasks.value.filter(t => t.taskId !== taskId)
        ElMessage.error(data.error || '图片生成失败')
        return
      }
      
      if (url) {
        clearInterval(pollingIntervals[taskId])
        delete pollingIntervals[taskId]
        
        // 成功生成，开始导入角色相册
        try {
          const resImport = await fetch(`/api/chat/roles/${roleId.value}/gallery/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          })
          const importData = await resImport.json()
          if (importData.ok) {
            ElMessage.success('图片生成并成功导入画廊')
            await fetchRoleDetails()
            await fetchGallery()
          } else {
            ElMessage.error(importData.error || '导入画廊失败')
          }
        } catch (importErr) {
          ElMessage.error('导入画廊异常')
        } finally {
          generatingTasks.value = generatingTasks.value.filter(t => t.taskId !== taskId)
        }
      }
    } catch (err) {
      console.error('Polling error for task:', taskId, err)
    }
  }
  
  pollingIntervals[taskId] = window.setInterval(tick, 3000)
  void tick()
}

async function fetchRoleDetails() {
  loading.value = true
  try {
    // 1. 获取基本信息 (role.json)
    const resRoles = await fetch(`/api/chat/roles?t=${Date.now()}`)
    if (resRoles.ok) {
      const allRoles = await resRoles.json()
      const found = allRoles.find((r: any) => r.id === roleId.value)
      if (found) {
        if (!found.tags) found.tags = []
        if (found.daily_message_enabled === undefined) {
          found.daily_message_enabled = true
        }
        if (!found.voice_character) {
          found.voice_character = 'Vivi'
        }
        roleMeta.value = found
      }
    }

    // 2. 获取用户人设 (USER_SETTINGS.md)
    const resSettings = await fetch(`/api/chat/roles/${roleId.value}/settings?t=${Date.now()}`)
    if (resSettings.ok) {
      const data = await resSettings.json()
      userSettings.value = data.user_settings || ''
    }

    // 3. 获取AI人设 (IDENTITY.md / SOUL.md 用于只读展示)
    const resIdentity = await fetch(`/api/chat/roles/${roleId.value}/files/IDENTITY.md?t=${Date.now()}`)
    if (resIdentity.ok) {
      identityContent.value = await resIdentity.text()
    } else {
      identityContent.value = 'IDENTITY.md 正在由 AI 自动维护...'
    }

    const resSoul = await fetch(`/api/chat/roles/${roleId.value}/files/SOUL.md?t=${Date.now()}`)
    if (resSoul.ok) {
      soulContent.value = await resSoul.text()
    } else {
      soulContent.value = 'SOUL.md 正在由 AI 自动维护...'
    }

    // 4. 获取角色台词 (HABIT.md)
    const resHabit = await fetch(`/api/chat/roles/${roleId.value}/files/HABIT.md?t=${Date.now()}`)
    if (resHabit.ok) {
      habbitContent.value = await resHabit.text()
    } else {
      habbitContent.value = ''
    }

  } catch (err) {
    console.error(err)
    ElMessage.error('获取角色详情失败')
  } finally {
    loading.value = false
  }
}

async function fetchGallery() {
  try {
    const res = await fetch(`/api/chat/roles/${roleId.value}/gallery?t=${Date.now()}`)
    if (res.ok) {
      const data = await res.json()
      galleryImages.value = data.images || []
    }
  } catch (err) {
    console.error('获取相册列表失败:', err)
  }
}

async function handleSaveFile(filename: string, content: string) {
  saveLoading.value = true
  try {
    const res = await fetch(`/api/chat/roles/${roleId.value}/files/${filename}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    })
    const data = await res.json()
    if (data.ok) {
      ElMessage.success('保存成功')
      await fetchRoleDetails()
    } else {
      ElMessage.error(data.error || '保存失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('保存文件发生异常')
  } finally {
    saveLoading.value = false
  }
}

async function handleUpdateMeta() {
  try {
    const res = await fetch(`/api/chat/roles/${roleId.value}/meta`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: roleMeta.value.name,
        description: roleMeta.value.description,
        tags: roleMeta.value.tags,
        voice_configured: roleMeta.value.voice_configured,
        voice_character: roleMeta.value.voice_character || 'Vivi',
        daily_message_enabled: roleMeta.value.daily_message_enabled
      })
    })
    const data = await res.json()
    if (data.ok) {
      await fetchRoleDetails()
    }
  } catch (err) {
    console.error('更新元数据失败:', err)
    ElMessage.error('更新基本设定失败')
  }
}

function handleUpdateVoiceCharacter(voiceCharacter: string) {
  if (roleMeta.value) {
    roleMeta.value.voice_character = voiceCharacter
    roleMeta.value.voice_configured = !!voiceCharacter
    handleUpdateMeta()
  }
}

function handleSelectThumbnail(img: any) {
  selectedGalleryImage.value = {
    filename: img.filename,
    url: img.url
  }
}

async function handleSetPortrait() {
  const filename = selectedGalleryImage.value?.filename || roleMeta.value?.portrait_filename
  if (!filename) {
    ElMessage.warning('请先在相册中选择一张图片')
    return
  }
  try {
    // 1. 设置为主形象/立绘
    const resPortrait = await fetch(`/api/chat/roles/${roleId.value}/portrait`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename })
    })
    const dataPortrait = await resPortrait.json()

    // 2. 同时设置为头像，保持同步，使得外面列表卡片的占位图能够及时更新
    const resAvatar = await fetch(`/api/chat/roles/${roleId.value}/avatar-select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename })
    })
    const dataAvatar = await resAvatar.json()

    if (dataPortrait.ok && dataAvatar.ok) {
      ElMessage.success('成功设为封面立绘与头像')
      await fetchRoleDetails()
      await fetchGallery()
      if (selectedGalleryImage.value && selectedGalleryImage.value.filename === filename) {
        selectedGalleryImage.value = null // 回归默认读取最新
      }
    } else {
      ElMessage.error(dataPortrait.error || dataAvatar.error || '设置失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('操作失败')
  }
}

async function handleDeleteImage(img: any) {
  try {
    const res = await fetch(`/api/chat/roles/${roleId.value}/gallery/${img.filename}`, {
      method: 'DELETE'
    })
    const data = await res.json()
    if (data.ok) {
      ElMessage.success('成功删除照片')
      if (selectedGalleryImage.value && selectedGalleryImage.value.filename === img.filename) {
        selectedGalleryImage.value = null
      }
      await fetchRoleDetails()
      await fetchGallery()
    } else {
      ElMessage.error(data.error || '删除失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('操作失败')
  }
}

const displayPortraitUrl = computed(() => {
  if (selectedGalleryImage.value) {
    return selectedGalleryImage.value.url
  }
  return roleMeta.value?.portrait_url || ''
})

async function onCropped() {
  await fetchRoleDetails()
  await fetchGallery()
}

async function onImported() {
  await fetchGallery()
  isImporting.value = false
}

onMounted(() => {
  fetchRoleDetails()
  fetchGallery()
})
</script>

<template>
  <div class="role-space-container" v-loading="loading">
    <!-- 左上角返回导航（左对齐至 1200px 布局区域）-->
    <div class="back-navigation-wrapper">
      <div class="back-navigation-header" @click="goBack" :title="backTitle">
        <el-icon class="back-icon"><i-ep-arrow-left /></el-icon>
        <span>{{ backText }}</span>
      </div>
    </div>

    <div class="role-space-layout" v-if="roleMeta">
      
      <!-- 左栏: Visual Assets (35% 宽度) -->
      <RoleVisualPanel
        :role-id="roleId"
        :role-meta="roleMeta"
        :gallery-images="galleryImages"
        :selected-gallery-image="selectedGalleryImage"
        :is-importing="isImporting"
        :generating-tasks="generatingTasks"
        @select-thumbnail="handleSelectThumbnail"
        @set-portrait="handleSetPortrait"
        @delete-image="handleDeleteImage"
        @open-import="collectionsDialogVisible = true"
        @open-ai-generate="aiGenerateDialogVisible = true"
        @upload-success="fetchGallery"
      />

      <!-- 右栏: Configuration & Text (65% 宽度) -->
      <div class="role-right-panel">
        <RoleConfigPanel
          :role-id="roleId"
          :role-meta="roleMeta"
          @open-crop="cropDialogVisible = true"
          @update-meta="handleUpdateMeta"
          @update-voice-character="handleUpdateVoiceCharacter"
          @start-chat="router.push(`/chat?role_id=${roleId}`)"
        />

        <RoleTabsPanel
          :role-id="roleId"
          :voice-configured="roleMeta.voice_configured"
          :voice-character="roleMeta.voice_character || 'Vivi'"
          :role-description="roleMeta.description || ''"
          :role-tags="roleMeta.tags || []"
          v-model:user-settings="userSettings"
          v-model:identity-content="identityContent"
          v-model:soul-content="soulContent"
          v-model:habbit-content="habbitContent"
          :save-loading="saveLoading"
          @save-file="handleSaveFile"
        />
      </div>
    </div>

    <!-- 从收藏导入 Dialog -->
    <CollectionsImportDialog
      v-model="collectionsDialogVisible"
      :role-id="roleId"
      :gallery-images="galleryImages"
      @importing="isImporting = true"
      @imported="onImported"
    />

    <!-- 头像裁剪 Dialog -->
    <AvatarCropDialog
      v-model="cropDialogVisible"
      :role-id="roleId"
      :source-url="displayPortraitUrl"
      @cropped="onCropped"
    />

    <!-- AI 生图 Dialog -->
    <AiGenerateDialog
      v-model="aiGenerateDialogVisible"
      :role-id="roleId"
      :role-name="roleMeta?.name || ''"
      :role-description="roleMeta?.description || ''"
      @task-submitted="handleTaskSubmitted"
    />
  </div>
</template>

<style scoped>
.role-space-container {
  padding: 24px;
  background: #fafbfe;
  min-height: calc(100vh - 64px);
}

.role-space-layout {
  display: flex;
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
  align-items: flex-start;
}

.role-right-panel {
  flex: 0 0 65%;
  max-width: 65%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 对齐导航按钮到 1200px 布局区域的左侧 */
.back-navigation-wrapper {
  max-width: 1200px;
  margin: 0 auto 16px auto;
  display: flex;
  justify-content: flex-start;
}

.back-navigation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #64748b;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  width: fit-content;
  user-select: none;
}

.back-navigation-header:hover {
  color: #6366f1;
}

.back-icon {
  font-size: 16px;
  transition: transform 0.2s ease;
}

.back-navigation-header:hover .back-icon {
  transform: translateX(-4px);
}
</style>
