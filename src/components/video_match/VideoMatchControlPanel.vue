<template>
<el-card class="control-panel" shadow="never" :body-style="{ padding: '12px 20px' }">
      <div class="header-controls vm-header-unified">
        <div class="left-controls vm-context-row">
          <h3 class="section-title">视频匹配</h3>
          <div class="vm-inline-group">
            <el-select
              v-model="historyJobId"
              filterable
              clearable
              placeholder="载入已转写任务"
              class="history-job-select"
              size="small"
              @change="onHistoryJobChange"
            >
              <el-option
                v-for="j in historyJobs"
                :key="j.id"
                :label="historyJobLabel(j)"
                :value="j.id"
              />
            </el-select>
            <el-tooltip
              placement="top"
              content="与视频分析索引一致；载入历史任务时会自动切换 workspace"
            >
              <el-select v-model="form.workspace" size="small" class="workspace-select">
                <el-option
                  v-for="ws in workspaceOptions"
                  :key="ws.key"
                  :label="ws.label"
                  :value="ws.key"
                />
              </el-select>
            </el-tooltip>
          </div>
        </div>
        <div class="vm-header-right">
          <div v-if="currentJobId" class="job-status-bar">
            <el-tooltip placement="bottom" :content="'完整任务编号：' + currentJobId">
              <span class="job-ref subtle">匹配 #{{ currentJobId }}</span>
            </el-tooltip>
            <el-tag v-if="parseStatus" size="small" effect="plain" :type="pipelineStatusZh(parseStatus).tag" style="cursor: pointer" @click="copyJobId(currentJobId)">
              口播转写 · {{ pipelineStatusZh(parseStatus).label }}
            </el-tag>
            <el-tag v-if="jobSearchStatus" size="small" effect="plain" :type="pipelineStatusZh(jobSearchStatus).tag" style="cursor: pointer" @click="copyJobId(currentJobId)">
              素材匹配 · {{ pipelineStatusZh(jobSearchStatus).label }}
            </el-tag>
            <el-tag v-if="extractStatus" size="small" effect="plain" :type="pipelineStatusZh(extractStatus).tag" style="cursor: pointer" @click="copyJobId(currentJobId)">
              抽取标签 · {{ pipelineStatusZh(extractStatus).label }}
            </el-tag>
            <el-button size="small" type="primary" plain @click="onExtract" :disabled="!currentJobId || extractStatus === 'running'" :loading="isExtracting">
              一键抽取
            </el-button>
            <el-button size="small" @click="refreshJob">刷新任务</el-button>
          </div>
          <div class="vm-pipeline-actions">
            <div class="vm-action-group">
              <SearchStrategySelect
                :model-value="selectedStrategy ?? ''"
                :strategies="strategies"
                placeholder="选择搜索策略"
                @refresh="loadStrategies"
                @delete="onStrategyDelete"
                @create="openVmStrategyCreateDialog"
                @update:model-value="(v) => selectedStrategy = (v ?? null)"
              />
              <el-button
                circle
                size="small"
                color="#6366f1"
                :disabled="!selectedStrategy"
                title="编辑策略权重（BM25 / 向量 / RRF）"
                @click="openVmStrategyEditDialog"
              >
                <el-icon><Setting /></el-icon>
              </el-button>
              <el-switch
                v-model="enableRoadRunFallback"
                active-text="路跑兜底"
                size="small"
                style="margin-right: 12px"
              />
              <el-button type="success" :disabled="!canMatch || matching" :loading="matching" @click="onMatch">
                匹配
              </el-button>
            </div>
            <div class="vm-action-group vm-compose-inline">
              <span class="mix-srt-toggle" @click.stop>
                <el-switch v-model="mixPreferSrt" size="small" :disabled="composing" />
                <span class="mix-srt-label">外挂 SRT</span>
              </span>
              <el-tooltip
                :disabled="canMixCompose"
                placement="top"
                :content="mixComposeDisabledHint || '提交混剪（后台转码 + 拼轨 + 下发）'"
              >
                <el-button
                  type="primary"
                  plain
                  :disabled="!canMixCompose || composing"
                  :loading="composing"
                  @click="onMixCompose"
                >
                  混剪合成
                </el-button>
              </el-tooltip>
            </div>
          </div>
        </div>
      </div>

      <div class="vm-parse-block" @dragover.prevent @drop.prevent="onDropJson">
        <el-form class="parse-form" label-width="72px" @submit.prevent="onParse">
          <el-form-item label="口播脚本" required>
            <el-input
              v-model="form.script"
              type="textarea"
              :rows="3"
              placeholder="例如：智己LS6... 也可以直接将包含 主题/标题/中段混剪/车型的 JSON 文件拖拽到此处填充表单"
            />
          </el-form-item>
          <div class="vm-extra-fields">
            <div class="form-row-inline">
              <el-form-item label="主题">
                <el-input v-model="form.topic" placeholder="选填" />
              </el-form-item>
              <el-form-item label="标题">
                <el-input v-model="form.title" placeholder="选填" />
              </el-form-item>
              <el-form-item label="车型">
                <el-select
                  v-model="form.car_model"
                  placeholder="请选择车型（影响转写参考词表）"
                  clearable
                  style="width: 100%"
                >
                  <el-option
                    v-for="opt in ZHIJI_CAR_MODEL_OPTIONS"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </el-form-item>
            </div>
            <div class="form-row-inline vm-frame-constraints-row">
              <el-form-item label="画面比例">
                <el-select
                  v-model="form.frame_size"
                  placeholder="选填：与索引 frame_size 一致"
                  clearable
                  class="frame-size-select"
                >
                  <el-option
                    v-for="opt in videoMatchFrameSizeOptions"
                    :key="`fs_${opt.value || 'any'}`"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="横竖屏">
                <el-select
                  v-model="form.frame_orientation"
                  placeholder="选填：仅定横竖屏（不定比例），写入 frame_orientation"
                  clearable
                  class="frame-orientation-select"
                >
                  <el-option
                    v-for="opt in VIDEO_FRAME_ORIENTATION_OPTIONS"
                    :key="`fo_${opt.value || 'any'}`"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </el-form-item>
            </div>
          </div>
          <el-form-item>
            <div class="parse-actions-row">
              <el-button type="primary" :loading="parsing" @click="onParse" :disabled="isFullPipeline">
                {{ parsing ? '转写中...' : '解析 / 转写' }}
              </el-button>
              <el-button type="success" :loading="isFullPipeline" @click="$emit('full-pipeline')" :disabled="parsing">
                {{ isFullPipeline ? '全流程执行中...' : '一键全流程' }}
              </el-button>
              <el-tooltip content="AND 命中模板（转写 MUST / v2 term filter）" placement="bottom">
                <el-button
                  circle
                  size="default"
                  class="template-gear-btn"
                  title="AND 命中模板"
                  @click="tokenJoinDialogVisible = true"
                >
                  <el-icon><Setting /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </el-form-item>
        </el-form>
        <el-alert v-if="parseError" type="error" :closable="false" show-icon class="parse-alert">
          {{ parseError }}
        </el-alert>
      </div>

      <el-alert
        v-if="jobSearchError"
        type="warning"
        :closable="false"
        show-icon
        class="parse-alert vm-search-error-alert"
      >
        {{ jobSearchError }}
      </el-alert>

      <el-alert
        v-if="extractError"
        type="warning"
        :closable="false"
        show-icon
        class="parse-alert vm-search-error-alert"
      >
        {{ extractError }}
      </el-alert>

      <el-alert
        v-if="lastMixCompose"
        class="mix-compose-status"
        :type="
          lastMixCompose.status === 'failed'
            ? 'error'
            : lastMixCompose.status === 'done'
              ? 'success'
              : 'info'
        "
        :closable="true"
        show-icon
        @close="dismissMixComposeAlert"
      >
        <template #title>混剪：{{ lastMixCompose.status }}</template>
        <div class="mix-compose-status-body">
          <div class="mono">
            <span class="lbl">compose</span> {{ lastMixCompose.compose_id }}
          </div>
          <div class="mono">
            <span class="lbl">biz</span> {{ lastMixCompose.biz_id }}
          </div>
          <div v-if="lastMixCompose.result_obs_url" class="result-link">
            <template v-if="mixComposeResultHref(lastMixCompose.result_obs_url)">
              <a
                :href="mixComposeResultHref(lastMixCompose.result_obs_url)!"
                target="_blank"
                rel="noopener noreferrer"
                >成品 URL</a
              >
            </template>
            <template v-else>
              <div class="mix-result-path">
                <div class="muted small">以下为 OBS 对象键（不是浏览器直链）；用于 Worker/CDN 拼接</div>
                <div class="mono path-text">{{ lastMixCompose.result_obs_url }}</div>
                <el-button
                  size="small"
                  link
                  type="primary"
                  @click="copyMixOutputPath(lastMixCompose.result_obs_url!)"
                >
                  复制路径
                </el-button>
              </div>
            </template>
          </div>
          <div v-if="lastMixCompose.prefer_srt" class="mix-srt-block">
            <template v-if="(lastMixCompose.result_srt_text || '').trim()">
              <div class="muted small">外挂字幕（与口播时间轴对齐）</div>
              <el-button
                size="small"
                link
                type="primary"
                @click="copyMixOutputPath(lastMixCompose.result_srt_text!)"
              >
                复制 SRT
              </el-button>
              <el-button
                size="small"
                link
                type="primary"
                @click="downloadMixSrtFile(lastMixCompose.result_srt_text!, lastMixCompose.compose_id)"
              >
                下载 .srt
              </el-button>
            </template>
            <div v-else-if="lastMixCompose.status === 'done'" class="muted small">
              未返回 SRT 文本（可查看服务端日志）
            </div>
          </div>
          <div v-if="lastMixCompose.error_message" class="mix-err">{{ lastMixCompose.error_message }}</div>
        </div>
      </el-alert>
    </el-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Headset, Microphone, RefreshRight, Setting, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { ZHIJI_CAR_MODEL_OPTIONS, VIDEO_FRAME_SIZE_OPTIONS, VIDEO_FRAME_ORIENTATION_OPTIONS, videoFrameSizeOptionsForOrientation, normalizeZhijiCarSelectValue } from '@/constants/zhijiCarModels'
