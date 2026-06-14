<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCollectionsStore, type CollectionItem } from '@/stores/collections'
import { copyToClipboard } from '@/utils/browser'
import { ElMessage } from 'element-plus'
import TagsPanelOverlay from './TagsPanelOverlay.vue'

const props = defineProps<{
  item: CollectionItem
  isSelected: boolean
}>()

const emit = defineEmits<{
  (e: 'click-header', event: MouseEvent): void
  (e: 'click-preview', item: CollectionItem): void
}>()

const collectionsStore = useCollectionsStore()

// ─── 大图预览 ───
const viewerPromptVisible = ref(true)
const viewerTagVisible = ref(true)

function onImagePreviewShow() {
  viewerPromptVisible.value = true
  viewerTagVisible.value = true
}

// 归属的主题空间名称映射
function getSpaceName(spaceId?: string) {
  if (!spaceId) return ''
  const space = collectionsStore.themeSpaces.find(s => s.id === spaceId)
  return space ? space.name : ''
}

// 下载媒体文件
function downloadMedia(url: string) {
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = isVideoItem.value ? `download_${new Date().getTime()}.mp4` : `download_${new Date().getTime()}.png`
  a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// 取消收藏单个项目
async function handleUnfavorite() {
  const item = props.item
  const payload = item.item_type === 'media' ? { url: item.data.url } : item.item_type === 'template' ? { template_text: item.data.template_text } : { prompt: item.data.prompt }
  await collectionsStore.toggleFavorite(item.item_type, item.title, undefined, payload)
}

// 复制到画布
async function handleCopyToCanvas() {
  const item = props.item
  const isTemplate = item.item_type === 'template' || !!(item.data.template_text || '').match(/\{([^:]+):\s*([^}]+)\}/g)
  const payload = {
    type: 'jottings-canvas-node',
    node_type: isTemplate ? 'prompt_template' : 'image_card',
    name: item.title || '收藏的提示词',
    template_text: item.data.template_text || item.data.prompt || ''
  }
  const success = await copyToClipboard(JSON.stringify(payload))
  if (success) {
    ElMessage.success('已复制卡片数据，可在画布页面按 Ctrl+V 粘贴为节点')
  } else {
    ElMessage.error('复制失败')
  }
}

// 复制提示词
async function handleCopyPrompt(prompt: string) {
  const success = await copyToClipboard(prompt)
  if (success) ElMessage.success('提示词已复制到剪贴板')
}

// 格式化日期
function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const isVideoItem = computed(() => {
  const url = props.item.data.url || props.item.data.image_url || ''
  return props.item.data.media_type === 'video' || url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm')
})
</script>

<template>
  <div class="result-card" :class="{ 'is-selected': isSelected }">
    <div class="result-header" @click.stop="emit('click-header', $event)" style="cursor: pointer;">
      <el-tag size="small" type="info">{{ item.data.model || '生成模型' }}</el-tag>
      <el-tag size="small" :type="item.data.media_type === 'video' ? 'danger' : 'primary'">
        {{ item.data.media_type === 'video' ? '视频' : '图片' }}
      </el-tag>
    </div>

    <!-- Hover tags list -->
    <div class="hover-tags-panel">
      <span v-if="item.space_id" class="hover-tag folder-tag">
        <el-icon><i-ep-folder /></el-icon> {{ getSpaceName(item.space_id) }}
      </span>
      <span v-for="tag in item.tags" :key="tag" class="hover-tag custom-tag">
        #{{ tag }}
      </span>
      <span v-if="!item.space_id && (!item.tags || item.tags.length === 0)" class="hover-tag empty-tag">
        无标签
      </span>
    </div>

    <!-- Click handler for Image triggers native viewer, video triggers custom dialog preview -->
    <div class="image-wrapper" @click="isVideoItem ? emit('click-preview', item) : null" draggable="false">
      <video
        v-if="isVideoItem"
        :src="item.data.url"
        class="generated-image"
        autoplay
        loop
        muted
        playsinline
        draggable="false"
      />
      <el-image
        v-else
        :src="item.data.url || item.data.image_url"
        fit="contain"
        class="generated-image-el"
        :preview-src-list="item.data.url || item.data.image_url ? [item.data.url || item.data.image_url] : []"
        preview-teleported
        draggable="false"
        @show="onImagePreviewShow"
      >
        <template #viewer>
          <!-- Bottom Prompt Dock (contains prompt panel and triggers) -->
          <div
            class="result-preview-prompt-dock"
            @mousedown.stop
            @touchstart.stop
          >
            <!-- Prompt Panel -->
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
              <p class="result-preview-text">{{ item.data.prompt?.trim() ? item.data.prompt : '—' }}</p>
              <div class="result-preview-actions">
                <el-button type="primary" link size="small" @click.stop="handleCopyPrompt(item.data.prompt || '')">
                  复制全文
                </el-button>
              </div>
            </div>

            <!-- Restore button if prompt is hidden -->
            <el-button
              v-if="!viewerPromptVisible"
              type="primary"
              round
              size="small"
              class="result-preview-restore-btn"
              @click.stop="viewerPromptVisible = true"
            >
              显示提示词
            </el-button>
          </div>

          <!-- Right Floating Tags Panel Overlay -->
          <TagsPanelOverlay :item="item" v-model:visible="viewerTagVisible" />
        </template>
      </el-image>

      <!-- Star Button in top right corner -->
      <div
        class="result-favorite-star is-favorited"
        @click.stop="handleUnfavorite"
        title="取消收藏"
      >
        <el-icon><i-ep-star-filled /></el-icon>
      </div>

      <!-- Hover Overlay -->
      <div class="result-overlay" @click.stop>
        <div class="overlay-top">
          <span v-if="item.space_id" class="space-badge">{{ getSpaceName(item.space_id) }}</span>
        </div>
        <div class="overlay-bottom">
          <div class="media-prompt-overlay" :title="item.data.prompt">
            {{ item.data.prompt || '(无提示词)' }}
          </div>
          <div class="overlay-bottom-row">
            <div class="time-info">{{ formatDate(item.created_at) }}</div>
            <div class="action-icons">
              <el-tooltip :content="isVideoItem ? '下载视频' : '下载图片'" placement="top">
                <div class="icon-btn" @click="downloadMedia(item.data.url || item.data.image_url)">
                  <el-icon><i-ep-download /></el-icon>
                </div>
              </el-tooltip>

              <el-tooltip content="复制到画布" placement="top">
                <div class="icon-btn" @click="handleCopyToCanvas">
                  <el-icon><i-ep-copy-document /></el-icon>
                </div>
              </el-tooltip>
              <el-tooltip content="复制提示词" placement="top">
                <div class="icon-btn" @click="handleCopyPrompt(item.data.prompt)">
                  <el-icon><i-ep-document-copy /></el-icon>
                </div>
              </el-tooltip>
              <el-tooltip content="取消收藏" placement="top">
                <div class="icon-btn danger" @click="handleUnfavorite">
                  <el-icon><i-ep-delete /></el-icon>
                </div>
              </el-tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.result-card {
  border: 1px solid #ebeef5;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.3s ease;
  width: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
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
  justify-content: flex-start;
}

