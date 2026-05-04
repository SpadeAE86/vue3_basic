<script setup lang="ts">
import { computed } from 'vue'
import DrawerSection from './DrawerSection.vue'
import TagPills from './TagPills.vue'

// ─── 核心字段定义（与 VideoAnalysisView 保持一致）─────────────────────────
type CoreFieldDef = { key: string; label: string; bg: string; color: string }
const CORE_FIELD_DEFS: CoreFieldDef[] = [
  { key: 'footage_type',         label: '素材类型',   bg: '#fef3c7', color: '#b45309' },
  { key: 'shot_type',            label: '景别',       bg: '#dbeafe', color: '#1d4ed8' },
  { key: 'shot_style',           label: '拍摄风格',   bg: '#dcfce7', color: '#15803d' },
  { key: 'camera_movement',      label: '运镜',       bg: '#fce7f3', color: '#be185d' },
  { key: 'product_status_scene', label: '产品状态',   bg: '#ede9fe', color: '#6d28d9' },
  { key: 'scene_location',       label: '场景地点',   bg: '#d1fae5', color: '#065f46' },
  { key: 'topic',                label: '话题',       bg: '#fee2e2', color: '#b91c1c' },
  { key: 'has_presenter',        label: '出镜人',     bg: '#e0f2fe', color: '#0369a1' },
]

function getCoreChips(shot: UiShotCard) {
  return CORE_FIELD_DEFS.flatMap((f) => {
    const v = shot[f.key as keyof typeof shot]
    let value: string | null = null
    if (typeof v === 'boolean') value = v ? '有出镜人' : '无出镜人'
    else if (Array.isArray(v)) {
      const vals = v.filter((x: unknown) => x && String(x) !== '未知').map(String)
      value = vals.join('、') || null
    } else if (typeof v === 'string' && v && v !== '未知') value = v
    return value ? [{ ...f, value }] : []
  })
}

// 接受任意 workspace schema 的 ShotCard（index signature）
type ShotCard = {
  scene_id: number
  start_time: number
  end_time: number
  duration_seconds: number
  thumbnail?: string | null
  frame_urls?: string[]
  description?: string | null
  subject?: string | null
  object?: string[] | null
  movement?: string | null
  // v1
  adjective?: string[] | null
  search_tags?: string[] | null
  marketing_tags?: string[] | null
  appealing_audience?: string[] | null
  visual_quality?: number[] | null
  // v2
  key_words?: string[] | null
  footage_type?: string | null
  shot_style?: string | null
  shot_type?: string | null
  camera_movement?: string | null
  scene_location?: string[] | null
  car_color?: string | null
  car_model?: string | null
  product_status_scene?: string | null
  has_presenter?: boolean | null
  person_detail?: string[] | null
  design_adjectives?: string[] | null
  function_adjectives?: string[] | null
  design_selling_points?: string[] | null
  function_selling_points?: string[] | null
  scenario_a?: string[] | null
  scenario_b?: string[] | null
  marketing_phrases?: string[] | null
  topic?: string | null
  weather?: string | null
  time_of_day?: string | null
  text?: string[] | null
  video_usage?: string[] | null
  error?: string | null
  // 搜索结果附加字段
  _score?: number | null
  _highlight?: Record<string, string[]> | null
  _search_mode?: 'precise' | 'fuzzy' | null
  // 允许任意额外字段
  [key: string]: unknown
}

type UiShotCard = ShotCard & { id: number | string; time: string }

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    shot: UiShotCard | null
    width?: string
  }>(),
  { width: '440px' },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const qualityLabels = ['光影', '构图', '清晰', '色彩']
function getQualityColor(score: number) {
  if (score >= 8) return '#67c23a'
  if (score >= 6) return '#e6a23c'
  return '#f56c6c'
}

// ─── 已在抽屉主体中有专属渲染块的字段 ────────────────────────────────────
const KNOWN_DRAWER_FIELDS = new Set([
  'id', 'time', 'scene_id', 'start_time', 'end_time', 'duration_seconds',
  'history_id', 'thumbnail', 'frame_urls',
  'subject', 'movement', 'description',
  'search_tags', 'key_words',
  'marketing_tags', 'marketing_phrases',
  'appealing_audience',
  'object',
  'adjective', 'design_adjectives', 'function_adjectives',
  'design_selling_points', 'function_selling_points',
  'visual_quality',
  'error', 'os_index_status', 'os_index_error',
  '_score', '_highlight', '_search_mode',
])

