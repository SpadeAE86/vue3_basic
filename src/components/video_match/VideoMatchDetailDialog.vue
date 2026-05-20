<template>
<el-dialog
      :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)"
      title="分镜 · 匹配 HTTP 详情与 Top 命中"
      width="min(1080px, 96vw)"
      top="5vh"
      class="match-detail-dialog admin-dialog"
      align-center
      destroy-on-close
    >
      <div v-loading="loading" class="match-detail-body">
        <div class="field-label">结构化标签（与视频分析搜索条语义一致）</div>
        <TokenChipsReadonly :tokens="tokens" :max-preview-chars="36" />

        <el-alert
          v-if="localOnly"
          type="info"
          :closable="false"
          show-icon
          class="match-detail-alert"
          title="当前为未落库分镜或暂无 HTTP 记录：仅展示标签。解析落库并执行「素材匹配」后，可查看 OpenSearch 请求与响应摘要。"
        />

        <template v-else-if="payload && payload.error">
          <el-alert type="error" :title="String(payload.error)" show-icon :closable="false" />
        </template>

        <template v-else-if="payload && !payload.error">
          <el-descriptions :column="2" border size="small" class="desc-grid">
            <el-descriptions-item label="分镜">{{
              row ? `#${row.shot_order}` : '—'
            }}</el-descriptions-item>
            <el-descriptions-item v-if="payload.requestRid" label="请求记录 rid">{{
              payload.requestRid
            }}</el-descriptions-item>
            <el-descriptions-item v-if="payload.upstreamTaskId" label="上游任务">{{
              payload.upstreamTaskId
            }}</el-descriptions-item>
            <el-descriptions-item label="服务">{{ payload.serviceName ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="方法">{{ payload.methodName ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="HTTP">{{ payload.httpMethod ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="业务类型">{{ payload.businessType ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="状态码">{{ payload.statusCode ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="耗时">{{
              payload.durationMs != null ? `${payload.durationMs} ms` : '—'
            }}</el-descriptions-item>
            <el-descriptions-item label="业务状态">
              <el-tag
                v-if="payload.businessSuccess != null"
                :type="payload.businessSuccess ? 'success' : 'danger'"
                effect="light"
                size="small"
                class="status-tag-admin"
              >
                {{ payload.businessStatusLabel ?? '—' }}
              </el-tag>
              <span v-else>—</span>
            </el-descriptions-item>
            <el-descriptions-item label="错误信息">{{
              (payload.errorMessage as string) || '—'
            }}</el-descriptions-item>
            <el-descriptions-item v-if="payload.httpTraceCreatedAt" label="HTTP 记录创建">{{
              payload.httpTraceCreatedAt
            }}</el-descriptions-item>
            <el-descriptions-item v-if="payload.httpTraceUpdatedAt" label="HTTP 记录更新">{{
              payload.httpTraceUpdatedAt
            }}</el-descriptions-item>
          </el-descriptions>

          <div class="field-label">Request URL</div>
          <pre class="code-block">{{ payload.requestUrl ?? '—' }}</pre>

          <div class="field-label">Request Headers</div>
          <pre class="code-block muted">{{ formatMatchDetailJson(payload.requestHeaders) }}</pre>

          <div class="field-label">Request Body</div>
          <p class="hint trace-body-hint">
            以下内容仅作审计对照：检索请求里的<strong>长向量</strong>入库前会替换为
            <code>_omitted: numeric_vector</code>
            占位；若整体仍超长则会再出现
            <code>_truncated</code>
            。<strong>重试匹配</strong>由服务端根据当前分镜的
            <code>tags_json</code>
            重新调用检索逻辑，<strong>不会</strong>也不应依赖本条 Request Body 回放。
          </p>
          <pre class="code-block code-block--shot-trace">{{ formatMatchDetailJson(payload.requestBody) }}</pre>

          <div class="field-label">Response Headers</div>
          <pre class="code-block muted">{{ formatMatchDetailJson(payload.responseHeaders) }}</pre>

          <div class="field-label">Response Body</div>
          <pre class="code-block">{{ formatMatchDetailJson(payload.responseBody) }}</pre>

          <div class="field-label">Top5 命中（OpenSearch _score）</div>
          <p v-if="!hitRows.length" class="hint">
            暂无命中记录（尚未匹配或 trace 未落库时可仍可从上方 Response 查看摘要）
          </p>
          <el-table
            v-else
            :data="hitRows"
            border
            stripe
            size="small"
            class="hit-rank-table"
            max-height="280"
          >
            <el-table-column prop="rank" label="#" width="44" align="center" />
            <el-table-column prop="score" label="_score" width="96" align="right">
              <template #default="{ row: hr }">
                {{ Number.isFinite(hr.score) ? hr.score.toFixed(4) : hr.score }}
              </template>
            </el-table-column>
            <el-table-column prop="history_id" label="history_id" min-width="110" show-overflow-tooltip />
            <el-table-column label="video_url" min-width="200" show-overflow-tooltip>
              <template #default="{ row: hr }">
                <a
                  v-if="hr.video_path"
                  class="match-url-link"
                  :href="hr.video_path"
                  target="_blank"
                  rel="noopener noreferrer"
                  >{{ hr.video_path }}</a
                >
                <span v-else class="muted-small">—</span>
              </template>
            </el-table-column>
          </el-table>
          <p v-if="hitRows.some((r: any) => !r.video_path)" class="hint">
            表格中
            <code>video_url</code>
            为「—」表示服务端未解析到成片地址：该
            <code>history_id</code>
            在
            <code>video_analysis_history</code>
            无记录、或
            <code>video_url</code>
            为空且 v2 分镜里也暂无
            <code>obs_video_url</code>
            ，与界面截断无关。可直接点
            <code>history_id</code>
            同一行的其它列或到视频分析里核对该条历史。
          </p>

          <p v-if="payload.note" class="hint">{{ payload.note }}</p>
        </template>
      </div>
    </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  modelValue: boolean,
  loading: boolean,
  payload: any,
  row: any,
  hitRows: any,
  formatMatchDetailJson: (v: any) => string
}>()
const emit = defineEmits(['update:modelValue'])
</script>