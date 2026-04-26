<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import {
  analyzeVideoApi,
  getVideoAnalysisHistoryApi,
  getVideoAnalysisHistoryItemApi,
  getVideoAnalysisCardsApi,
  searchVideoAnalysisCardsApi,
  type VideoAnalysisSearchToken,
} from '@/api/video_analysis'
import ShotDetailDrawer from '@/components/video_analysis/ShotDetailDrawer.vue'
import TagPills from '@/components/video_analysis/TagPills.vue'
import FrameStrip from '@/components/video_analysis/FrameStrip.vue'
import TagSearchBar, { type SearchToken } from '@/components/video_analysis/TagSearchBar.vue'

const isAnalyzing = ref(false)
const selectedFile = ref<File | null>(null)
const selectedHistory = ref('')
const searchTokens = ref<SearchToken[]>([])
const fuzzySearch = ref(false)
const splitScenes = ref(true)

type ShotCard = {
  history_id?: string
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
  adjective?: string[] | null
  search_tags?: string[] | null
  marketing_tags?: string[] | null
  appealing_audience?: string[] | null
  visual_quality?: number[] | null
  error?: string | null
  os_index_status?: 'PENDING' | 'OK' | 'FAILED' | string | null
  os_index_error?: string | null
}

type VideoAnalysisHistoryItem = {
  id: string
  name: string
  time: string
  video_url?: string | null
  cards: ShotCard[]
}

const historyItems = ref<VideoAnalysisHistoryItem[]>([])
const historyOptions = computed(() =>
  [
    { value: '__all__', label: 'All（全部卡片）' },
    ...historyItems.value.map((it) => ({
      value: it.id,
      label: `${it.time} ${it.name}`,
    })),
  ],
)

type UiShotCard = ShotCard & { id: number | string; time: string }
const analysisResults = ref<UiShotCard[]>([])
const remoteSearching = ref(false)
let searchAbort: AbortController | null = null
let searchSeq = 0

// ─── 详情抽屉（承载卡片容不下的字段） ─────────────────────────────
const drawerOpen = ref(false)
const activeShot = ref<UiShotCard | null>(null)

function openShotDetail(shot: UiShotCard) {
  activeShot.value = shot
  drawerOpen.value = true
}

// 卡片内帧预览：hover/click 缩略图切主图
const activeFrameIndex = ref<Record<string, number>>({})
function getActiveFrameUrl(shot: UiShotCard) {
  const urls = (shot.frame_urls ?? []).filter(Boolean)
  const idx = activeFrameIndex.value[String(shot.id)] ?? 0
  return urls[idx] || shot.thumbnail
}

const handleFileChange = (file: any) => {
  selectedFile.value = file.raw
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function toUiCards(cards: ShotCard[]) {
  return (cards || []).map((c) => ({
    ...c,
    id: c.scene_id,
    time: `${formatTime(c.start_time)} - ${formatTime(c.end_time)}`,
    object: c.object ?? [],
    adjective: c.adjective ?? [],
    appealing_audience: c.appealing_audience ?? [],
    visual_quality: (c.visual_quality && c.visual_quality.length ? c.visual_quality : [0, 0, 0, 0]) as any,
    os_index_status: c.os_index_status ?? 'PENDING',
  }))
}

function statusType(s?: string | null) {
  if (s === 'OK') return 'success'
  if (s === 'FAILED') return 'danger'
  return 'warning'
}

function statusText(s?: string | null) {
  if (s === 'OK') return '已入库'
  if (s === 'FAILED') return '入库失败'
  return '待入库'
}

async function reindexOne(e: MouseEvent, shot: UiShotCard) {
  e.stopPropagation()
  if (!shot?.history_id) return
  try {
    shot.os_index_status = 'PENDING'
    const res = await fetch('/api/video-analysis/reindex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history_id: shot.history_id, scene_ids: [shot.scene_id] }),
    }).then((r) => r.json())
    if (res?.success && Array.isArray(res.updated) && res.updated.length) {
      const updated = res.updated[0] as ShotCard
      shot.os_index_status = updated.os_index_status ?? 'OK'
      shot.os_index_error = updated.os_index_error ?? null
    } else {
      shot.os_index_status = 'FAILED'
    }
  } catch {
    shot.os_index_status = 'FAILED'
  }
}

