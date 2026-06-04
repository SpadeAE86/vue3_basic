<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { shotStatusLabel, shotExtractStatusLabel, shotSearchStatusNorm, shotExtractStatusNorm, shotStatusTagType, shotTop1VideoUrl, top1UrlDisplay, shotMatchFailedVm, canJumpVideoAnalysisFromVmShot, shotRankedVideoUrls } from '@/utils/videoMatchHelpers'
import { Headset, Microphone, Position, RefreshRight, VideoPlay, Document, View, Search, DocumentCopy, Loading, MoreFilled, Refresh } from '@element-plus/icons-vue'

const props = defineProps<{
  shots: any[]
  synthBusyByShotId: Record<string, boolean>
  waveHeights: number[]
  playingRowKey: string | null
  audioProgressPct: number
  vmShotRematchingId: string | number | null

  rowIsActivelyPlaying: (row: any) => boolean
  rowAudioKey: (row: any) => string

  rowClassName: string
  currentJobId?: string | null
}>()


async function copyTop1Url(url: string | null) {
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success('已复制链接')
  } catch (e) {
    ElMessage.error('复制失败')
  }
}
async function copyExtractId(row: any) {
  if (!row.id) return
  try {
    await navigator.clipboard.writeText(String(row.id))
    ElMessage.success(`已复制分镜/抽取ID=${row.id}`)
  } catch (e) {
    ElMessage.error('复制失败')
  }
}

async function copyMatchId(row: any) {
  if (!row.match_id) {
    ElMessage.warning('该分镜尚无匹配记录ID')
    return
  }
  try {
    await navigator.clipboard.writeText(String(row.match_id))
    ElMessage.success(`已复制匹配看板ID=${row.match_id}`)
  } catch (e) {
    ElMessage.error('复制失败')
  }
}

const emit = defineEmits<{
  (e: 'togglePlayObs', row: any): void
  (e: 'synthesizeAudio', row: any): void
  (e: 'openShotTranscribe', row: any): void
  (e: 'openMatchDetail', row: any): void
  (e: 'rematchVmShot', row: any): void
  (e: 'extractSingleShot', row: any): void
  (e: 'goVideoAnalysisFromVmShot', row: any): void
  (e: 'updateShotTop1', row: any, url: string): void
}>()

function handleMoreCmd(cmd: string, row: any) {
  if (cmd === 'detail') emit('openMatchDetail', row)
  else if (cmd === 'rematch') emit('rematchVmShot', row)
  else if (cmd === 'extract') emit('extractSingleShot', row)
}

function handleTop1Change(row: any, url: string) {
  if (url === 'COPY_LINK') {
    copyTop1Url(shotTop1VideoUrl(row))
    return
  }
  emit('updateShotTop1', row, url)
}
</script>