// ─── 字段中文标签映射 ─────────────────────────────────────────────────────
const FIELD_LABEL: Record<string, string> = {
  footage_type: '素材类型',
  shot_style: '拍摄风格',
  shot_type: '景别',
  camera_movement: '运镜',
  scene_location: '场景地点',
  car_color: '车身颜色',
  car_model: '车型',
  product_status_scene: '产品状态场景',
  has_presenter: '有出镜人',
  person_detail: '人物细节',
  video_usage: '视频用途',
  scenario_a: '场景A',
  scenario_b: '场景B',
  topic: '话题',
  weather: '天气',
  time_of_day: '时段',
  text: '画面文字',
  generic_hq_road_run: '通用路跑',
  analysis_doc_id: '文档ID',
  frame_size: '画幅',
  resolution: '分辨率',
  video_duration: '视频时长(s)',
}

function fieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? key.replace(/_/g, ' ')
}

// ─── 命中字段 highlight 辅助 ────────────────────────────────────────────────
const HIGHLIGHT_FIELD_LABEL: Record<string, string> = {
  description:             '画面描述',
  subject:                 '主体',
  object:                  '客体/部件',
  design_selling_points:   '设计卖点',
  function_selling_points: '功能卖点',
  scenario_a:              '场景A',
  scenario_b:              '场景B',
  marketing_phrases:       '营销短句',
  appealing_audience:      '目标受众',
  scene_location:          '场景地点',
}

const searchModeLabel: Record<string, string> = {
  precise: '精准匹配 (BM25关键词)',
  fuzzy:   '模糊匹配 (BM25 + KNN语义)',
}

const highlightEntries = computed(() => {
  const hl = props.shot?._highlight
  if (!hl || typeof hl !== 'object') return []
  return Object.entries(hl)
    .filter(([, snips]) => Array.isArray(snips) && snips.length > 0)
    .map(([key, snips]) => ({
      key,
      label: HIGHLIGHT_FIELD_LABEL[key] ?? key.replace(/_/g, ' '),
      snippets: snips as string[],
    }))
})

// 将值渲染为字符串，null/undefined/'未知'/空数组 返回 null（不渲染）
function renderValue(v: unknown): string | null {
  if (v === null || v === undefined || v === '' || v === '未知') return null
  if (Array.isArray(v)) {
    const filtered = v.filter((x) => x !== null && x !== undefined && x !== '' && x !== '未知')
    return filtered.length ? filtered.join('、') : null
  }
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'number') return String(v)
  return String(v)
}

// 判断某个值是否为"标签数组"（用 TagPills 渲染）
function isTagArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && typeof v[0] === 'string'
}

// 溢出字段：不在 KNOWN_DRAWER_FIELDS 中、且有非空有意义的值
const overflowFields = computed(() => {
  if (!props.shot) return []
  return Object.entries(props.shot)
    .filter(([key, val]) => {
      if (KNOWN_DRAWER_FIELDS.has(key)) return false
      return renderValue(val) !== null
    })
    .map(([key, val]) => ({ key, label: fieldLabel(key), val }))
})