import SearchStrategySelect from '@/components/video_analysis/SearchStrategySelect.vue'

const props = defineProps<{
  form: any,
  workspaceOptions: any,
  videoMatchFrameSizeOptions: any,
  parsing: boolean,
  parseStatus?: string | null,
  parseError?: string | null,
  matching: boolean,
  composing: boolean,
  isExtracting: boolean,
  isFullPipeline: boolean,
  extractStatus?: string | null,
  extractError?: string | null,
  hasShots: boolean,
  canMatch: boolean,
  canMixCompose: boolean,
  mixComposeDisabledHint: string,
  historyJobs: any,
  historyJobLabel: any,
  lastMixCompose: any,
  currentJobId?: string | number | null,
  jobSearchStatus?: string | null,
  jobSearchError?: string | null,
  mixComposeResultHref: any,
  strategies: any,
  pipelineStatusZh: (status: any) => { label: string, tag: string }
}>()

const tokenJoinDialogVisible = defineModel<boolean>('tokenJoinDialogVisible')
const historyJobId = defineModel<string | null>('historyJobId')
const selectedStrategy = defineModel<string | null>('selectedStrategy')
const mixPreferSrt = defineModel<boolean>('mixPreferSrt')
const enableRoadRunFallback = defineModel<boolean>('enableRoadRunFallback')

