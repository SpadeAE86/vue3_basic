<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  fetchImageHistoryForBoard,
  fetchVideoAnalysisHistoryForBoard,
  fetchImageTaskDetail,
  fetchVideoAnalysisTaskDetail,
  retryImageHistoryTask,
} from '@/api/taskBoard'
import { IMAGEGEN_RETRY_STARTED_EVENT } from '@/composables/image/useGenerateHistory'

type BoardSection = 'image' | 'video'

const route = useRoute()

const boardSection = computed<BoardSection>(() =>
  route.meta.boardSection === 'video' ? 'video' : 'image',
)

const pageTitle = computed(() => (route.meta.title as string) || '任务看板')

const loading = ref(false)
const imageRows = ref<Record<string, unknown>[]>([])
const videoRows = ref<Record<string, unknown>[]>([])

const dateRange = ref<[Date, Date] | null>(null)
const statusFilter = ref<string>('')
const workspaceFilter = ref<string>('')
const currentPage = ref(1)
const pageSize = ref(10)

const detailVisible = ref(false)
const detailLoading = ref(false)
const detailPayload = ref<Record<string, unknown> | null>(null)

/** 有进行中的生图/视频分析任务时每秒 +1，驱动「耗时」列用当前时间 - 本轮开始时间/创建时间动态展示（仅小表） */
const durationTick = ref(0)
let durationLiveTimer: ReturnType<typeof setInterval> | null = null

function syncRunningDurationTimer() {
  const need =
    (boardSection.value === 'image' &&
      imageRows.value.some((r) => rowStatusNorm(r, 'image') === 'running')) ||
    (boardSection.value === 'video' &&
      videoRows.value.some((r) => rowStatusNorm(r, 'video') === 'running'))
  if (need) {
    if (!durationLiveTimer) {
      durationLiveTimer = setInterval(() => {
        durationTick.value++
      }, 1000)
    }
  } else if (durationLiveTimer) {
    clearInterval(durationLiveTimer)
    durationLiveTimer = null
  }
}

function pickRows(): Record<string, unknown>[] {
  return boardSection.value === 'image' ? imageRows.value : videoRows.value
}

