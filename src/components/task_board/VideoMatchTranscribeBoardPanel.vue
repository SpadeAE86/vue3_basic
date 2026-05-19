<script setup lang="ts">
import { computed } from 'vue'
import {
  rowCreatedAt,
  rowDurationLabel,
  rowStatusNorm,
  vmParseColStatus,
  vmRowNeedsLiveDurationTick,
} from '@/views/task_board/taskBoardRowUtils'

const props = defineProps<{
  rows: Record<string, unknown>[]
  loading: boolean
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
        <el-table-column label="转写状态" width="104" align="center">
          <template #default="{ row }">
            <el-tag
              :type="statusTagType(vmParseColStatus(row))"
              effect="light"
              size="small"
              class="status-pill status-tag-admin"
            >
              {{ statusLabel(vmParseColStatus(row)) }}
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
            {{ rowDurationLabel(row, 'video_match_transcribe', durationTick) }}
          </template>
        </el-table-column>
        <el-table-column prop="workspace" label="工作区" width="88" />
        <el-table-column label="操作" width="220" fixed="right" align="center">
          <template #default="{ row }">
            <div class="op-links">
              <el-button type="primary" link @click="openDetail(row)">查看详情</el-button>
              <el-button type="primary" link @click="openStoryboard(row)">查看分镜</el-button>
              <el-button
                v-if="vmJobCanRetryTranscribe(row)"
                type="primary"
                link
                :loading="vmRetryingId === String(row.id ?? '').trim()"
                @click="retryVmJobRow(row)"
              >
                重试
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
</template>