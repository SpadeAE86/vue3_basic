<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import {
  analyzeVideoApi,
  getVideoAnalysisHistoryApi,
  getVideoAnalysisHistoryItemApi,
  getVideoAnalysisCardsApi,
  searchVideoAnalysisCardsApi,
  getVideoAnalysisWorkspacesApi,
  type VideoAnalysisSearchToken,
} from '@/api/video_analysis'
import ShotDetailDrawer from '@/components/video_analysis/ShotDetailDrawer.vue'
import ShotCardGrid from '@/components/video_analysis/ShotCardGrid.vue'
import TagSearchBar, { type SearchToken } from '@/components/video_analysis/TagSearchBar.vue'
import type { ShotCard, VideoAnalysisHistoryItem, UiShotCard, WorkspaceOption } from '@/types/videoAnalysis'
import {
  buildSearchCacheKey,
  loadPageSnapshot,
  savePageSnapshot,
  videoAnalysisSearchCache,
  type VideoAnalysisPageSnapshot,
} from '@/utils/videoAnalysisSessionCache'

const isAnalyzing = ref(false)
const selectedFile = ref<File | null>(null)
const selectedHistory = ref('')
const searchTokens = ref<SearchToken[]>([])
const fuzzySearch = ref(false)
const splitScenes = ref(true)

// ─── 模块级搜索缓存（跨路由导航保持，keep-alive 替代方案）────────────────
let _cachedResults: UiShotCard[] = []

/** 从 sessionStorage 批量还原时跳过 workspace 等 watcher 的副作用 */
const restoringSnapshot = ref(false)
/** 最近一次成功 /search（或缓存命中）对应的 cache key，写入快照 */
const lastSuccessfulSearchKey = ref<string | null>(null)

// ─── Workspace ─────────────────────────────────────────────────────────────
const currentWorkspace = ref('v1')
const workspaceOptions = ref<WorkspaceOption[]>([
  { key: 'v1', label: '经典分析 v1', description: '', is_default: true },
])

async function fetchWorkspaces() {
  try {
    const res = await getVideoAnalysisWorkspacesApi()
    if (res?.success && Array.isArray(res.workspaces)) {
      workspaceOptions.value = res.workspaces
      const def = res.workspaces.find((w: WorkspaceOption) => w.is_default)
      if (def && !currentWorkspace.value) currentWorkspace.value = def.key
    }
  } catch {
    // keep defaults
  }
}

// ─── Types imported from src/types/videoAnalysis.ts ─────────────────────────
// ShotCard, UiShotCard, VideoAnalysisHistoryItem, WorkspaceOption

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

// analysisResults = 当前历史/上传加载的卡片（不因搜索而改变）
const analysisResults = ref<UiShotCard[]>([])
// remoteSearchCards = /search 接口返回的结果（与 analysisResults 独立，清 token 后清空）
const remoteSearchCards = ref<UiShotCard[]>([])
const remoteSearching = ref(false)
let searchAbort: AbortController | null = null
let searchSeq = 0

let persistTimer: ReturnType<typeof setTimeout> | null = null
function schedulePersistPageState() {
  if (restoringSnapshot.value) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const snap: VideoAnalysisPageSnapshot = {
      currentWorkspace: currentWorkspace.value,
      selectedHistory: selectedHistory.value,
      splitScenes: splitScenes.value,
      fuzzySearch: fuzzySearch.value,
      searchTokens: [...searchTokens.value],
      lastSearchCacheKey: lastSuccessfulSearchKey.value,
    }
    savePageSnapshot(snap)
  }, 350)
}

// ─── 详情抽屉（承载卡片容不下的字段） ─────────────────────────────
const drawerOpen = ref(false)
const activeShot = ref<UiShotCard | null>(null)

function openShotDetail(shot: UiShotCard) {
  activeShot.value = shot
  drawerOpen.value = true
}

