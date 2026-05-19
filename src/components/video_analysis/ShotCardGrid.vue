<script setup lang="ts">
import FrameStrip from './FrameStrip.vue'
import TagPills from './TagPills.vue'
import type { UiShotCard } from '@/types/videoAnalysis'

// ─── Props / Emits ────────────────────────────────────────────────────────────
const props = defineProps<{
  shots: UiShotCard[]
  activeFrameIndex: Record<string, number>
  strategyWeights?: {
    bm25_weight: number;
    vector_weight: number;
    text_weights?: Record<string, number>;
    vector_weights?: Record<string, number>;
  }
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
  return urls[Math.min(raw, urls.length - 1)] ?? ''
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

// 解析 OpenSearch 的 Explain 树，提取分数组成
type ScoreDetail = { description: string; value: number; isNormalized?: boolean; details?: ScoreDetail[] }

function parseExplanation(explanation: any, matchedQueries: string[] = []): { items: { name: string; score: number }[]; bm25Items: { name: string; score: number }[]; knnItems: { name: string; score: number }[]; bm25Sum: number; knnSum: number; isNormalized: boolean } {
  const items: { name: string; score: number }[] = []
  let isNormalized = false

  if (!explanation) return { items, bm25Items: [], knnItems: [], bm25Sum: 0, knnSum: 0, isNormalized }

  function traverse(node: any) {
    if (!node) return

    const desc = node.description || ''

    if (desc.toLowerCase().includes('normalization')) {
      isNormalized = true
    }

    if (desc.startsWith('weight(')) {
      const match = desc.match(/weight\(([^:]+):/)
      const fieldName = match ? match[1] : 'text'
      items.push({ name: `BM25 (${fieldName})`, score: node.value })
      return
    }

    if (desc.includes('within top k documents') || desc.includes('knn')) {
      const match = desc.match(/for (?:field )?([^:]+)/) || desc.match(/knn\(([^)]+)\)/)
      const fieldName = match ? match[1] : 'Vector'
      items.push({ name: `KNN (${fieldName})`, score: node.value })
      return
    }

    if (desc.includes('score(') || desc.includes('Math.max') || desc.includes('sum of')) {
       if (node.details && node.details.length > 0) {
         node.details.forEach(traverse)
       } else if (node.value > 0.0001) {
         items.push({ name: 'Sub-query Score', score: node.value })
       }
       return
    }

    if (node.details && node.details.length > 0) {
      node.details.forEach(traverse)
    } else if (node.value > 0.0001 && !desc.includes('queryWeight') && !desc.includes('fieldWeight') && !desc.includes('idf') && !desc.includes('tf')) {
      items.push({ name: 'Score', score: node.value })
    }
  }

  traverse(explanation)

  if (items.length === 0 && explanation.details) {
    explanation.details.forEach((d: any) => {
      let name = 'Score'
      if (d.description.includes('weight(')) {
        const m = d.description.match(/weight\(([^:]+):/)
        name = m ? `BM25 (${m[1]})` : 'BM25'
      } else if (d.description.includes('vector') || d.description.includes('knn') || d.description.includes('within top k')) {
        name = 'KNN'
      } else if (d.description.includes('Normalization')) {
        name = 'Normalized'
      }
      if (d.value > 0.0001) {
        items.push({ name, score: d.value })
      }
    })
  }

  // 尝试用 matchedQueries 修复丢失名字的 Score
  const unknownScores = items.filter(i => i.name === 'Score' || i.name === 'Sub-query Score')
  if (unknownScores.length > 0 && matchedQueries.length > 0) {
    let mqIndex = 0
    items.forEach((item) => {
      if ((item.name === 'Score' || item.name === 'Sub-query Score') && mqIndex < matchedQueries.length) {
        const mq = matchedQueries[mqIndex]
        if (mq && mq.startsWith('knn_')) item.name = `KNN (${mq.replace('knn_', '').replace('_vector', '')})`
        else if (mq && mq.startsWith('bm25_')) item.name = `BM25`
        else if (mq) item.name = mq
        mqIndex++
      }
    })
  }

  // 兜底：如果还有未识别的，统一叫 BM25 (Text)
  items.forEach((item) => {
    if (item.name === 'Score' || item.name === 'Sub-query Score') {
      item.name = 'BM25 (Text)'
    }
  })

  // 合并同名项
  const aggregated: Record<string, number> = {}
  items.forEach(i => {
    if (i.score > 0.0001) {
      aggregated[i.name] = (aggregated[i.name] || 0) + i.score
    }
  })

  const finalItems = Object.keys(aggregated).map(k => ({ name: k, score: aggregated[k] ?? 0 }))
  finalItems.sort((a, b) => b.score - a.score)

  const bm25Items: { name: string; score: number }[] = []
  const knnItems: { name: string; score: number }[] = []

  finalItems.forEach(item => {
    if (item.name.toUpperCase().includes('KNN') || item.name.toUpperCase().includes('VECTOR')) {
      knnItems.push({ name: item.name, score: item.score })
    } else {
      bm25Items.push({ name: item.name, score: item.score })
    }
  })

  const bm25Sum = bm25Items.reduce((acc, item) => acc + item.score, 0)
  const knnSum = knnItems.reduce((acc, item) => acc + item.score, 0)

  return { items: finalItems, bm25Items, knnItems, isNormalized, bm25Sum, knnSum }
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
          <el-tooltip
            v-if="shot._score != null && (shot._search_mode === 'fuzzy_rrf' || (shot._score as number) >= 0)"
            placement="bottom-end"
            effect="dark"
            popper-class="score-tooltip"
          >
            <template #content>
              <template v-if="shot._search_mode === 'fuzzy_rrf'">
                <div class="score-breakdown">
                  <div class="score-title">RRF 混合检索</div>
                  <p class="rrf-plain">
                    分数为排名融合值，与 BM25 / 旧版混合归一化百分比不可比；未请求分项 explain。
                  </p>
                  <div class="score-row total">
                    <span class="score-name">RRF score</span>
                    <span class="score-val">{{ Number(shot._score).toFixed(4) }}</span>
                  </div>
                </div>
              </template>
              <template v-else>
                <div
                  v-for="parsed in [parseExplanation(shot._explanation, (shot._matched_queries as string[]) || [])]"
                  :key="shot.id"
                  class="score-breakdown"
                >
                <div class="score-title">
                  得分明细 ({{ shot.is_fallback || shot._search_mode?.includes('fuzzy') ? '路跑兜底' : '精确检索' }})
                </div>
                <p v-if="shot.is_fallback" class="rrf-plain" style="color: #fbbf24; margin-bottom: 6px;">
                  ⚠️ 未完全匹配硬标签，由路跑兜底召回
                </p>
                <div v-if="shot._explanation">

                  <div v-if="parsed.bm25Items.length > 0" class="score-group bm25-group">
                    <div class="group-title">BM25 匹配</div>
                    <div v-for="(item, idx) in parsed.bm25Items" :key="'b'+idx" class="score-row">
                      <span class="score-name" :title="item.name">{{ item.name }}</span>
                      <span class="score-val">{{ item.score.toFixed(4) }}</span>
                    </div>
                  </div>

                  <div v-if="parsed.knnItems.length > 0" class="score-group knn-group">
                    <div class="group-title">向量 匹配</div>
                    <div v-for="(item, idx) in parsed.knnItems" :key="'k'+idx" class="score-row">
                      <span class="score-name" :title="item.name">{{ item.name }}</span>
                      <span class="score-val">{{ item.score.toFixed(4) }}</span>
                    </div>
                  </div>

                  <el-divider class="score-divider" />

                  <div v-if="shot._search_mode?.includes('fuzzy')" class="score-formula">
                    <div class="formula-text">
                      <span>Norm({{ parsed.bm25Sum.toFixed(4) }}) × {{ strategyWeights?.bm25_weight ?? 0.3 }}</span>
                      <span class="formula-plus">+</span>
                      <span>Norm({{ parsed.knnSum.toFixed(4) }}) × {{ strategyWeights?.vector_weight ?? 0.7 }}</span>
                    </div>
                  </div>

                  <div class="score-row total">
                    <span class="score-name">Total {{ parsed.isNormalized ? '(Normalized)' : '' }}</span>
                    <span class="score-val">{{ (shot._score as number).toFixed(4) }}</span>
                  </div>
                </div>
                <div v-else>
                  <div class="score-row total">
                    <span class="score-name">Total Score</span>
                    <span class="score-val">{{ (shot._score as number).toFixed(4) }}</span>
                  </div>
                </div>
                <div v-if="shot._matched_queries && (shot._matched_queries as string[]).length" class="matched-queries">
                  <div class="mq-title">命中路径:</div>
                  <div class="mq-tags">
                    <span v-for="q in (shot._matched_queries as string[])" :key="q" class="mq-tag">{{ q }}</span>
                  </div>
                </div>
              </div>
              </template>
            </template>
            <div
              class="score-badge"
              :class="{ 'fallback-badge': shot.is_fallback }"
              style="pointer-events: auto; cursor: help;"
            >
              {{
                shot.is_fallback
                  ? '兜底 ' + Number(shot._score).toFixed(2)
                  : shot._search_mode === 'fuzzy_rrf'
                    ? Number(shot._score).toFixed(2)
                    : shot._search_mode?.includes('fuzzy')
                      ? Math.round((shot._score as number) * 100) + '%'
                      : (shot._score as number).toFixed(2)
              }}
            </div>
          </el-tooltip>

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
  background: rgba(0, 0, 0, 0.4);
  color: #a7f3d0;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  font-family: Inter, monospace;
  letter-spacing: 0.5px;
  pointer-events: auto;
  cursor: help;
  backdrop-filter: blur(2px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition: all 0.2s ease;
}
.score-badge:hover {
  background: rgba(0, 0, 0, 0.7);
  transform: scale(1.05);
}
.fallback-badge {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.4);
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

.score-breakdown {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 180px;
  font-family: Inter, monospace;
}
.score-title {
  font-size: 12px;
  font-weight: 600;
  color: #e5e7eb;
  margin-bottom: 4px;
  font-family: monospace;
}
.score-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #d1d5db;
}
.score-row.total {
  font-weight: bold;
  color: #10b981;
  font-size: 12px;
}
.score-name {
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.score-val {
  font-variant-numeric: tabular-nums;
}
.score-divider {
  margin: 4px 0;
  border-color: #4b5563;
}
.matched-queries {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mq-title {
  font-size: 11px;
  color: #9ca3af;
}
.mq-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.mq-tag {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  color: #d1d5db;
}
.score-group {
  margin-bottom: 6px;
  padding-left: 8px;
  border-left: 2px solid;
}
.bm25-group {
  border-left-color: #60a5fa;
}
.bm25-group .group-title {
  color: #93c5fd;
}
.knn-group {
  border-left-color: #34d399;
}
.knn-group .group-title {
  color: #6ee7b7;
}
.group-title {
  font-size: 11px;
  margin-bottom: 4px;
  font-weight: 600;
}
.score-formula {
  font-size: 12px;
  color: #9ca3af;
  margin: 8px 0;
  padding: 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.formula-text {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-family: serif;
  color: #d1d5db;
}
.formula-plus {
  color: #9ca3af;
}
.formula-subtext {
  font-size: 9px;
  color: #6b7280;
}
.rrf-plain {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.45;
  color: #d1d5db;
}
</style>
<style>
/* Global styles for the score tooltip to ensure dark theme */
.el-popper.is-dark.score-tooltip {
  background: rgba(0, 0, 0, 0.65) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
  padding: 14px !important;
  border-radius: 16px !important;
}
.el-popper.is-dark.score-tooltip .el-popper__arrow::before {
  background: rgba(0, 0, 0, 0.65) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
}
</style>
