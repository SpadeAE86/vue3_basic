<script setup lang="ts">
import { computed } from 'vue'
import {
  rowCreatedAt,
  rowDurationLabel,
  rowStatusNorm,
  vmExtractColStatus,
  vmRowNeedsLiveDurationTick,
  statusTagType,
} from '@/views/task_board/taskBoardRowUtils'

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

const vmJobCanRetryExtract = (row: Record<string, unknown>) => { return vmExtractColStatus(row) === 'failed' }

const props = defineProps<{
  rows: Record<string, unknown>[]
  loading: boolean
  durationTick: number
}>()

const emit = defineEmits(['detail', 'retry', 'storyboard'])
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
        <el-table-column prop="id" label="任务 ID" min-width="120" show-overflow-tooltip />
        <el-table-column label="提取状态" width="104" align="center">
          <template #default="{ row }">
            <el-tag
              :type="statusTagType(vmExtractColStatus(row))"
              effect="light"
              size="small"
              class="status-pill status-tag-admin"
            >
              {{ statusLabel(vmExtractColStatus(row)) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="匹配状态" width="104" align="center">
          <template #default="{ row }">
            <el-tag
              :type="statusTagType((row.search_status || '').toString())"
              effect="light"
              size="small"
              class="status-pill status-tag-admin"
            >
              {{ statusLabel((row.search_status || '').toString()) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="标题/主题" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ vmJobTitle(row) }}
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="168">
          <template #default="{ row }">
            {{ rowCreatedAt(row)?.toLocaleString() ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="120" align="center">
          <template #default="{ row }">
            {{ rowDurationLabel(row, 'video_match_tag', durationTick) }}
          </template>
        </el-table-column>
        <el-table-column prop="workspace" label="工作区" width="88" />
        <el-table-column label="操作" width="220" fixed="right" align="center">
          <template #default="{ row }">
            <div class="op-links">
              <el-button type="primary" link @click="$emit('detail', row)">查看详情</el-button>
              <el-button type="primary" link @click="$emit('storyboard', row)">查看分镜</el-button>
              <el-button
                v-if="vmJobCanRetryExtract(row)"
                type="primary"
                link
                @click="$emit('retry', row)"
              >
                重试任务
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
</template>