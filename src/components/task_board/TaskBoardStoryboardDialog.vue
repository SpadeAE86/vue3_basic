<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Position } from '@element-plus/icons-vue'
import TokenChipsReadonly from '@/components/video_match/TokenChipsReadonly.vue'
import { tagsJsonToSearchTokens } from '@/utils/matchTagsFromSegment'
import type { VideoMatchShotDto } from '@/api/video_match'

const props = defineProps<{
  modelValue: boolean
  boardSection: string
  storyboardLoading: boolean
  storyboardJobId: string | null
  storyboardJobParseFailed: boolean
  storyboardParentRow: any
  vmRetryingId: string
  storyboardShots: VideoMatchShotDto[]
  shotRematchingId: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'retry-job', row: any): void
  (e: 'open-match', row: VideoMatchShotDto): void
  (e: 'rematch-shot', row: VideoMatchShotDto): void
  (e: 'go-video-analysis', row: VideoMatchShotDto): void
}>()

const visible = ref(props.modelValue)
watch(() => props.modelValue, (val) => {
  visible.value = val
})
watch(visible, (val) => {
  emit('update:modelValue', val)
})

const shotTranscribeVisible = ref(false)
const shotTranscribeRow = ref<VideoMatchShotDto | null>(null)

const shotTranscribeTokens = computed(() => {
  if (shotTranscribeRow.value?.search_tokens_json && Array.isArray(shotTranscribeRow.value.search_tokens_json)) {
    return shotTranscribeRow.value.search_tokens_json
  }
  return tagsJsonToSearchTokens((shotTranscribeRow.value?.tags_json ?? {}) as Record<string, unknown>)
})

function openShotTranscribe(row: VideoMatchShotDto) {
  shotTranscribeRow.value = row
  shotTranscribeVisible.value = true
}

watch(shotTranscribeVisible, (open) => {
  if (!open) shotTranscribeRow.value = null
})

function vmJobCanRetryTranscribe(row: Record<string, unknown>): boolean {
  const ps = String(row.parse_status ?? '').toLowerCase()
  if (ps === 'running' || ps === 'processing' || ps === 'pending') return false
  return ps === 'failed'
}

function shotSearchStatusNormBoard(row: VideoMatchShotDto): string {
  const s = (row.search_status || '').toLowerCase()
  if (s === 'failed') return 'failed'
  if (s === 'done') return 'success'
  if (s === 'running') return 'running'
  if (s === 'pending') return 'pending'
  return s || 'unknown'
}

function shotStatusLabelBoard(st: string) {
  if (st === 'success') return '成功'
  if (st === 'failed') return '失败'
  if (st === 'running') return '进行中'
  if (st === 'pending') return '待匹配'
  if (st === 'unknown') return '未知'
  return st
}

function shotStatusTagTypeBoard(st: string): 'success' | 'danger' | 'warning' | 'info' {
  if (st === 'success') return 'success'
  if (st === 'failed') return 'danger'
  if (st === 'running') return 'warning'
  if (st === 'pending') return 'info'
  return 'info'
}

function top1UrlDisplayBoard(url: string): string {
  const u = (url || '').trim()
  if (!u) return '—'
  try {
    const parsed = new URL(u)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const last = parts.length ? parts[parts.length - 1] : ''
    if (last) return decodeURIComponent(last)
  } catch {
    // ignore
  }
  return u.length > 52 ? `${u.slice(0, 52)}…` : u
}

function shotMatchFailed(row: VideoMatchShotDto): boolean {
  return (row.search_status || '').toLowerCase() === 'failed'
}

function canJumpVideoAnalysisFromShot(row: VideoMatchShotDto): boolean {
  return (
    (row.search_status || '').toLowerCase() === 'done' &&
    !!row.tags_json &&
    Object.keys(row.tags_json as object).length > 0
  )
}
</script>

