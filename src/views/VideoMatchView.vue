<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { videoFrameSizeOptionsForOrientation } from '@/constants/zhijiCarModels'
import type { WorkspaceOption } from '@/types/videoAnalysis'

import VideoMatchControlPanel from '@/components/video_match/VideoMatchControlPanel.vue'
import VideoMatchShotsTable from '@/components/video_match/VideoMatchShotsTable.vue'
import VideoMatchDetailDialog from '@/components/video_match/VideoMatchDetailDialog.vue'
import VideoMatchTranscribeDialog from '@/components/video_match/VideoMatchTranscribeDialog.vue'
import TokenJoinTemplateDialog from '@/components/video_analysis/TokenJoinTemplateDialog.vue'

import { useVideoMatchSearch } from '@/composables/video_match/useVideoMatchSearch'
import { useVideoMatchJobPoller } from '@/composables/video_match/useVideoMatchJobPoller'
import { useVideoMatchMixCompose } from '@/composables/video_match/useVideoMatchMixCompose'
import { useVideoMatchAudio } from '@/composables/video_match/useVideoMatchAudio'

const router = useRouter()

const form = ref({
  script: '',
  topic: '',
  title: '',
  car_model: '',
  frame_size: '',
  frame_orientation: '',
  workspace: 'v1',
})

const workspaceOptions = ref<WorkspaceOption[]>([
  { key: 'v1', label: '默认 v1', description: '', is_default: true },
])

const videoMatchFrameSizeOptions = computed(() =>
  videoFrameSizeOptionsForOrientation(form.value.frame_orientation),
)

watch(
  () => form.value.frame_orientation,
  () => {
    const allowed = new Set<string>(videoMatchFrameSizeOptions.value.map((x) => x.value))
    const fs = form.value.frame_size
    if (fs && !allowed.has(fs)) {
      form.value.frame_size = ''
    }
  },
)

const matchDetailRowProxy = ref<any>(null)
const shotTranscribeRowProxy = ref<any>(null)

const {
  strategies, selectedStrategy, vmStrategyDialogVisible, vmStrategyDialogMode, vmStrategyInitialName,
  vmStrategyInitialIsDefault, vmStrategyBm25, vmStrategyVector, vmStrategyUseRrf,
  vmStrategyTextWeights, vmStrategyVectorWeights, vmIndexFields, vmTextWeightDefaults, vmVectorWeightDefaults,
  tokenJoinDialogVisible, tokenJoinAndFields, loadTokenJoinAndFields, matchDetailTokens, shotTranscribeTokens,
  loadStrategies, fetchVmIndexFields, applyVmStrategyWeightsFromSelection, openVmStrategyCreateDialog, openVmStrategyEditDialog, handleVmStrategySave
} = useVideoMatchSearch(form, matchDetailRowProxy, shotTranscribeRowProxy)

const {
  parsing, matching, composing: pollerComposing, currentJobId, shots, parseStatus, parseError, searchTotalMs, jobSearchStatus, jobSearchError, extractStatus, extractError,
  matchJobWorkspace, jobStrategySnapshot, historyJobs, historyJobId,
  matchDetailVisible, matchDetailLoading, matchDetailPayload, matchDetailRow, matchDetailLocalOnly, matchDetailHitRows,
  shotTranscribeVisible, shotTranscribeRow, vmShotRematchingId,
  hasShots, canMatch, canMixCompose, mixComposeDisabledHint,
  formatMatchDetailJson, normalizeMatchHitRows, syncMatchJobContext, openShotTranscribe, rematchVmShot, goVideoAnalysisFromVmShot, openMatchDetail,
  normalizeVideoMatchScriptInbound, applyVideoMatchJobInputsToForm, shortJobIdForDisplay, pipelineStatusZh, loadHistoryJobs, historyJobLabel, onHistoryJobChange, fetchWorkspaces, onParse, onMatch, refreshJob, onExtract, isExtracting
} = useVideoMatchJobPoller(form, workspaceOptions, selectedStrategy, router, strategies)

watch(() => matchDetailRow, (val) => { matchDetailRowProxy.value = val?.value }, { deep: true })
watch(() => shotTranscribeRow, (val) => { shotTranscribeRowProxy.value = val?.value }, { deep: true })

const {
  sharedAudioRef, playingRowKey, isAudioPlaying, audioProgressPct, synthBusyByShotId,
  rowAudioKey, onAudioTimeUpdate, onAudioPlay, onAudioPause, onAudioEnded, togglePlayObs, rowIsActivelyPlaying, onSynthesizeAudio
} = useVideoMatchAudio(currentJobId, shots)

