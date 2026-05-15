import type { SearchToken } from '@/components/video_analysis/TagSearchBar.vue'

/**
 * 将 Stage2 segment 标签（与视频分析「改写提取」同一套字段）转为 SearchToken[]，
 * 逻辑对齐 VideoAnalysisView `submitRewrite` 中的 token 构造。
 */
export function tagsJsonToSearchTokens(seg: Record<string, unknown>): SearchToken[] {
  const newTokens: SearchToken[] = []
  let idCounter = 0
  const addToken = (text: unknown, isMust: boolean, type: 'keyword' | 'text' = 'keyword') => {
    const t = String(text ?? '').trim()
    if (!t || t === '未知') return
    if (newTokens.some((x) => x.text === t)) return
    idCounter += 1
    newTokens.push({
      id: `mt_${Date.now().toString(36)}_${idCounter}_${Math.random().toString(36).slice(2, 7)}`,
      text: t,
      join: isMust ? 'AND' : 'OR',
      not: false,
      type,
    })
  }

  addToken(seg.car_model, true, 'keyword')
  addToken(seg.frame_size, true, 'keyword')
  addToken(seg.product_status_scene, true, 'keyword')
  addToken(seg.footage_type, true, 'keyword')
  addToken(seg.movement, true, 'keyword')

  addToken(seg.subject, false, 'keyword')
  addToken(seg.camera_movement, false, 'keyword')
  addToken(seg.topic, false, 'keyword')
  addToken(seg.shot_style, false, 'keyword')
  addToken(seg.shot_type, false, 'keyword')
  addToken(seg.weather, false, 'keyword')
  addToken(seg.time, false, 'keyword')

  const orKeywordArrays = [
    ...((seg.object as unknown[]) ?? []),
    ...((seg.scene_location as unknown[]) ?? []),
    ...((seg.design_selling_points as unknown[]) ?? []),
    ...((seg.function_selling_points as unknown[]) ?? []),
    ...((seg.design_adjectives as unknown[]) ?? []),
    ...((seg.function_adjectives as unknown[]) ?? []),
    ...((seg.scenario_a as unknown[]) ?? []),
    ...((seg.scenario_b as unknown[]) ?? []),
    ...((seg.marketing_tags as unknown[]) ?? []),
    ...((seg.appealing_audience as unknown[]) ?? []),
    ...((seg.extra_tags as unknown[]) ?? []),
  ]
  for (const x of orKeywordArrays) {
    addToken(x, false, 'keyword')
  }

  addToken(seg.description, false, 'text')
  addToken(seg.segment_text, false, 'text')

  const orTextArrays = [...((seg.marketing_phrases as unknown[]) ?? []), ...((seg.text as unknown[]) ?? [])]
  for (const x of orTextArrays) {
    addToken(x, false, 'text')
  }

  if (newTokens.length > 0) {
    newTokens[0].join = 'AND'
  }

  return newTokens
}
