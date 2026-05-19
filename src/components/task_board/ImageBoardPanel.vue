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

const emit = defineEmits(['detail', 'retry'])
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
        <el-table-column label="总状态" width="104" align="center">
          <template #default="{ row }">
            <el-tag
              :type="statusTagType(rowStatusNorm(row, 'image'))"
              effect="light"
              size="small"
              class="status-pill status-tag-admin"
            >
              {{ statusLabel(rowStatusNorm(row, 'image')) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提示词" min-width="140">
          <template #default="{ row }">
            <span class="prompt-clip" :title="row.prompt != null && String(row.prompt).trim() ? String(row.prompt) : ''">
              {{ imagePromptPreview(row) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="168">
          <template #default="{ row }">
            {{ rowCreatedAt(row)?.toLocaleString() ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="120" align="center">
          <template #default="{ row }">
            {{ rowDurationLabel(row, 'image', durationTick) }}
          </template>
        </el-table-column>
        <el-table-column prop="model" label="模型" width="130" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="72" />
        <el-table-column label="操作" width="168" fixed="right" align="center">
          <template #default="{ row }">
            <div class="op-links">
              <el-button type="primary" link @click="openDetail(row)">查看详情</el-button>
              <el-button
                v-if="rowStatusNorm(row, 'image') === 'failed'"
                type="primary"
                link
                :loading="imageRetryingId === detailLookupKey(row)"
                @click="retryImageRow(row)"
              >
                重试
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
</template>