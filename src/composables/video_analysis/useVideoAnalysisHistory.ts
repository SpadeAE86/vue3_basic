/**
 * useVideoAnalysisHistory.ts
 * 负责视频分析页面的历史记录加载、删除、切换等逻辑
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getVideoAnalysisHistoryApi as getAnalysisList } from '@/api/video_analysis'
const deleteAnalysisRecord = async (id: any, ws: any) => fetch(`/api/video-analysis/history/${id}?workspace=${ws}`, {method:'DELETE'})

export function useVideoAnalysisHistory(currentWorkspace: any, splitScenes: any, performSearch: any) {
  const historyList = ref<any[]>([])
  const selectedHistory = ref<string>('__all__')
  const historyLoading = ref(false)

  const loadHistory = async () => {
    historyLoading.value = true
    try {
      // workspace logic mapping
      const workspaceVal = currentWorkspace.value || 'v1'
      const res = await getAnalysisList(workspaceVal)
      if (res && res.records) {
        historyList.value = res.records.map((r: any) => ({
          label: `${r.task_id} - ${r.video_name || 'unknown'} (${r.created_at})`,
          value: r.task_id,
          raw: r
        }))
      } else {
        historyList.value = []
      }
    } catch (e: any) {
      console.error(e)
      ElMessage.error('获取历史记录失败: ' + String(e))
      historyList.value = []
    } finally {
      historyLoading.value = false
    }
  }

  const handleHistoryChange = (val: string) => {
    selectedHistory.value = val
    if (val !== '__all__') {
      splitScenes.value = true
    }
    performSearch()
  }

  const handleDeleteHistory = async (taskId: string) => {
    if (!taskId) return
    try {
      const workspaceVal = currentWorkspace.value || 'v1'
      await deleteAnalysisRecord(taskId, workspaceVal)
      ElMessage.success('删除成功')
      if (selectedHistory.value === taskId) {
        selectedHistory.value = '__all__'
        performSearch()
      }
      await loadHistory()
    } catch (e: any) {
      console.error(e)
      ElMessage.error('删除失败: ' + String(e))
    }
  }

  return {
    historyList,
    selectedHistory,
    historyLoading,
    loadHistory,
    handleHistoryChange,
    handleDeleteHistory
  }
}
