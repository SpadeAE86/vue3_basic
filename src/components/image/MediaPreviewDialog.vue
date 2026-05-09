<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  url: string
  /** 文生图 / 图生图 / 文生视频 / 图生视频 */
  mediaType: string
  prompt?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)

const isVideo = computed(() => props.mediaType.includes('v'))

const promptText = computed(() => props.prompt?.trim() || '—')

watch(
  () => props.modelValue,
  (open) => {
    if (!open && videoRef.value) {
      videoRef.value.pause()
      videoRef.value.currentTime = 0
    }
  },
)

function onClosed() {
  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.currentTime = 0
  }
}

function onVisibleChange(v: boolean) {
  emit('update:modelValue', v)
}

function close() {
  onVisibleChange(false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    class="media-preview-dialog"
    title=""
    :show-close="false"
    width="fit-content"
    append-to-body
    align-center
    destroy-on-close
    :close-on-click-modal="true"
    @update:model-value="onVisibleChange"
    @closed="onClosed"
  >
    <div class="preview-shell">
      <button type="button" class="close-fab" aria-label="关闭" @click="close">
        <el-icon :size="20"><i-ep-close /></el-icon>
      </button>

      <div class="preview-media">
        <video
          v-if="isVideo"
          ref="videoRef"
          :key="url"
          :src="url"
          class="media-contain"
          controls
          playsinline
          preload="metadata"
        />
        <img v-else :src="url" alt="" class="media-contain" />
      </div>

      <aside class="preview-prompt">
        <p class="prompt-body">{{ promptText }}</p>
      </aside>
    </div>
  </el-dialog>
</template>

<style scoped>
.preview-shell {
  position: relative;
  display: flex;
  width: 100%;
  /* 上下留出视口空隙，避免贴顶、底侧留白过大 */
  height: min(94vh, calc(100dvh - 6vh));
  max-height: calc(100dvh - 12vh);
  min-height: 260px;
  background: #000;
  border-radius: 32px;
  overflow: hidden;
}

.close-fab {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 20;·
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 50%;
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
  cursor: pointer;
  transition: background 0.2s;
}

.close-fab:hover {
  background: rgba(255, 255, 255, 0.22);
}

.preview-media {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  border-radius: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  padding: 0px 0px;
  box-sizing: border-box;
}

/* 完整显示画面：contain，不裁切；宽度优先撑满列，高度随比例落在列高内 */
.media-contain {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  object-position: center;
}

.preview-prompt {
  flex: 0 0 clamp(260px, 30vw, 400px);
  box-sizing: border-box;
  padding: 24px 22px 24px 20px;
  overflow-y: auto;
  overflow-x: hidden;
  color: #fff;
  background: #000;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.prompt-body {
  margin: 0;
  font-size: 17px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  color: #fff;
}
</style>

<style>
.el-dialog {
  padding: 0;
  margin: 10vh auto !important;
  max-height: calc(100dvh - 5vh);
  background: transparent !important;
  box-shadow: none !important;
  border-radius: 32px;
  overflow: hidden;
}

.media-preview-dialog .el-dialog__header {
  display: none !important;
}

.media-preview-dialog .el-dialog__body {
  padding: 0;
  background: transparent;
  border-radius: 16px;
  overflow: hidden;
  max-height: 96dvh;
}
</style>