// 主区域标签分组（兼容 v1 / v2）
function firstNonEmpty(shot: UiShotCard, ...keys: string[]): string[] {
  for (const k of keys) {
    const v = shot[k]
    if (Array.isArray(v) && v.length) return v as string[]
  }
  return []
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :size="width"
    direction="rtl"
    :with-header="false"
  >
    <div v-if="shot" class="drawer">
      <!-- 标题栏 -->
      <div class="header">
        <div class="title">
          <div class="subject">{{ shot.subject || '未识别主体' }}</div>
          <div class="meta">
            <span class="time">{{ shot.time }}</span>
            <el-tag v-if="shot.car_model" size="small" type="info" effect="plain" round>
              {{ shot.car_model }}
            </el-tag>
          </div>
        </div>
        <el-button text @click="emit('update:modelValue', false)">
          <el-icon><i-ep-close /></el-icon>
        </el-button>
      </div>

      <!-- 缩略图 -->
      <el-image v-if="shot.thumbnail" :src="shot.thumbnail" fit="cover" class="image" />

      <!-- 运镜 / 动作 -->
      <DrawerSection v-if="shot.movement || shot.camera_movement" title="动作 / 运镜">
        <el-alert
          :title="shot.movement || shot.camera_movement || ''"
          type="info"
          :closable="false"
        />
        <div v-if="shot.shot_style || shot.shot_type" class="meta-row">
          <el-tag v-if="shot.shot_style" size="small" effect="plain">{{ shot.shot_style }}</el-tag>
          <el-tag v-if="shot.shot_type" size="small" effect="plain" type="info">{{ shot.shot_type }}</el-tag>
          <el-tag v-if="shot.footage_type" size="small" effect="plain" type="warning">{{ shot.footage_type }}</el-tag>
        </div>
      </DrawerSection>

      <!-- 描述 -->
      <DrawerSection v-if="shot.description" title="描述">
        <div class="text">{{ shot.description }}</div>
      </DrawerSection>

      <!-- 核心结构字段（彩色 chips，全部 8 项） -->
      <DrawerSection v-if="getCoreChips(shot).length" title="核心字段">
        <div class="core-chips">
          <span
            v-for="chip in getCoreChips(shot)"
            :key="chip.key"
            class="core-chip"
            :style="{ background: chip.bg, color: chip.color }"
          >
            <span class="chip-label">{{ chip.label }}</span>
            <span class="chip-value">{{ chip.value }}</span>
          </span>
        </div>
      </DrawerSection>

      <!-- 关键词 / 搜索标签（v2 key_words 优先，v1 fallback search_tags） -->
      <DrawerSection title="关键词 / 搜索标签">
        <TagPills
          :tags="firstNonEmpty(shot, 'key_words', 'search_tags')"
          type="primary"
          effect="plain"
          :round="true"
          :clickable="true"
          border-radius="999px"
        />
      </DrawerSection>

      <!-- 营销（marketing_phrases 优先） -->
      <DrawerSection
        v-if="firstNonEmpty(shot, 'marketing_phrases', 'marketing_tags').length"
        title="营销场景"
      >
        <TagPills
          :tags="firstNonEmpty(shot, 'marketing_phrases', 'marketing_tags')"
          type="danger"
          effect="plain"
          :round="true"
          :clickable="true"
          border-radius="999px"
        />
      </DrawerSection>

      <!-- 受众 -->
      <DrawerSection v-if="(shot.appealing_audience ?? []).length" title="受众">
        <TagPills
          :tags="shot.appealing_audience ?? []"
          type="warning"
          effect="light"
          :round="true"
          :clickable="true"
          border-radius="999px"
        />
      </DrawerSection>

      <!-- 实体 -->
      <DrawerSection v-if="(shot.object ?? []).length" title="实体">
        <TagPills
          :tags="shot.object ?? []"
          type="info"
          effect="light"
          :round="true"
          :clickable="true"
          border-radius="999px"
        />
      </DrawerSection>

      <!-- 特征（v2 分 design / function，v1 adjective） -->
      <DrawerSection
        v-if="firstNonEmpty(shot, 'design_adjectives', 'function_adjectives', 'adjective').length"
        title="特征 / 形容词"
      >
        <div class="tag-group-stack">
          <TagPills
            v-if="(shot.design_adjectives ?? []).length"
            label="设计"
            :tags="shot.design_adjectives ?? []"
            type="success"
            effect="plain"
            border-radius="999px"
          />
          <TagPills
            v-if="(shot.function_adjectives ?? []).length"
            label="功能"
            :tags="shot.function_adjectives ?? []"
            type="success"
            effect="light"
            border-radius="999px"
          />
          <TagPills
            v-if="!(shot.design_adjectives ?? []).length && !(shot.function_adjectives ?? []).length"
            :tags="shot.adjective ?? []"
            type="success"
            effect="plain"
            border-radius="999px"
          />
        </div>
      </DrawerSection>

      <!-- 卖点 -->
      <DrawerSection
        v-if="firstNonEmpty(shot, 'design_selling_points', 'function_selling_points').length"
        title="卖点"
      >
        <TagPills
          v-if="(shot.design_selling_points ?? []).length"
          label="设计"
          :tags="shot.design_selling_points ?? []"
          type="primary"
          effect="light"
          border-radius="999px"
        />
        <TagPills
          v-if="(shot.function_selling_points ?? []).length"
          label="功能"
          :tags="shot.function_selling_points ?? []"
          type="primary"
          effect="plain"
          border-radius="999px"
        />
      </DrawerSection>

      <!-- 打分区：画面质量（v1）+ 搜索相关度 + 模式说明 -->
      <!-- _score 仅在 0-1 归一化区间内才显示（负值 / 超大值代表后端未归一化，跳过） -->
      <DrawerSection
        v-if="(shot.visual_quality ?? []).length || (shot._score != null && (shot._score as number) >= 0 && (shot._score as number) <= 1)"
        title="打分"
      >
        <!-- 搜索模式 badge -->
        <div v-if="shot._search_mode" class="score-mode-badge">
          {{ searchModeLabel[shot._search_mode as string] ?? shot._search_mode }}
        </div>
        <!-- 搜索相关度（精准匹配 BM25 时分数可能 >1，不展示进度条） -->
        <div v-if="shot._score != null && (shot._score as number) >= 0 && (shot._score as number) <= 1" class="score-row">
          <span class="q-label">相关度</span>
          <el-progress
            :percentage="Math.round((shot._score as number) * 100)"
            :color="(shot._score as number) >= 0.6 ? '#67c23a' : (shot._score as number) >= 0.35 ? '#e6a23c' : '#f56c6c'"
            :show-text="false"
            :stroke-width="6"
          />
          <span class="q-score">{{ Math.round((shot._score as number) * 100) }}%</span>
        </div>
        <!-- v1 画面质量 -->
        <div class="quality">
          <div class="q-item" v-for="(score, index) in (shot.visual_quality ?? [])" :key="index">
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
      </DrawerSection>

      <!-- 命中字段：解释 BM25 分数来源 -->
      <DrawerSection v-if="highlightEntries.length" title="命中路径">
        <div class="hl-hint">以下字段含有与搜索词匹配的内容</div>
        <div class="hl-list">
          <div v-for="entry in highlightEntries" :key="entry.key" class="hl-row">
            <span class="hl-field">{{ entry.label }}</span>
            <div class="hl-snips">
              <span
                v-for="(snip, si) in entry.snippets"
                :key="si"
                class="hl-snip"
                v-html="snip"
              />
            </div>
          </div>
        </div>
      </DrawerSection>

      <!-- 溢出字段：其它 workspace schema 的额外字段（自动渲染） -->
      <DrawerSection v-if="overflowFields.length" title="更多标签">
        <div class="overflow-grid">
          <template v-for="f in overflowFields" :key="f.key">
            <div class="overflow-row">
              <span class="overflow-label">{{ f.label }}</span>
              <TagPills
                v-if="isTagArray(f.val)"
                :tags="f.val as string[]"
                type="info"
                effect="plain"
                size="small"
                border-radius="999px"
              />
              <span v-else class="overflow-value">{{ renderValue(f.val) }}</span>
            </div>
          </template>
        </div>
      </DrawerSection>
    </div>
  </el-drawer>
</template>

<style scoped>
.drawer {
  padding: 14px 14px 18px 14px;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.title {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.subject {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time {
  font-size: 12px;
  color: #6b7280;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.image {
  width: 100%;
  height: 210px;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 14px;
}

.text {
  font-size: 13px;
  line-height: 1.5;
  color: #374151;
  white-space: pre-wrap;
}

.tag-group-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quality {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.q-item {
  display: grid;
  grid-template-columns: 44px 1fr 26px;
  align-items: center;
  gap: 10px;
}

.q-label {
  font-size: 12px;
  color: #6b7280;
}

.q-score {
  font-size: 12px;
  color: #374151;
  text-align: right;
}

/* 核心字段 chips */
.core-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.core-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.5;
}

.chip-label {
  opacity: 0.65;
  font-size: 11px;
}

.chip-value {
  font-weight: 500;
}

/* 打分区 */
.score-mode-badge {
  display: inline-block;
  margin-bottom: 8px;
  padding: 2px 10px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 500;
}

.score-row {
  display: grid;
  grid-template-columns: 44px 1fr 42px;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

/* 命中路径区 */
.hl-hint {
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 8px;
}

.hl-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hl-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.hl-field {
  flex-shrink: 0;
  min-width: 72px;
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  padding: 2px 0;
}

.hl-snips {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}

.hl-snip {
  font-size: 12px;
  color: #4b5563;
  line-height: 1.5;
}

/* <em> 高亮样式：命中词加粗+橙色 */
.hl-snip :deep(em) {
  font-style: normal;
  font-weight: 700;
  color: #d97706;
  background: #fef3c7;
  border-radius: 3px;
  padding: 0 2px;
}

/* 溢出字段 */
.overflow-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.overflow-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.overflow-label {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  min-width: 70px;
  padding-top: 2px;
}

.overflow-value {
  font-size: 12px;
  color: #374151;
}
</style>
