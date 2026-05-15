/**
 * 视频分析页：会话级状态 + /search 结果缓存（sessionStorage）
 * - 切路由再回来可还原搜索栏与结果，不必再等后端
 * - LRU + TTL，条目数与配额溢出时有降级
 */
import { reactive } from 'vue'
import type { VideoAnalysisSearchToken } from '@/api/video_analysis'
import type { SearchToken } from '@/components/video_analysis/TagSearchBar.vue'
import type { ShotCard } from '@/types/videoAnalysis'

const PAGE_KEY = 'videoAnalysis:page:v2'
const SEARCH_KEY = 'videoAnalysis:searchLRU:v2'
/** 从任务看板「跳转视频分析」写入，进入分析页后 consume */
const NAV_FROM_BOARD_KEY = 'videoAnalysis:navFromBoard:v1'
const PREFILL_FROM_MATCH_KEY = 'videoAnalysis:prefillFromMatch:v1'

export type VideoAnalysisNavFromBoard = {
  workspace: string
  historyId: string
}

/** 全局的智能提取状态，跨路由保持 */
export const rewriteTaskState = reactive({
  isRewriting: false,
  dialogVisible: false,
  form: {
    script: '',
    topic: '',
    title: '',
    car_model: '',
    frame_size: '',
  },
  pendingTokens: null as SearchToken[] | null
})

/** 单 tab 内最多保留几条搜索结果（每条为一组 query 的快照） */
const MAX_SEARCH_ENTRIES = 12
/** 条目 TTL（滑动：命中 get/set 会刷新时间戳） */
export const SEARCH_CACHE_TTL_MS = 45 * 60 * 1000

export type VideoAnalysisPageSnapshot = {
  currentWorkspace: string
  selectedHistory: string
  splitScenes: boolean
  /** 兼容旧快照 */
  fuzzySearch?: boolean
  searchFuzzy?: boolean
  searchTokens: SearchToken[]
  /** 最近一次成功 /search 对应的缓存键；用于挂载时对齐 */
  lastSearchCacheKey: string | null
}

/** 视频匹配分镜「跳转视频分析」时写入 sessionStorage，进入分析页后 consume */
export type VideoAnalysisPrefillFromMatch = {
  workspace: string
  selectedHistory: string
  searchTokens: SearchToken[]
  searchStrategyWeights: {
    bm25_weight: number
    vector_weight: number
    use_rrf: boolean
    text_weights?: Record<string, number>
    vector_weights?: Record<string, number>
  }
  searchFuzzy: boolean
  /** 填入后是否自动请求 /search */
  autoSearch: boolean
}

type SearchCacheEntry = {
  key: string
  ts: number
  search_mode?: string | null
  cards: ShotCard[]
}

type SearchCacheFile = {
  entries: SearchCacheEntry[]
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** 与后端 kickRemoteSearch 参数一致即可稳定命中 */
export function buildSearchCacheKey(parts: {
  workspace: string
  historyId?: string
  fuzzy: boolean
  tokens: VideoAnalysisSearchToken[]
  size: number
  /** 权重 / RRF 开关变化须使缓存失效 */
  strategySig?: string
}): string {
  const h = (parts.historyId || '').trim() || '*'
  const payload = parts.tokens.map((t) => ({
    text: t.text.trim(),
    join: t.join ?? 'AND',
    not: !!t.not,
  }))
  const sig = (parts.strategySig ?? '').trim()
  return `${parts.workspace}|${h}|${parts.fuzzy ? 1 : 0}|${parts.size}|${sig}|${JSON.stringify(payload)}`
}

function loadSearchFile(): SearchCacheFile {
  const f = safeParse<SearchCacheFile>(sessionStorage.getItem(SEARCH_KEY))
  if (!f?.entries || !Array.isArray(f.entries)) return { entries: [] }
  return f
}

function saveSearchFile(data: SearchCacheFile) {
  try {
    sessionStorage.setItem(SEARCH_KEY, JSON.stringify(data))
  } catch {
    // 配额：删掉一半最旧条目再试一次
    const half = Math.ceil(data.entries.length / 2)
    data.entries = data.entries.slice(half)
    try {
      sessionStorage.setItem(SEARCH_KEY, JSON.stringify(data))
    } catch {
      /* ignore */
    }
  }
}

function pruneExpired(entries: SearchCacheEntry[]): SearchCacheEntry[] {
  const now = Date.now()
  return entries.filter((e) => now - e.ts <= SEARCH_CACHE_TTL_MS)
}

export function savePageSnapshot(s: VideoAnalysisPageSnapshot) {
  try {
    sessionStorage.setItem(PAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export function loadPageSnapshot(): VideoAnalysisPageSnapshot | null {
  return safeParse<VideoAnalysisPageSnapshot>(sessionStorage.getItem(PAGE_KEY))
}

export function stashVideoAnalysisNavFromBoard(payload: VideoAnalysisNavFromBoard) {
  try {
    sessionStorage.setItem(NAV_FROM_BOARD_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function consumeVideoAnalysisNavFromBoard(): VideoAnalysisNavFromBoard | null {
  try {
    const raw = sessionStorage.getItem(NAV_FROM_BOARD_KEY)
    if (!raw) return null
    sessionStorage.removeItem(NAV_FROM_BOARD_KEY)
    const o = JSON.parse(raw) as VideoAnalysisNavFromBoard
    if (!o || typeof o.workspace !== 'string' || typeof o.historyId !== 'string') return null
    return o
  } catch {
    return null
  }
}

export function stashVideoAnalysisPrefillFromMatch(payload: VideoAnalysisPrefillFromMatch) {
  try {
    sessionStorage.setItem(PREFILL_FROM_MATCH_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function consumeVideoAnalysisPrefillFromMatch(): VideoAnalysisPrefillFromMatch | null {
  try {
    const raw = sessionStorage.getItem(PREFILL_FROM_MATCH_KEY)
    if (!raw) return null
    sessionStorage.removeItem(PREFILL_FROM_MATCH_KEY)
    return JSON.parse(raw) as VideoAnalysisPrefillFromMatch
  } catch {
    return null
  }
}

export const videoAnalysisSearchCache = {
  get(key: string): { cards: ShotCard[]; search_mode?: string | null } | null {
    let data = loadSearchFile()
    let entries = pruneExpired(data.entries)
    const idx = entries.findIndex((e) => e.key === key)
    if (idx < 0) {
      if (entries.length !== data.entries.length) saveSearchFile({ entries })
      return null
    }
    const hit = entries[idx]
    const now = Date.now()
    hit.ts = now
    entries.splice(idx, 1)
    entries.push(hit)
    saveSearchFile({ entries })
    return { cards: hit.cards, search_mode: hit.search_mode }
  },

  set(key: string, cards: ShotCard[], search_mode?: string | null) {
    let entries = pruneExpired(loadSearchFile().entries)
    entries = entries.filter((e) => e.key !== key)
    entries.push({
      key,
      ts: Date.now(),
      search_mode: search_mode ?? undefined,
      cards: cards ?? [],
    })
    while (entries.length > MAX_SEARCH_ENTRIES) entries.shift()
    saveSearchFile({ entries })
  },

  /** 清空（例如用户手动清标签时可选择性调用；当前由页面逻辑决定） */
  clearAll() {
    try {
      sessionStorage.removeItem(SEARCH_KEY)
    } catch {
      /* ignore */
    }
  },
}
