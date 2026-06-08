<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { GeneratedItem } from '@/types/generate'
import { copyToClipboard } from '@/utils/browser'
import MediaPreviewDialog from './MediaPreviewDialog.vue'

const props = defineProps<{
  item: GeneratedItem
  modelLabel: string
}>()

const previewOpen = ref(false)
/** 文生图/图生图：仅用 el-image 内嵌的 ElImageViewer（可缩放拖动）；勿再叠 MediaPreviewDialog */
const elImageRef = ref<{ showPreview?: () => void } | null>(null)

function openPreview() {
  if (!props.item.url || props.item.loading || props.item.error) return
  if (props.item.type.includes('v')) {
    previewOpen.value = true
    return
  }
  elImageRef.value?.showPreview?.()
}

function onMediaAreaClick(e: MouseEvent) {
  if (!props.item.url || props.item.loading || props.item.error) return
  const t = e.target as HTMLElement
  if (t.closest('.action-icons')) return
  if (props.item.type.includes('v')) {
    openPreview()
  }
}

const emit = defineEmits<{
  (e: 'delete', id: string): void
  (e: 'retry', id: string): void
}>()

/** 大图预览内提示词条显隐（关闭预览再打开会重置为显示） */
const viewerPromptVisible = ref(true)

function onImagePreviewShow() {
  viewerPromptVisible.value = true
}

async function copyPrompt(prompt: string) {
  const success = await copyToClipboard(prompt)
  if (success) {
    ElMessage.success('提示词已复制')
  } else {
    ElMessage.error('复制失败')
  }
}

async function copyToCanvas() {
  if (!props.item.url) return
  const data = {
    type: 'jottings-canvas-node',
    image_url: props.item.url,
    prompt: props.item.prompt || '',
    model: props.item.model || '',
    media_type: props.item.type.includes('v') ? 'video' : 'image'
  }
  const success = await copyToClipboard(JSON.stringify(data))
  if (success) {
    ElMessage.success('已复制卡片数据，可在画布页面按 Ctrl+V 粘贴为节点')
  } else {
    ElMessage.error('复制失败')
  }
}

