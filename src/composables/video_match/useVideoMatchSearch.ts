/**
 * useVideoMatchSearch.ts
 * 负责视频匹配页面的搜索执行、弹窗详情展示以及跨页面回填跳转
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { searchVideoMatchJobApi as runJobSearch } from '@/api/video_match'
import { stashVideoAnalysisPrefillFromMatch } from '@/utils/videoAnalysisSessionCache'

export function useVideoMatchSearch(selectedHistory: any, formPayload: any, searchTokens: any, matchHitRows: any) {
  const router = useRouter()
  const isSearching = ref(false)
  const detailVisible = ref(false)
  const detailLoading = ref(false)
  const detailPayload = ref<any>(null)
  
  // Weights (synchronized with match UI)
  const searchStrategyWeights = ref({
    bm25_weight: 0.1,
    vector_weight: 0.9,
    use_rrf: false,
    text_weights: {
      ocr: 0.2,
      asr: 0.1,
      caption: 0.7
    },
    vector_weights: {
      ocr: 0.0,
      asr: 0.0,
      caption: 1.0,
      vision: 0.0
    }
  })

  const doManualSearch = async () => {
    if (!selectedHistory.value) {
      ElMessage.warning('请先选择一个任务')
      return
    }
    if (!searchTokens.value || searchTokens.value.length === 0) {
      ElMessage.warning('请先生成或输入Tokens')
      return
    }
    
    isSearching.value = true
    try {
      const res = await runJobSearch(selectedHistory.value, {
        strategy_name: 'default',
      })
      if (res && res.success && res.shots) {
        matchHitRows.value = res.shots
        ElMessage.success('匹配搜索成功')
      } else {
        matchHitRows.value = []
        ElMessage.warning('未能获取有效的匹配结果')
      }
    } catch (e: any) {
      console.error(e)
      ElMessage.error('匹配搜索异常: ' + String(e))
    } finally {
      isSearching.value = false
    }
  }

  const handleShowDetail = (row: any) => {
    if (!row) return
    detailPayload.value = row
    detailVisible.value = true
  }

  const goVideoAnalysisFromVmShot = (row: any) => {
    if (!row || !row.id) {
      ElMessage.warning('缺少切片 ID')
      return
    }
    // Set sessionStorage using the utility to ensure it works across tabs or history
    stashVideoAnalysisPrefillFromMatch({
      searchTokens: searchTokens.value,
      searchStrategyWeights: searchStrategyWeights.value,
      selectedHistory: selectedHistory.value,
      workspace: row.workspace || 'v1',
      autoSearch: false,
      sourceMatchId: row.id ? String(row.id) : undefined,
    })
    
    router.push({ name: 'VideoAnalysis' })
  }

  return {
    isSearching,
    detailVisible,
    detailLoading,
    detailPayload,
    searchStrategyWeights,
    doManualSearch,
    handleShowDetail,
    goVideoAnalysisFromVmShot
  }
}
