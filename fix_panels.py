import os

# 1. VideoMatchTranscribeBoardPanel
path = 'src/components/task_board/VideoMatchTranscribeBoardPanel.vue'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()
if 'durationTick: number' not in text:
    text = text.replace('loading: boolean', 'loading: boolean\n  durationTick: number')
if 'statusTagType' not in text:
    text = text.replace('vmRowNeedsLiveDurationTick,', 'vmRowNeedsLiveDurationTick,\n  statusTagType,')
if 'const statusLabel' not in text:
    stubs = '''
const statusLabel = (st: string) => {
  if (st === 'success') return '成功'
  if (st === 'failed') return '失败'
  if (st === 'running') return '进行中'
  return '未知'
}

const vmJobTitle = (row: Record<string, unknown>) => {
  const t = row.title != null && String(row.title).trim() ? String(row.title).trim() : ''
  const top = row.topic != null && String(row.topic).trim() ? String(row.topic).trim() : ''
  if (t && top) return `${t} / ${top}`
  return t || top || '—'
}

const vmJobCanRetryTranscribe = (row: Record<string, unknown>) => {
  return vmParseColStatus(row) === 'failed'
}
'''
    text = text.replace("} from '@/views/task_board/taskBoardRowUtils'", "} from '@/views/task_board/taskBoardRowUtils'\n" + stubs)

text = text.replace('openDetail(row)', "$emit('detail', row)")
text = text.replace('openStoryboard(row)', "$emit('storyboard', row)")
text = text.replace('retryVmJobRow(row)', "$emit('retry', row)")
# Remove loading prop for retry button
import re
text = re.sub(r':loading="vmRetryingId[^"]*"', '', text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)


# 2. VideoMatchSearchBoardPanel
path = 'src/components/task_board/VideoMatchSearchBoardPanel.vue'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()
if 'durationTick: number' not in text:
    text = text.replace('loading: boolean', 'loading: boolean\n  durationTick: number')
if 'statusTagType' not in text:
    text = text.replace('vmRowNeedsLiveDurationTick,', 'vmRowNeedsLiveDurationTick,\n  statusTagType,')

if 'import { Position }' not in text:
    text = text.replace("import { computed } from 'vue'", "import { computed } from 'vue'\nimport { Position } from '@element-plus/icons-vue'")

if 'const statusLabel' not in text:
    stubs = '''
const statusLabel = (st: string) => {
  if (st === 'success') return '成功'
  if (st === 'failed') return '失败'
  if (st === 'running') return '进行中'
  return '未知'
}

const shortStr = (s: unknown, n = 48) => {
  if (s == null) return '—'
  const t = String(s)
  return t.length > n ? `${t.slice(0, n)}…` : t
}

const materialSourceLabel = (src: unknown) => {
  if (src === 'video_match_shot') return '视频匹配-分镜'
  if (src === 'video_analysis_search') return '视频分析-手工'
  return String(src || '—')
}

const formatMaterialStrategyTemplate = (snap: unknown) => {
  if (!snap || typeof snap !== 'object') return '—'
  const bm25 = (snap as any).bm25_weight ?? 0.3
  const vec = (snap as any).vector_weight ?? 0.7
  const rrf = !!(snap as any).use_rrf
  return `BM25(${bm25}) / 向量(${vec}) ${rrf ? '[RRF]' : ''}`
}

const canJumpVideoAnalysisFromMaterialRow = (row: Record<string, unknown>): boolean => {
  const src = String(row.source ?? '')
  if (src === 'video_analysis_search') {
    if (String(row.va_context_history_id ?? '').trim()) return true
    return !!String(row.query_preview ?? '').trim()
  }
  if (src === 'video_match_shot') {
    return !!String(row.video_match_job_id ?? '').trim() && Number(row.video_match_shot_row_id ?? 0) > 0
  }
  return false
}

const materialMatchCanRetry = (row: Record<string, unknown>) => {
  return String(row.source) === 'video_match_shot' && rowStatusNorm(row, 'video_match_search') === 'failed'
}
'''
    text = text.replace("} from '@/views/task_board/taskBoardRowUtils'", "} from '@/views/task_board/taskBoardRowUtils'\n" + stubs)

text = text.replace('openDetail(row)', "$emit('detail', row)")
text = text.replace('goVideoAnalysisFromMaterialRow(row)', "$emit('navigate-analysis', row)")
text = text.replace('retryMaterialMatchRow(row)', "$emit('retry', row)")
text = re.sub(r':loading="mmRetryingKey[^"]*"', '', text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)


# 3. TaskBoardView.vue
path = 'src/views/TaskBoardView.vue'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Pass durationTick to components
text = text.replace(':loading="loading" :rows="pagedRows"', ':loading="loading" :rows="pagedRows" :durationTick="durationTick"')

# Add handleRetry that routes to the correct retry function
if 'const handleRetry =' not in text:
    stubs = '''
const handleRetry = (row: Record<string, unknown>) => {
  const s = boardSection.value
  if (s === 'image') retryImageRow(row)
  else if (s === 'video') retryVideoRow(row)
  else if (s === 'video_match_transcribe') retryVmJobRow(row)
  else if (s === 'video_match_search') retryMaterialMatchRow(row)
}
'''
    text = text.replace('async function openDetail(row: Record<string, unknown>) {', stubs + '\nasync function openDetail(row: Record<string, unknown>) {')

# Route handleOpenDetail
text = text.replace('@detail="handleOpenDetail"', '@detail="openDetail"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Done")
