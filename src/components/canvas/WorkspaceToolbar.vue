<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '@/stores/workspace'
import { useCanvasStore } from '@/stores/canvas'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Plus, FolderOpened, Delete, Picture, Memo, Film, MagicStick } from '@element-plus/icons-vue'
import { uploadToObs } from '@/utils/obs'

const workspaceStore = useWorkspaceStore()
const canvasStore = useCanvasStore()

const { workspaces, selectedWorkspaceId, workspaceName } = storeToRefs(workspaceStore)

async function handleCreateWorkspace() {
  try {
    const { value: name } = await ElMessageBox.prompt('请输入新工程名称', '新建工程', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '名称不能为空',
    })
    if (name) {
      await workspaceStore.createWorkspace(name)
    }
  } catch (e) {
    if (e !== 'cancel') {
      console.error(e)
    }
  }
}

async function handleDeleteWorkspace() {
  if (!selectedWorkspaceId.value) return
  try {
    await ElMessageBox.confirm('确定要删除当前工程画布及所有节点连线吗？此操作不可逆！', '警告', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await workspaceStore.deleteWorkspace()
  } catch (e) {
    if (e !== 'cancel') {
      console.error(e)
    }
  }
}

const toolbarFileInputRef = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)

async function handleAddGenNode() {
  if (!selectedWorkspaceId.value) return
  await canvasStore.addGenNode(selectedWorkspaceId.value)
}

function handleAddImageCardNode() {
  if (!selectedWorkspaceId.value || isUploading.value) return
  toolbarFileInputRef.value?.click()
}

async function handleToolbarFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file || !selectedWorkspaceId.value) return

  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    ElMessage.warning('仅支持上传图片或视频文件')
    return
  }

  isUploading.value = true
  ElMessage.info('正在上传文件到 OBS...')
  try {
    const isVideoFile = file.type.startsWith('video/')
    const prefix = isVideoFile ? 'ai_picture/reference_video' : 'ai_picture/reference_image'
    const url = await uploadToObs(file, prefix)

    const posX = Math.random() * 100 + 150
    const posY = Math.random() * 100 + 150
    const nodeId = `card_${Math.random().toString(36).substring(2, 8)}`
    
    const maxId = canvasStore.nodes.reduce((max, n) => {
      const did = n.data?.display_id || 0
      return did > max ? did : max
    }, 0)

    const payload = {
      id: nodeId,
      type: 'image_card',
      x: posX,
      y: posY,
      data: {
        display_id: maxId + 1,
        image_url: url,
        prompt: '',
        media_type: isVideoFile ? 'video' : 'image',
        source: 'upload',
        status: 'success'
      }
    }
    await canvasStore.saveNode(selectedWorkspaceId.value, payload)
    ElMessage.success('素材上传成功，已创建素材节点')
    await canvasStore.loadGraph(selectedWorkspaceId.value)
    canvasStore.pushHistory()
  } catch (err: any) {
    ElMessage.error(`上传失败: ${err.message || err}`)
  } finally {
    isUploading.value = false
    if (toolbarFileInputRef.value) toolbarFileInputRef.value.value = ''
  }
}

async function handleAddVideoNode() {
  if (!selectedWorkspaceId.value) return
  await canvasStore.addVideoNode(selectedWorkspaceId.value)
}

async function handleAddTemplateNode() {
  if (!selectedWorkspaceId.value) return
  await canvasStore.addPromptTemplateNode(selectedWorkspaceId.value)
}
</script>

<template>
  <div class="canvas-toolbar">
    <!-- Project Management controls (Left) -->
    <div class="toolbar-section project-section">
      <el-icon class="toolbar-icon"><FolderOpened /></el-icon>
      <el-select 
        v-model="selectedWorkspaceId" 
        placeholder="选择工程画布" 
        size="default" 
        style="width: 170px"
        class="workspace-selector"
      >
        <el-option 
          v-for="ws in workspaces" 
          :key="ws.id" 
          :label="ws.name" 
          :value="ws.id" 
        />
      </el-select>
      <el-button type="primary" :icon="Plus" @click="handleCreateWorkspace" size="default">新建工程</el-button>
      <el-button type="danger" :icon="Delete" @click="handleDeleteWorkspace" :disabled="!selectedWorkspaceId" size="default">删除工程</el-button>
    </div>
    
    <!-- Vertical divider line separating projects from node tools -->
    <div class="toolbar-divider"></div>

    <!-- Node creation group (Center/Responsive) -->
    <div class="toolbar-section node-section" v-if="selectedWorkspaceId">
      <el-button-group>
        <el-button type="default" :icon="MagicStick" @click="handleAddGenNode" size="default">
          图像节点 <span class="kbd-key">G</span>
        </el-button>
        <el-button type="default" :icon="Film" @click="handleAddVideoNode" size="default">
          视频节点 <span class="kbd-key">V</span>
        </el-button>
        <el-button type="default" :icon="Picture" @click="handleAddImageCardNode" size="default">
          上传素材 <span class="kbd-key">M</span>
        </el-button>
        <el-button type="default" :icon="Memo" @click="handleAddTemplateNode" size="default">
          模板节点 <span class="kbd-key">T</span>
        </el-button>
      </el-button-group>
    </div>

    <!-- Information and switch actions (Right aligned, non-wrapping) -->
    <div class="toolbar-section info-section" v-if="selectedWorkspaceId">
      <el-switch
        v-model="canvasStore.showNodeId"
        active-text="显示 ID"
        class="id-switch"
      />
      <div class="ws-title-badge">
        <span class="badge-label">画布:</span>
        <span class="badge-value">{{ workspaceName }}</span>
      </div>
    </div>
    <input 
      ref="toolbarFileInputRef" 
      type="file" 
      accept="image/*,video/*" 
      style="display: none;" 
      @change="handleToolbarFileChange"
    />
  </div>
</template>

<style scoped>
.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-section {
  flex-shrink: 0;
}

.node-section {
  flex-grow: 1;
}

.info-section {
  margin-left: auto;
  flex-shrink: 0;
  white-space: nowrap;
  gap: 16px;
}

.toolbar-icon {
  font-size: 18px;
  color: #6366f1;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background-color: #e2e8f0;
  margin: 0 4px;
  flex-shrink: 0;
}

.kbd-key {
  font-size: 9px;
  font-weight: 700;
  color: #64748b;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  padding: 1px 4px;
  border-radius: 4px;
  margin-left: 6px;
}

.ws-title-badge {
  display: inline-flex;
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
}

.badge-label {
  color: #64748b;
  margin-right: 4px;
  font-weight: 500;
}

.badge-value {
  color: #1e293b;
  font-weight: 600;
}
</style>
