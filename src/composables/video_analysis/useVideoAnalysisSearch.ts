/**
 * useVideoAnalysisSearch.ts
 * 负责视频分析页面的搜索和检索核心逻辑
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { searchVideoAnalysisCardsApi as searchVideoAnalysis } from '@/api/video_analysis'

export function useVideoAnalysisSearch(currentWorkspace: any, splitScenes: any, searchTokens: any, searchStrategyWeights: any, selectedHistory: any) {
  const isSearching = ref(false)
  const analysisResults = ref<any[]>([])
  const remoteSearchCards = ref<any[]>([])
  const lastSuccessfulSearchKey = ref<string | null>(null)
  
  const selectedTags = ref<string[]>([])
  const showTextFilter = ref(false)
  const onlyShowWithText = ref(false)

  const performSearch = async () => {
    isSearching.value = true
    try {
      const payload = {
        workspace: currentWorkspace.value || 'v1',
        task_id: selectedHistory.value === '__all__' ? null : selectedHistory.value,
        tokens: searchTokens.value || [],
        weights: searchStrategyWeights.value || {},
        split_scenes: splitScenes.value
      }
      
      const searchKey = JSON.stringify(payload)
      
      const res = await searchVideoAnalysis(payload)
      if (res && res.results) {
        remoteSearchCards.value = res.results
        analysisResults.value = res.results
        lastSuccessfulSearchKey.value = searchKey
        ElMessage.success(`搜索到 ${res.results.length} 条记录`)
      } else {
        remoteSearchCards.value = []
        analysisResults.value = []
        lastSuccessfulSearchKey.value = searchKey
      }
    } catch (e: any) {
      console.error(e)
      ElMessage.error('搜索异常: ' + String(e))
    } finally {
      isSearching.value = false
    }
  }

  const debouncedPerformSearch = () => {
    // Add simple debounce if needed or call directly
    performSearch()
  }

  const handleTagsChange = (tags: string[]) => {
    selectedTags.value = tags
  }

  const handleRefresh = () => {
    performSearch()
  }

  return {
    isSearching,
    analysisResults,
    remoteSearchCards,
    lastSuccessfulSearchKey,
    selectedTags,
    showTextFilter,
    onlyShowWithText,
    performSearch,
    debouncedPerformSearch,
    handleTagsChange,
    handleRefresh
  }
}
