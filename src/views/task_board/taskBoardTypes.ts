export type BoardSection =
  | 'image'
  | 'video'
  | 'video_match_transcribe'
  | 'video_match_tag'
  | 'video_match_search'

export function isVmBoard(s: BoardSection): boolean {
  return s === 'video_match_transcribe' || s === 'video_match_search'
}
