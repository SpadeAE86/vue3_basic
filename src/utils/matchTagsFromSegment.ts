import type { SearchToken } from '@/components/video_analysis/TagSearchBar.vue'
import { inferFrameOrientation, FRAME_ORIENTATION_UNKNOWN } from '@/utils/frameOrientation'

/** 与后端默认模板一致（无 DB 时使用） */
export const DEFAULT_TOKEN_JOIN_AND_FIELDS = ['car_model', 'movement', 'product_status_scene']

/**
 * 将 Stage2 segment 标签（与视频分析「改写提取」同一套字段）转为 SearchToken[]。
 * ``andFields`` 来自 ``/token-join-templates/default-fields``；与 VideoAnalysisView 转写逻辑一致。
 * 标量字段带 ``sourceField``，供 /search 在 v2 下做 AND term filter。
 */
export function tagsJsonToSearchTokens(
  seg: Record<string, unknown>,
  andFields: string[] = DEFAULT_TOKEN_JOIN_AND_FIELDS,
): SearchToken[] {
  const newTokens: SearchToken[] = []
  let idCounter = 0
  const mustSet = new Set(andFields)

  const addToken = (
    field: string | null,
    text: unknown,
    isMust: boolean,
    type: 'keyword' | 'text' = 'keyword',
  ) => {
    const t = String(text ?? '').trim()
    if (!t || t === '未知') return
    if (newTokens.some((x) => x.text === t)) return
    idCounter += 1
    const st: SearchToken = {
      id: `mt_${Date.now().toString(36)}_${idCounter}_${Math.random().toString(36).slice(2, 7)}`,
      text: t,
      join: isMust ? 'AND' : 'OR',
      not: false,
      type,
    }
    if (field) st.sourceField = field
    newTokens.push(st)
  }

  addToken('car_model', seg.car_model, mustSet.has('car_model'), 'keyword')
  addToken('frame_size', seg.frame_size, mustSet.has('frame_size'), 'keyword')

  const orientRaw = seg.frame_orientation
  const orient =
    (typeof orientRaw === 'string' && orientRaw.trim() && orientRaw !== FRAME_ORIENTATION_UNKNOWN
      ? orientRaw.trim()
      : null) ?? inferFrameOrientation(String(seg.frame_size ?? ''))
  if (orient && orient !== FRAME_ORIENTATION_UNKNOWN) {
    addToken('frame_orientation', orient, mustSet.has('frame_orientation'), 'keyword')
  }

  addToken('product_status_scene', seg.product_status_scene, mustSet.has('product_status_scene'), 'keyword')
  addToken('footage_type', seg.footage_type, mustSet.has('footage_type'), 'keyword')
  addToken('movement', seg.movement, mustSet.has('movement'), 'keyword')

  addToken('subject', seg.subject, false, 'keyword')
  addToken('camera_movement', seg.camera_movement, false, 'keyword')
  addToken('topic', seg.topic, false, 'keyword')
  addToken('shot_style', seg.shot_style, false, 'keyword')
  addToken('shot_type', seg.shot_type, false, 'keyword')
  addToken('weather', seg.weather, false, 'keyword')
  addToken('time', seg.time, false, 'keyword')

  const orKeywordFields = [
    'object', 'scene_location', 'design_selling_points', 'function_selling_points',
    'design_adjectives', 'function_adjectives', 'scenario_a', 'scenario_b',
    'marketing_tags', 'appealing_audience', 'extra_tags'
  ]
  for (const field of orKeywordFields) {
    const arr = (seg[field] as unknown[]) ?? []
    for (const x of arr) {
      let mappedField = field
      if (field === 'extra_tags') {
        mappedField = ''
      } else if (field === 'marketing_tags') {
        mappedField = 'marketing_phrases'
      }
      addToken(mappedField, x, false, 'keyword')
    }
  }

  addToken('description', seg.description, false, 'text')
  addToken('', seg.segment_text, false, 'text')

  const orTextFields = ['marketing_phrases', 'text']
  for (const field of orTextFields) {
    const arr = (seg[field] as unknown[]) ?? []
    for (const x of arr) {
      addToken(field, x, false, 'text')
    }
  }

  const firstTok = newTokens[0]
  if (firstTok) firstTok.join = 'AND'

  return newTokens
}
