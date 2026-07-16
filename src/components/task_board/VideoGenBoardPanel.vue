<script setup lang="ts">
import {
  rowCreatedAt,
  rowDurationLabel,
  rowStatusNorm,
  statusTagType,
  imagePromptPreview,
} from '@/views/task_board/taskBoardRowUtils'

const statusLabel = (st: string) => {
  if (st === 'success') return '成功'
  if (st === 'failed') return '失败'
  if (st === 'running') return '进行中'
  return '未知'
}

defineProps<{
  rows: Record<string, unknown>[]
  loading: boolean
  durationTick: number
}>()

defineEmits(['detail', 'retry'])
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
          :type="statusTagType(rowStatusNorm(row, 'video_gen'))"
          effect="light"
          size="small"
          class="status-pill status-tag-admin"
        >
          {{ statusLabel(rowStatusNorm(row, 'video_gen')) }}
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
    <el-table-column label="参考图" width="100" align="center">
      <template #default="{ row }">
        <div v-if="row.referenceMedia && row.referenceMedia.length > 0" class="board-ref-images">
          <el-image
            v-for="(refItem, index) in row.referenceMedia.slice(0, 2)"
            :key="index"
            :src="refItem.url"
            class="board-ref-thumb"
            :preview-src-list="[refItem.url]"
            preview-teleported
            fit="cover"
          />
          <span v-if="row.referenceMedia.length > 2" class="board-ref-more">
            +{{ row.referenceMedia.length - 2 }}
          </span>
        </div>
        <span v-else>—</span>
      </template>
    </el-table-column>
    <el-table-column label="创建时间" min-width="168">
      <template #default="{ row }">
        {{ rowCreatedAt(row)?.toLocaleString() ?? '—' }}
      </template>
    </el-table-column>
    <el-table-column label="耗时" width="120" align="center">
      <template #default="{ row }">
        {{ rowDurationLabel(row, 'video_gen', durationTick) }}
      </template>
    </el-table-column>
    <el-table-column prop="model" label="模型" width="130" show-overflow-tooltip />
    <el-table-column prop="resolution" label="分辨率" width="90" align="center" show-overflow-tooltip />
    <el-table-column prop="ratio" label="比例" width="90" align="center" show-overflow-tooltip />
    <el-table-column label="时长" width="80" align="center">
      <template #default="{ row }">
        {{ row.duration != null ? `${row.duration}s` : '—' }}
      </template>
    </el-table-column>
    <el-table-column prop="type" label="类型" width="72" align="center" />
    <el-table-column label="操作" width="168" fixed="right" align="center">
      <template #default="{ row }">
        <div class="op-links">
          <el-button type="primary" link @click="$emit('detail', row)">查看详情</el-button>
          <el-button
            v-if="rowStatusNorm(row, 'video_gen') === 'failed'"
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

<style scoped>
.board-ref-images {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.board-ref-thumb {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid #ebeef5;
  cursor: pointer;
  display: block;
}
.board-ref-more {
  font-size: 11px;
  color: #909399;
  font-weight: bold;
}
</style>
