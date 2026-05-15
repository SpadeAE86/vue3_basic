/**
 * 与后端 utils/frame_orientation.infer_frame_orientation 对齐。
 * segment 无 frame_orientation 时由 frame_size 派生，供转写 AND / 分析搜索 term。
 */
export const FRAME_ORIENTATION_UNKNOWN = '未知'
export const FRAME_ORIENTATION_PORTRAIT = '竖屏'
export const FRAME_ORIENTATION_LANDSCAPE = '横屏'

export function inferFrameOrientation(frameSize: string): string {
  const v = String(frameSize ?? '').trim()
  if (!v || v === FRAME_ORIENTATION_UNKNOWN) return FRAME_ORIENTATION_UNKNOWN
  const vl = v.toLowerCase()
  if (
    v === '竖版9:16' ||
    v === '竖屏9:16' ||
    v === '竖屏' ||
    v === '竖版' ||
    vl === 'portrait' ||
    vl === 'vertical'
  ) {
    return FRAME_ORIENTATION_PORTRAIT
  }
  if (
    v === '横版16:9' ||
    v === '横屏16:9' ||
    v === '横屏' ||
    v === '横版' ||
    vl === 'landscape' ||
    vl === 'horizontal'
  ) {
    return FRAME_ORIENTATION_LANDSCAPE
  }
  if (v === '其他比例') return FRAME_ORIENTATION_UNKNOWN
  const idx = v.indexOf(':')
  if (idx >= 0) {
    const a = v.slice(0, idx).trim()
    const b = v.slice(idx + 1).trim()
    const w = parseInt(a, 10)
    const h = parseInt(b, 10)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
      return FRAME_ORIENTATION_UNKNOWN
    if (w < h) return FRAME_ORIENTATION_PORTRAIT
    if (w > h) return FRAME_ORIENTATION_LANDSCAPE
    return FRAME_ORIENTATION_UNKNOWN
  }
  return FRAME_ORIENTATION_UNKNOWN
}
