import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { getWorkspaces, createWorkspace as apiCreateWorkspace, deleteWorkspace as apiDeleteWorkspace } from '@/api/workspace.api'
import type { Workspace } from '@/api/workspace.api'
import { ElMessage } from 'element-plus'

const LS_CANVAS_KEY = 'selected_canvas_workspace_id'
const LS_GRAPH_KEY  = 'selected_graph_name'

export const useWorkspaceStore = defineStore('workspace', () => {
  const workspaces = ref<Workspace[]>([])
  const workspaceName = ref<string>('默认画布')

  // 工程画布页 (canvas) 选中的 workspace id
  const selectedWorkspaceId = ref<string>(
    localStorage.getItem(LS_CANVAS_KEY) ?? ''
  )

  // 力导图页 (graph) 选中的图名
  const selectedGraphName = ref<string>(
    localStorage.getItem(LS_GRAPH_KEY) ?? ''
  )

  // 自动持久化
  watch(selectedWorkspaceId, (val) => {
    if (val) localStorage.setItem(LS_CANVAS_KEY, val)
    else localStorage.removeItem(LS_CANVAS_KEY)
  })
  watch(selectedGraphName, (val) => {
    if (val) localStorage.setItem(LS_GRAPH_KEY, val)
    else localStorage.removeItem(LS_GRAPH_KEY)
  })

  async function loadWorkspaces() {
    try {
      const data = await getWorkspaces()
      workspaces.value = data.workspaces || []
      
      // 默认选择第一个工程（仅当 localStorage 中没有缓存时）
      const firstWs = workspaces.value[0]
      if (firstWs && !selectedWorkspaceId.value) {
        selectedWorkspaceId.value = firstWs.id
      }
    } catch (e) {
      console.error('加载工程列表失败:', e)
    }
  }

  // 记录不同工程画布的视口位置
  const viewports = ref<Record<string, { x: number; y: number; zoom: number }>>(
    JSON.parse(localStorage.getItem('canvas_viewports') || '{}')
  )

  function saveViewport(workspaceId: string, vp: { x: number; y: number; zoom: number }) {
    if (!workspaceId) return
    viewports.value[workspaceId] = vp
    localStorage.setItem('canvas_viewports', JSON.stringify(viewports.value))
  }

  function getViewport(workspaceId: string) {
    return viewports.value[workspaceId] || { x: 100, y: 100, zoom: 0.85 }
  }

  async function createWorkspace(name: string) {
    try {
      const data = await apiCreateWorkspace(name)
      ElMessage.success('工程创建成功')
      await loadWorkspaces()
      selectedWorkspaceId.value = data.workspace.id
    } catch (e) {
      console.error('创建工程失败:', e)
      ElMessage.error('创建工程失败')
    }
  }

  async function deleteWorkspace() {
    if (!selectedWorkspaceId.value) return
    try {
      await apiDeleteWorkspace(selectedWorkspaceId.value)
      ElMessage.success('工程删除成功')
      selectedWorkspaceId.value = ''
      await loadWorkspaces()
    } catch (e) {
      console.error('删除工程失败:', e)
      ElMessage.error('删除工程失败')
    }
  }

  return {
    workspaces,
    selectedWorkspaceId,
    selectedGraphName,
    workspaceName,
    loadWorkspaces,
    createWorkspace,
    deleteWorkspace,
    saveViewport,
    getViewport
  }
})