async function reindexAllBad() {
  const bad = (filteredResults.value || []).filter((s) => (s.os_index_status ?? 'PENDING') !== 'OK' && s.history_id)
  if (!bad.length) return
  const byHistory = new Map<string, number[]>()
  for (const s of bad) {
    const hid = String(s.history_id)
    if (!byHistory.has(hid)) byHistory.set(hid, [])
    byHistory.get(hid)!.push(Number(s.scene_id))
    s.os_index_status = 'PENDING'
  }
  for (const [hid, sceneIds] of byHistory.entries()) {
    try {
      const res = await fetch('/api/video-analysis/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history_id: hid, scene_ids: sceneIds }),
      }).then((r) => r.json())
      if (res?.success && Array.isArray(res.updated)) {
        const map = new Map<number, any>(res.updated.map((u: any) => [Number(u.scene_id), u]))
        for (const s of bad.filter((x) => x.history_id === hid)) {
          const u = map.get(Number(s.scene_id))
          if (u) {
            s.os_index_status = u.os_index_status ?? 'OK'
            s.os_index_error = u.os_index_error ?? null
          } else {
            s.os_index_status = s.os_index_status === 'PENDING' ? 'FAILED' : s.os_index_status
          }
        }
      } else {
        for (const s of bad.filter((x) => x.history_id === hid)) s.os_index_status = 'FAILED'
      }
    } catch {
      for (const s of bad.filter((x) => x.history_id === hid)) s.os_index_status = 'FAILED'
    }
  }
}

const handleHistoryChange = async (val: string) => {
  if (!val) return

  if (val === '__all__') {
    isAnalyzing.value = true
    try {
      const res = await getVideoAnalysisCardsApi('__all__')
      if (!res?.success || !Array.isArray(res.cards)) {
        analysisResults.value = []
        return
      }
      analysisResults.value = toUiCards(res.cards || [])
    } finally {
      isAnalyzing.value = false
    }
    return
  }

  isAnalyzing.value = true
  try {
    const res = await getVideoAnalysisHistoryItemApi(val)
    if (!res?.success || !res?.item) {
      analysisResults.value = []
      return
    }
    const item = res.item as VideoAnalysisHistoryItem
    analysisResults.value = toUiCards(item.cards || [])
  } finally {
    isAnalyzing.value = false
  }
}

function buildBag(shot: UiShotCard) {
  return [
    ...(shot.search_tags ?? []),
    ...(shot.object ?? []),
    ...(shot.adjective ?? []),
    ...(shot.appealing_audience ?? []),
    ...(shot.marketing_tags ?? []),
  ].filter(Boolean)
}

function matchTag(tags: string[], token: string, fuzzy: boolean) {
  const q = token.trim()
  if (!q) return true
  if (!fuzzy) return tags.includes(q)
  const qq = q.toLowerCase()
  return tags.some((t) => {
    const s = String(t).toLowerCase()
    return s.includes(qq) || qq.includes(s)
  })
}

const filteredResults = computed(() => {
  const tokens = (searchTokens.value ?? []).filter((t) => t.text && t.text.trim())
  if (!tokens.length) return analysisResults.value

  return analysisResults.value.filter((shot) => {
    const tags = buildBag(shot)
    const hay = `${shot.subject ?? ''} ${shot.description ?? ''} ${tags.join(' ')}`.toLowerCase()

    let acc = true
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      const join = (t.join ?? 'AND').toUpperCase() as 'AND' | 'OR'
      const not = !!t.not

      let ok = true
      // >=10 chars => treat as natural language, else treat as tag (with optional fuzzy)
      if ((t.text ?? '').trim().length >= 10) ok = hay.includes(t.text.toLowerCase())
      else ok = matchTag(tags, t.text, fuzzySearch.value)
      if (not) ok = !ok

      if (i === 0) acc = ok
      else if (join === 'OR') acc = acc || ok
      else acc = acc && ok
    }
    return acc
  })
})

const hasBadCards = computed(() =>
  (filteredResults.value ?? []).some((s) => (s.os_index_status ?? 'PENDING') !== 'OK')
)

function toBackendTokens(tokens: SearchToken[]): VideoAnalysisSearchToken[] {
  return (tokens || [])
    .filter((t) => t.text && t.text.trim())
    .map((t) => ({
      text: t.text.trim(),
      join: (t.join ?? 'AND') as any,
      not: !!t.not,
    }))
}

