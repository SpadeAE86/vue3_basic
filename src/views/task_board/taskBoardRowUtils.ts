import type { BoardSection } from './taskBoardTypes'

/** 主表「转写」列（与 rowStatusNorm/video_match_transcribe 口径一致，供模板单独上色） */
export function vmParseColStatus(r: Record<string, unknown>): string {
  const ps = String(r.parse_status ?? '').toLowerCase()
  if (ps === 'failed') return 'failed'
  if (ps === 'done') return 'success'
  if (ps === 'running' || ps === 'pending' || ps === 'processing') return 'running'
  return ps || 'unknown'
}

export function rowCreatedAt(r: Record<string, unknown>): Date | null {
  return parseApiDateTime(r.created_at as string | undefined)
}

export function rowUpdatedAt(r: Record<string, unknown>): Date | null {
  return parseApiDateTime(r.updated_at as string | undefined)
}

/** 本轮异步运行开始时间（重试时会刷新）；生图看板耗时时优先于 created_at */
export function rowCurrentRunStartedAt(r: Record<string, unknown>): Date | null {
  return parseApiDateTime(r.current_run_started_at as string | undefined)
}

/**
 * 解析接口时间。列表 `duration_ms` 已由后端计算；此处仍用于创建时间展示与筛选。
 * 无 `Z`/偏移的 `YYYY-MM-DDTHH:mm:ss` 在本项目中与带 `Z` 字段混用时浏览器会按**本地**解析，
 * 易与 UTC 字段差 8h；接口已统一输出 Z，若仍遇到裸 ISO 则按 **UTC** 解释以与 `…Z` 一致。
 */
export function parseApiDateTime(v: string | number | undefined): Date | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof v !== 'string') return null
  const raw = v.trim()
  if (!raw) return null
  let s = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
    s = `${s}Z`
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export function rowDurationStartForImage(r: Record<string, unknown>): Date | null {
  return rowCurrentRunStartedAt(r) ?? rowCreatedAt(r)
}

function formatDurationMs(ms: number): string {
  if (ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${Math.floor(ms / 1000)} s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m} 分 ${s} 秒`
}

export function rowDurationLabel(
  r: Record<string, unknown>,
  section: BoardSection,
  /** 由模板传入 `durationTick`（解包后的数值），用于进行中任务每秒刷新耗时展示 */
  durationTickValue: number,
): string {
  if (section === 'image') {
    const st = rowStatusNorm(r, section)
    if (st !== 'running') {
      const dm = r.duration_ms
      if (typeof dm === 'number' && Number.isFinite(dm) && dm >= 0) {
        return formatDurationMs(dm)
      }
    }
    const start = rowDurationStartForImage(r)
    if (!start) return '—'
    if (st === 'running') {
      void durationTickValue
      return formatDurationMs(Date.now() - start.getTime())
    }
    const ua = rowUpdatedAt(r)
    if (!ua) return '—'
    return formatDurationMs(ua.getTime() - start.getTime())
  }

  if (section === 'video_match_search') {
    const st = rowStatusNorm(r, section)
    const em = r.elapsed_ms
    if (st !== 'running' && typeof em === 'number' && Number.isFinite(em) && em >= 0) {
      return formatDurationMs(em)
    }
    const ca = rowCreatedAt(r)
    if (!ca) return '—'
    if (st === 'running') {
      void durationTickValue
      return formatDurationMs(Date.now() - ca.getTime())
    }
    return '—'
  }

  if (section === 'video_match_transcribe') {
    const st = rowStatusNorm(r, section)
    const ca = rowCreatedAt(r)
    if (!ca) return '—'
    const parseLive = vmParseColStatus(r) === 'running'
    const liveTranscribe = st === 'running' || parseLive
    if (liveTranscribe) {
      void durationTickValue
      return formatDurationMs(Date.now() - ca.getTime())
    }
    const ua = rowUpdatedAt(r)
    if (!ua) return '—'
    return formatDurationMs(ua.getTime() - ca.getTime())
  }

  const ca = rowCreatedAt(r)
  if (!ca) return '—'
  if (section === 'video' && rowStatusNorm(r, section) === 'running') {
    void durationTickValue
    return formatDurationMs(Date.now() - ca.getTime())
  }
  const ua = rowUpdatedAt(r)
  if (!ua) return '—'
  return formatDurationMs(ua.getTime() - ca.getTime())
}

export function rowStatusNorm(r: Record<string, unknown>, section: BoardSection): string {
  if (section === 'image') {
    const s = ((r.status as string) || '').toLowerCase()
    if (r.error) return 'failed'
    if (s === 'failed' || s === 'error') return 'failed'
    if (s === 'running' || s === 'pending') return 'running'
    if (r.url || r.obs_url || r.doubao_url) return 'success'
    if (s === 'success' || s === 'succeed' || s === 'succeeded') return 'success'
    return s || 'unknown'
  }
  if (section === 'video') {
    const raw = String(r.status ?? '').trim()
    const s = raw.toLowerCase()
    if (s === 'failed' || s === 'error') return 'failed'
    if (s === 'running' || s === 'pending') return 'running'
    if (s === 'success' || s === 'succeed' || s === 'succeeded') return 'success'
    return raw ? raw.toLowerCase() : 'unknown'
  }
  if (section === 'video_match_transcribe') {
    const ps = String(r.parse_status ?? '').toLowerCase()
    if (ps === 'failed') return 'failed'
    if (ps === 'running' || ps === 'pending' || ps === 'processing') return 'running'
    if (ps === 'done') return 'success'
    return ps || 'unknown'
  }
  if (section === 'video_match_search') {
    const s = String((r.status as string) ?? '').toLowerCase()
    if (s === 'failed') return 'failed'
    if (s === 'running' || s === 'pending') return 'running'
    if (s === 'done') return 'success'
    return s || 'unknown'
  }
  return 'unknown'
}

export function vmRowNeedsLiveDurationTick(r: Record<string, unknown>, section: BoardSection): boolean {
  if (section === 'video_match_transcribe') {
    const st = rowStatusNorm(r, section)
    return st === 'running' || vmParseColStatus(r) === 'running'
  }
  if (section === 'video_match_search') {
    const st = rowStatusNorm(r, section)
    return st === 'running'
  }
  return false
}
