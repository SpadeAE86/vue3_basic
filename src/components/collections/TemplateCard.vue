<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { useCollectionsStore, type CollectionItem } from '@/stores/collections'
import { copyToClipboard } from '@/utils/browser'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'

function getAgentAvatar(roleId?: string) {
  const base = window.location.protocol === 'file:' ? 'http://127.0.0.1:8004' : ''
  if (!roleId) return `${base}/api/chat/roles/default/avatar`
  return `${base}/api/chat/roles/${roleId}/avatar`
}

function getAgentName(roleId?: string) {
  if (roleId === 'neuro') return '欣怡'
  if (roleId === 'default' || roleId === 'cc') return 'CC'
  return roleId || '欣怡'
}

function getTtsText(content: string): string {
  const bothMatch = content.match(/<both>([\s\S]*?)<\/both>/)
  const speakMatch = content.match(/<speak>([\s\S]*?)<\/speak>/)
  const summaryMatch = content.match(/<summary>([\s\S]*?)<\/summary>/)
  
  let bothText = bothMatch && bothMatch[1] ? bothMatch[1].trim() : ''
  let speakText = speakMatch && speakMatch[1] ? speakMatch[1].trim() : ''
  let summaryText = summaryMatch && summaryMatch[1] ? summaryMatch[1].trim() : ''
  
  bothText = bothText.replace(/<\/?[a-zA-Z]+>/g, '').trim()
  speakText = speakText.replace(/<\/?[a-zA-Z]+>/g, '').trim()
  summaryText = summaryText.replace(/<\/?[a-zA-Z]+>/g, '').trim()
  
  const parts = [bothText, speakText, summaryText].filter(Boolean)
  if (parts.length > 0) {
    return parts.join('\n')
  }
  return content.replace(/<\/?[a-zA-Z]+>/g, '').trim().substring(0, 500)
}

const isPlaying = ref(false)
const isLoading = ref(false)
let audioEl: HTMLAudioElement | null = null

onBeforeUnmount(() => {
  if (audioEl) {
    audioEl.pause()
    audioEl = null
  }
})

async function playTTS() {
  if (isPlaying.value) {
    if (audioEl) {
      audioEl.pause()
      isPlaying.value = false
    }
    return
  }

  const text = getTtsText(props.item.data.prompt || props.item.data.template_text || '')
  if (!text) return

  let voice = 'Vivi'
  const roleId = props.item.data.role_id
  if (roleId) {
    try {
      const rolesRes = await fetch(`/api/chat/roles?t=${Date.now()}`)
      if (rolesRes.ok) {
        const allRoles = await rolesRes.json()
        const foundRole = allRoles.find((r: any) => r.id === roleId)
        if (foundRole && foundRole.voice_character) {
          voice = foundRole.voice_character
        }
      }
    } catch (e) {
      console.error('Failed to resolve role voice, fallback to Vivi', e)
    }
  }

  isLoading.value = true
  isPlaying.value = true

  try {
    const res = await fetch('/api/chat/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice,
        speed: 1.0,
        disable_segmentation: true,
        byte_stream: false
      })
    })

    if (!res.ok) throw new Error('TTS 请求失败')
    const reader = res.body?.getReader()
    if (!reader) throw new Error('无法读取响应流')

    const decoder = new TextDecoder()
    let buffer = ''
    let audioUrl = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim()
          if (dataStr === '[DONE]') continue
          try {
            const raw = JSON.parse(dataStr)
            if (raw.event_type === 'merged_audio' && raw.url) {
              audioUrl = raw.url
            }
          } catch(e) {}
        }
      }
    }

    if (!audioUrl) throw new Error('未获取到合成音频 URL')

    audioEl = new Audio(audioUrl)
    audioEl.onended = () => {
      isPlaying.value = false
    }
    audioEl.onerror = () => {
      isPlaying.value = false
    }
    isLoading.value = false
    audioEl.play().catch(() => {
      isPlaying.value = false
    })

  } catch (err: any) {
    console.error(err)
    ElMessage.error(err.message || '语音合成失败')
    isLoading.value = false
    isPlaying.value = false
  }
}

const props = defineProps<{
  item: CollectionItem
  isSelected: boolean
  selectedSpaceId?: string | null
}>()

const emit = defineEmits<{
  (e: 'click-header', event: MouseEvent): void
}>()

const router = useRouter()

function goToDiscuss(sessionId: string, roleId: string) {
  router.push(`/chat?role_id=${roleId || 'default'}&session_id=${sessionId}`)
}

