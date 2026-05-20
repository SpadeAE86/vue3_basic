import type { VideoMatchShotDto } from '@/api/video_match'

export function shotRankedVideoUrls(row: VideoMatchShotDto): string[] {
  try {
    if (!row.match_result || !row.match_result.ranked_results) return []
    return row.match_result.ranked_results.map((r: any) => r.video_url || '').filter(Boolean)
  } catch {
    return []
  }
}

export function shotTop1VideoUrl(row: VideoMatchShotDto): string | null {
  const arr = shotRankedVideoUrls(row)
  return arr.length > 0 ? arr[0] : null
}

export function top1UrlDisplay(url: string | null): string {
  if (!url) return '-'
  const parts = url.split('/')
  return parts[parts.length - 1] || url
}

export function shotSearchStatusNorm(row: VideoMatchShotDto): string {
  const s = (row.search_status || '').toLowerCase()
  if (s === 'failed') return 'failed'
  if (s === 'done') {
    if (!shotRankedVideoUrls(row).length) return 'failed'
    return 'success'
  }
  if (s === 'processing' || s === 'running') return 'running'
  if (s === 'pending') return 'pending'
  return s
}

export function shotStatusLabel(st: string): string {
  if (st === 'success') return '成功'
  if (st === 'failed') return '失败'
  if (st === 'running') return '匹配中'
  if (st === 'pending') return '待匹配'
  if (st === 'unknown') return '未知'
  return st
}

export function shotStatusTagType(st: string): 'success' | 'danger' | 'warning' | 'info' {
  if (st === 'success') return 'success'
  if (st === 'failed') return 'danger'
  if (st === 'running') return 'warning'
  if (st === 'pending') return 'info'
  return 'info'
}

export function shotMatchFailedVm(row: VideoMatchShotDto): boolean {
  return shotSearchStatusNorm(row) === 'failed'
}

export function canJumpVideoAnalysisFromVmShot(row: VideoMatchShotDto): boolean {
  return shotSearchStatusNorm(row) === 'success' && !!shotTop1VideoUrl(row)
}
