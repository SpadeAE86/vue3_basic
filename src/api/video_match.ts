const API_BASE = '/api'

export interface VideoMatchHitDto {
  _id?: string
  _score?: number | null
  history_id?: string
  video_path?: string
}

export interface VideoMatchShotDto {
  id: number | null
  shot_order: number
  storyboard_id: number
  segment_text: string
  duration_sec: number
  description: string
  tags_summary: string
  tags_json: Record<string, unknown>
  search_status: string
  top1_obs_url: string | null
  top5_video_urls?: string[]
  obs_audio_url?: string | null
  match_top_hits_json?: VideoMatchHitDto[] | null
  match_elapsed_ms?: number | null
  match_hit_count?: number
  search_request_id?: string | null
}

export interface VideoMatchJobSummary {
  id: string
  workspace?: string | null
  parse_status?: string
  search_status?: string | null
  title?: string | null
  topic?: string | null
  car_model?: string | null
  frame_size?: string | null
  frame_orientation?: string | null
  created_at?: string | null
  updated_at?: string | null
  request_id?: string | null
}

export interface VideoMatchJobListResponse {
  success: boolean
  jobs?: VideoMatchJobSummary[]
  error?: string
}

export interface VideoMatchJobResponse {
  success: boolean
  mock?: boolean
  job_id?: string
  request_id?: string | null
  /** 创建任务时的口播与元数据（历史载入时回填表单） */
  script?: string
  topic?: string | null
  title?: string | null
  car_model?: string | null
  frame_size?: string | null
  frame_orientation?: string | null
  parse_status?: string
  parse_error?: string | null
  workspace?: string
  search_status?: string | null
  search_total_ms?: number | null
  search_error?: string | null
  search_strategy_snapshot?: Record<string, unknown> | null
  shots?: VideoMatchShotDto[]
  error?: string
}

export async function listVideoMatchJobsApi(params?: {
  parse_status?: string
  workspace?: string
  limit?: number
}): Promise<VideoMatchJobListResponse> {
  const sp = new URLSearchParams()
  if (params?.parse_status) sp.set('parse_status', params.parse_status)
  if (params?.workspace) sp.set('workspace', params.workspace)
  if (params?.limit != null) sp.set('limit', String(params.limit))
  const q = sp.toString()
  const resp = await fetch(`${API_BASE}/video-match/jobs${q ? `?${q}` : ''}`)
  if (!resp.ok) {
    return { success: false, error: `HTTP ${resp.status}` }
  }
  return resp.json() as Promise<VideoMatchJobListResponse>
}

export async function createVideoMatchJobApi(body: {
  script: string
  topic?: string
  title?: string
  car_model?: string
  frame_size?: string
  frame_orientation?: string
  workspace?: string
  mock?: boolean
}): Promise<VideoMatchJobResponse> {
  const resp = await fetch(`${API_BASE}/video-match/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return resp.json() as Promise<VideoMatchJobResponse>
}

export async function getVideoMatchJobApi(jobId: string): Promise<VideoMatchJobResponse> {
  const resp = await fetch(`${API_BASE}/video-match/jobs/${encodeURIComponent(jobId)}`)
  if (!resp.ok) {
    return { success: false, error: `HTTP ${resp.status}` }
  }
  return resp.json() as Promise<VideoMatchJobResponse>
}

export async function searchVideoMatchJobApi(
  jobId: string,
  body: { strategy_name: string; mode?: string; top_k?: number },
): Promise<VideoMatchJobResponse> {
  const resp = await fetch(`${API_BASE}/video-match/jobs/${encodeURIComponent(jobId)}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      strategy_name: body.strategy_name,
      mode: body.mode ?? 'field_aligned_hybrid',
      top_k: body.top_k ?? 5,
    }),
  })
  return resp.json() as Promise<VideoMatchJobResponse>
}

export interface VideoMatchShotDetailResponse {
  success: boolean
  detail?: Record<string, unknown>
  shot?: VideoMatchShotDto
  error?: string
}

export async function getVideoMatchShotDetailApi(
  jobId: string,
  shotRowId: number,
): Promise<VideoMatchShotDetailResponse> {
  const resp = await fetch(
    `${API_BASE}/video-match/jobs/${encodeURIComponent(jobId)}/shots/${shotRowId}/detail`,
  )
  if (!resp.ok) {
    return { success: false, error: `HTTP ${resp.status}` }
  }
  return resp.json() as Promise<VideoMatchShotDetailResponse>
}

export async function rematchVideoMatchShotApi(
  jobId: string,
  shotRowId: number,
): Promise<VideoMatchShotDetailResponse> {
  const resp = await fetch(
    `${API_BASE}/video-match/jobs/${encodeURIComponent(jobId)}/shots/${shotRowId}/rematch`,
    { method: 'POST' },
  )
  const data = (await resp.json().catch(() => ({}))) as VideoMatchShotDetailResponse & {
    detail?: string
  }
  if (!resp.ok) {
    const msg =
      typeof data.detail === 'string' ? data.detail : typeof data.error === 'string' ? data.error : `HTTP ${resp.status}`
    return { success: false, error: msg }
  }
  return data as VideoMatchShotDetailResponse
}

export async function synthesizeShotAudioApi(
  jobId: string,
  shotRowId: number,
): Promise<{ success: boolean; shot?: VideoMatchShotDto; error?: string }> {
  const resp = await fetch(
    `${API_BASE}/video-match/jobs/${encodeURIComponent(jobId)}/shots/${shotRowId}/audio`,
    { method: 'POST' },
  )
  return resp.json() as Promise<{ success: boolean; shot?: VideoMatchShotDto; error?: string }>
}

/** 启动混剪合成（异步流水线：转码 → 拼请求体 → 下发/ mock → 轮询） */
export async function startMixComposeApi(
  jobId: string,
  opts?: { mock?: boolean; prefer_srt?: boolean },
): Promise<{
  compose_id?: string
  biz_id?: string | number
  status?: string
  prefer_srt?: boolean
  detail?: string
}> {
  const body: Record<string, unknown> = {}
  if (opts && typeof opts.mock === 'boolean') {
    body.mock = opts.mock
  }
  if (opts && typeof opts.prefer_srt === 'boolean') {
    body.prefer_srt = opts.prefer_srt
  }
  const resp = await fetch(
    `${API_BASE}/video-match/jobs/${encodeURIComponent(jobId)}/mix-compose`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const data = (await resp.json()) as {
    compose_id?: string
    biz_id?: string | number
    status?: string
    detail?: string
  }
  if (!resp.ok) {
    const detail =
      (data as { detail?: string }).detail ||
      (data as { message?: string }).message ||
      `HTTP ${resp.status}`
    return { detail }
  }
  return data
}

export interface MixComposeJobDto {
  compose_id: string
  biz_id: string | number
  video_match_job_id?: string | null
  status: string
  error_message?: string | null
  result_obs_url?: string | null
  prefer_srt?: boolean
  result_srt_text?: string | null
  request_json?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
}

export async function getMixComposeApi(composeId: string): Promise<MixComposeJobDto | null> {
  const resp = await fetch(`${API_BASE}/video-mix/compose/${encodeURIComponent(composeId)}`)
  if (!resp.ok) {
    return null
  }
  return resp.json() as Promise<MixComposeJobDto>
}