const collectionsStore = useCollectionsStore()

// Compute item sub-type
const itemSubType = computed(() => {
  const item = props.item
  if (item.data?.subtype === 'inspiration') return 'inspiration'
  if (item.data?.subtype === 'beautify' || (item.title && item.title.includes('大纲'))) return 'beautify'
  
  // Dynamic fallback for templates/prompts without slots
  const content = item.data?.template_text || item.data?.content || item.data?.prompt || ''
  const hasSlots = /\{([^:]+):\s*([^}]+)\}/g.test(content)
  if (item.item_type === 'template' && !hasSlots) {
    return 'beautify'
  }
  
  return 'prompt'
})

function getSubTypeLabel(subType: string) {
  if (subType === 'inspiration') return '灵感'
  if (subType === 'beautify') return '美化'
  return '提示词'
}

function getInspirationSummary(item: CollectionItem): string {
  // If it's a structured checklist card, return the summary
  if (item.data?.checklist) {
    return item.data.summary || '要点清单规划'
  }
  
  // If it's a structured dialogue card
  if (item.data?.both || item.data?.display || item.data?.speak || item.data?.summary) {
    const parts = [
      item.data.both || item.data.display,
      item.data.summary ? `摘要: ${item.data.summary}` : ''
    ].filter(Boolean)
    return parts.join('\n\n')
  }

  const content = item.data?.prompt || item.data?.template_text || ''
  
  // Try to extract <both> and <summary>
  const bothMatch = content.match(/<both>([\s\S]*?)<\/both>/)
  const summaryMatch = content.match(/<summary>([\s\S]*?)<\/summary>/)
  
  let bothText = bothMatch && bothMatch[1] ? bothMatch[1].trim() : ''
  let summaryText = summaryMatch && summaryMatch[1] ? summaryMatch[1].trim() : ''
  
  // Clean tags
  bothText = bothText.replace(/<\/?[a-zA-Z]+>/g, '').trim()
  summaryText = summaryText.replace(/<\/?[a-zA-Z]+>/g, '').trim()

  if (bothText || summaryText) {
    return [bothText, summaryText].filter(Boolean).join('\n\n')
  }
  
  // Fallback: clean raw content and take first 500 chars
  let cleanText = content.replace(/<[a-zA-Z]+>[\s\S]*?<\/[a-zA-Z]+>/g, '')
  cleanText = cleanText.replace(/[*#`\-]/g, '').trim()
  return cleanText.substring(0, 500) + (cleanText.length > 500 ? '...' : '')
}

function getSubTypeTagType(subType: string) {
  if (subType === 'inspiration') return 'success'
  if (subType === 'beautify') return 'warning'
  return 'primary'
}

// 归属的主题空间名称映射
function getSpaceName(spaceId?: string) {
  if (!spaceId) return ''
  const space = collectionsStore.themeSpaces.find(s => s.id === spaceId)
  return space ? space.name : ''
}

// 下载模板文件 (.md)
function downloadTemplate() {
  const text = props.item.data.template_text || props.item.data.prompt || ''
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const sanitizeName = (props.item.title || 'untitled').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
  a.download = `${sanitizeName}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 取消收藏单个项目
async function handleUnfavorite() {
  const item = props.item
  if (props.selectedSpaceId) {
    // 文件夹内点击，仅移出空间 (unlink)
    await collectionsStore.moveToSpace(item.id, null)
  } else {
    // 全部收藏内点击，彻底取消收藏 (delete)
    const payload = item.item_type === 'media' ? { url: item.data.url } : item.item_type === 'template' ? { template_text: item.data.template_text } : { prompt: item.data.prompt }
    await collectionsStore.toggleFavorite(item.item_type, item.title, undefined, payload)
  }
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
</script>

<template>
  <div class="result-card" :class="{ 'is-selected': isSelected }">
    <div class="result-header" @click.stop="emit('click-header', $event)" style="cursor: pointer;">
      <el-tag :type="getSubTypeTagType(itemSubType)" size="small" effect="light">
        {{ getSubTypeLabel(itemSubType) }}
      </el-tag>
      <span class="tpl-header-title" :title="item.title">{{ item.title }}</span>
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

    <div class="image-wrapper template-text-content-wrapper">
      <!-- Checklist items display -->
      <div v-if="item.data?.checklist && item.data.checklist.length > 0" class="template-checklist-wrapper">
        <div v-for="(task, idx) in item.data.checklist" :key="idx" class="template-checklist-item">
          <el-checkbox :model-value="task.checked" disabled size="small">
            <span class="checklist-item-text" :class="{ 'is-checked': task.checked }">{{ task.text }}</span>
          </el-checkbox>
        </div>
        <div v-if="item.data.summary" class="checklist-summary" :title="item.data.summary">
          <strong>摘要: </strong>{{ item.data.summary }}
        </div>
      </div>
      <!-- Standard text display -->
      <div v-else class="template-text-display">
        {{ getInspirationSummary(item) }}
      </div>

      <!-- Left Bottom Audio Dock (avatar & microphone) -->
      <div v-if="item.data?.chat_session_id" class="card-audio-footer" @click.stop>
        <el-tooltip :content="`设计助手: ${getAgentName(item.data.role_id)}`" placement="top">
          <div class="agent-avatar-container">
            <img :src="getAgentAvatar(item.data.role_id)" class="card-agent-avatar" />
          </div>
        </el-tooltip>
        <div 
          class="card-tts-btn" 
          :class="{ 'is-active': isLoading || isPlaying }" 
          @click.stop="playTTS"
          title="播放脑暴规划朗读"
        >
          <el-icon v-if="isLoading" class="is-loading"><i-ep-loading /></el-icon>
          <el-icon v-else-if="isPlaying"><i-ep-video-pause /></el-icon>
          <el-icon v-else><i-ep-microphone /></el-icon>
        </div>
      </div>

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
          <div class="overlay-bottom-row">
            <div class="time-info">{{ formatDate(item.created_at) }}</div>
            <div class="action-icons">
              <el-tooltip content="下载模板" placement="top">
                <div class="icon-btn" @click="downloadTemplate">
                  <el-icon><i-ep-download /></el-icon>
                </div>
              </el-tooltip>

              <el-tooltip content="复制到画布" placement="top">
                <div class="icon-btn" @click="handleCopyToCanvas">
                  <el-icon><i-ep-copy-document /></el-icon>
                </div>
              </el-tooltip>
              <el-tooltip content="复制提示词文本" placement="top">
                <div class="icon-btn" @click="handleCopyPrompt(item.data.template_text || item.data.prompt)">
                  <el-icon><i-ep-document-copy /></el-icon>
                </div>
              </el-tooltip>
              <!-- Discuss Button if it is linked to a session -->
              <el-tooltip v-if="item.data?.chat_session_id" content="去讨论此灵感" placement="top">
                <div class="icon-btn highlight-btn" @click.stop="goToDiscuss(item.data.chat_session_id, item.data.role_id)">
                  <el-icon><i-ep-chat-dot-round /></el-icon>
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
  cursor: pointer;
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

.tpl-header-title {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
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

/* Template text display content styling */
.template-text-content-wrapper {
  background: #faf5ff;
  min-height: 160px;
  max-height: 240px;
  padding: 20px;
  box-sizing: border-box;
  overflow: hidden;
  cursor: default;
}

.template-text-display {
  font-size: 13px;
  line-height: 1.6;
  color: #5b21b6;
  font-style: italic;
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
  padding: 0 10px;
  word-break: break-all;
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

.icon-btn.highlight-btn {
  background: #10b981;
  color: #ffffff;
  border-color: #10b981;
}

.icon-btn.highlight-btn:hover {
  background: #059669;
  color: #ffffff;
  border-color: #059669;
}

.card-audio-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto; /* Push to bottom of flex container */
  padding-top: 10px;
  border-top: 1px dashed #f1f5f9;
  z-index: 10;
}

.agent-avatar-container {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  overflow: hidden;
  border: 1.5px solid #10b981; /* green theme border */
  background: #f8fafc;
}

.card-agent-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-tts-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #f1f5f9;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s ease;
}

.card-tts-btn:hover {
  background: #e2e8f0;
  color: #10b981;
}

.card-tts-btn.is-active {
  background: #d1fae5;
  color: #10b981;
}

/* Checklist styling */
.template-checklist-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
  overflow: hidden;
  box-sizing: border-box;
}

.template-checklist-item {
  display: flex;
  align-items: center;
}

.checklist-item-text {
  font-size: 13px;
  color: #334155;
}

.checklist-item-text.is-checked {
  color: #94a3b8;
  text-decoration: line-through;
}

.checklist-summary {
  margin-top: 8px;
  font-size: 11px;
  color: #64748b;
  border-top: 1px dashed #e2e8f0;
  padding-top: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
