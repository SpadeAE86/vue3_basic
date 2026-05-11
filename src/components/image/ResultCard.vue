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

function openPreview() {
  if (!props.item.url || props.item.loading || props.item.error) return
  previewOpen.value = true
}

function onMediaAreaClick(e: MouseEvent) {
  if (!props.item.url || props.item.loading || props.item.error) return
  const t = e.target as HTMLElement
  if (t.closest('.action-icons')) return
  openPreview()
}

const emit = defineEmits<{
  (e: 'delete', id: string): void
}>()

async function copyPrompt(prompt: string) {
  const success = await copyToClipboard(prompt)
  if (success) {
    ElMessage.success('提示词已复制')
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
      v-if="item.url"
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
        <!-- 新增：失败状态下的删除按钮 -->
        <div class="error-delete-btn" @click="emit('delete', item.id)" title="删除记录">
          <el-icon><i-ep-delete /></el-icon>
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
        <video v-if="item.type.includes('v')" :src="item.url" class="generated-image" loop muted playsinline></video>
        <img v-else :src="item.url" class="generated-image" alt="generated" />
        
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
  position: absolute;
  top: 10px;
  right: 10px;
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
  pointer-events: none;
  border-radius: 0 0 12px 12px;
}

.result-card:hover .result-overlay {
  opacity: 1;
  pointer-events: auto;
}

.overlay-bottom {
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
</style>