<template>
  <div>
    <el-dialog
      v-model="visible"
      title="分镜列表"
      width="1080px"
      top="5vh"
      class="storyboard-dialog admin-dialog"
      align-center
      destroy-on-close
    >
      <div v-loading="storyboardLoading" class="storyboard-dialog-body">
        <p v-if="storyboardJobId" class="story-job-id muted-small">任务 ID：{{ storyboardJobId }}</p>
        <el-alert
          v-if="storyboardJobParseFailed && !storyboardShots.length && !storyboardLoading"
          type="warning"
          show-icon
          :closable="false"
          class="storyboard-parse-alert"
        >
          <template #title>口播转写失败，暂无分镜</template>
          <div v-if="storyboardParentRow" class="storyboard-alert-actions">
            <el-button
              v-if="storyboardParentRow && vmJobCanRetryTranscribe(storyboardParentRow)"
              type="primary"
              size="small"
              :loading="vmRetryingId === String(storyboardParentRow.id ?? '').trim()"
              @click="$emit('retry-job', storyboardParentRow)"
            >
              重试转写
            </el-button>
          </div>
        </el-alert>
        <el-table
          v-if="storyboardShots.length"
          :data="storyboardShots"
          stripe
          border
          size="small"
          style="width: 100%"
        >
          <el-table-column prop="shot_order" label="#" width="52" />
          <el-table-column prop="segment_text" label="口播" min-width="140" show-overflow-tooltip />
          <el-table-column prop="description" label="画面描述" min-width="120" show-overflow-tooltip />
          <el-table-column
            v-if="boardSection === 'video_match_transcribe'"
            label="match_id"
            min-width="120"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              {{ (row.match_id && String(row.match_id).trim()) || '—' }}
            </template>
          </el-table-column>
          <el-table-column
            v-if="boardSection === 'video_match_search' || boardSection === 'video_match_transcribe'"
            label="匹配状态"
            width="96"
            align="center"
          >
            <template #default="{ row }">
              <el-tag
                :type="shotStatusTagTypeBoard(shotSearchStatusNormBoard(row))"
                effect="light"
                size="small"
                class="status-pill status-tag-admin"
              >
                {{ shotStatusLabelBoard(shotSearchStatusNormBoard(row)) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            v-if="boardSection === 'video_match_search' || boardSection === 'video_match_transcribe'"
            label="本镜耗时(ms)"
            width="104"
            align="center"
          >
            <template #default="{ row }">
              {{
                row.match_elapsed_ms != null && Number.isFinite(Number(row.match_elapsed_ms))
                  ? Number(row.match_elapsed_ms).toFixed(0)
                  : '—'
              }}
            </template>
          </el-table-column>
          <el-table-column v-if="boardSection === 'video_match_search' || boardSection === 'video_match_transcribe'" label="Top1 视频" min-width="168">
            <template #default="{ row }">
              <a
                v-if="(row.top1_obs_url || '').trim()"
                class="match-url-link"
                :href="(row.top1_obs_url || '').trim()"
                target="_blank"
                rel="noopener noreferrer"
                >{{ top1UrlDisplayBoard((row.top1_obs_url || '').trim()) }}</a
              >
              <span v-else class="muted-small">—</span>
            </template>
          </el-table-column>
          <el-table-column
            v-if="boardSection === 'video_match_transcribe'"
            label="转写操作"
            width="108"
            fixed="right"
            align="center"
          >
            <template #default="{ row }">
              <el-button type="primary" link :disabled="row.id == null" @click="openShotTranscribe(row)">
                查看转写
              </el-button>
            </template>
          </el-table-column>
          <el-table-column
            v-if="boardSection === 'video_match_search' || boardSection === 'video_match_transcribe'"
            label="匹配操作"
            width="248"
            fixed="right"
            align="center"
          >
            <template #default="{ row }">
              <div class="shot-op-cell">
                <el-button type="primary" link :disabled="row.id == null" @click="$emit('open-match', row)">
                  查看匹配
                </el-button>
                <el-button
                  v-if="shotMatchFailed(row)"
                  type="primary"
                  link
                  :disabled="row.id == null"
                  :loading="shotRematchingId === row.id"
                  @click="$emit('rematch-shot', row)"
                >
                  重试
                </el-button>
                <el-tooltip content="用本分镜标签与当时匹配策略打开视频分析，并自动全库搜索" placement="top">
                  <el-button
                    class="va-jump-icon-btn"
                    :icon="Position"
                    circle
                    size="small"
                    :disabled="!canJumpVideoAnalysisFromShot(row)"
                    aria-label="跳转视频分析"
                    @click="$emit('go-video-analysis', row)"
                  />
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else-if="!storyboardLoading" description="暂无分镜数据" />
      </div>
    </el-dialog>

    <el-dialog
      v-model="shotTranscribeVisible"
      title="分镜 · 转写与标签"
      width="560px"
      top="8vh"
      class="admin-dialog"
      align-center
      destroy-on-close
    >
      <template v-if="shotTranscribeRow">
        <div v-if="shotTranscribeRow.match_id" class="field-label">match_id（素材匹配履历）</div>
        <div v-if="shotTranscribeRow.match_id" class="text-panel">{{ shotTranscribeRow.match_id }}</div>
        <div class="field-label">口播</div>
        <div class="text-panel">{{ shotTranscribeRow.segment_text || '—' }}</div>
        <div class="field-label">画面描述</div>
        <div class="text-panel">{{ shotTranscribeRow.description || '—' }}</div>
        <div class="field-label">结构化标签</div>
        <TokenChipsReadonly :tokens="shotTranscribeTokens" />
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.storyboard-dialog-body {
  min-height: 120px;
}
.storyboard-dialog.admin-dialog :deep(.el-dialog__body) {
  max-height: calc(100vh - 132px);
  overflow-y: auto;
  padding-right: 4px;
}
.storyboard-parse-alert {
  margin-bottom: 16px;
}
.storyboard-alert-actions {
  margin-top: 8px;
}
.story-job-id {
  margin: 0 0 12px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}
.muted-small {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}
.match-url-link {
  color: var(--el-color-primary);
  text-decoration: none;
  font-size: 13px;
}
.match-url-link:hover {
  text-decoration: underline;
}
.shot-op-cell {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
}
.va-jump-icon-btn {
  font-size: 14px;
  padding: 4px;
}
.field-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 16px 0 8px;
}
.text-panel {
  padding: 12px 14px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 2px;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(0, 0, 0, 0.85);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}
</style>
