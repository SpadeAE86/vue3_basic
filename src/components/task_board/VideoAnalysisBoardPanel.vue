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
        <el-table-column prop="id" label="分析 ID" min-width="120" show-overflow-tooltip />
        <el-table-column label="总状态" width="104" align="center">
          <template #default="{ row }">
            <el-tag
              :type="statusTagType(rowStatusNorm(row, 'video'))"
              effect="light"
              size="small"
              class="status-pill status-tag-admin"
            >
              {{ statusLabel(rowStatusNorm(row, 'video')) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="产品名" min-width="100" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.car_model != null && String(row.car_model).trim() ? String(row.car_model).trim() : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="168">
          <template #default="{ row }">
            {{ rowCreatedAt(row)?.toLocaleString() ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="120" align="center">
          <template #default="{ row }">
            {{ rowDurationLabel(row, 'video', durationTick) }}
          </template>
        </el-table-column>
        <el-table-column label="视频标题" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ shortStr(row.name, 48) }}
          </template>
        </el-table-column>
        <el-table-column prop="workspace" label="工作区" width="88" />
        <el-table-column label="视频地址" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ shortStr(row.video_url, 40) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right" align="center">
          <template #default="{ row }">
            <div class="va-board-op">
              <el-button type="primary" link @click="openDetail(row)">查看详情</el-button>
              <el-button
                v-if="rowStatusNorm(row, 'video') === 'failed'"
                type="primary"
                link
                :loading="vaRetryingId === String(row.id ?? '').trim()"
                @click="retryVideoRow(row)"
              >
                重试
              </el-button>
              <el-tooltip content="在视频分析中打开此记录（已选工作区与历史）" placement="top">
                <el-button
                  class="va-jump-icon-btn"
                  :icon="VideoCamera"
                  circle
                  size="small"
                  aria-label="打开视频分析"
                  @click="goVideoAnalysisFromBoardRow(row)"
                />
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>
</template>