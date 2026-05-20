<script setup lang="ts">
const props = defineProps<{
  selectedFiles: File[]
  isSubmittingBatch: boolean
  MAX_BATCH_VIDEOS: number
}>()

const emit = defineEmits<{
  (e: 'update:selectedFiles', files: File[]): void
  (e: 'handleFileChange', evt: any): void
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
            @change="emit('handleFileChange', $event)"
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
