<script setup lang="ts">
import { computed } from 'vue'
import { Position } from '@element-plus/icons-vue'
import {
  rowCreatedAt,
  rowDurationLabel,
  rowStatusNorm,
  vmParseColStatus,
  vmRowNeedsLiveDurationTick,
} from '@/views/task_board/taskBoardRowUtils'

const statusLabel = (st: string) => {
  if (st === 'success') return '成功'
  if (st === 'failed') return '失败'
  if (st === 'running') return '进行中'
  return '未知'
}

const statusTagType = (st: string): 'success' | 'danger' | 'warning' | 'info' => {
  if (st === 'success') return 'success'
  if (st === 'failed') return 'danger'
  if (st === 'running') return 'warning'
  return 'info'
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


const props = defineProps<{
  rows: Record<string, unknown>[]
  loading: boolean
  durationTick: number
}>()

const emit = defineEmits(['detail', 'retry', 'view-material', 'navigate-analysis'])
</script>

<template>
  <el-table
        v-loading="loading"
        :data="rows"
        stripe
        :border="false"
        class="admin-table"
        header-cell-class-name="admin-th"
        style="width: 100%"
      >
        <el-table-column prop="id" label="履历 ID" min-width="112" show-overflow-tooltip />
        <el-table-column label="来源" width="120" show-overflow-tooltip>
          <template #default="{ row }">
            {{ materialSourceLabel(row.source) }}
          </template>
        </el-table-column>
        <el-table-column label="总状态" width="104" align="center">
          <template #default="{ row }">
            <el-tag
              :type="statusTagType(rowStatusNorm(row, 'video_match_search'))"
              effect="light"
              size="small"
              class="status-pill status-tag-admin"
            >
              {{ statusLabel(rowStatusNorm(row, 'video_match_search')) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="检索摘要" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ shortStr(row.query_preview, 64) }}
          </template>
        </el-table-column>
        <el-table-column label="命中数" width="72" align="center">
          <template #default="{ row }">
            {{ row.hit_count != null ? row.hit_count : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="Top1 视频" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <a
              v-if="(row.top1_obs_url || '').trim()"
              class="match-url-link"
              :href="(row.top1_obs_url || '').trim()"
              target="_blank"
              rel="noopener noreferrer"
              >{{ shortStr(row.top1_obs_url, 36) }}</a
            >
            <span v-else class="muted-small">—</span>
          </template>
        </el-table-column>
        <el-table-column label="检索模板" min-width="168" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatMaterialStrategyTemplate(row.strategy_snapshot) }}
          </template>
        </el-table-column>
        <el-table-column label="模式" width="88" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.search_mode || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="168">
          <template #default="{ row }">
            {{ rowCreatedAt(row)?.toLocaleString() ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="120" align="center">
          <template #default="{ row }">
            {{ rowDurationLabel(row, 'video_match_search', durationTick) }}
          </template>
        </el-table-column>
        <el-table-column prop="workspace" label="工作区" width="88" />
        <el-table-column label="操作" width="240" fixed="right" align="center">
          <template #default="{ row }">
            <div class="op-links">
              <el-button type="primary" link @click="$emit('detail', row)">查看详情</el-button>
              <el-tooltip
                content="回到视频分析：若当时挂在某条分析上会直接定位；全库搜索则用本行检索摘要与模板权重自动再搜（与分镜跳转一致）"
                placement="top"
              >
                <el-button
                  class="va-jump-icon-btn"
                  :icon="Position"
                  circle
                  size="small"
                  :disabled="!canJumpVideoAnalysisFromMaterialRow(row)"
                  aria-label="跳转视频分析"
                  @click="$emit('navigate-analysis', row)"
                />
              </el-tooltip>
              <el-button
                v-if="materialMatchCanRetry(row)"
                type="primary"
                link
                
                @click="$emit('retry', row)"
              >
                重试
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
</template>