<template>
<div v-if="shots && shots.length > 0" class="results-area">
<el-table
        :data="shots"
        stripe
        border
        size="small"
        style="width: 100%"
        :row-class-name="rowClassName"
      >
        <el-table-column prop="shot_order" label="#" width="56" />
        <el-table-column prop="segment_text" label="口播文案" min-width="260" show-overflow-tooltip />
        <el-table-column label="提取状态" width="104" align="center">
          <template #default="{ row }">
            <div class="status-cell">
              <button
                class="status-tag-btn"
                :class="{ 'is-clickable': shotExtractStatusNorm(row) === 'success' }"
                :title="shotExtractStatusNorm(row) === 'success' ? '点击复制抽取ID' : undefined"
                @click="shotExtractStatusNorm(row) === 'success' ? copyExtractId(row) : undefined"
              >
                <el-tag
                  :type="shotStatusTagType(shotExtractStatusNorm(row))"
                  effect="light"
                  size="small"
                  class="status-pill"
                  style="pointer-events: none;"
                >
                  <span>{{ shotExtractStatusLabel(shotExtractStatusNorm(row)) }}</span>
                </el-tag>
              </button>
              <el-icon v-if="shotExtractStatusNorm(row) === 'running'" class="status-spin"><Loading /></el-icon>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="匹配状态" width="104" align="center">
          <template #default="{ row }">
            <div class="status-cell">
              <button
                class="status-tag-btn"
                :class="{ 'is-clickable': shotSearchStatusNorm(row) === 'success' }"
                :title="shotSearchStatusNorm(row) === 'success' ? '点击复制匹配ID' : undefined"
                @click="shotSearchStatusNorm(row) === 'success' ? copyMatchId(row) : undefined"
              >
                <el-tag
                  :type="shotStatusTagType(shotSearchStatusNorm(row))"
                  effect="light"
                  size="small"
                  class="status-pill"
                  style="pointer-events: none;"
                >
                  <span>{{ shotStatusLabel(shotSearchStatusNorm(row)) }}</span>
                </el-tag>
              </button>
              <el-icon v-if="shotSearchStatusNorm(row) === 'running'" class="status-spin"><Loading /></el-icon>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="音频" min-width="120">
          <template #default="{ row }">
            <div class="audio-cell">
              <div class="audio-actions">
                <template v-if="(row.obs_audio_url || '').trim()">
                  <el-button
                    size="small"
                    circle
                    :type="rowIsActivelyPlaying(row) ? 'warning' : 'primary'"
                    @click="emit('togglePlayObs', row)"
                  >
                    <el-icon class="audio-btn-icon" :class="{ 'icon-pulse': rowIsActivelyPlaying(row) }">
                      <Headset v-if="rowIsActivelyPlaying(row)" />
                      <VideoPlay v-else />
                    </el-icon>
                  </el-button>
                </template>
                <el-button
                  v-if="!(row.obs_audio_url || '').trim()"
                  size="small"
                  :disabled="row.id == null"
                  :loading="row.id != null && !!synthBusyByShotId[row.id]"
                  @click="emit('synthesizeAudio', row)"
                >
                  <el-icon class="btn-inline-icon"><Microphone /></el-icon>
                  生成朗读
                </el-button>
              </div>
              <div v-if="(row.obs_audio_url || '').trim()" class="wave-block">
                <div class="wave-bars" aria-hidden="true">
                  <span
                    v-for="(h, wi) in waveHeights"
                    :key="wi"
                    class="wave-bar"
                    :class="{
                      'wave-bar--hot':
                        playingRowKey === rowAudioKey(row) &&
                        (wi + 1) / waveHeights.length <= audioProgressPct / 100,
                    }"
                    :style="{ height: Math.max(3, h) + 'px' }"
                  />
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="128" fixed="right" align="center">
          <template #default="{ row }">
            <div class="shot-op-cell">
              <el-tooltip content="查看 / 编辑提取标签" placement="top">
                <el-button type="primary" link :disabled="row.id == null" @click="emit('openShotTranscribe', row)">
                  <el-icon size="16"><Document /></el-icon>
                </el-button>
              </el-tooltip>

              <el-tooltip content="用本分镜标签打开视频分析，并全库搜索" placement="top">
                <el-button type="primary" link :disabled="!canJumpVideoAnalysisFromVmShot(row)" @click="emit('goVideoAnalysisFromVmShot', row)">
                  <el-icon size="16"><Position /></el-icon>
                </el-button>
              </el-tooltip>

              <!-- 更多操作下拉 -->
              <el-dropdown trigger="click" size="small" placement="top" @command="(cmd: string) => handleMoreCmd(cmd, row)">
                <el-button type="primary" link>
                  <el-icon size="16"><MoreFilled /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="detail" :disabled="row.id == null">
                      <div class="drop-item">
                        <el-icon><View /></el-icon><span>查看匹配结果</span>
                      </div>
                    </el-dropdown-item>
                    <el-dropdown-item command="extract" :disabled="row.id == null">
                      <div class="drop-item">
                        <el-icon><Refresh /></el-icon><span>重新抽取标签</span>
                      </div>
                    </el-dropdown-item>
                    <el-dropdown-item command="rematch" :disabled="row.id == null">
                      <div class="drop-item">
                        <el-icon><RefreshRight /></el-icon><span>重新匹配素材</span>
                      </div>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="duration_sec" label="时长(s)" width="88" />

        <el-table-column prop="description" label="画面描述" min-width="160" show-overflow-tooltip />
        <el-table-column width="96" align="right">
          <template #header>
            <el-tooltip content="本分镜检索链路耗时（毫秒，含排队）" placement="top">
              <span>耗时</span>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <span v-if="row.match_elapsed_ms != null">{{ Number(row.match_elapsed_ms).toFixed(0) }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="Top1 视频" min-width="160">
          <template #default="{ row }">
            <div v-if="shotTop1VideoUrl(row)" class="match-topn-cell">
                <div style="display: flex; align-items: center; gap: 4px;">
                  <a
                    class="match-url-link"
                    :href="shotTop1VideoUrl(row) ?? undefined"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="shotTop1VideoUrl(row) ?? undefined"
                    >{{ top1UrlDisplay(shotTop1VideoUrl(row) ?? null) }}</a
                  >
                  <!-- Replace copy button with dropdown to switch top5 videos -->
                  <el-dropdown trigger="click" size="small" @command="(url: string) => handleTop1Change(row, url)">
                    <el-button type="info" link title="切换视频/复制链接">
                      <el-icon><Refresh /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item
                          v-for="(url, idx) in shotRankedVideoUrls(row)"
                          :key="idx"
                          :command="url"
                          :disabled="url === shotTop1VideoUrl(row)"
                        >
                          <span :style="{ fontWeight: url === shotTop1VideoUrl(row) ? 'bold' : 'normal', color: url === shotTop1VideoUrl(row) ? '#409eff' : 'inherit' }">
                            Top {{ idx + 1 }}: {{ top1UrlDisplay(url) }}
                          </span>
                        </el-dropdown-item>
                        <el-dropdown-item divided command="COPY_LINK">
                          <span style="display: flex; align-items: center; gap: 4px;">
                            <el-icon><DocumentCopy /></el-icon> 复制当前视频链接
                          </span>
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              <div v-if="row.match_hit_count != null" class="muted-small match-hit-meta">
                命中 {{ row.match_hit_count }} 条              </div>
            </div>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>

      </el-table>
</div>
</template>
<style scoped>
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
.match-url-link {
  color: var(--el-color-primary);
  word-break: break-all;
}
.match-url-link:hover {
  text-decoration: underline;
}
.match-topn-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}
.match-hit-meta {
  margin-top: 2px;
}
.shot-op-cell {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px 6px;
}
.va-jump-icon-btn {
  flex-shrink: 0;
}
.sr-audio {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.audio-cell {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  min-width: 0;
}
.status-pill {
  border: none;
  flex-shrink: 0;
}
/* 状态 tag 的 wrapper button — 重置浏览器默认 button 样式 */
.status-tag-btn {
  all: unset;
  display: inline-flex;
  cursor: default;
}
.status-tag-btn.is-clickable {
  cursor: pointer;
}
.status-tag-btn.is-clickable:hover .el-tag {
  opacity: 0.8;
}
/* 下拉菜单项：图标 + 文字对齐 */
.drop-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-cell {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-content: center;
}
.status-spin {
  animation: spin-icon 1s linear infinite;
  color: #e6a23c;
  font-size: 13px;
  flex-shrink: 0;
}
@keyframes spin-icon {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.audio-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.audio-btn-icon {
  font-size: 18px;
}
.btn-inline-icon {
  margin-right: 4px;
  vertical-align: middle;
}
.icon-pulse {
  animation: audio-pulse 0.9s ease-in-out infinite;
}
@keyframes audio-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.12);
    opacity: 0.85;
  }
}
.wave-block {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  flex-shrink: 0;
}
.wave-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 22px;
  padding: 0 2px;
}
.wave-bar {
  width: 3px;
  min-height: 3px;
  border-radius: 1px;
  background: #e4e7ed;
  transition: background 0.15s ease;
}
.wave-bar--hot {
  background: linear-gradient(180deg, #f89898 0%, #f56c6c 100%);
}
:deep(.video-match-table-row .cell) {
  padding-top: 14px;
  padding-bottom: 14px;
  line-height: 1.55;
}
.muted-small {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}
.muted {
  color: #9ca3af;
  font-size: 12px;
}
.shot-op-cell {
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  width: 100%;
}
</style>
