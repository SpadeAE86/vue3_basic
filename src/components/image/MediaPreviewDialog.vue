<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElImageViewer } from 'element-plus'
import type { CollectionItem } from '@/stores/collections'
import TagsPanelOverlay from '../collections/TagsPanelOverlay.vue'
import PromptDock from './PromptDock.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  url: string
  /** 文生图 / 图生图 / 文生视频 / 图生视频 */
  mediaType: string
  prompt?: string
  tags?: string[]
  spaceName?: string
  referenceMedia?: Array<{ url: string; type: string }>
  showCarousel?: boolean
  item?: CollectionItem
}>(), {
  showCarousel: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update-tags', tags: string[]): void
  (e: 'prefill'): void
  (e: 'prev'): void
  (e: 'next'): void
}>()

const refPreviewUrl = ref<string | null>(null)
const refPreviewType = ref<string>('image')

function openRefPreview(url: string, type: string = 'image') {
  refPreviewUrl.value = url
  refPreviewType.value = type
}

function handlePrefillBtn() {
  emit('prefill')
}

const videoRef = ref<HTMLVideoElement | null>(null)

const isVideo = computed(() => {
  const t = props.mediaType.toLowerCase()
  return t.includes('v') || props.url.toLowerCase().endsWith('.mp4') || props.url.toLowerCase().endsWith('.webm')
})

const promptText = computed(() => props.prompt?.trim() || '—')

const showPromptPanel = ref(true)
const showTagPanel = ref(true)
const localTags = ref<string[]>([])
const isAddingTag = ref(false)
const newTagInput = ref('')
const addTagInputRef = ref<HTMLInputElement | null>(null)

watch(() => props.tags, (newTags) => {
  localTags.value = [...(newTags || [])]
  showTagPanel.value = newTags !== undefined
}, { immediate: true })

function startAddTag() {
  isAddingTag.value = true
  nextTick(() => {
    addTagInputRef.value?.focus()
  })
}

function handleSaveTag() {
  const raw = newTagInput.value.trim()
  if (raw) {
    const parts = raw.split(/[,，;；\s]+/).map(s => s.trim()).filter(Boolean)
    let changed = false
    for (const p of parts) {
      if (!localTags.value.includes(p)) {
        localTags.value.push(p)
        changed = true
      }
    }
    if (changed) {
      emit('update-tags', localTags.value)
    }
  }
  newTagInput.value = ''
  isAddingTag.value = false
}

function handleRemoveTag(tag: string) {
  localTags.value = localTags.value.filter(t => t !== tag)
  emit('update-tags', localTags.value)
}

function handleKeyDown(event: KeyboardEvent) {
  if (!props.modelValue) return
  
  // Skip if user is typing in inputs or textareas
  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    emit('prev')
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    emit('next')
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open && videoRef.value) {
      videoRef.value.pause()
      videoRef.value.currentTime = 0
    }
  }
)

onMounted(() => {
  if (props.showCarousel) {
    window.addEventListener('keydown', handleKeyDown, true) // Capture phase to pre-empt media player/focus-trap handlers
  }
})

onUnmounted(() => {
  if (props.showCarousel) {
    window.removeEventListener('keydown', handleKeyDown, true)
  }
})

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
    <div class="dialog-content-wrapper">
      <!-- Left and Right navigation buttons -->
      <button v-if="showCarousel" type="button" class="nav-arrow nav-arrow-left" @click.stop="emit('prev')" aria-label="上一张">
        <el-icon :size="24"><i-ep-arrow-left /></el-icon>
      </button>
      <button v-if="showCarousel" type="button" class="nav-arrow nav-arrow-right" @click.stop="emit('next')" aria-label="下一张">
        <el-icon :size="24"><i-ep-arrow-right /></el-icon>
      </button>

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

        <!-- Center Bottom Prompt Dock Overlay -->
        <PromptDock
          v-model:visible="showPromptPanel"
          :prompt="promptText"
          :reference-media="referenceMedia"
          @prefill="handlePrefillBtn"
          @click-reference="payload => openRefPreview(payload.url, payload.type)"
        />

        <!-- Floating Tags Panel Overlay (Collections only) -->
        <TagsPanelOverlay
          v-if="tags !== undefined && item"
          :item="item"
          v-model:visible="showTagPanel"
        />
      </div>
    </div>

  <!-- 外部弹窗，解决二次预览挂载 -->
    <ElImageViewer
      v-if="refPreviewUrl && refPreviewType === 'image'"
      :url-list="[refPreviewUrl]"
      @close="refPreviewUrl = null"
      teleported
    />
    <el-dialog
      v-else-if="refPreviewUrl && refPreviewType === 'video'"
      :model-value="true"
      append-to-body
      align-center
      width="fit-content"
      class="video-preview-inner-dialog"
      @close="refPreviewUrl = null"
    >
      <video :src="refPreviewUrl" controls autoplay style="max-width: 90vw; max-height: 90vh;" />
    </el-dialog>
  </el-dialog>
</template>

<style scoped>
.preview-shell {
  position: relative;
  display: flex;
  width: 100%;
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
  z-index: 20;
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
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  padding: 0px 0px;
  box-sizing: border-box;
}

.media-contain {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  object-position: center;
}

</style>

<style>
/* 必须带 .media-preview-dialog：避免全局污染 */
.el-dialog.media-preview-dialog {
  padding: 0;
  margin: 10vh auto !important;
  max-height: calc(100dvh - 5vh);
  background: transparent !important;
  box-shadow: none !important;
  border-radius: 32px;
  overflow: visible;
}

.media-preview-dialog .el-dialog__header {
  display: none !important;
}

.media-preview-dialog .el-dialog__body {
  padding: 0;
  background: transparent;
  border-radius: 16px;
  overflow: visible;
  max-height: 96dvh;
}

.dialog-content-wrapper {
  position: relative;
  overflow: visible;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1000;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(8px);
}

.nav-arrow:hover {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.35);
  color: #ffffff;
  transform: translateY(-50%) scale(1.15);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.nav-arrow-left {
  left: -76px;
}

.nav-arrow-right {
  right: -76px;
}

@media (max-width: 1024px) {
  .nav-arrow-left {
    left: 8px;
    background: rgba(0, 0, 0, 0.4);
  }
  .nav-arrow-right {
    right: 8px;
    background: rgba(0, 0, 0, 0.4);
  }
}
</style>
