<script setup lang="ts">
import FrameStrip from './FrameStrip.vue'
import TagPills from './TagPills.vue'
import type { UiShotCard } from '@/types/videoAnalysis'

// ─── Props / Emits ────────────────────────────────────────────────────────────
const props = defineProps<{
  shots: UiShotCard[]
  activeFrameIndex: Record<string, number>
}>()

const emit = defineEmits<{
  (e: 'select-shot', shot: UiShotCard): void
  (e: 'frame-select', id: string, idx: number): void
  (e: 'reindex', ev: MouseEvent, shot: UiShotCard): void
}>()

// ─── Core field chips (v2 schema) ─────────────────────────────────────────────
type CoreFieldDef = { key: string; label: string; bg: string; color: string }
const CORE_FIELDS: CoreFieldDef[] = [
  { key: 'footage_type',         label: '素材', bg: '#fef3c7', color: '#b45309' },
  { key: 'shot_type',            label: '景别', bg: '#dbeafe', color: '#1d4ed8' },
  { key: 'shot_style',           label: '风格', bg: '#dcfce7', color: '#15803d' },
  { key: 'camera_movement',      label: '运镜', bg: '#fce7f3', color: '#be185d' },
  { key: 'product_status_scene', label: '状态', bg: '#ede9fe', color: '#6d28d9' },
  { key: 'scene_location',       label: '场景', bg: '#d1fae5', color: '#065f46' },
  { key: 'topic',                label: '话题', bg: '#fee2e2', color: '#b91c1c' },
  { key: 'has_presenter',        label: '出镜', bg: '#e0f2fe', color: '#0369a1' },
]

function getVisibleCoreFields(shot: UiShotCard) {
  const hasScores = !!(shot.visual_quality as number[] | null)?.some((s) => s > 0)
  const limit = hasScores ? 6 : 8
  const result: Array<CoreFieldDef & { value: string }> = []
  for (const f of CORE_FIELDS) {
    if (result.length >= limit) break
    const v = shot[f.key]
    let value: string | null = null
    if (typeof v === 'boolean') value = v ? '有' : '无'
    else if (Array.isArray(v) && v.length) {
      const s = String(v[0] || '')
      if (s && s !== '未知') value = s
    } else if (typeof v === 'string' && v && v !== '未知') value = v
    if (value) result.push({ ...f, value })
  }
  return result
}

// ─── Tag groups (workspace-agnostic) ─────────────────────────────────────────
const TAG_GROUPS = [
  { label: '关键词', keys: ['key_words', 'search_tags'],                              type: 'primary', effect: 'plain' },
  { label: '营销',   keys: ['marketing_phrases', 'marketing_tags'],                   type: 'danger',  effect: 'plain' },
  { label: '实体',   keys: ['object'],                                                type: 'info',    effect: 'light' },
  { label: '特征',   keys: ['design_adjectives', 'function_adjectives', 'adjective'], type: 'success', effect: 'plain' },
  { label: '受众',   keys: ['appealing_audience'],                                    type: 'warning', effect: 'light' },
  { label: '卖点',   keys: ['design_selling_points', 'function_selling_points'],      type: 'primary', effect: 'light' },
] as const

const TAG_PREVIEW_COUNT = 3

function getTagGroup(shot: UiShotCard, keys: readonly string[]): string[] {
  for (const k of keys) {
    const v = shot[k]
    if (Array.isArray(v) && v.length) return v as string[]
  }
  return []
}

// 提取高亮词汇列表
function getHighlightTerms(shot: UiShotCard): string[] {
  const hl = shot._highlight
  if (!hl) return []
  
  const terms = new Set<string>()
  for (const snippets of Object.values(hl)) {
    for (const snip of snippets) {
      // 提取 <em>...</em> 之间的内容
      const matches = snip.match(/<em>(.*?)<\/em>/g)
      if (matches) {
        matches.forEach(m => {
          const term = m.replace(/<\/?em>/g, '')
          if (term) terms.add(term)
        })
      }
    }
  }
  return Array.from(terms)
}

// ─── Misc helpers ──────────────────────────────────────────────────────────────
function getActiveFrameUrl(shot: UiShotCard): string {
  const urls = (shot.frame_urls ?? []).filter(Boolean)
  if (!urls.length) return shot.thumbnail ?? ''
  const raw = props.activeFrameIndex[String(shot.id)] ?? 0
  return urls[Math.min(raw, urls.length - 1)]
}

function statusType(status: string | null | undefined) {
  if (status === 'OK') return 'success'
  if (status === 'FAILED') return 'danger'
  return 'warning'
}
function statusText(status: string | null | undefined) {
  if (status === 'OK') return '已入库'
  if (status === 'FAILED') return '入库失败'
  return '待入库'
}

function getQualityColor(score: number) {
  if (score >= 8) return '#67c23a'
  if (score >= 6) return '#e6a23c'
  return '#f56c6c'
}
const qualityLabels = ['光影', '构图', '清晰', '色彩']

// Auto-scroll card into view on hover
function handleCardHover(e: MouseEvent) {
  const card = e.currentTarget as HTMLElement
  const container = card.closest('.sg-scroll-container') as HTMLElement | null
  if (!card || !container) return
  const cardRect = card.getBoundingClientRect()
  const cRect = container.getBoundingClientRect()
  if (cardRect.right > cRect.right)
    container.scrollBy({ left: cardRect.right - cRect.right + 20, behavior: 'smooth' })
  else if (cardRect.left < cRect.left)
    container.scrollBy({ left: -(cRect.left - cardRect.left + 20), behavior: 'smooth' })
}
</script>