function rowCreatedAt(r: Record<string, unknown>): Date | null {
  const v = r.created_at as string | undefined
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function rowUpdatedAt(r: Record<string, unknown>): Date | null {
  const v = r.updated_at as string | undefined
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 本轮异步运行开始时间（重试时会刷新）；生图看板耗时时优先于 created_at */
function rowCurrentRunStartedAt(r: Record<string, unknown>): Date | null {
  const v = r.current_run_started_at as string | undefined
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function rowDurationStartForImage(r: Record<string, unknown>): Date | null {
  return rowCurrentRunStartedAt(r) ?? rowCreatedAt(r)
}

function _formatDurationMs(ms: number): string {
  if (ms < 0) return '—'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`
  const m = Math.floor(ms / 60_000)
  const s = ((ms % 60_000) / 1000).toFixed(0)
  return `${m} 分 ${s} 秒`
}

function rowDurationLabel(r: Record<string, unknown>, section: BoardSection): string {
  if (section === 'image') {
    const start = rowDurationStartForImage(r)
    if (!start) return '—'
    if (rowStatusNorm(r, section) === 'running') {
      void durationTick.value
      return _formatDurationMs(Date.now() - start.getTime())
    }
    const ua = rowUpdatedAt(r)
    if (!ua) return '—'
    return _formatDurationMs(ua.getTime() - start.getTime())
  }

  const ca = rowCreatedAt(r)
  if (!ca) return '—'
  if (rowStatusNorm(r, section) === 'running') {
    void durationTick.value
    return _formatDurationMs(Date.now() - ca.getTime())
  }
  const ua = rowUpdatedAt(r)
  if (!ua) return '—'
  return _formatDurationMs(ua.getTime() - ca.getTime())
}

function rowStatusNorm(r: Record<string, unknown>, section: BoardSection): string {
  if (section === 'image') {
    const s = ((r.status as string) || '').toLowerCase()
    if (r.error) return 'failed'
    if (s === 'failed' || s === 'error') return 'failed'
    if (s === 'running' || s === 'pending') return 'running'
    if (r.url || r.obs_url || r.doubao_url) return 'success'
    if (s === 'success' || s === 'succeed' || s === 'succeeded') return 'success'
    return s || 'unknown'
  }
  const raw = String(r.status ?? '').trim()
  const s = raw.toLowerCase()
  if (s === 'failed' || s === 'error') return 'failed'
  if (s === 'running' || s === 'pending') return 'running'
  if (s === 'success' || s === 'succeed' || s === 'succeeded') return 'success'
  return raw ? raw.toLowerCase() : 'unknown'
}

const filteredRows = computed(() => {
  let list = pickRows().slice()
  if (dateRange.value) {
    const [a, b] = dateRange.value
    const start = a.getTime()
    const end = b.getTime()
    list = list.filter((r) => {
      const t = rowCreatedAt(r)?.getTime()
      if (t == null) return true
      return t >= start && t <= end
    })
  }
  if (statusFilter.value) {
    list = list.filter((r) => rowStatusNorm(r, boardSection.value) === statusFilter.value)
  }
  return list
})

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRows.value.slice(start, start + pageSize.value)
})

watch([boardSection, statusFilter, dateRange, workspaceFilter], () => {
  currentPage.value = 1
})

async function loadImage(silent = false) {
  if (!silent) loading.value = true
  try {
    const data = await fetchImageHistoryForBoard()
    if (data?.success && Array.isArray(data.history)) {
      imageRows.value = data.history as Record<string, unknown>[]
    } else {
      imageRows.value = []
    }
  } finally {
    if (!silent) loading.value = false
  }
}

async function loadVideo(silent = false) {
  if (!silent) loading.value = true
  try {
    const data = await fetchVideoAnalysisHistoryForBoard(workspaceFilter.value || undefined)
    if (data?.success && Array.isArray(data.history)) {
      videoRows.value = data.history as Record<string, unknown>[]
    } else {
      videoRows.value = []
    }
  } finally {
    if (!silent) loading.value = false
  }
}

async function refresh() {
  loading.value = true
  try {
    if (boardSection.value === 'image') {
      await loadImage()
    } else {
      await loadVideo()
    }
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

watch([boardSection, imageRows, videoRows], syncRunningDurationTimer, { deep: true })

/** 当前看板存在「进行中」任务时定时拉取历史，避免后台已完成仍显示生成中 */
let boardHistoryPollTimer: ReturnType<typeof setInterval> | null = null

function syncBoardHistoryPoll() {
  const section = boardSection.value
  const imageRunning = imageRows.value.some((r) => rowStatusNorm(r, 'image') === 'running')
  const videoRunning = videoRows.value.some((r) => rowStatusNorm(r, 'video') === 'running')
  const needPoll =
    (section === 'image' && imageRunning) || (section === 'video' && videoRunning)

  if (needPoll && !boardHistoryPollTimer) {
    const tick = async () => {
      const s = boardSection.value
      try {
        if (s === 'image' && imageRows.value.some((r) => rowStatusNorm(r, 'image') === 'running')) {
          await loadImage(true)
        } else if (s === 'video' && videoRows.value.some((r) => rowStatusNorm(r, 'video') === 'running')) {
          await loadVideo(true)
        }
      } catch {
        /* 静默轮询失败不打断 */
      }
    }
    void tick()
    boardHistoryPollTimer = setInterval(tick, 3000)
  } else if (!needPoll && boardHistoryPollTimer) {
    clearInterval(boardHistoryPollTimer)
    boardHistoryPollTimer = null
  }
}

watch([boardSection, imageRows, videoRows], syncBoardHistoryPoll, { deep: true })

onUnmounted(() => {
  if (durationLiveTimer) {
    clearInterval(durationLiveTimer)
    durationLiveTimer = null
  }
  if (boardHistoryPollTimer) {
    clearInterval(boardHistoryPollTimer)
    boardHistoryPollTimer = null
  }
})

watch(
  () => route.path,
  () => {
    workspaceFilter.value = boardSection.value === 'video' ? workspaceFilter.value : ''
    refresh()
  },
)

watch(workspaceFilter, async () => {
  if (boardSection.value === 'video') await loadVideo()
})

function resetFilters() {
  dateRange.value = null
  statusFilter.value = ''
  if (boardSection.value === 'video') workspaceFilter.value = ''
}

function formatJson(v: unknown) {
  try {
    return JSON.stringify(v ?? null, null, 2)
  } catch {
    return String(v)
  }
}

function shortStr(s: unknown, n = 48) {
  if (s == null) return '—'
  const t = String(s)
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/** 列表中的提示词：前 10 字 + ...，便于区分记录 */
function imagePromptPreview(row: Record<string, unknown>) {
  const p = row.prompt
  if (p == null) return '—'
  const t = String(p).trim()
  if (!t) return '—'
  return t.length > 10 ? `${t.slice(0, 10)}...` : t
}

/** 与表格「任务 ID」列一致优先用 id，兼容仅 taskId 的旧数据；两端 strip 避免隐性空白 */
function detailLookupKey(row: Record<string, unknown>): string {
  const pid = row.id != null && String(row.id).trim() !== '' ? String(row.id).trim() : ''
  const tid = row.taskId != null && String(row.taskId).trim() !== '' ? String(row.taskId).trim() : ''
  return pid || tid
}

async function openDetail(row: Record<string, unknown>) {
  detailVisible.value = true
  detailLoading.value = true
  detailPayload.value = null
  const id = detailLookupKey(row)
  if (!id) {
    detailPayload.value = { error: '缺少任务 ID' }
    detailLoading.value = false
    return
  }
  try {
    const res =
      boardSection.value === 'image'
        ? await fetchImageTaskDetail(id)
        : await fetchVideoAnalysisTaskDetail(id)
    if (res?.success && res.detail) {
      detailPayload.value = res.detail as Record<string, unknown>
    } else {
      detailPayload.value = { error: res?.detail || res?.error || '加载失败' }
    }
  } catch (e: unknown) {
    detailPayload.value = { error: (e as Error)?.message || '请求失败' }
  } finally {
    detailLoading.value = false
  }
}

const imageRetryingId = ref('')

async function retryImageRow(row: Record<string, unknown>) {
  const id = detailLookupKey(row)
  if (!id) {
    ElMessage.warning('缺少任务 ID')
    return
  }
  imageRetryingId.value = id
  try {
    const res = (await retryImageHistoryTask(id)) as { success?: boolean; error?: string }
    if (res?.success) {
      ElMessage.success('已重新排队生成')
      window.dispatchEvent(new CustomEvent(IMAGEGEN_RETRY_STARTED_EVENT, { detail: { id } }))
      await loadImage(true)
    } else {
      ElMessage.error(typeof res?.error === 'string' ? res.error : '重试失败')
    }
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message || '重试请求失败')
  } finally {
    imageRetryingId.value = ''
  }
}

function statusLabel(st: string) {
  if (st === 'success') return '成功'
  if (st === 'failed') return '失败'
  if (st === 'running') return '进行中'
  if (st === 'unknown') return '未知'
  return st
}

function statusTagType(st: string) {
  if (st === 'success') return 'success'
  if (st === 'failed') return 'danger'
  if (st === 'running') return 'warning'
  return 'info'
}

const isImageGenDetail = computed(
  () => detailPayload.value && detailPayload.value.businessType === 'IMAGE_GEN',
)

const detailPrompt = computed(() => {
  const p = detailPayload.value?.prompt_full
  return typeof p === 'string' ? p : ''
})

const detailResultImageUrl = computed(() => {
  const u = detailPayload.value?.result_image_url
  return typeof u === 'string' && u.startsWith('http') ? u : ''
})
</script>

<template>
  <div class="task-board">
    <div class="board-panel">
      <div class="panel-head">
        <h2 class="panel-title">{{ pageTitle }}</h2>
        <el-button type="primary" size="small" :loading="loading" @click="refresh">刷新</el-button>
      </div>

      <el-form :inline="true" class="filter-form" @submit.prevent>
        <el-form-item label="创建时间">
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            style="width: 340px"
          />
        </el-form-item>
        <el-form-item label="总状态">
          <el-select v-model="statusFilter" clearable placeholder="请选择状态" style="width: 160px">
            <el-option label="成功" value="success" />
            <el-option label="失败" value="failed" />
            <el-option label="进行中" value="running" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="boardSection === 'video'" label="工作区">
          <el-select
            v-model="workspaceFilter"
            clearable
            placeholder="全部"
            style="width: 120px"
            @change="loadVideo"
          >
            <el-option label="v1" value="v1" />
            <el-option label="v2" value="v2" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="currentPage = 1">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 图像生成 -->
      <el-table
        v-if="boardSection === 'image'"
        v-loading="loading"
        :data="pagedRows"
        stripe
        :border="false"
        class="admin-table"
        header-cell-class-name="admin-th"
        style="width: 100%"
      >
        <el-table-column prop="id" label="任务 ID" min-width="120" show-overflow-tooltip />
        <el-table-column label="总状态" width="104" align="center">
          <template #default="{ row }">
            <el-tag
              :type="statusTagType(rowStatusNorm(row, 'image'))"
              effect="light"
              size="small"
              class="status-pill status-tag-admin"
            >
              {{ statusLabel(rowStatusNorm(row, 'image')) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提示词" min-width="140">
          <template #default="{ row }">
            <span class="prompt-clip" :title="row.prompt != null && String(row.prompt).trim() ? String(row.prompt) : ''">
              {{ imagePromptPreview(row) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="168">
          <template #default="{ row }">
            {{ rowCreatedAt(row)?.toLocaleString() ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="120" align="center">
          <template #default="{ row }">
            {{ rowDurationLabel(row, 'image') }}
          </template>
        </el-table-column>
        <el-table-column prop="model" label="模型" width="130" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="72" />
        <el-table-column label="操作" width="168" fixed="right" align="center">
          <template #default="{ row }">
            <div class="op-links">
              <el-button type="primary" link @click="openDetail(row)">查看详情</el-button>
              <el-button
                v-if="rowStatusNorm(row, 'image') === 'failed'"
                type="primary"
                link
                :loading="imageRetryingId === detailLookupKey(row)"
                @click="retryImageRow(row)"
              >
                重试
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 视频分析 -->
      <el-table
        v-else
        v-loading="loading"
        :data="pagedRows"
        stripe
        :border="false"
        class="admin-table"
        header-cell-class-name="admin-th"
        style="width: 100%"
      >
        <el-table-column prop="id" label="分析 ID" min-width="120" show-overflow-tooltip />
        <el-table-column label="总状态" width="104" align="center">
          <template #default="{ row }">
            <el-tag
              :type="statusTagType(rowStatusNorm(row, 'video'))"
              effect="light"
              size="small"
              class="status-pill status-tag-admin"
            >
              {{ statusLabel(rowStatusNorm(row, 'video')) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="产品名" min-width="100" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.car_model != null && String(row.car_model).trim() ? String(row.car_model).trim() : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="168">
          <template #default="{ row }">
            {{ rowCreatedAt(row)?.toLocaleString() ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="120" align="center">
          <template #default="{ row }">
            {{ rowDurationLabel(row, 'video') }}
          </template>
        </el-table-column>
        <el-table-column label="视频标题" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ shortStr(row.name, 48) }}
          </template>
        </el-table-column>
        <el-table-column prop="workspace" label="工作区" width="88" />
        <el-table-column label="视频地址" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ shortStr(row.video_url, 40) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="108" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link @click="openDetail(row)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="filteredRows.length"
          background
        />
      </div>
    </div>

    <el-dialog
      v-model="detailVisible"
      title="HTTP 调用记录详情"
      width="900px"
      top="5vh"
      class="detail-dialog admin-dialog"
      align-center
      destroy-on-close
    >
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detailPayload && !detailPayload.error">
          <el-descriptions :column="2" border size="small" class="desc-grid">
            <el-descriptions-item label="任务 ID">{{ detailPayload.id }}</el-descriptions-item>
            <el-descriptions-item label="Task ID">{{ detailPayload.taskId ?? '—' }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.requestRid" label="请求记录 rid">{{ detailPayload.requestRid }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.processId != null" label="进程 ID">{{ detailPayload.processId }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.upstreamTaskId" label="上游 Task ID">{{ detailPayload.upstreamTaskId }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.traceId" label="Trace ID">{{ detailPayload.traceId }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.parentTraceId" label="父 Trace ID">{{ detailPayload.parentTraceId }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.callSequence != null" label="调用序号">{{ detailPayload.callSequence }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.businessId" label="业务 ID">{{ detailPayload.businessId }}</el-descriptions-item>
            <el-descriptions-item label="服务">{{ detailPayload.serviceName }}</el-descriptions-item>
            <el-descriptions-item label="方法">{{ detailPayload.methodName }}</el-descriptions-item>
            <el-descriptions-item label="HTTP">{{ detailPayload.httpMethod }}</el-descriptions-item>
            <el-descriptions-item label="业务类型">{{ detailPayload.businessType }}</el-descriptions-item>
            <el-descriptions-item label="状态码">{{ detailPayload.statusCode }}</el-descriptions-item>
            <el-descriptions-item label="耗时">{{ detailPayload.durationMs != null ? `${detailPayload.durationMs} ms` : '—' }}</el-descriptions-item>
            <el-descriptions-item label="业务状态">
              <el-tag
                :type="detailPayload.businessSuccess ? 'success' : 'danger'"
                effect="light"
                size="small"
                class="status-tag-admin"
              >
                {{ detailPayload.businessStatusLabel }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="错误信息">{{ (detailPayload.errorMessage as string) || '—' }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ detailPayload.createdAt ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ detailPayload.updatedAt ?? '—' }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.httpTraceCreatedAt" label="HTTP 记录创建">{{ detailPayload.httpTraceCreatedAt }}</el-descriptions-item>
            <el-descriptions-item v-if="detailPayload.httpTraceUpdatedAt" label="HTTP 记录更新">{{ detailPayload.httpTraceUpdatedAt }}</el-descriptions-item>
          </el-descriptions>

          <div class="field-label">Request URL</div>
          <pre class="code-block">{{ detailPayload.requestUrl }}</pre>

          <div class="field-label">Request Headers</div>
          <pre class="code-block muted">{{ formatJson(detailPayload.requestHeaders) }}</pre>

          <div class="field-label">Request Body</div>
          <pre class="code-block">{{ formatJson(detailPayload.requestBody) }}</pre>

          <div class="field-label">Response Headers</div>
          <pre class="code-block muted">{{ formatJson(detailPayload.responseHeaders) }}</pre>

          <div class="field-label">Response Body</div>
          <pre class="code-block">{{ formatJson(detailPayload.responseBody) }}</pre>

          <p v-if="detailPayload.note" class="hint">{{ detailPayload.note }}</p>

          <template v-if="isImageGenDetail">
            <div class="detail-image-tail">
              <div class="field-label">提示词</div>
              <div class="text-panel">{{ detailPrompt || '—' }}</div>
              <div class="field-label">生成结果</div>
              <div v-if="detailResultImageUrl" class="result-img-wrap detail-result-img-wrap">
                <el-image
                  :src="detailResultImageUrl"
                  fit="contain"
                  class="detail-result-el-image"
                  :preview-src-list="[detailResultImageUrl]"
                  preview-teleported
                />
              </div>
              <div v-else class="text-panel muted">暂无图片 URL（可能仍在生成或失败）</div>
            </div>
          </template>
        </template>
        <el-alert v-else-if="detailPayload?.error" type="error" :title="String(detailPayload.error)" show-icon :closable="false" />
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.task-board {
  max-width: 100%;
  margin: 0;
}

.board-panel {
  background: #fff;
  border-radius: 2px;
  padding: 20px 24px 24px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.panel-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.85);
  letter-spacing: 0.02em;
}

.filter-form {
  margin-bottom: 16px;
  padding: 16px 16px 4px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 2px;
}

.filter-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.op-links {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  justify-content: center;
  align-items: center;
}

.admin-table {
  --el-table-border-color: transparent;
}

.admin-table :deep(.el-table__inner-wrapper::before) {
  display: none;
}

.admin-table :deep(td.el-table__cell) {
  border-bottom: 1px solid #f0f0f0;
}

.admin-th {
  background: #fafafa !important;
  color: rgba(0, 0, 0, 0.65);
  font-weight: 500;
}

.status-pill {
  border: none;
}

/* 参考管理后台：浅底 + 深字 */
.status-tag-admin.el-tag--success {
  --el-tag-bg-color: #f6ffed;
  --el-tag-border-color: #b7eb8f;
  --el-tag-text-color: #389e0d;
}

.status-tag-admin.el-tag--danger {
  --el-tag-bg-color: #fff2f0;
  --el-tag-border-color: #ffccc7;
  --el-tag-text-color: #cf1322;
}

.status-tag-admin.el-tag--warning {
  --el-tag-bg-color: #fffbe6;
  --el-tag-border-color: #ffe58f;
  --el-tag-text-color: #d48806;
}

.status-tag-admin.el-tag--info {
  --el-tag-bg-color: #f0f5ff;
  --el-tag-border-color: #adc6ff;
  --el-tag-text-color: #2f54eb;
}

.pager {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.detail-body {
  min-height: 120px;
}

/* 详情弹窗 body 可滚动，避免整图在视口外被截断 */
.detail-dialog.admin-dialog :deep(.el-dialog__body) {
  max-height: calc(100vh - 132px);
  overflow-y: auto;
  padding-right: 4px;
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

.text-panel.muted {
  color: #8c8c8c;
}

.result-img-wrap {
  margin-bottom: 16px;
}

.result-img {
  max-width: 100%;
  max-height: 360px;
  border-radius: 4px;
  border: 1px solid #f0f0f0;
}

.detail-image-tail {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

.detail-image-tail .text-panel {
  max-height: 280px;
}

/* el-image 默认 height:100% + overflow:hidden，易把竖图裁成一条；改为随原图比例撑满宽度 */
.detail-result-img-wrap {
  margin-bottom: 0;
}

.detail-result-img-wrap :deep(.el-image) {
  display: block;
  width: 100%;
  max-height: none;
  overflow: visible;
}

.detail-result-img-wrap :deep(.el-image__inner) {
  position: relative;
  width: 100% !important;
  height: auto !important;
  max-height: none !important;
  vertical-align: top;
  border-radius: 4px;
  border: 1px solid #f0f0f0;
}

.desc-grid {
  margin-bottom: 16px;
}

.field-label {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  margin: 12px 0 6px;
  font-weight: 500;
}

.code-block {
  margin: 0;
  padding: 12px 14px;
  background: #f5f5f5;
  border: 1px solid #e8e8e8;
  border-radius: 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  overflow-x: auto;
  max-height: 260px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.code-block.muted {
  color: #8c8c8c;
}

.hint {
  margin-top: 12px;
  font-size: 12px;
  color: #8c8c8c;
}
</style>