function downloadImage(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = `generated_${new Date().getTime()}.png`
  a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function playVideo(e: Event) {
  const video = (e.currentTarget as HTMLElement).querySelector('video')
  if (video) video.play().catch(() => {})
}

function pauseVideo(e: Event) {
  const video = (e.currentTarget as HTMLElement).querySelector('video')
  if (video) video.pause()
}
</script>

<template>
  <div class="result-card" @mouseenter="playVideo" @mouseleave="pauseVideo">
    <MediaPreviewDialog
      v-if="item.url && item.type.includes('v')"
      v-model="previewOpen"
      :url="item.url"
      :media-type="item.type"
      :prompt="item.prompt"
    />

    <div class="result-header">
      <el-tag size="small" type="info">{{ modelLabel }}</el-tag>
      <el-tag size="small" :type="item.type.includes('i2') ? 'success' : 'primary'">
        {{ item.type === 'i2i' ? '图生图' : item.type === 't2i' ? '文生图' : item.type === 'i2v' ? '图生视频' : '文生视频' }}
      </el-tag>
    </div>
    
    <div class="result-content" :class="{ 'has-image': item.url }">
      <div v-if="item.loading" class="loading-wrapper">
        <el-icon class="is-loading" :size="40"><i-ep-loading /></el-icon>
        <span class="loading-text">正在生成...</span>
      </div>
      
      <div v-else-if="item.error" class="error-wrapper">
        <el-icon :size="40" color="#f56c6c"><i-ep-warning-filled /></el-icon>
        <span class="error-text">{{ item.error }}</span>
        <div class="error-actions">
          <el-tooltip v-if="!item.type.includes('v')" content="重试生成" placement="top">
            <div
              class="error-retry-btn"
              @click.stop="emit('retry', item.id)"
            >
              <el-icon><i-ep-refresh-right /></el-icon>
            </div>
          </el-tooltip>
          <div class="error-delete-btn" @click.stop="emit('delete', item.id)" title="删除记录">
            <el-icon><i-ep-delete /></el-icon>
          </div>
        </div>
      </div>
      
      <div
        v-else-if="item.url"
        class="image-wrapper is-clickable"
        role="button"
        tabindex="0"
        @click="onMediaAreaClick"
        @keydown.enter.prevent="openPreview"
        @keydown.space.prevent="openPreview"
      >
        <video v-if="item.type.includes('v')" :src="item.url ? item.url + '#t=0.001' : ''" class="generated-image" loop muted playsinline preload="metadata"></video>
        <el-image
          v-else
          ref="elImageRef"
          :src="item.url"
          fit="contain"
          class="generated-image-el"
          :preview-src-list="item.url ? [item.url] : []"
          preview-teleported
          @show="onImagePreviewShow"
        >
          <!-- 预览层插槽：与缩放/拖拽共存；右上角关闭与底部旋转/缩放等为 Element Plus 内置 -->
          <template #viewer>
            <div
              class="result-preview-prompt-dock"
              @mousedown.stop
              @touchstart.stop
            >
              <div v-show="viewerPromptVisible" class="result-preview-prompt-inner">
                <div class="result-preview-prompt-head">
                  <span class="result-preview-label">提示词</span>
                  <el-button
                    type="info"
                    link
                    size="small"
                    class="result-preview-toggle-link"
                    @click.stop="viewerPromptVisible = false"
                  >
                    隐藏
                  </el-button>
                </div>
                <p class="result-preview-text">{{ item.prompt?.trim() ? item.prompt : '—' }}</p>
                <div class="result-preview-actions">
                  <el-button type="primary" link size="small" @click.stop="copyPrompt(item.prompt)">
                    复制全文
                  </el-button>
                </div>
              </div>
              <el-button
                v-show="!viewerPromptVisible"
                type="primary"
                round
                size="small"
                class="result-preview-restore-btn"
                @click.stop="viewerPromptVisible = true"
              >
                显示提示词
              </el-button>
            </div>
          </template>
        </el-image>
        
        <!-- Hover Overlay -->
        <div class="result-overlay">
          <div class="overlay-top"></div>
          <div class="overlay-bottom">
            <div class="time-info">{{ item.time }}</div>
            <div class="overlay-actions">
              <el-tooltip content="大图 / 全屏预览" placement="top">
                <div class="icon-btn" @click.stop="openPreview">
                  <el-icon><i-ep-zoom-in /></el-icon>
                </div>
              </el-tooltip>
              <div class="action-icons">
                <el-tooltip content="复制到画布" placement="top">
                  <div class="icon-btn" @click="copyToCanvas">
                    <el-icon><i-ep-copy-document /></el-icon>
                  </div>
                </el-tooltip>
                <el-tooltip content="复制提示词" placement="top">
                  <div class="icon-btn" @click="copyPrompt(item.prompt)">
                    <el-icon><i-ep-document-copy /></el-icon>
                  </div>
                </el-tooltip>
                <el-tooltip :content="item.type.includes('v') ? '下载视频' : '下载图片'" placement="top">
                  <div class="icon-btn" @click="downloadImage(item.url!)">
                    <el-icon><i-ep-download /></el-icon>
                  </div>
                </el-tooltip>
                <el-tooltip content="删除记录" placement="top">
                  <div class="icon-btn danger" @click="emit('delete', item.id)">
                    <el-icon><i-ep-delete /></el-icon>
                  </div>
                </el-tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.result-card {
  break-inside: avoid;
  margin-bottom: 20px;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.3s ease;
}

.result-card:hover {
  transform: scale(1.02);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  z-index: 10;
}

.result-header {
  padding: 10px 14px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  gap: 8px;
  align-items: center;
}

.result-content {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
  border-radius: 0 0 8px 8px;
  position: relative;
}

.result-content.has-image {
  min-height: auto;
  display: block;
}

.loading-wrapper,
.error-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #909399;
  padding: 40px 0;
  position: relative;
}

.loading-text,
.error-text {
  font-size: 14px;
  text-align: center;
  padding: 0 16px;
}

.error-text {
  color: #f56c6c;
}

.error-delete-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(245, 108, 108, 0.1);
  color: #f56c6c;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.error-delete-btn:hover {
  background: #f56c6c;
  color: white;
}

.error-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-retry-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(64, 158, 255, 0.12);
  color: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.error-retry-btn:hover {
  background: #409eff;
  color: white;
}

.image-wrapper {
  width: 100%;
  position: relative;
  padding: 0;
}

.image-wrapper.is-clickable {
  cursor: zoom-in;
}

.image-wrapper.is-clickable:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.overlay-actions {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.generated-image {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 0 0 12px 12px;
}

/* 与任务详情里一致：随比例撑满宽度，点击可走 Element Plus 大图预览 */
.generated-image-el {
  width: 100%;
  display: block;
  border-radius: 0 0 12px 12px;
}

.generated-image-el :deep(.el-image__wrapper) {
  width: 100% !important;
}

.generated-image-el :deep(.el-image__inner) {
  position: relative;
  width: 100% !important;
  height: auto !important;
  vertical-align: top;
  border-radius: 0 0 12px 12px;
}

.result-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(0,0,0,0.7) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px;
  /* 蒙层不抢点击：大图预览点在中间区域；仅底部工具条接收 */
  pointer-events: none;
  border-radius: 0 0 12px 12px;
}

.result-card:hover .result-overlay {
  opacity: 1;
}

.overlay-bottom {
  pointer-events: auto;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  width: 100%;
}

.time-info {
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.action-icons {
  display: flex;
  gap: 8px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.4);
  transform: scale(1.1);
}

.icon-btn.danger:hover {
  background: rgba(245, 108, 108, 0.8);
}

/* 大图预览内嵌：固定底部，留白避开 Element Plus 底部工具条 */
.result-preview-prompt-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
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
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.92);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0 0 6px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.result-preview-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