<template>
  <div class="sg-scroll-container">
    <div class="sg-track">
      <el-card
        v-for="shot in shots"
        :key="shot.id"
        class="sg-card"
        :body-style="{ padding: '0px' }"
        @mouseenter="handleCardHover"
        @click="emit('select-shot', shot)"
      >
        <!-- Media layer -->
        <div class="media-layer">
          <el-image :src="getActiveFrameUrl(shot)" fit="cover" class="thumbnail" />
          <div class="time-badge">{{ shot.time }}</div>

          <!-- Score badge: only show normalized 0-1 scores -->
          <div
            v-if="shot._score != null && (shot._score as number) >= 0 && (shot._score as number) <= 1"
            class="score-badge"
            :title="`相关度 ${Math.round((shot._score as number) * 100)}%`"
          >
            {{ Math.round((shot._score as number) * 100) }}%
          </div>

          <el-tag
            v-if="(shot.os_index_status ?? 'PENDING') !== 'OK'"
            class="index-badge"
            size="small"
            :type="statusType(shot.os_index_status)"
            effect="dark"
            round
            @click.stop="(e: MouseEvent) => emit('reindex', e, shot)"
            :title="shot.os_index_error || ''"
          >
            {{ statusText(shot.os_index_status) }}
          </el-tag>
        </div>

        <div class="card-content">
          <!-- Frame strip -->
          <div v-if="(shot.frame_urls ?? []).length" class="frame-strip">
            <FrameStrip
              :urls="(shot.frame_urls ?? []).filter(Boolean)"
              :active-index="activeFrameIndex[String(shot.id)] ?? 0"
              :max="7"
              :height="42"
              :radius="10"
              @select="(i: number) => emit('frame-select', String(shot.id), i)"
            />
          </div>

          <!-- Core field chips (v2) -->
          <div v-if="getVisibleCoreFields(shot).length" class="core-fields">
            <span
              v-for="f in getVisibleCoreFields(shot)"
              :key="f.key"
              class="core-chip"
              :style="{ background: f.bg, color: f.color }"
            >
              <span class="chip-label">{{ f.label }}</span>
              <span class="chip-value">{{ f.value }}</span>
            </span>
          </div>

          <!-- Core info -->
          <div class="core-info">
            <h4 class="subject-title">{{ shot.subject }}</h4>
            <el-alert :title="shot.movement" type="info" :closable="false" class="movement-alert">
              <template #icon><el-icon><i-ep-video-camera /></el-icon></template>
            </el-alert>
            <p class="description">{{ shot.description }}</p>
          </div>

          <el-divider border-style="dashed" class="divider" />

          <!-- Tag groups (workspace-agnostic) -->
          <div class="tags-section">
            <template v-for="group in TAG_GROUPS" :key="group.label">
              <TagPills
                v-if="getTagGroup(shot, group.keys).length"
                :label="group.label"
                :tags="getTagGroup(shot, group.keys)"
                :max="TAG_PREVIEW_COUNT"
                :show-more="true"
                :type="group.type"
                :effect="group.effect"
                border-radius="999px"
                :clickable="true"
                :highlight-terms="getHighlightTerms(shot)"
              />
            </template>
          </div>

          <!-- Quality scores (v1 only) -->
          <div v-if="(shot.visual_quality ?? []).length" class="quality-section">
            <div class="quality-item" v-for="(score, index) in (shot.visual_quality as number[])" :key="index">
              <span class="q-label">{{ qualityLabels[index] }}</span>
              <el-progress
                :percentage="(score as number) * 10"
                :color="getQualityColor(score as number)"
                :show-text="false"
                :stroke-width="6"
              />
              <span class="q-score">{{ score }}</span>
            </div>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.sg-scroll-container {
  width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  padding-bottom: 16px;
}

.sg-scroll-container::-webkit-scrollbar { height: 8px; }
.sg-scroll-container::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 4px; }
.sg-scroll-container::-webkit-scrollbar-thumb { background: #c0c4cc; border-radius: 4px; }
.sg-scroll-container::-webkit-scrollbar-thumb:hover { background: #909399; }

.sg-track {
  display: inline-flex;
  gap: 20px;
  padding: 4px;
  align-items: flex-start;
}

.sg-card {
  width: 360px;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
  transition: transform 0.3s, box-shadow 0.3s;
  height: max-content;
  cursor: pointer;
}
.sg-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
}

.media-layer {
  position: relative;
  height: 200px;
  background-color: #f5f7fa;
}
.thumbnail { width: 100%; height: 100%; }

.time-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  font-family: Inter, monospace;
}
.score-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.55);
  color: #a7f3d0;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  font-family: Inter, monospace;
  letter-spacing: 0.5px;
  pointer-events: none;
}
.index-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  cursor: pointer;
  user-select: none;
}

.card-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.core-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 4px 0 0;
}
.core-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
}
.chip-label { opacity: 0.7; font-size: 10px; }
.chip-value { font-weight: 500; max-width: 72px; overflow: hidden; text-overflow: ellipsis; }

.core-info { display: flex; flex-direction: column; gap: 8px; }
.subject-title { margin: 0; font-size: 16px; color: #303133; }
.movement-alert { padding: 6px 12px; margin: 4px 0; }
:deep(.el-alert__title) { font-size: 13px; }
.description {
  margin: 0;
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.divider { margin: 8px 0; }

.tags-section { display: flex; flex-direction: column; gap: 8px; }

.quality-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  background: #fafafa;
  padding: 12px;
  border-radius: 8px;
  margin-top: 4px;
}
.quality-item { display: flex; align-items: center; gap: 8px; }
.q-label { font-size: 12px; color: #606266; width: 24px; }
.q-score { font-size: 12px; color: #303133; font-weight: bold; width: 14px; text-align: right; }
</style>