function kickRemoteSearch() {
  const tokens = (searchTokens.value ?? []).filter((t) => t.text && t.text.trim())
  if (!tokens.length) {
    // clear remote state
    remoteSearching.value = false
    if (searchAbort) searchAbort.abort()
    searchAbort = null
    return
  }

  // abort previous request
  if (searchAbort) searchAbort.abort()
  searchAbort = new AbortController()
  const mySeq = ++searchSeq
  remoteSearching.value = true

  const historyId =
    selectedHistory.value && selectedHistory.value !== '__all__' ? selectedHistory.value : undefined

  searchVideoAnalysisCardsApi(
    { tokens: toBackendTokens(tokens), fuzzy: fuzzySearch.value, history_id: historyId, size: 80 },
    { signal: searchAbort.signal }
  )
    .then((res) => {
      if (mySeq !== searchSeq) return // stale
      if (!res?.success || !Array.isArray(res.cards)) return
      // 用后端搜索结果覆盖当前列表（前端本地过滤仍然会生效）
      analysisResults.value = toUiCards(res.cards || [])
    })
    .catch((e: any) => {
      // ignore abort
      if (e?.name === 'AbortError') return
      // 不打扰用户，只在控制台留痕
      // eslint-disable-next-line no-console
      console.warn('video-analysis remote search failed', e)
    })
    .finally(() => {
      if (mySeq !== searchSeq) return
      remoteSearching.value = false
    })
}

async function refreshHistory() {
  try {
    const res = await getVideoAnalysisHistoryApi()
    if (res?.success && Array.isArray(res.history)) {
      historyItems.value = res.history
    } else {
      historyItems.value = []
    }
  } catch (e) {
    historyItems.value = []
  }
}

const handleUpload = async () => {
  if (!selectedFile.value) return

  isAnalyzing.value = true
  try {
    const res = await analyzeVideoApi(selectedFile.value, { splitScenes: splitScenes.value })
    if (!res?.success || !res?.item) {
      ElMessage.error(res?.error || '视频分析失败')
      return
    }
    const item = res.item as VideoAnalysisHistoryItem
    // 更新历史并选中新结果
    historyItems.value = [item, ...historyItems.value.filter((x) => x.id !== item.id)]
    selectedHistory.value = item.id
    analysisResults.value = toUiCards(item.cards)
    ElMessage.success('视频分析完成')
  } catch (e: any) {
    ElMessage.error(e?.message || '视频分析出错')
  } finally {
    isAnalyzing.value = false
  }
}

const getQualityColor = (score: number) => {
  if (score >= 8) return '#67c23a'
  if (score >= 6) return '#e6a23c'
  return '#f56c6c'
}

const qualityLabels = ['光影', '构图', '清晰', '色彩']
const TAG_PREVIEW_COUNT = 3

// 处理卡片 hover 滚动逻辑
const handleCardHover = (e: MouseEvent) => {
  const card = (e.currentTarget as HTMLElement)
  const container = document.querySelector('.storyboard-scroll-container') as HTMLElement

  if (!card || !container) return

  const cardRect = card.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()

  // 检查卡片右侧是否超出容器右边界
  if (cardRect.right > containerRect.right) {
    const scrollAmount = cardRect.right - containerRect.right + 20 // 20px padding
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' })
  }
  // 检查卡片左侧是否超出容器左边界
  else if (cardRect.left < containerRect.left) {
    const scrollAmount = containerRect.left - cardRect.left + 20 // 20px padding
    container.scrollBy({ left: -scrollAmount, behavior: 'smooth' })
  }
}

onMounted(async () => {
  await refreshHistory()
})

watch([searchTokens, fuzzySearch, selectedHistory], () => {
  // 先前端 computed 立即过滤出结果，再异步从后端拉更准的结果覆盖
  kickRemoteSearch()
})

onBeforeUnmount(() => {
  if (searchAbort) searchAbort.abort()
  searchAbort = null
})
</script>