.image-wrapper {
  width: 100%;
  position: relative;
  padding: 0;
  background: #fafafa;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
}

.generated-image {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 0 0 12px 12px;
}

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

/* Favorite Star Button */
.result-favorite-star {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 15;
  color: #94a3b8;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.2s ease;
  pointer-events: auto;
}

.image-wrapper:hover .result-favorite-star,
.result-favorite-star.is-favorited {
  opacity: 1;
  transform: scale(1);
}

.result-favorite-star:hover {
  transform: scale(1.1) !important;
  color: #eab308;
}

.result-favorite-star.is-favorited {
  color: #eab308 !important;
  background: #fff !important;
  border-color: #f59e0b !important;
}

/* Hover Overlay */
.result-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(0,0,0,0.75) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px;
  pointer-events: none;
  box-sizing: border-box;
  z-index: 10;
}

.image-wrapper:hover .result-overlay {
  opacity: 1;
}

.overlay-top {
  display: flex;
  justify-content: flex-start;
  width: 100%;
}

.space-badge {
  background: rgba(99, 102, 241, 0.7);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  backdrop-filter: blur(4px);
}

.overlay-bottom {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.media-prompt-overlay {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.4;
  margin: 0;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 1px 2px rgba(0,0,0,0.6);
}

.overlay-bottom-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.time-info {
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.action-icons {
  display: flex;
  gap: 8px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.4);
  transform: scale(1.1);
}

.icon-btn.danger:hover {
  background: rgba(245, 108, 108, 0.8);
  border-color: rgba(245, 108, 108, 0.8);
}

.result-card.is-selected {
  border-color: #6366f1 !important;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.4), 0 10px 24px rgba(0, 0, 0, 0.12) !important;
}

/* Hover tags panel sliding from left to right on the right of the card */
.hover-tags-panel {
  position: absolute;
  left: 102%;
  top: 12px;
  display: flex;
  flex-direction: row;
  gap: 6px;
  opacity: 0;
  transform: translateX(-10px);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
  z-index: 99;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  padding: 6px 10px;
  border-radius: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid #e2e8f0;
  white-space: nowrap;
}

.result-card:hover .hover-tags-panel {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}

.hover-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.hover-tag.folder-tag {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  color: #7c3aed;
}

.hover-tag.custom-tag {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #059669;
}

.hover-tag.empty-tag {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #64748b;
  font-style: italic;
  font-weight: normal;
}

/* 大图预览提示词 dock：对齐提示词对比页的 viewer 交互 */
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

/* Right Edge Activation FAB */
.result-preview-tags-trigger-fab {
  position: fixed;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(30, 30, 38, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #a7f3d0;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.result-preview-tags-trigger-fab:hover {
  background: rgba(30, 30, 38, 0.65);
  transform: translateY(-50%) scale(1.1);
  color: #fff;
}
</style>
