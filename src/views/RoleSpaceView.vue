<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

// 导入子组件
import RoleVisualPanel from '@/components/role/RoleVisualPanel.vue'
import RoleConfigPanel from '@/components/role/RoleConfigPanel.vue'
import RoleTabsPanel from '@/components/role/RoleTabsPanel.vue'
import AvatarCropDialog from '@/components/role/AvatarCropDialog.vue'
import CollectionsImportDialog from '@/components/role/CollectionsImportDialog.vue'

const route = useRoute()
const router = useRouter()
const roleId = computed(() => route.params.role_id as string)

const roleMeta = ref<any>(null)
const userSettings = ref('')
const identityContent = ref('')
const soulContent = ref('')

const saveLoading = ref(false)
const loading = ref(false)

// 相册与预览状态
const galleryImages = ref<any[]>([])
const selectedGalleryImage = ref<{ filename: string; url: string } | null>(null)
const isImporting = ref(false)

// 弹窗可见性
const collectionsDialogVisible = ref(false)
const cropDialogVisible = ref(false)

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
        voice_configured: roleMeta.value.voice_configured
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
    <!-- 左上角返回导航 -->
    <div class="back-navigation-header" @click="router.push('/role-cards')" title="返回角色列表">
      <el-icon class="back-icon"><i-ep-arrow-left /></el-icon>
      <span>返回角色列表</span>
    </div>

    <div class="role-space-layout" v-if="roleMeta">
      
      <!-- 左栏: Visual Assets (35% 宽度) -->
      <RoleVisualPanel
        :role-id="roleId"
        :role-meta="roleMeta"
        :gallery-images="galleryImages"
        :selected-gallery-image="selectedGalleryImage"
        :is-importing="isImporting"
        @select-thumbnail="handleSelectThumbnail"
        @set-portrait="handleSetPortrait"
        @delete-image="handleDeleteImage"
        @open-import="collectionsDialogVisible = true"
        @upload-success="fetchGallery"
      />

      <!-- 右栏: Configuration & Text (65% 宽度) -->
      <div class="role-right-panel">
        <RoleConfigPanel
          :role-id="roleId"
          :role-meta="roleMeta"
          @open-crop="cropDialogVisible = true"
          @update-meta="handleUpdateMeta"
          @start-chat="router.push(`/chat?role_id=${roleId}`)"
        />

        <RoleTabsPanel
          v-model:user-settings="userSettings"
          v-model:identity-content="identityContent"
          v-model:soul-content="soulContent"
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

.back-navigation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 1200px;
  margin: 0 auto 16px auto;
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