<template>
  <div class="video-analysis-container">
    <!-- 顶部控制区：精简高度 -->
    <el-card class="control-panel" shadow="never" :body-style="{ padding: '12px 20px' }">
      <div class="header-controls">
        <div class="left-controls">
          <h3 class="section-title">视频分析</h3>
          <el-select
            v-model="selectedHistory"
            placeholder="选择历史分析记录"
            clearable
            class="history-select"
            @change="handleHistoryChange"
          >
            <el-option
              v-for="item in historyOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>

          <el-tag
            :type="splitScenes ? 'success' : 'info'"
            effect="dark"
            size="small"
            round
            class="toggle-tag"
            @click="splitScenes = !splitScenes"
          >
            <el-icon class="toggle-icon"><i-ep-scissor /></el-icon>
            {{ splitScenes ? '拆分镜' : '不拆分镜' }}
          </el-tag>

          <el-button v-if="hasBadCards" size="small" type="warning" plain @click="reindexAllBad">
            重入库异常卡片
          </el-button>
        </div>

        <div class="right-controls">
          <TagSearchBar v-model="searchTokens" v-model:fuzzy="fuzzySearch" class="tag-search" />
          <el-upload
            class="compact-uploader"
            action="#"
            :auto-upload="false"
            :show-file-list="false"
            @change="handleFileChange"
            accept="video/*"
          >
            <el-button type="default">
              <el-icon class="el-icon--left"><i-ep-video-camera /></el-icon>
              选择视频
            </el-button>
          </el-upload>

          <span v-if="selectedFile" class="compact-file-info">
            {{ selectedFile.name }}
          </span>

          <el-button
            type="primary"
            @click="handleUpload"
            :loading="isAnalyzing"
            :disabled="!selectedFile"
          >
            {{ isAnalyzing ? '分析中...' : '开始分析' }}
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 分析结果展示区：横向滚动 -->
    <div class="results-area" v-if="analysisResults.length > 0">
      <div class="storyboard-scroll-container">
        <div class="storyboard-track">
          <el-card
            v-for="shot in filteredResults" 
            :key="shot.id"
            class="storyboard-card"
            :body-style="{ padding: '0px' }"
            @mouseenter="handleCardHover"
            @click="openShotDetail(shot)"
          >
            <!-- 视觉层 -->
            <div class="media-layer">
              <el-image :src="getActiveFrameUrl(shot)" fit="cover" class="thumbnail" />
              <div class="time-badge">{{ shot.time }}</div>
              <el-tag
                v-if="(shot.os_index_status ?? 'PENDING') !== 'OK'"
                class="index-badge"
                size="small"
                :type="statusType(shot.os_index_status)"
                effect="dark"
                round
                @click="(e) => reindexOne(e as any, shot)"
                :title="shot.os_index_error || ''"
              >
                {{ statusText(shot.os_index_status) }}
              </el-tag>
            </div>

            <div class="card-content">
              <!-- 帧胶片条：不进抽屉也能看到多帧信息 -->
              <div v-if="(shot.frame_urls ?? []).length" class="frame-strip">
                <FrameStrip
                  :urls="shot.frame_urls ?? []"
                  :active-index="activeFrameIndex[String(shot.id)] ?? 0"
                  :max="7"
                  :height="42"
                  :radius="10"
                  @select="(i) => (activeFrameIndex[String(shot.id)] = i)"
                />
              </div>
              <!-- 核心信息层 -->
              <div class="core-info">
                <h4 class="subject-title">{{ shot.subject }}</h4>
                <el-alert
                  :title="shot.movement"
                  type="info"
                  :closable="false"
                  class="movement-alert"
                >
                  <template #icon><el-icon><i-ep-video-camera /></el-icon></template>
                </el-alert>
                <p class="description">{{ shot.description }}</p>
              </div>

              <el-divider border-style="dashed" class="divider" />

              <!-- 标签分类层 -->
              <div class="tags-section">
                <TagPills
                  label="搜索"
                  :tags="shot.search_tags ?? []"
                  :max="TAG_PREVIEW_COUNT"
                  :show-more="true"
                  type="primary"
                  effect="plain"
                  border-radius="999px"
                  :clickable="true"
                />
                <TagPills
                  label="实体"
                  :tags="shot.object ?? []"
                  type="info"
                  effect="light"
                  border-radius="999px"
                  :clickable="true"
                />
                <TagPills
                  label="特征"
                  :tags="shot.adjective ?? []"
                  type="success"
                  effect="plain"
                  border-radius="999px"
                  :clickable="true"
                />
                <TagPills
                  label="受众"
                  :tags="shot.appealing_audience ?? []"
                  type="warning"
                  effect="light"
                  border-radius="999px"
                  :clickable="true"
                />
                <TagPills
                  v-if="(shot.marketing_tags ?? []).length"
                  label="营销"
                  :tags="shot.marketing_tags ?? []"
                  type="danger"
                  effect="plain"
                  border-radius="999px"
                  :clickable="true"
                />
              </div>

              <!-- 质量评分层 -->
              <div class="quality-section">
                <div class="quality-item" v-for="(score, index) in (shot.visual_quality ?? [0,0,0,0])" :key="index">
                  <span class="q-label">{{ qualityLabels[index] }}</span>
                  <el-progress
                    :percentage="score * 10"
                    :color="getQualityColor(score)"
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
    </div>

    <!-- 空状态 -->
    <el-empty v-else-if="!isAnalyzing" description="暂无分析数据，请选择历史记录或上传视频" class="empty-state" />

    <ShotDetailDrawer v-model="drawerOpen" :shot="activeShot" />
  </div>
