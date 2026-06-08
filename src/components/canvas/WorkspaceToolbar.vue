<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '@/stores/workspace'
import { useCanvasStore } from '@/stores/canvas'
import { ElMessageBox } from 'element-plus'
import { Plus, FolderOpened, Delete, Picture, Memo } from '@element-plus/icons-vue'

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

async function handleAddGenNode() {
  if (!selectedWorkspaceId.value) return
  await canvasStore.addGenNode(selectedWorkspaceId.value)
}

async function handleAddImageCardNode() {
  if (!selectedWorkspaceId.value) return
  await canvasStore.addImageCardNode(selectedWorkspaceId.value)
}

async function handleAddTemplateNode() {
  if (!selectedWorkspaceId.value) return
  await canvasStore.addPromptTemplateNode(selectedWorkspaceId.value)
}
</script>

<template>
  <div class="canvas-toolbar">
    <el-icon class="toolbar-icon"><FolderOpened /></el-icon>
    <el-select 
      v-model="selectedWorkspaceId" 
      placeholder="选择工程画布" 
      size="default" 
      style="width: 200px"
      class="workspace-selector"
    >
      <el-option 
        v-for="ws in workspaces" 
        :key="ws.id" 
        :label="ws.name" 
        :value="ws.id" 
      />
    </el-select>
    
    <el-button-group class="toolbar-buttons">
      <el-button type="primary" :icon="Plus" @click="handleCreateWorkspace">新建工程</el-button>
      <el-button type="default" :icon="Plus" @click="handleAddGenNode" :disabled="!selectedWorkspaceId">添加生成节点</el-button>
      <el-button type="default" :icon="Picture" @click="handleAddImageCardNode" :disabled="!selectedWorkspaceId">添加图片节点</el-button>
      <el-button type="default" :icon="Memo" @click="handleAddTemplateNode" :disabled="!selectedWorkspaceId">添加模板节点</el-button>
      <el-button type="danger" :icon="Delete" @click="handleDeleteWorkspace" :disabled="!selectedWorkspaceId">删除工程</el-button>
    </el-button-group>

    <el-switch
      v-if="selectedWorkspaceId"
      v-model="canvasStore.showNodeId"
      active-text="显示节点 ID"
      class="id-switch"
    />
    <span class="active-ws-title" v-if="selectedWorkspaceId">
      当前画布: <strong>{{ workspaceName }}</strong>
    </span>
  </div>
</template>

<style scoped>
.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.toolbar-icon {
  font-size: 18px;
  color: #6366f1;
}

.id-switch {
  margin-left: auto;
  margin-right: 16px;
}

.active-ws-title {
  font-size: 13px;
  color: #64748b;
}

.active-ws-title strong {
  color: #1e293b;
}
</style>
