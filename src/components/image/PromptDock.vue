<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  prompt?: string
  referenceMedia?: Array<{ url: string; type: string }>
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'prefill'): void
  (e: 'click-reference', payload: { url: string; type: string }): void
}>()

const promptText = computed(() => props.prompt?.trim() || '—')
</script>

<template>
  <div
    class="result-preview-prompt-dock"
    @mousedown.stop
    @touchstart.stop
  >
    <div v-show="visible" class="result-preview-prompt-inner">
      <div class="result-preview-prompt-head">
        <span class="result-preview-label">提示词</span>
        <el-button
          type="info"
          link
          size="small"
          class="result-preview-toggle-link"
          @click.stop="emit('update:visible', false)"
        >
          隐藏
        </el-button>
      </div>
      <p class="result-preview-text">{{ promptText }}</p>
      
      <!-- 参考图列表展示 -->
      <div v-if="referenceMedia && referenceMedia.length > 0" class="preview-reference-media-list">
        <div v-for="(media, index) in referenceMedia" :key="index" class="preview-reference-media-wrapper">
          <img
            v-if="media.type === 'image' || !media.type"
            :src="media.url"
            class="preview-reference-media-item"
            alt="参考图"
            @click.stop="emit('click-reference', { url: media.url, type: 'image' })"
          />
          <video
            v-else-if="media.type === 'video'"
            :src="media.url"
            class="preview-reference-media-item"
            @click.stop="emit('click-reference', { url: media.url, type: 'video' })"
          />
          <div
            v-else
            class="preview-reference-media-item audio-placeholder"
            title="参考音频"
            @click.stop="emit('click-reference', { url: media.url, type: 'audio' })"
          >
            🎵
          </div>
        </div>
      </div>

      <div class="result-preview-actions">
        <el-button type="primary" link size="small" @click.stop="emit('prefill')">
          去生成
        </el-button>
      </div>
    </div>
    
    <el-button
      v-show="!visible"
      type="primary"
      round
      size="small"
      class="result-preview-restore-btn"
      @click.stop="emit('update:visible', true)"
    >
      显示提示词
    </el-button>
  </div>
</template>

<style>
/* CSS rules are defined globally so they work inside ElImageViewer slot portals and custom video dialogs */
.result-preview-prompt-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2000;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 16px;
  box-sizing: border-box;
}

.result-preview-prompt-inner {
  pointer-events: auto;
  width: min(100%, 720px);
  max-height: min(30vh, 240px);
  overflow-y: auto;
  margin-bottom: 100px;
  padding: 12px 14px 10px;
  background: rgba(30, 30, 38, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  color: #fff;
}

.result-preview-prompt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.result-preview-toggle-link {
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.75) !important;
}

.result-preview-label {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.06em;
}

.result-preview-restore-btn {
  pointer-events: auto;
  margin-bottom: 100px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.result-preview-text {
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.95);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0 0 10px;
  text-align: left;
}

.result-preview-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 8px;
}

.preview-reference-media-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  justify-content: flex-start;
  width: 100%;
}

.preview-reference-media-wrapper {
  position: relative;
}

.preview-reference-media-item {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  cursor: pointer;
  object-fit: cover;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  background: #000;
  display: block;
}

.preview-reference-media-item:hover {
  transform: scale(1.4);
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  border-color: #a78bfa;
}

.audio-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
</style>
