<script setup lang="ts">
const props = defineProps<{
  selectedFiles: File[]
  isSubmittingBatch: boolean
  MAX_BATCH_VIDEOS: number
}>()

const emit = defineEmits<{
  (e: 'update:selectedFiles', files: File[]): void
  (e: 'handleFileChange', file: any, fileList: any[]): void
  (e: 'handleUploadExceed', files: any): void
  (e: 'openCarModelDialog'): void
}>()
</script>

<template>
<div class="va-upload-panel">
  <div class="va-upload-actions">
    <el-upload
      class="compact-uploader"
      action="#"
      :auto-upload="false"
      :show-file-list="false"
      multiple
      :limit="props.MAX_BATCH_VIDEOS"
      @change="(file: any, fileList: any[]) => emit('handleFileChange', file, fileList)"
      :on-exceed="(files: any) => emit('handleUploadExceed', files)"
      accept="video/*"
    >
      <el-button type="default">
        <el-icon class="el-icon--left"><i-ep-video-camera /></el-icon>
        选择视频
      </el-button>
    </el-upload>

    <span
      v-if="props.selectedFiles.length > 0"
      class="compact-file-info"
      :title="props.selectedFiles.map((f) => f.name).join(', ')"
    >
      已选 {{ props.selectedFiles.length }} 个文件
    </span>

    <el-button
      type="primary"
      @click="emit('openCarModelDialog')"
      :loading="props.isSubmittingBatch"
      :disabled="props.selectedFiles.length === 0"
    >
      {{ props.isSubmittingBatch ? '提交中...' : '开始分析' }}
    </el-button>
  </div>
</div>
</template>

<style scoped>
.va-upload-panel {
  padding: 0;
}
.va-upload-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
/* 取消 el-upload 默认的块级撑满 */
.compact-uploader {
  display: inline-flex;
}
:deep(.compact-uploader .el-upload) {
  display: inline-block;
}
.compact-file-info {
  font-size: 12px;
  color: #909399;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

