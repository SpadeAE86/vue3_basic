/**
 * 视频分析页：会话级状态 + /search 结果缓存（sessionStorage）
 * - 切路由再回来可还原搜索栏与结果，不必再等后端
 * - LRU + TTL，条目数与配额溢出时有降级
 */
import type { VideoAnalysisSearchToken } from '@/api/video_analysis'
import type { SearchToken } from '@/components/video_analysis/TagSearchBar.vue'
import type { ShotCard } from '@/types/videoAnalysis'

const PAGE_KEY = 'videoAnalysis:page:v2'
const SEARCH_KEY = 'videoAnalysis:searchLRU:v2'

/** 单 tab 内最多保留几条搜索结果（每条为一组 query 的快照） */
const MAX_SEARCH_ENTRIES = 12
/** 条目 TTL（滑动：命中 get/set 会刷新时间戳） */
export const SEARCH_CACHE_TTL_MS = 45 * 60 * 1000

export type VideoAnalysisPageSnapshot = {
  currentWorkspace: string
  selectedHistory: string
  splitScenes: boolean
  fuzzySearch: boolean
  searchTokens: SearchToken[]
  /** 最近一次成功 /search 对应的缓存键；用于挂载时对齐 */
  lastSearchCacheKey: string | null
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
}): string {
  const h = (parts.historyId || '').trim() || '*'
  const payload = parts.tokens.map((t) => ({
    text: t.text.trim(),
    join: t.join ?? 'AND',
    not: !!t.not,
  }))
  return `${parts.workspace}|${h}|${parts.fuzzy ? 1 : 0}|${parts.size}|${JSON.stringify(payload)}`
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
