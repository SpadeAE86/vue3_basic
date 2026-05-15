import type { SearchToken } from '@/components/video_analysis/TagSearchBar.vue'
import type { VideoAnalysisSearchToken } from '@/api/video_analysis'
import { buildSearchCacheKey } from '@/utils/videoAnalysisSessionCache'

/** 与 VideoAnalysisView ``toBackendTokens`` / ``kickRemoteSearch`` 一致，供看板跳转预计算 LRU 键 */
export function tokensToBackendSearchTokens(tokens: SearchToken[]): VideoAnalysisSearchToken[] {
  return (tokens || [])
    .filter((t): t is SearchToken => !!t && !!String(t.text || '').trim())
    .map((t) => ({
      text: String(t.text).trim(),
      join: (t.join ?? 'AND') as 'AND' | 'OR',
      not: !!t.not,
      type: t.type,
      source_field: t.sourceField || undefined,
    }))
}

export type StrategyWeightsForCache = {
  bm25_weight: number
  vector_weight: number
  use_rrf?: boolean
  text_weights?: Record<string, number>
  vector_weights?: Record<string, number>
}

export function buildStrategySigForSearchCache(w: StrategyWeightsForCache): string {
  return JSON.stringify({
    r: !!w.use_rrf,
    b: w.bm25_weight,
    v: w.vector_weight,
    tw: w.text_weights ?? {},
    vw: w.vector_weights ?? {},
  })
}

/** 与 ``buildSearchCacheKey`` + ``size:80`` 的用法对齐 */
export function computeVideoAnalysisSearchCacheKey(opts: {
  workspace: string
  fuzzy: boolean
  tokens: SearchToken[]
  strategyWeights: StrategyWeightsForCache
  size?: number
}): string {
  const backendTok = tokensToBackendSearchTokens(opts.tokens)
  return buildSearchCacheKey({
    workspace: opts.workspace,
    fuzzy: opts.fuzzy,
    tokens: backendTok,
    size: opts.size ?? 80,
    strategySig: buildStrategySigForSearchCache(opts.strategyWeights),
  })
}
