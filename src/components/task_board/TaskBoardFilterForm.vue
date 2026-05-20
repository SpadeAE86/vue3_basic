<script setup lang="ts">
import { isVmBoard } from '@/views/task_board/taskBoardTypes'

const props = defineProps<{
  dateRange: [Date, Date] | null
  statusFilter: string
  idSearchFilter: string
  workspaceFilter: string
  boardSection: string
}>()

const emit = defineEmits<{
  (e: 'update:dateRange', val: [Date, Date] | null): void
  (e: 'update:statusFilter', val: string): void
  (e: 'update:idSearchFilter', val: string): void
  (e: 'update:workspaceFilter', val: string): void
  (e: 'search'): void
  (e: 'reset'): void
}>()
</script>

<template>
<el-form :inline="true" class="filter-form" @submit.prevent>
        <el-form-item label="创建时间">
          <el-date-picker
            :model-value="props.dateRange" @update:model-value="emit('update:dateRange', $event)"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            style="width: 340px"
          />
        </el-form-item>
        <el-form-item label="总状态">
          <el-select :model-value="props.statusFilter" @update:model-value="emit('update:statusFilter', $event)" clearable placeholder="请选择状态" style="width: 160px">
            <el-option label="成功" value="success" />
            <el-option label="失败" value="failed" />
            <el-option label="进行中" value="running" />
          </el-select>
        </el-form-item>
        <el-form-item label="记录 ID">
          <el-input
            :model-value="props.idSearchFilter" @update:model-value="emit('update:idSearchFilter', $event)"
            clearable
            placeholder="子串匹配：履历 ID、视频匹配任务/分镜、VA 上下文等"
            style="width: 260px"
            @keyup.enter="emit('search')"
          />
        </el-form-item>
        <el-form-item v-if="boardSection === 'video' || isVmBoard(boardSection)" label="工作区">
          <el-select :model-value="props.workspaceFilter" @update:model-value="emit('update:workspaceFilter', $event)" clearable placeholder="全部" style="width: 120px">
            <el-option label="v1" value="v1" />
            <el-option label="v2" value="v2" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="emit('search')">查询</el-button>
          <el-button @click="emit('reset')">重置</el-button>
        </el-form-item>
      </el-form>
</template>
