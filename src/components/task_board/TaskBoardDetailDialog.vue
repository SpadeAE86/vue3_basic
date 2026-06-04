<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElImageViewer } from 'element-plus'
import HttpTraceJsonBlock from '@/components/task_board/HttpTraceJsonBlock.vue'

const props = defineProps<{
  modelValue: boolean
  detailDialogTitle: string
  detailIsShotMatch: boolean
  detailLoading: boolean
  detailPayload: Record<string, unknown> | null
  detailMatchHitRows: Record<string, unknown>[]
  isImageGenDetail: boolean
  detailPrompt: string
  detailResultImageUrl: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = ref(props.modelValue)
watch(() => props.modelValue, (val) => {
  visible.value = val
})
watch(visible, (val) => {
  emit('update:modelValue', val)
  if (!val) hitRowsExpanded.value = false
})

const detailImageViewerVisible = ref(false)
const hitRowsExpanded = ref(false)

const isVideoGenDetail = computed(
  () => !!(props.detailPayload && props.detailPayload.businessType === 'VIDEO_GEN'),
)

const slicedHitRows = computed(() => {
  if (!props.detailMatchHitRows?.length) return []
  return hitRowsExpanded.value
    ? props.detailMatchHitRows.slice(0, 20)
    : props.detailMatchHitRows.slice(0, 5)
})

function formatJson(val: unknown) {
  if (!val) return '—'
  if (typeof val === 'string') return val
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="detailDialogTitle"
    :width="detailIsShotMatch ? 'min(1080px, 96vw)' : '900px'"
    top="4vh"
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
              :type="
                detailPayload.businessSuccess === true
                  ? 'success'
                  : detailPayload.businessSuccess === false
                    ? 'danger'
                    : 'info'
              "
              effect="light"
              size="small"
              class="status-tag-admin"
            >
              {{ detailPayload.businessStatusLabel ?? '—' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="错误信息">{{ (detailPayload.errorMessage as string) || '—' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ detailPayload.createdAt ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ detailPayload.updatedAt ?? '—' }}</el-descriptions-item>
          <el-descriptions-item v-if="detailPayload.httpTraceCreatedAt" label="HTTP 记录创建">{{ detailPayload.httpTraceCreatedAt }}</el-descriptions-item>
          <el-descriptions-item v-if="detailPayload.httpTraceUpdatedAt" label="HTTP 记录更新">{{ detailPayload.httpTraceUpdatedAt }}</el-descriptions-item>
        </el-descriptions>

        <template v-if="detailIsShotMatch">
          <div class="field-label" style="margin-bottom: 6px;">
            Top 命中
            <span v-if="detailMatchHitRows.length" class="hit-count-badge">{{ detailMatchHitRows.length }} 条</span>
          </div>
          <p v-if="!detailMatchHitRows.length" class="hint">暂无命中记录（尚未匹配或 trace 未落库时可从下方 Response 查看摘要）</p>
          <template v-else>
            <el-table
              :data="slicedHitRows"
              border
              stripe
              size="small"
              class="hit-rank-table"
              max-height="360"
            >
              <el-table-column prop="rank" label="#" width="44" align="center" />
              <el-table-column prop="score" label="_score" width="96" align="right">
                <template #default="{ row: hr }">
                  {{ Number.isFinite(hr.score) ? hr.score.toFixed(4) : (hr.score ?? '—') }}
                </template>
              </el-table-column>
              <el-table-column prop="history_id" label="history_id" min-width="110" show-overflow-tooltip />
              <el-table-column label="video_url" min-width="200" show-overflow-tooltip>
                <template #default="{ row: hr }">
                  <a
                    v-if="hr.video_path"
                    class="match-url-link"
                    :href="hr.video_path"
                    :title="hr.video_path"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ hr.video_path.split('/').pop() || hr.video_path }}</a>
                  <span v-else class="muted-small">—</span>
                </template>
              </el-table-column>
            </el-table>
            <div v-if="detailMatchHitRows.length > 5" class="hit-expand-row">
              <el-button
                type="primary"
                link
                size="small"
                @click="hitRowsExpanded = !hitRowsExpanded"
              >
                {{ hitRowsExpanded ? '收起' : `展开全部 ${Math.min(detailMatchHitRows.length, 20)} 条` }}
              </el-button>
            </div>
          </template>
        </template>

        <div class="field-label">Request URL</div>
        <pre class="code-block">{{ detailPayload.requestUrl }}</pre>

        <div class="field-label">Request Headers</div>
        <pre class="code-block muted">{{ formatJson(detailPayload.requestHeaders) }}</pre>

        <HttpTraceJsonBlock
          label="Request Body"
          :model-value="detailPayload.requestBody"
          :pre-extra-class="detailIsShotMatch ? 'code-block--shot-trace' : undefined"
        >
          <template v-if="detailIsShotMatch" #before-body>
            <p class="hint trace-body-hint">
              以下内容仅作审计对照：检索请求里的<strong>长向量</strong>入库前会替换为
              <code>_omitted: numeric_vector</code>
              占位；若整体仍超长则会再出现
              <code>_truncated</code>
              。<strong>重试匹配</strong>由服务端根据当前分镜的
              <code>tags_json</code>
              重新调用检索逻辑，<strong>不会</strong>也不应依赖本条 Request Body 回放。
            </p>
          </template>
        </HttpTraceJsonBlock>

        <div class="field-label">Response Headers</div>
        <pre class="code-block muted">{{ formatJson(detailPayload.responseHeaders) }}</pre>

        <HttpTraceJsonBlock label="Response Body" :model-value="detailPayload.responseBody" />

        <p v-if="detailPayload.note" class="hint">{{ detailPayload.note }}</p>

        <template v-if="isImageGenDetail">
          <div class="detail-image-tail">
            <div class="field-label">提示词</div>
            <div class="text-panel">{{ detailPrompt || '—' }}</div>
            <div class="field-label">生成结果</div>
            <div
              v-if="detailResultImageUrl"
              class="result-img-wrap detail-result-img-wrap detail-result-img-open"
              role="button"
              tabindex="0"
              title="点击查看大图（可缩放拖动）"
              @click="detailImageViewerVisible = true"
              @keydown.enter.prevent="detailImageViewerVisible = true"
            >
              <el-image
                :src="detailResultImageUrl"
                fit="contain"
                class="detail-result-el-image"
                preview-disabled
              />
            </div>
            <div v-else class="text-panel muted">暂无图片 URL（可能仍在生成或失败）</div>
          </div>
        </template>

        <template v-else-if="isVideoGenDetail">
          <div class="detail-image-tail">
            <div class="field-label">提示词</div>
            <div class="text-panel">{{ detailPrompt || '—' }}</div>
            <div class="field-label">生成结果</div>
            <div
              v-if="detailResultImageUrl"
              class="result-img-wrap detail-result-img-wrap"
              style="background: #000; display: flex; align-items: center; justify-content: center; height: auto; max-height: 480px;"
            >
              <video
                :src="detailResultImageUrl"
                controls
                style="max-width: 100%; max-height: 460px; border-radius: 4px;"
              />
            </div>
            <div v-else class="text-panel muted">暂无视频 URL（可能仍在生成或失败）</div>
          </div>
        </template>
      </template>
      <el-alert v-else-if="detailPayload?.error" type="error" :title="String(detailPayload.error)" show-icon :closable="false" />
    </div>
  </el-dialog>

  <ElImageViewer
    v-if="detailImageViewerVisible && detailResultImageUrl"
    :url-list="[detailResultImageUrl]"
    @close="detailImageViewerVisible = false"
  />
</template>

<style scoped>
/* Scoped styles will be extracted or preserved from TaskBoardView.vue */
.detail-body {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 8px;
}
.detail-dialog.admin-dialog :deep(.el-dialog__body) {
  padding-top: 10px;
  padding-bottom: 20px;
}
.desc-grid {
  margin-bottom: 16px;
}
.field-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 16px 0 8px;
}
.code-block {
  margin: 0;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
}
.code-block.muted {
  color: var(--el-text-color-regular);
}
.code-block--shot-trace {
  max-height: 400px;
}
.trace-body-hint {
  font-size: 12px;
  margin: 0 0 8px;
}
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0 0 12px;
  line-height: 1.5;
}
.hit-rank-table {
  margin-bottom: 4px;
}
.hit-expand-row {
  padding: 4px 0 12px;
  text-align: left;
}
.hit-count-badge {
  display: inline-block;
  margin-left: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-radius: 10px;
  padding: 1px 7px;
  vertical-align: middle;
}
.match-url-link {
  color: var(--el-color-primary);
  text-decoration: none;
  font-size: 13px;
  word-break: break-all;
}
.match-url-link:hover {
  text-decoration: underline;
}
.top5-url-list {
  background: #f8f9fa;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 8px 12px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.top5-url-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
}
.top5-rank {
  min-width: 18px;
  font-size: 11px;
  font-weight: 600;
  color: var(--el-color-primary);
  text-align: right;
  flex-shrink: 0;
}
.muted-small {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.text-panel {
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
}
.text-panel.muted {
  color: var(--el-text-color-placeholder);
  background: transparent;
  padding: 0;
}
.detail-image-tail {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px dashed var(--el-border-color-lighter);
}
.detail-image-tail .text-panel {
  margin-bottom: 16px;
}
.detail-result-img-wrap {
  width: 100%;
  height: 240px;
  background: #f0f2f5;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.detail-result-img-open {
  cursor: pointer;
  transition: opacity 0.2s;
}
.detail-result-img-open:hover {
  opacity: 0.9;
}
.detail-result-img-wrap :deep(.el-image) {
  width: 100%;
  height: 100%;
  display: flex;
}
.detail-result-img-wrap :deep(.el-image__inner) {
  object-fit: contain;
}
</style>
