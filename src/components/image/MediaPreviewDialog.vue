<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'

const props = defineProps<{
  modelValue: boolean
  url: string
  /** 文生图 / 图生图 / 文生视频 / 图生视频 */
  mediaType: string
  prompt?: string
  tags?: string[]
  spaceName?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update-tags', tags: string[]): void
}>()

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

      <div class="preview-panels-wrapper">
        <!-- Prompt panel -->
        <aside v-show="showPromptPanel" class="preview-panel prompt-panel">
          <div class="panel-header">
            <span class="panel-title">提示词</span>
            <button class="toggle-panel-btn" @click="showPromptPanel = false">隐藏</button>
          </div>
          <p class="prompt-body">{{ promptText }}</p>
        </aside>

        <!-- Tag panel -->
        <aside v-show="showTagPanel" class="preview-panel tag-panel">
          <div class="panel-header">
            <span class="panel-title">标签管理</span>
            <button class="toggle-panel-btn" @click="showTagPanel = false">隐藏</button>
          </div>

          <!-- Collection folder/category tag -->
          <div class="space-section">
            <div class="section-subtitle">所属空间</div>
            <span v-if="spaceName" class="space-tag-pill">
              <el-icon><i-ep-folder /></el-icon> {{ spaceName }}
            </span>
            <span v-else class="space-tag-pill empty">未分类</span>
          </div>

          <!-- Item tags list -->
          <div class="tags-section">
            <div class="section-subtitle">内容标签</div>
            <div class="tags-list">
              <span v-for="(tag, idx) in localTags" :key="idx" class="tag-pill-item">
                {{ tag }}
                <span class="tag-pill-remove" @click="handleRemoveTag(tag)">×</span>
              </span>
              
              <!-- Add tag input -->
              <div v-if="isAddingTag" class="add-tag-form">
                <input
                  ref="addTagInputRef"
                  v-model="newTagInput"
                  class="add-tag-input"
                  placeholder="新标签..."
                  @keyup.enter="handleSaveTag"
                  @blur="handleSaveTag"
                />
              </div>
              <button v-else class="add-tag-btn" @click="startAddTag" title="添加标签">
                <el-icon><i-ep-plus /></el-icon>
              </button>
            </div>
          </div>
        </aside>

        <!-- Collapsed triggers -->
        <div class="collapsed-triggers">
          <button v-if="!showPromptPanel" class="trigger-btn" @click="showPromptPanel = true">
            <el-icon><i-ep-document /></el-icon> 显示提示词
          </button>
          <button v-if="!showTagPanel" class="trigger-btn" @click="showTagPanel = true">
            <el-icon><i-ep-price-tag /></el-icon> 显示标签
          </button>
        </div>
      </div>
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

.preview-panels-wrapper {
  display: flex;
  height: 100%;
  background: #111;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.preview-panel {
  width: 280px;
  box-sizing: border-box;
  padding: 20px;
  overflow-y: auto;
  color: #fff;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preview-panel:last-child {
  border-right: none;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 8px;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #a78bfa;
}

.toggle-panel-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.toggle-panel-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.prompt-body {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: rgba(255, 255, 255, 0.9);
}

/* Tag styles inside preview dialog */
.space-section, .tags-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-subtitle {
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
}

.space-tag-pill {
  background: rgba(124, 58, 237, 0.2);
  border: 1px solid rgba(124, 58, 237, 0.4);
  color: #ddd6fe;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
}

.space-tag-pill.empty {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.3);
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.tag-pill-item {
  background: rgba(5, 150, 105, 0.2);
  border: 1px solid rgba(5, 150, 105, 0.4);
  color: #a7f3d0;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tag-pill-remove {
  cursor: pointer;
  color: rgba(255, 255, 255, 0.4);
  font-weight: bold;
  margin-left: 2px;
}

.tag-pill-remove:hover {
  color: #ef4444;
}

.add-tag-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px dashed rgba(255, 255, 255, 0.3);
  background: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.add-tag-btn:hover {
  border-color: #a78bfa;
  color: #a78bfa;
}

.add-tag-form {
  display: inline-flex;
}

.add-tag-input {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 11px;
  outline: none;
  width: 80px;
}

.add-tag-input:focus {
  border-color: #a78bfa;
}

/* Collapsed triggers */
.collapsed-triggers {
  position: absolute;
  right: 14px;
  bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
  pointer-events: auto;
}

.trigger-btn {
  background: rgba(30, 30, 38, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  transition: all 0.2s;
}

.trigger-btn:hover {
  background: #a78bfa;
  border-color: #a78bfa;
}
</style>

<style>
/* 必须带 .media-preview-dialog：裸 .el-dialog 会全局污染所有弹窗（打开媒体预览后其它对话框背景被透明化）。 */
.el-dialog.media-preview-dialog {
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
