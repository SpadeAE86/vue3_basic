<script setup lang="ts">
import { shotStatusLabel, shotSearchStatusNorm, shotStatusTagType, shotTop1VideoUrl, top1UrlDisplay, shotMatchFailedVm, canJumpVideoAnalysisFromVmShot } from '@/utils/videoMatchHelpers'
import { Headset, Microphone, Position, RefreshRight, VideoPlay } from '@element-plus/icons-vue'

const props = defineProps<{
  shots: any[]
  synthBusyByShotId: Record<string, boolean>
  waveHeights: number[]
  playingRowKey: string | null
  audioProgressPct: number
  vmShotRematchingId: string | null

  rowIsActivelyPlaying: (row: any) => boolean
  rowAudioKey: (row: any) => string

  rowClassName: () => string
}>()

const emit = defineEmits<{
  (e: 'togglePlayObs', row: any): void
  (e: 'onSynthesizeAudio', row: any): void
  (e: 'openShotTranscribe', row: any): void
  (e: 'openMatchDetail', row: any): void
  (e: 'rematchVmShot', row: any): void
  (e: 'goVideoAnalysisFromVmShot', row: any): void
}>()
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
        <el-table-column prop="segment_text" label="鍙ｆ挱鏂囨" min-width="200" show-overflow-tooltip />
        <el-table-column label="鍖归厤鐘舵€? width="96" align="center">
          <template #default="{ row }">
            <el-tag
              :type="shotStatusTagType(shotSearchStatusNorm(row))"
              effect="light"
              size="small"
              class="status-pill status-tag-admin"
            >
              {{ shotStatusLabel(shotSearchStatusNorm(row)) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="duration_sec" label="鏃堕暱(s)" width="88" />
        <el-table-column label="鍙ｆ挱闊抽 (OBS)" min-width="220">
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
                  @click="emit('onSynthesizeAudio', row)"
                >
                  <el-icon class="btn-inline-icon"><Microphone /></el-icon>
                  鐢熸垚鏈楄
                </el-button>
                <el-tooltip
                  v-if="(row.obs_audio_url || '').trim() && row.id != null"
                  content="閲嶆柊鐢熸垚鏈楄"
                  placement="top"
                >
                  <el-button
                    size="small"
                    circle
                    type="info"
                    :loading="row.id != null && !!synthBusyByShotId[row.id]"
                    @click="emit('onSynthesizeAudio', row)"
                  >
                    <el-icon><RefreshRight /></el-icon>
                  </el-button>
                </el-tooltip>
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
        <el-table-column prop="description" label="鐢婚潰鎻忚堪" min-width="160" show-overflow-tooltip />
        <el-table-column width="96" align="right">
          <template #header>
            <el-tooltip content="鏈垎闀滄绱㈤摼璺€楁椂锛堟绉掞紝鍚帓闃燂級" placement="top">
              <span>鑰楁椂</span>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <span v-if="row.match_elapsed_ms != null">{{ Number(row.match_elapsed_ms).toFixed(0) }}</span>
            <span v-else class="muted">鈥?/span>
          </template>
        </el-table-column>
        <el-table-column label="Top1 瑙嗛" min-width="160">
          <template #default="{ row }">
            <div v-if="shotTop1VideoUrl(row)" class="match-topn-cell">
              <a
                class="match-url-link"
                :href="shotTop1VideoUrl(row)"
                target="_blank"
                rel="noopener noreferrer"
                :title="shotTop1VideoUrl(row)"
                >{{ top1UrlDisplay(shotTop1VideoUrl(row)) }}</a
              >
              <div v-if="row.match_hit_count != null" class="muted-small match-hit-meta">
                鍛戒腑 {{ row.match_hit_count }} 鏉?              </div>
            </div>
            <span v-else class="muted">鈥?/span>
          </template>
        </el-table-column>
        <el-table-column label="杞啓鎿嶄綔" width="108" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link :disabled="row.id == null" @click="emit('openShotTranscribe', row)">
              鏌ョ湅杞啓
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="鍖归厤鎿嶄綔" width="248" fixed="right" align="center">
          <template #default="{ row }">
            <div class="shot-op-cell">
              <el-button type="primary" link :disabled="row.id == null" @click="emit('openMatchDetail', row)">
                鏌ョ湅鍖归厤
              </el-button>
              <el-button
                v-if="shotMatchFailedVm(row)"
                type="primary"
                link
                :disabled="row.id == null"
                :loading="vmShotRematchingId === row.id"
                @click="emit('rematchVmShot', row)"
              >
                閲嶈瘯
              </el-button>
              <el-tooltip content="鐢ㄦ湰鍒嗛暅鏍囩涓庡綋鏃跺尮閰嶇瓥鐣ユ墦寮€瑙嗛鍒嗘瀽锛屽苟鑷姩鍏ㄥ簱鎼滅储" placement="top">
                <el-button
                  class="va-jump-icon-btn"
                  :icon="Position"
                  circle
                  size="small"
                  :disabled="!canJumpVideoAnalysisFromVmShot(row)"
                  aria-label="璺宠浆瑙嗛鍒嗘瀽"
                  @click="emit('goVideoAnalysisFromVmShot', row)"
                />
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>
</div>
</template>
