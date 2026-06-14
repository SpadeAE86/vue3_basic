<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '@/stores/workspace'
import { useChatStore } from '@/stores/chat'
import { useCanvasStore } from '@/stores/canvas'
import WorkspaceToolbar from '@/components/canvas/WorkspaceToolbar.vue'
import CanvasBoard from '@/components/canvas/CanvasBoard.vue'
import AgentSidebar from '@/components/canvas/AgentSidebar.vue'

const workspaceStore = useWorkspaceStore()
const chatStore = useChatStore()
const canvasStore = useCanvasStore()
const { selectedWorkspaceId } = storeToRefs(workspaceStore)
const { chatLoading } = storeToRefs(chatStore)

onMounted(() => {
  workspaceStore.loadWorkspaces()
})

// 当选中的 workspaceId 发生变化时，重载聊天会话历史，保持 Agent 对话的同步
// watch(selectedWorkspaceId, (newId) => {
//   if (newId) {
//     chatStore.loadChatHistory(newId)
//   }
// })

// AI 对话完成后，自动刷新工程画布（Agent 可能新增了节点/边）
watch(chatLoading, async (loading) => {
  if (!loading && selectedWorkspaceId.value) {
    await canvasStore.loadGraph(selectedWorkspaceId.value)
  }
})
</script>

<template>
  <div class="canvas-view-layout">
    <!-- 左侧：画布区和工具栏 -->
    <div class="canvas-main-area">
      <WorkspaceToolbar />
      <CanvasBoard />
    </div>

    <!-- 右侧：Agent 协同窗口 -->
    <AgentSidebar />
  </div>
</template>

<style scoped>
.canvas-view-layout {
  display: flex;
  flex-direction: row;
  height: calc(100vh - 100px); /* 扣除页面 Header 和 Padding */
  width: 100%;
  overflow: hidden;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
}

.canvas-main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-right: 1px solid #e2e8f0;
}
</style>