function rowClassName() {
  return 'video-match-table-row'
}

const {
  composing, composePollTimer, mixPreferSrt, lastMixCompose,
  clearComposePoll, isAbsoluteHttpUrl, mixComposeResultHref, copyMixOutputPath, downloadMixSrtFile, onMixCompose
} = useVideoMatchMixCompose(pollerComposing, currentJobId, shots, canMixCompose, mixComposeDisabledHint)

onMounted(() => {
  fetchWorkspaces()
  loadHistoryJobs()
})
</script>

<template>
  <div class="video-match-page video-analysis-container">
    <VideoMatchControlPanel
      :form="form"
      :workspaceOptions="workspaceOptions"
      :videoMatchFrameSizeOptions="videoMatchFrameSizeOptions"
      :parsing="parsing"
      :parseStatus="parseStatus"
      :parseError="parseError"
      v-model:tokenJoinDialogVisible="tokenJoinDialogVisible"
      :matching="matching"
      :composing="pollerComposing"
      :hasShots="hasShots"
      :canMatch="canMatch"
      :canMixCompose="canMixCompose"
      :isExtracting="isExtracting"
      :mixComposeDisabledHint="mixComposeDisabledHint"
      :historyJobs="historyJobs"
      :historyJobId="historyJobId"
      :historyJobLabel="historyJobLabel"
      :strategies="strategies"
      :selectedStrategy="selectedStrategy"
      :pipelineStatusZh="pipelineStatusZh"
      :currentJobId="currentJobId"
      :jobSearchStatus="jobSearchStatus"
      :jobSearchError="jobSearchError"
      :extractStatus="extractStatus"
      :extractError="extractError"
      :lastMixCompose="lastMixCompose"
      :mixComposeResultHref="mixComposeResultHref"
      v-model:mixPreferSrt="mixPreferSrt"
      @update:historyJobId="historyJobId = ($event as any)"
      @update:selectedStrategy="selectedStrategy = ($event as any)"
      @parse="onParse"
      @extract="onExtract"
      @match="onMatch"
      @mix-compose="onMixCompose"
      @history-change="onHistoryJobChange"
      @strategy-delete="handleVmStrategySave"
      @open-strategy-create="openVmStrategyCreateDialog"
      @open-strategy-edit="openVmStrategyEditDialog"
      @refreshJob="refreshJob"
      @loadStrategies="loadStrategies"
      @copyMixOutputPath="copyMixOutputPath"
      @downloadMixSrtFile="downloadMixSrtFile"
    />

    <div v-if="hasShots" class="results-area">
      <VideoMatchShotsTable
        :shots="shots"
        :currentJobId="currentJobId"
        :synthBusyByShotId="synthBusyByShotId"
        :waveHeights="[]"
        :playingRowKey="playingRowKey"
        :audioProgressPct="audioProgressPct"
        :isAudioPlaying="isAudioPlaying"
        :vmShotRematchingId="vmShotRematchingId"
        :rowIsActivelyPlaying="rowIsActivelyPlaying"
        :rowAudioKey="rowAudioKey"
        rowClassName="video-match-table-row"
        @goVideoAnalysisFromVmShot="goVideoAnalysisFromVmShot"
        @togglePlayObs="togglePlayObs"
        @synthesizeAudio="onSynthesizeAudio"
        @openMatchDetail="openMatchDetail"
        @openShotTranscribe="openShotTranscribe"
        @rematchVmShot="rematchVmShot"
      />
    </div>

    <VideoMatchDetailDialog
      v-model="matchDetailVisible"
      :loading="matchDetailLoading"
      :payload="matchDetailPayload"
      :row="matchDetailRow"
      :hitRows="matchDetailHitRows"
      :tokens="matchDetailTokens"
      :formatMatchDetailJson="formatMatchDetailJson"
      @refresh="refreshJob"
    />

    <VideoMatchTranscribeDialog
      v-model="shotTranscribeVisible"
      :row="shotTranscribeRow"
      :tokens="shotTranscribeTokens"
      @saved="refreshJob"
    />

    <TokenJoinTemplateDialog v-model="tokenJoinDialogVisible" :workspace="form.workspace" />
  </div>
</template>

<style scoped>
.video-match-page {
  padding: 20px;
  background-color: var(--el-bg-color-page);
  min-height: calc(100vh - 60px);
}
.results-area {
  margin-top: 16px;
  background: var(--el-bg-color);
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  padding: 16px;
}
</style>