// 帧预览活跃索引（reactive 字典：避免 ref.value 在模板/事件链里偶发 undefined）
const activeFrameIndex = reactive<Record<string, number>>({})
function onFrameSelect(id: string, idx: number) {
  const k = String(id)
  const n = Number(idx)
  if (!Number.isFinite(n)) return
  activeFrameIndex[k] = n
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
    // 复合 ID 防止跨 history 的 scene_id 冲突（frame hover bug 根因）
    id: `${c.history_id || (c as any).video_id || ''}_${c.scene_id}`,
    time: `${formatTime(c.start_time)} - ${formatTime(c.end_time)}`,
    object: c.object ?? [],
    adjective: c.adjective ?? [],
    appealing_audience: c.appealing_audience ?? [],
    // 只有真正有非零质量分时才保留（v2 通常无此字段）
    visual_quality: (c.visual_quality?.some(s => (s as number) > 0) ? c.visual_quality : null) as any,
    os_index_status: c.os_index_status ?? 'PENDING',
  }))
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
      const res = await getVideoAnalysisCardsApi('__all__', currentWorkspace.value)
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
    const res = await getVideoAnalysisHistoryItemApi(val, currentWorkspace.value)
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
  // 兼容 v1 + v2 所有标签字段，确保本地过滤对 v2 卡片立即生效
  const strField = (k: string) => { const v = shot[k]; return typeof v === 'string' && v ? [v] : [] }
  return [
    ...(shot.key_words ?? []),            // v2
    ...(shot.search_tags ?? []),          // v1
    ...(shot.object ?? []),
    ...(shot.design_adjectives ?? []),    // v2
    ...(shot.function_adjectives ?? []), // v2
    ...(shot.adjective ?? []),            // v1
    ...(shot.appealing_audience ?? []),
    ...(shot.marketing_tags ?? []),
    ...(shot.marketing_phrases ?? []),    // v2
    ...(shot.scenario_a ?? []),           // v2
    ...(shot.scenario_b ?? []),           // v2
    ...(shot.design_selling_points ?? []),   // v2
    ...(shot.function_selling_points ?? []), // v2
    ...(shot.scene_location ?? []),      // v2
    ...(shot.text ?? []),                 // v2 画面文字
    ...strField('footage_type'),          // v2
    ...strField('shot_type'),             // v2
    ...strField('shot_style'),            // v2
    ...strField('topic'),                 // v2
    ...strField('product_status_scene'),  // v2
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

// effectiveResults 状态分离设计：
//   有搜索 token → 优先显示 remoteSearchCards；尚未返回时用 analysisResults 做本地过滤垫底
//   无搜索 token → 始终显示历史卡片 analysisResults（搜索结果不混入）
const effectiveResults = computed(() => {
  const hasTokens = (searchTokens.value ?? []).some(t => t.text?.trim())
  if (!hasTokens) {
    // 无 token：历史卡片或模块级缓存
    return analysisResults.value.length > 0 ? analysisResults.value : _cachedResults
  }
  // 有 token：搜索结果（加载完前先用历史卡片做本地过滤，不出现空卡片状态）
  return remoteSearchCards.value.length > 0 ? remoteSearchCards.value : analysisResults.value
})

const filteredResults = computed(() => {
  const tokens = (searchTokens.value ?? []).filter((t) => t.text && t.text.trim())
  if (!tokens.length) return effectiveResults.value

  // 若 remoteSearchCards 已返回，这些卡片是后端已精确排好序的结果，直接展示不再过滤
  if (remoteSearchCards.value.length > 0) return remoteSearchCards.value

  // 远程结果尚未回来时：用本地集合过滤 analysisResults 立即呈现
  return effectiveResults.value.filter((shot) => {
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

function applySearchHit(cards: ShotCard[], search_mode: 'precise' | 'fuzzy' | null) {
  const rawCards = cards.map((c) => ({ ...c, _search_mode: search_mode }))
  const fresh = toUiCards(rawCards)
  _cachedResults = fresh
  remoteSearchCards.value = fresh
}

function kickRemoteSearch() {
  const tokens = (searchTokens.value ?? []).filter((t) => t.text && t.text.trim())
  if (!tokens.length) {
    // token 全清：中止进行中的请求，清空搜索结果 → effectiveResults 自动回到历史卡片
    if (searchAbort) { searchAbort.abort(); searchAbort = null }
    remoteSearchCards.value = []
    remoteSearching.value = false
    lastSuccessfulSearchKey.value = null
    schedulePersistPageState()
    return
  }

  const historyId =
    selectedHistory.value && selectedHistory.value !== '__all__' ? selectedHistory.value : undefined
  const backendTok = toBackendTokens(tokens)
  const cacheKey = buildSearchCacheKey({
    workspace: currentWorkspace.value,
    historyId,
    fuzzy: fuzzySearch.value,
    tokens: backendTok,
    size: 80,
  })

  const cached = videoAnalysisSearchCache.get(cacheKey)
  if (cached?.cards?.length) {
    applySearchHit(cached.cards as ShotCard[], (cached.search_mode as 'precise' | 'fuzzy') ?? null)
    lastSuccessfulSearchKey.value = cacheKey
    schedulePersistPageState()
    remoteSearching.value = false
    return
  }

  if (searchAbort) searchAbort.abort()
  searchAbort = new AbortController()
  const mySeq = ++searchSeq
  remoteSearching.value = true

  searchVideoAnalysisCardsApi(
    {
      tokens: backendTok,
      fuzzy: fuzzySearch.value,
      history_id: historyId,
      size: 80,
      workspace: currentWorkspace.value,
    },
    { signal: searchAbort.signal }
  )
    .then((res) => {
      if (mySeq !== searchSeq) return // stale
      if (!res?.success || !Array.isArray(res.cards)) return
      const mode = res.search_mode as 'precise' | 'fuzzy' | null ?? null
      applySearchHit(res.cards as ShotCard[], mode)
      videoAnalysisSearchCache.set(cacheKey, res.cards as ShotCard[], mode)
      lastSuccessfulSearchKey.value = cacheKey
      schedulePersistPageState()
    })
    .catch((e: any) => {
      if (e?.name === 'AbortError') return
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
    const res = await analyzeVideoApi(selectedFile.value, {
      splitScenes: splitScenes.value,
      workspace: currentWorkspace.value,
    })
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

watch(
  [searchTokens, fuzzySearch, currentWorkspace, selectedHistory, splitScenes],
  () => schedulePersistPageState(),
  { deep: true },
)

onMounted(async () => {
  await fetchWorkspaces()

  const snap = loadPageSnapshot()
  if (snap) {
    restoringSnapshot.value = true
    try {
      if (snap.currentWorkspace) currentWorkspace.value = snap.currentWorkspace
      selectedHistory.value = snap.selectedHistory ?? ''
      splitScenes.value = snap.splitScenes ?? true
      fuzzySearch.value = snap.fuzzySearch ?? false
      searchTokens.value = Array.isArray(snap.searchTokens) ? [...snap.searchTokens] : []
      lastSuccessfulSearchKey.value = snap.lastSearchCacheKey ?? null
    } finally {
      restoringSnapshot.value = false
    }
  }

  await refreshHistory()

  if (selectedHistory.value) {
    await handleHistoryChange(selectedHistory.value)
  }

  const tok = (searchTokens.value ?? []).filter((t) => t.text?.trim())
  if (tok.length) {
    const hid =
      selectedHistory.value && selectedHistory.value !== '__all__' ? selectedHistory.value : undefined
    const key = buildSearchCacheKey({
      workspace: currentWorkspace.value,
      historyId: hid,
      fuzzy: fuzzySearch.value,
      tokens: toBackendTokens(tok),
      size: 80,
    })
    const hit = videoAnalysisSearchCache.get(key)
    if (hit?.cards?.length) {
      applySearchHit(hit.cards as ShotCard[], (hit.search_mode as 'precise' | 'fuzzy') ?? null)
      lastSuccessfulSearchKey.value = key
    }
  }

  schedulePersistPageState()
})

// 切换 workspace 时重新加载当前历史，清空搜索状态（批量还原快照时不要触发）
watch(currentWorkspace, () => {
  if (restoringSnapshot.value) return
  analysisResults.value = []
  remoteSearchCards.value = []
  searchTokens.value = []
  lastSuccessfulSearchKey.value = null
  if (selectedHistory.value) handleHistoryChange(selectedHistory.value)
  schedulePersistPageState()
})

// token 变化：
//   - 有 token → 本地过滤立即生效（filteredResults computed）；不自动触发远程搜索
//   - 无 token → 清空搜索结果，恢复历史卡片
watch(searchTokens, (tokens) => {
  if (!(tokens ?? []).some(t => t.text?.trim())) {
    kickRemoteSearch() // 内部 tokens.length===0 分支：中止请求 + 清空 remoteSearchCards
  }
})

// 切换精准/模糊模式时：若有 token 则重新搜索
watch(fuzzySearch, () => {
  if ((searchTokens.value ?? []).some(t => t.text?.trim())) {
    kickRemoteSearch()
  }
})

onBeforeUnmount(() => {
  if (searchAbort) searchAbort.abort()
  searchAbort = null
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = null
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

          <el-select
            v-model="currentWorkspace"
            size="small"
            class="workspace-select"
            title="切换分析 workspace（schema / index / 卡片表）"
          >
            <el-option
              v-for="ws in workspaceOptions"
              :key="ws.key"
              :value="ws.key"
              :label="ws.label"
            >
              <span>{{ ws.label }}</span>
              <span v-if="ws.is_default" class="workspace-default-badge">默认</span>
            </el-option>
          </el-select>

          <el-button v-if="hasBadCards" size="small" type="warning" plain @click="reindexAllBad">
            重入库异常卡片
          </el-button>
        </div>

        <div class="right-controls">
          <TagSearchBar
            v-model="searchTokens"
            v-model:fuzzy="fuzzySearch"
            :loading="remoteSearching"
            @search="kickRemoteSearch"
            class="tag-search"
          />
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

    <!-- 分析结果展示区 -->
    <div class="results-area" v-if="effectiveResults.length > 0">
      <ShotCardGrid
        :shots="filteredResults"
        :active-frame-index="activeFrameIndex"
        @select-shot="openShotDetail"
        @frame-select="onFrameSelect"
        @reindex="reindexOne"
      />
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

.workspace-select {
  width: 130px;
}

.workspace-default-badge {
  font-size: 11px;
  color: #909399;
  margin-left: 6px;
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

/* 结果区：包裹 ShotCardGrid */
.results-area {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow-y: auto;
}

.empty-state {
  margin-top: 60px;
}
</style>
