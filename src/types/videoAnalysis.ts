/**
 * Shared type definitions for video analysis features.
 * Designed to be workspace-agnostic: the index-signature [key: string]: unknown
 * lets v1 and v2 ShotCards carry their respective extra fields without casting.
 */

export type ShotCard = {
  history_id?: string
  scene_id: number
  start_time: number
  end_time: number
  duration_seconds: number
  thumbnail?: string | null
  frame_urls?: string[]
  description?: string | null
  subject?: string | null
  object?: string[] | null
  movement?: string | null
  // v1 fields
  adjective?: string[] | null
  search_tags?: string[] | null
  marketing_tags?: string[] | null
  appealing_audience?: string[] | null
  visual_quality?: number[] | null
  // v2 fields (representative subset; extra fields are captured by [key])
  key_words?: string[] | null
  footage_type?: string | null
  shot_style?: string | null
  shot_type?: string | null
  camera_movement?: string | null
  scene_location?: string[] | null
  car_color?: string | null
  car_model?: string | null
  product_status_scene?: string | null
  has_presenter?: boolean | null
  person_detail?: string[] | null
  design_adjectives?: string[] | null
  function_adjectives?: string[] | null
  design_selling_points?: string[] | null
  function_selling_points?: string[] | null
  scenario_a?: string[] | null
  scenario_b?: string[] | null
  marketing_phrases?: string[] | null
  topic?: string | null
  weather?: string | null
  text?: string[] | null
  video_usage?: string[] | null
  // index status
  error?: string | null
  os_index_status?: 'PENDING' | 'OK' | 'FAILED' | string | null
  os_index_error?: string | null
  // Search result meta (injected by /search endpoint)
  _score?: number | null
  /** highlight: field → list of snippets with <em> tags wrapping matched terms */
  _highlight?: Record<string, string[]> | null
  /** 'precise' = BM25 only  /  'fuzzy' = BM25 + KNN hybrid */
  _search_mode?: 'precise' | 'fuzzy' | null
  /** Raw explanation tree from OpenSearch */
  _explanation?: any | null
  // Allow any additional workspace-specific fields
  [key: string]: unknown
}

export type VideoAnalysisHistoryItem = {
  id: string
  name: string
  time: string
  video_url?: string | null
  cards: ShotCard[]
}

export type UiShotCard = ShotCard & {
  /** Compound unique key: `${history_id}_${scene_id}` */
  id: number | string
  /** Human-readable time range, e.g. "00:03 - 00:07" */
  time: string
}

export type WorkspaceOption = {
  key: string
  label: string
  description: string
  is_default: boolean
}