</template>

<style scoped>
.video-analysis-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow: hidden; /* 防止整个页面滚动 */
}

/* 精简版控制面板 */
.control-panel {
  border-radius: 8px;
  border: 1px solid #ebeef5;
  flex-shrink: 0;
}

.header-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.left-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.toggle-tag {
  cursor: pointer;
  user-select: none;
}

.toggle-icon {
  margin-right: 6px;
}


.muted {
  color: #9ca3af;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0;
  padding-left: 8px;
  border-left: 4px solid #409eff;
}

.history-select {
  width: 240px;
}

.right-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tag-search {
  width: min(720px, 54vw);
}

.compact-uploader {
  display: inline-block;
}

.compact-file-info {
  font-size: 13px;
  color: #606266;
  max-width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #f4f4f5;
  padding: 4px 8px;
  border-radius: 4px;
}

.frame-strip {
  margin: 10px 12px 0 12px;
}

/* 结果区：横向滚动容器 */
.results-area {
  flex: 1;
  min-height: 0; /* 允许内部元素滚动 */
  position: relative;
  overflow-y: auto; /* 卡片变高时允许纵向滚动，不裁切 */
}

.storyboard-scroll-container {
  width: 100%;
  height: auto; /* 让高度随卡片内容增长 */
  overflow-x: auto;
  overflow-y: visible; /* 不裁切卡片底部（比如打分区） */
  padding-bottom: 16px; /* 为滚动条留出空间 */
  /* 隐藏滚动条但保留功能 (可选) */
  /* scrollbar-width: none; */
}

/* 自定义滚动条样式 */
.storyboard-scroll-container::-webkit-scrollbar {
  height: 8px;
}
.storyboard-scroll-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}
.storyboard-scroll-container::-webkit-scrollbar-thumb {
  background: #c0c4cc;
  border-radius: 4px;
}
.storyboard-scroll-container::-webkit-scrollbar-thumb:hover {
  background: #909399;
}

.storyboard-track {
  display: inline-flex;
  gap: 20px;
  padding: 4px;
  height: auto;
  align-items: flex-start; /* 以最高卡片为准，不拉伸 */
}

/* 卡片样式 */
.storyboard-card {
  width: 360px; /* 固定宽度 */
  flex-shrink: 0; /* 防止被挤压 */
  border-radius: 12px;
  overflow: hidden;
  transition: transform 0.3s, box-shadow 0.3s;
  height: max-content; /* 适应内容高度 */
}

.storyboard-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0,0,0,0.1);
}

.media-layer {
  position: relative;
  height: 200px;
  background-color: #f5f7fa;
}

.thumbnail {
  width: 100%;
  height: 100%;
}

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
  font-family: Inter;
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

.core-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.subject-title {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.movement-alert {
  padding: 6px 12px;
  margin: 4px 0;
}

:deep(.el-alert__title) {
  font-size: 13px;
}

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

.divider {
  margin: 8px 0;
}

.tags-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.group-label {
  font-size: 12px;
  color: #909399;
  margin-right: 8px;
  margin-bottom: 4px;
  width: 32px;
}

.mr-1 { margin-right: 4px; }
.mb-1 { margin-bottom: 4px; }

.quality-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  background: #fafafa;
  padding: 12px;
  border-radius: 8px;
  margin-top: 4px;
}

.quality-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.q-label {
  font-size: 12px;
  color: #606266;
  width: 24px;
}

.q-score {
  font-size: 12px;
  color: #303133;
  font-weight: bold;
  width: 14px;
  text-align: right;
}

.empty-state {
  margin-top: 60px;
}
</style>
