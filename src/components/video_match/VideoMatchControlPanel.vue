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
              <span class="job-ref subtle">任务 {{ shortJobIdForDisplay(currentJobId) }}</span>
            </el-tooltip>
            <el-tag v-if="parseStatus" size="small" effect="plain" :type="pipelineStatusZh(parseStatus).tag">
              口播转写 · {{ pipelineStatusZh(parseStatus).label }}
            </el-tag>
            <el-tag v-if="jobSearchStatus" size="small" effect="plain" :type="pipelineStatusZh(jobSearchStatus).tag">
              素材匹配 · {{ pipelineStatusZh(jobSearchStatus).label }}
            </el-tag>
            <el-button size="small" @click="refreshJob">刷新任务</el-button>
          </div>
          <div class="vm-pipeline-actions">
            <div class="vm-action-group">
              <SearchStrategySelect
                v-model="selectedStrategy"
                :strategies="strategies"
                placeholder="选择搜索策略"
                @refresh="loadStrategies"
                @delete="onStrategyDelete"
                @create="openVmStrategyCreateDialog"
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

      <div class="vm-parse-block">
        <el-form class="parse-form" label-width="72px" @submit.prevent="onParse">
          <el-form-item label="口播脚本" required>
            <el-input
              v-model="form.script"
              type="textarea"
              :rows="3"
              placeholder="例如：智己LS6，城市道路，展示一键泊车功能..."
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
              <el-button type="primary" :loading="parsing" @click="onParse">
                {{ parsing ? '转写中...' : '解析 / 转写' }}
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
import { ZHIJI_CAR_MODEL_OPTIONS, VIDEO_FRAME_SIZE_OPTIONS, VIDEO_FRAME_ORIENTATION_OPTIONS, videoFrameSizeOptionsForOrientation, normalizeZhijiCarSelectValue } from '@/constants/zhijiCarModels'
import SearchStrategySelect from '@/components/video_analysis/SearchStrategySelect.vue'

const props = defineProps<{
  form: any,
  workspaceOptions: any,
  videoMatchFrameSizeOptions: any,
  parsing: boolean,
  matching: boolean,
  composing: boolean,
  hasShots: boolean,
  canMatch: boolean,
  canMixCompose: boolean,
  mixComposeDisabledHint: string,
  historyJobs: any,
  historyJobId: any,
  historyJobLabel: any,
  lastMixCompose: any,
  jobSearchError: any,
  mixComposeResultHref: any,
  copyMixOutputPath: any,
  downloadMixSrtFile: any,
  strategies: any,
  selectedStrategy: any,
  pipelineStatusZh: string
}>()

const emit = defineEmits(['parse', 'match', 'mix-compose', 'update:historyJobId', 'update:selectedStrategy', 'history-change', 'strategy-delete', 'open-strategy-create', 'open-strategy-edit'])

function onHistoryJobChange(v: any) { emit('history-change', v) }
function dismissMixComposeAlert() { emit('update:historyJobId', null) }
function onStrategyDelete(name: any) { emit('strategy-delete', name) }
</script>