const copyJobId = async (id: string | number | null | undefined) => {
  if (!id) return
  try {
    await navigator.clipboard.writeText(String(id))
    ElMessage.success(`已复制任务看板ID=${id}`)
  } catch (e) {
    ElMessage.error('复制失败')
  }
}

const emit = defineEmits([
  'parse', 'match', 'extract', 'full-pipeline', 'mix-compose', 'history-change', 'strategy-delete',
  'open-strategy-create', 'open-strategy-edit', 'refreshJob', 'loadStrategies',
  'copyMixOutputPath', 'downloadMixSrtFile'
])

function onHistoryJobChange(v: any) { emit('history-change', v) }
function dismissMixComposeAlert() { historyJobId.value = null }
function onStrategyDelete(name: any) { emit('strategy-delete', name) }
function onParse() { emit('parse') }
function onExtract() { emit('extract') }
function onMatch() { emit('match') }
function onMixCompose() { emit('mix-compose') }
function refreshJob() { emit('refreshJob') }
function loadStrategies() { emit('loadStrategies') }
function openVmStrategyCreateDialog() { emit('open-strategy-create') }
function openVmStrategyEditDialog() { emit('open-strategy-edit') }
function copyMixOutputPath(path: string) { emit('copyMixOutputPath', path) }
function downloadMixSrtFile(path: string, id: string) { emit('downloadMixSrtFile', path, id) }
function shortJobIdForDisplay(id: string | number) {
  if (!id) return ''
  const t = String(id)
  return t.length > 8 ? t.substring(0, 8) : t
}

