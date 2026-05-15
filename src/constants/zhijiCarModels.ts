/** 当前项目固定对接的车型（后续可扩展为用户自定义） */
export const ZHIJI_CAR_MODEL_OPTIONS = [
  { value: 'LS6', label: '智己 LS6' },
  { value: 'LS9', label: '智己 LS9' },
] as const

export type ZhijiCarModelValue = (typeof ZHIJI_CAR_MODEL_OPTIONS)[number]['value']

/** 历史任务/口播里的车型文案归一到下拉框取值（仅 LS6 / LS9） */
export function normalizeZhijiCarSelectValue(raw: string | null | undefined): string {
  const u = (raw ?? '').trim().toUpperCase()
  if (!u) return ''
  if (u.includes('LS9')) return 'LS9'
  if (u.includes('LS6')) return 'LS6'
  return ''
}

/** 与索引 v2 ``frame_size`` 字段取值一致 */
export const VIDEO_FRAME_SIZE_OPTIONS = [
  { value: '', label: '不限' },
  { value: '横版16:9', label: '横屏 16:9' },
  { value: '竖版9:16', label: '竖屏 9:16' },
] as const

export type VideoFrameSizeOption = (typeof VIDEO_FRAME_SIZE_OPTIONS)[number]

/** 已选横竖屏时隐藏互斥的比例项，避免横屏下列出 9:16 等 */
export function videoFrameSizeOptionsForOrientation(
  orientation: string | null | undefined,
): VideoFrameSizeOption[] {
  const o = (orientation ?? '').trim()
  if (o === '横屏') {
    return VIDEO_FRAME_SIZE_OPTIONS.filter((x) => x.value !== '竖版9:16')
  }
  if (o === '竖屏') {
    return VIDEO_FRAME_SIZE_OPTIONS.filter((x) => x.value !== '横版16:9')
  }
  return [...VIDEO_FRAME_SIZE_OPTIONS]
}

/** 与索引 ``frame_orientation`` keyword 一致；可不选具体画面比例 */
export const VIDEO_FRAME_ORIENTATION_OPTIONS = [
  { value: '', label: '不限' },
  { value: '横屏', label: '横屏（不定比例）' },
  { value: '竖屏', label: '竖屏（不定比例）' },
] as const
