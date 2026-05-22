import type { VideoMatchShotDto } from '@/api/video_match'

export function shotRankedVideoUrls(row: VideoMatchShotDto): string[] {
  try {
    if (row.top5_video_urls && row.top5_video_urls.length > 0) {
      return row.top5_video_urls.filter(Boolean)
    }
    if (row.match_top_hits_json && row.match_top_hits_json.length > 0) {
      return row.match_top_hits_json.map((r) => r.video_path || '').filter(Boolean)
    }
    if (row.top1_obs_url) {
      return [row.top1_obs_url]
    }
    return []
  } catch {
    return []
  }
}

export function shotTop1VideoUrl(row: VideoMatchShotDto): string | null {
  const arr = shotRankedVideoUrls(row)
  return arr.length > 0 ? (arr[0] ?? null) : null
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

export function shotExtractStatusNorm(row: VideoMatchShotDto): string {
  const s = (row.extract_status || '').toLowerCase()
  if (s === 'failed') return 'failed'
  if (s === 'done') return 'success'
  if (s === 'running' || s === 'extracting') return 'running'
  return 'pending'
}

/** 匹配状态文字（只用于"匹配状态"列） */
export function shotStatusLabel(st: string): string {
  if (st === 'success') return '成功'
  if (st === 'failed') return '失败'
  if (st === 'running') return '匹配中'
  if (st === 'pending') return '待匹配'
  if (st === 'unknown') return '未知'
  return st
}

/** 提取状态文字（只用于"提取状态"列） */
export function shotExtractStatusLabel(st: string): string {
  if (st === 'success') return '已抽取'
  if (st === 'failed') return '抽取失败'
  if (st === 'running') return '抽取中'
  if (st === 'pending') return '待抽取'
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