async function onDropJson(event: DragEvent) {
  const file = event.dataTransfer?.files[0]
  if (!file || !file.name.endsWith('.json')) {
    ElMessage.warning('请拖拽有效的 JSON 文件')
    return
  }
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    
    if (data.topic || data['主题']) props.form.topic = data.topic || data['主题'] || ''
    if (data.title || data['标题']) props.form.title = data.title || data['标题'] || ''
    const script = data.script || data.mid_mix || data['中段混剪'] || ''
    if (script) props.form.script = script
    
    const carModelRaw = data.car_model || data['车型'] || ''
    if (carModelRaw) {
      const norm = normalizeZhijiCarSelectValue(carModelRaw)
      if (norm) {
        props.form.car_model = norm
      } else {
        // Fallback default
        props.form.car_model = 'LS6'
      }
    } else {
      props.form.car_model = 'LS6'
    }

    ElMessage.success('已自动填充 JSON 字段')
  } catch (e: any) {
    ElMessage.error('解析 JSON 文件失败: ' + e.message)
  }
}
</script><style scoped>
.control-panel {
  border-radius: 8px;
  border: 1px solid #ebeef5;
  flex-shrink: 0;
}
.header-controls {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
}
.vm-header-unified {
  padding-bottom: 10px;
}
.left-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.vm-context-row {
  align-items: center;
}
.vm-inline-group {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
}
.vm-header-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-width: 100%;
}
.vm-pipeline-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}
.vm-action-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.vm-compose-inline {
  padding-left: 8px;
  border-left: 1px solid var(--el-border-color-lighter);
}
.vm-parse-block {
  margin-top: 12px;
}
.parse-actions-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.vm-search-error-alert {
  margin-top: 10px;
}
.job-status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.vm-group-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.vm-extra-fields {
  margin-bottom: 4px;
}
.template-gear-btn .el-icon {
  font-size: 20px;
}
.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0;
  padding-left: 8px;
  border-left: 4px solid #409eff;
}
.workspace-select {
  width: 180px;
}
.history-job-select {
  min-width: 260px;
  max-width: 360px;
}
.strategy-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mix-result-path {
  margin-top: 6px;
}
.mix-result-path .path-text {
  margin: 4px 0;
  word-break: break-all;
  font-size: 12px;
}
.mix-result-path .small {
  font-size: 12px;
}
.inline-btn-wrap {
  display: inline-flex;
}
.mix-compose-actions {
  align-items: center;
  gap: 8px;
}
.mix-srt-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 4px;
}
.mix-srt-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.mix-srt-block {
  margin-top: 8px;
}
.mix-compose-status {
  margin-top: 12px;
  max-width: none;
}
.mix-compose-status-body {
  font-size: 13px;
  line-height: 1.5;
}
.mix-compose-status-body .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}
.mix-compose-status-body .lbl {
  color: #909399;
  margin-right: 6px;
}
.mix-compose-status-body .result-link {
  margin-top: 6px;
}
.mix-compose-status-body .mix-err {
  color: #f56c6c;
  margin-top: 6px;
}
.right-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.job-status-bar .job-ref {
  font-size: 13px;
  color: #606266;
  cursor: default;
  margin-right: 4px;
}
.parse-form {
  margin-top: 0;
  max-width: 960px;
}
.form-row-inline {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px 16px;
}
.vm-frame-constraints-row {
  grid-template-columns: 1fr 1fr;
}
@media (max-width: 900px) {
  .form-row-inline {
    grid-template-columns: 1fr;
  }
}
.parse-alert {
  margin-top: 8px;
}
.muted {
  color: #9ca3af;
  font-size: 12px;
}
.subtle {
  color: #9ca3af;
  font-size: 12px;
}
</style>
