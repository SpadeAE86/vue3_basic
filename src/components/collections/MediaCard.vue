<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCollectionsStore, type CollectionItem } from '@/stores/collections'
import { copyToClipboard } from '@/utils/browser'
import { ElMessage, ElImageViewer, ElMessageBox } from 'element-plus'
import TagsPanelOverlay from './TagsPanelOverlay.vue'
import PromptDock from '../image/PromptDock.vue'

const props = defineProps<{
  item: CollectionItem
  isSelected: boolean
  selectedSpaceId?: string | null
  previewList?: CollectionItem[]
  previewIndex?: number
}>()

const emit = defineEmits<{
  (e: 'click-header', event: MouseEvent): void
  (e: 'click-preview', item: CollectionItem): void
  (e: 'enter-subfolder', path: string): void
  (e: 'enter-virtual-folder', folderId: string): void
  (e: 'drop-items-on-folder', payload: { destFolderId?: string; destPath?: string }): void
}>()

const dragoverFolderId = ref<string | null>(null)

function handleDragOver() {
  if (props.item.item_type === 'folder') {
    dragoverFolderId.value = props.item.id
  }
}

function handleDragLeave() {
  dragoverFolderId.value = null
}

function handleDropOnFolder(event: DragEvent) {
  dragoverFolderId.value = null
  if (props.item.item_type === 'folder') {
    if (props.item.id.startsWith('local-folder-') || props.item.path) {
      emit('drop-items-on-folder', { destPath: props.item.path })
    } else {
      emit('drop-items-on-folder', { destFolderId: props.item.id })
    }
  }
}

function handleFolderEnter() {
  if (props.item.id.startsWith('local-folder-') || props.item.path) {
    emit('enter-subfolder', props.item.path)
  } else {
    emit('enter-virtual-folder', props.item.id)
  }
}

const collectionsStore = useCollectionsStore()

const folderCover = computed(() => {
  if (props.item.item_type !== 'folder') return null
  if (props.item.cover_url) return props.item.cover_url
  
  const firstChild = collectionsStore.items.find(
    i => i.data?.parent_folder_id === props.item.id && (i.cover_url || i.data?.url || i.data?.image_url)
  )
  if (firstChild) {
    return firstChild.cover_url || firstChild.data?.url || firstChild.data?.image_url || null
  }
  return null
})

// ─── 大图预览 ───
const viewerPromptVisible = ref(true)
const viewerTagVisible = ref(true)

const imagePreviewItems = computed(() => {
  if (!props.previewList) return [props.item]
  return props.previewList.filter(item => {
    const url = item.data.url || item.data.image_url || ''
    const isVid = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm')
    return !isVid
  })
})

const previewUrlList = computed(() => {
  return imagePreviewItems.value.map(item => item.data.url || item.data.image_url || '')
})

const initialPreviewIndex = computed(() => {
  const idx = imagePreviewItems.value.findIndex(item => item.id === props.item.id)
  return idx > -1 ? idx : 0
})

const activePreviewIndex = ref(0)

function onImagePreviewShow() {
  viewerPromptVisible.value = true
  viewerTagVisible.value = true
  activePreviewIndex.value = initialPreviewIndex.value
  const item = imagePreviewItems.value[activePreviewIndex.value]
  if (item) {
    window.dispatchEvent(new CustomEvent('preview-item-switched', { detail: item }))
  }
}

function handleSwitch(index: number) {
  activePreviewIndex.value = index
  const item = imagePreviewItems.value[index]
  if (item) {
    window.dispatchEvent(new CustomEvent('preview-item-switched', { detail: item }))
  }
}

const activePreviewItem = computed(() => {
  return imagePreviewItems.value[activePreviewIndex.value] || props.item
})

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
  
  // 1. 处理本地文件夹的删除
  if (item.id && String(item.id).startsWith('local-folder-')) {
    if (window.api && window.api.invoke) {
      const path = item.id.replace('local-folder-', '')
      try {
        await ElMessageBox.confirm('确定要永久删除此本地文件夹及其所有内容吗？', '删除文件夹警告', {
          confirmButtonText: '确定删除',
          cancelButtonText: '取消',
          type: 'warning'
        })
        await window.api.invoke('localFolder:delete', { dirPath: path })
        ElMessage.success('删除文件夹成功')
        window.dispatchEvent(new CustomEvent('local-folder-changed'))
      } catch (err) {
        if (err !== 'cancel') {
          console.error(err)
          ElMessage.error('删除文件夹失败')
        }
      }
    }
    return
  }

  // 2. 处理云端收藏项的删除
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



const mediaUrl = computed(() => {
  if (props.item.item_type !== 'media') {
    return props.item.cover_url || ''
  }
  return props.item.data.url || props.item.data.image_url || ''
})

const displayTitle = computed(() => {
  let title = props.item.title || ''
  title = title.replace(/^💡\s*灵感脑暴规划\s*-\s*/, '')
  return title
})

const isVideoItem = computed(() => {
  if (props.item.item_type !== 'media') return false
  const url = props.item.data.url || props.item.data.image_url || ''
  return props.item.data.media_type === 'video' || url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm')
})

import { onBeforeUnmount } from 'vue'

function getInspirationSummary(item: CollectionItem): string {
  if (item.item_type === 'graph') {
    return item.data?.display || '关联关系力导布局图'
  }
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
const urls = ref<string[]>([])
let currentIndex = 0
let isFetchingDone = false
let isAudioPlaying = false

onBeforeUnmount(() => {
  if (audioEl) {
    audioEl.pause()
    audioEl = null
  }
  isPlaying.value = false
  isAudioPlaying = false
})

async function playTTS() {
  if (isPlaying.value) {
    isPlaying.value = false
    isAudioPlaying = false
    if (audioEl) {
      audioEl.pause()
      audioEl = null
    }
    return
  }

  let text = ''
  if (props.item.item_type === 'graph') {
    text = props.item.data?.speak || props.item.data?.display || ''
  } else if (props.item.data?.speak || props.item.data?.both) {
    text = props.item.data.speak || props.item.data.both || ''
  } else {
    text = getTtsText(props.item.data.prompt || props.item.data.template_text || '')
  }
  if (!text) return

  let voice = 'Vivi'
  const roleId = props.item.data.role_id
  if (roleId) {
    voice = roleId
  }

  isLoading.value = true
  isPlaying.value = true
  isAudioPlaying = false
  isFetchingDone = false
  currentIndex = 0
  urls.value = []

  function playNext() {
    if (!isPlaying.value) {
      isAudioPlaying = false
      return
    }
    if (currentIndex >= urls.value.length) {
      if (isFetchingDone) {
        isPlaying.value = false
        isAudioPlaying = false
        audioEl = null
      } else {
        isAudioPlaying = false
        isLoading.value = true
      }
      return
    }
    isLoading.value = false
    isAudioPlaying = true
    let audio = audioEl
    if (!audio || audio.src.startsWith('blob:')) {
      audio = new Audio(urls.value[currentIndex] || '')
      audioEl = audio
    } else {
      audio.src = urls.value[currentIndex] || ''
    }
    audio.onended = () => {
      currentIndex++
      playNext()
    }
    audio.onerror = () => {
      isPlaying.value = false
      isAudioPlaying = false
      audioEl = null
    }
    audio.play().catch(err => {
      isPlaying.value = false
      isAudioPlaying = false
      audioEl = null
    })
  }

  let mediaSource: MediaSource | null = null
  let sourceBuffer: SourceBuffer | null = null
  let chunkQueue: Uint8Array[] = []
  let mediaSourceOpened = false
  let useMSE = typeof window.MediaSource !== 'undefined' && window.MediaSource.isTypeSupported('audio/mpeg')

  function appendNextFromQueue() {
    if (!sourceBuffer || sourceBuffer.updating || chunkQueue.length === 0) {
      if (isFetchingDone && chunkQueue.length === 0 && mediaSource && mediaSource.readyState === 'open') {
        try {
          mediaSource.endOfStream()
        } catch (e) {}
      }
      return
    }
    const nextChunk = chunkQueue.shift()!
    try {
      sourceBuffer.appendBuffer(nextChunk as any)
      if (audioEl && audioEl.paused && !isAudioPlaying) {
        isLoading.value = false
        isAudioPlaying = true
        audioEl.play().catch(err => {
          console.error('MSE play failed:', err)
        })
      }
    } catch (e) {
      console.error('MSE appendBuffer failed:', e)
    }
  }

  function pushChunkToMSE(bytes: Uint8Array) {
    chunkQueue.push(bytes)
    if (mediaSourceOpened) {
      appendNextFromQueue()
    }
  }

  if (useMSE) {
    mediaSource = new MediaSource()
    const audio = new Audio()
    audioEl = audio
    audio.src = URL.createObjectURL(mediaSource)
    mediaSource.addEventListener('sourceopen', () => {
      mediaSourceOpened = true
      try {
        sourceBuffer = mediaSource!.addSourceBuffer('audio/mpeg')
        sourceBuffer.addEventListener('updateend', () => {
          appendNextFromQueue()
        })
        appendNextFromQueue()
      } catch (e) {
        console.error('MSE addSourceBuffer failed, fallback to blob urls:', e)
        useMSE = false
      }
    })
    audio.onended = () => {
      isPlaying.value = false
      isAudioPlaying = false
      audioEl = null
    }
    audio.onerror = () => {
      isPlaying.value = false
      isAudioPlaying = false
      audioEl = null
    }
  }

  try {
    const res = await fetch('/api/chat/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice,
        speed: 1.0,
        disable_segmentation: true,
        byte_stream: true
      })
    })

    if (!res.ok) throw new Error('TTS 请求失败')
    const reader = res.body?.getReader()
    if (!reader) throw new Error('无法读取响应流')

    const decoder = new TextDecoder()
    let buffer = ''

    let currentSegmentIndex = -1
    let currentSegmentChunks: Uint8Array[] = []

    function flushCurrentSegment() {
      if (currentSegmentIndex !== -1 && currentSegmentChunks.length > 0) {
        const totalLength = currentSegmentChunks.reduce((acc, chunk) => acc + chunk.length, 0)
        const concatenated = new Uint8Array(totalLength)
        let offset = 0
        for (const chunk of currentSegmentChunks) {
          concatenated.set(chunk, offset)
          offset += chunk.length
        }
        const blob = new Blob([concatenated], { type: 'audio/mp3' })
        const chunkUrl = URL.createObjectURL(blob)
        urls.value.push(chunkUrl)
        if (!isAudioPlaying) {
          playNext()
        }
        currentSegmentChunks = []
      }
    }

    while (true) {
      if (!isPlaying.value) {
        break
      }

      const { done, value } = await reader.read()
      if (done) {
        flushCurrentSegment()
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const lines = part.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const dataStr = line.slice(6)
          if (dataStr === '[DONE]') {
            continue
          }

          try {
            const raw = JSON.parse(dataStr)
            if (raw.event_type === 'voice_chunk') {
              if (raw.data_type === 'base64' && raw.data) {
                const segmentIndex = raw.index ?? 0
                if (segmentIndex !== currentSegmentIndex) {
                  flushCurrentSegment()
                  currentSegmentIndex = segmentIndex
                }
                const binaryString = atob(raw.data)
                const len = binaryString.length
                const bytes = new Uint8Array(len)
                for (let i = 0; i < len; i++) {
                  bytes[i] = binaryString.charCodeAt(i)
                }
                currentSegmentChunks.push(bytes)
                if (useMSE) {
                  pushChunkToMSE(bytes)
                }
              } else if (raw.data_type === 'url' && raw.url) {
                if (useMSE) {
                  useMSE = false
                  if (audioEl) {
                    audioEl.src = raw.url
                  }
                }
                flushCurrentSegment()
                urls.value.push(raw.url)
                if (!isAudioPlaying) {
                  playNext()
                }
              }
            } else if (raw.event_type === 'sentence_end') {
              flushCurrentSegment()
            } else if (raw.event_type === 'error') {
              throw new Error(raw.message || 'TTS 生成出错')
            }
          } catch (e: any) {
            console.warn('TTS SSE JSON parse warning:', e)
          }
        }
      }
    }

    isFetchingDone = true
    if (useMSE) {
      appendNextFromQueue()
    } else {
      if (!isAudioPlaying) {
        playNext()
      }
    }

  } catch (err: any) {
    console.error(err)
    ElMessage.error(err.message || '语音合成失败')
    isLoading.value = false
    isPlaying.value = false
    isAudioPlaying = false
    if (audioEl) {
      audioEl.pause()
      audioEl = null
    }
  }
}

const router = useRouter()
const refPreviewUrl = ref<string | null>(null)
const refPreviewType = ref<string>('image')

function openRefPreview(url: string, type: string = 'image') {
  refPreviewUrl.value = url
  refPreviewType.value = type
}

function handlePrefill() {
  const item = activePreviewItem.value
  const data = item.data
  const detail = {
    type: data.type || data.media_type || (isVideoItem.value ? 't2v' : 't2i'),
    prompt: data.prompt || data.template_text || '',
    model: data.model || '',
    resolution: data.resolution || data.size || '',
    ratio: data.ratio || '',
    duration: data.duration,
    referenceMedia: data.referenceMedia || []
  }
  window.dispatchEvent(new CustomEvent('imagegen:prefill', { detail }))
  
  // Close Element Plus's viewer
  const closeBtn = document.querySelector('.el-image-viewer__wrapper .el-image-viewer__close') as HTMLElement
  if (closeBtn) {
    closeBtn.click()
  }
  
  router.push('/image')
}

function handleCardClick() {
  if (props.item.item_type === 'graph') {
    if (props.item.data?.graph_name) {
      router.push(`/graph?name=${encodeURIComponent(props.item.data.graph_name)}`)
    }
  } else if (props.item.item_type !== 'media') {
    if (props.item.data?.chat_session_id) {
      goToDiscuss(props.item.data.chat_session_id, props.item.data.role_id)
    } else {
      router.push(`/collections/prompt-space/${props.item.id}`)
    }
  }
}

function goToDiscuss(sessionId: string, roleId: string) {
  router.push(`/chat?role_id=${roleId || 'default'}&session_id=${sessionId}`)
}

async function toggleAcceptStatus() {
  if (props.item.data?.accept_status !== 'pending') return
  try {
    const res = await fetch(`/api/collections/${props.item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept_status: 'accepted' })
    })
    const data = await res.json()
    if (data.success) {
      ElMessage.success('已采纳该步骤规划')
      props.item.data.accept_status = 'accepted'
    } else {
      ElMessage.error(data.detail || '采纳失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('网络请求失败')
  }
}
</script>

<template>
  <div
    class="result-card"
    :class="{
      'is-selected': isSelected,
      'is-folder-card': item.item_type === 'folder',
      'is-dragover': dragoverFolderId === item.id
    }"
    @dragover.prevent="handleDragOver"
    @dragenter.prevent="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDropOnFolder"
  >
    <template v-if="item.item_type === 'folder'">
      <!-- Folder with cover image preview -->
      <div v-if="item.cover_url || folderCover" class="folder-preview-wrapper" @click="handleFolderEnter">
        <div class="folder-badge-tag">
          <el-icon class="folder-badge-icon"><i-ep-folder /></el-icon>
          <span class="folder-badge-text">文件夹</span>
        </div>
        <el-image
          :src="item.cover_url || folderCover"
          fit="cover"
          class="generated-image"
          draggable="false"
        />
        <div class="folder-preview-overlay">
          <span class="folder-preview-title" :title="displayTitle">{{ displayTitle }}</span>
          <div class="folder-preview-actions">
            <el-tooltip content="删除文件夹" placement="top">
              <div class="folder-action-btn danger" @click.stop="handleUnfavorite">
                <el-icon><i-ep-delete /></el-icon>
              </div>
            </el-tooltip>
          </div>
        </div>
      </div>
      
      <!-- Default empty folder card -->
      <div v-else class="folder-card-body" @click="handleFolderEnter">
        <el-icon class="folder-card-icon"><i-ep-folder /></el-icon>
        <span class="folder-card-title" :title="displayTitle">{{ displayTitle }}</span>
        <div class="folder-card-actions">
          <el-tooltip content="删除文件夹" placement="top">
            <div class="folder-action-btn danger" @click.stop="handleUnfavorite">
              <el-icon><i-ep-delete /></el-icon>
            </div>
          </el-tooltip>
        </div>
      </div>
    </template>
    
    <template v-else>
      <div class="result-header" @click.stop="emit('click-header', $event)" style="cursor: pointer;">
      <template v-if="item.item_type !== 'media' && !mediaUrl">
        <el-tag v-if="item.item_type === 'graph'" size="small" type="primary">力导布局</el-tag>
        <el-tag v-else-if="item.data?.accept_status" size="small" :type="item.data.accept_status === 'pending' ? 'warning' : 'success'">步骤规划</el-tag>
        <el-tag v-else size="small" type="success">灵感脑暴</el-tag>
        <span class="inspiration-header-title" :title="displayTitle">{{ displayTitle }}</span>
      </template>
      <template v-else>
        <el-tag size="small" type="info">{{ item.data.model || '生成模型' }}</el-tag>
        <el-tag size="small" :type="item.data.media_type === 'video' ? 'danger' : 'primary'">
          {{ item.data.media_type === 'video' ? '视频' : '图片' }}
        </el-tag>
      </template>
    </div>

    <!-- Hover tags list -->
    <div v-if="item.item_type === 'media' || mediaUrl" class="hover-tags-panel">
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

    <div class="image-wrapper" @click="isVideoItem ? emit('click-preview', item) : (item.item_type !== 'media' ? handleCardClick() : null)" draggable="false">
      <video
        v-if="isVideoItem"
        :src="mediaUrl"
        class="generated-image"
        autoplay
        loop
        muted
        playsinline
        draggable="false"
      />
      <el-image
        v-else-if="item.item_type === 'media' || mediaUrl"
        :src="mediaUrl"
        fit="contain"
        class="generated-image-el"
        :preview-src-list="previewUrlList"
        :initial-index="initialPreviewIndex"
        preview-teleported
        draggable="false"
        @show="onImagePreviewShow"
        @switch="handleSwitch"
      >
        <template #viewer>
          <PromptDock
            v-model:visible="viewerPromptVisible"
            :prompt="activePreviewItem.data.prompt"
            :reference-media="activePreviewItem.data.referenceMedia"
            @prefill="handlePrefill"
            @click-reference="payload => openRefPreview(payload.url, payload.type)"
          />

          <!-- Right Floating Tags Panel Overlay -->
          <TagsPanelOverlay :item="activePreviewItem" v-model:visible="viewerTagVisible" />
        </template>
      </el-image>
      
      <div
        v-else
        class="text-prompt-card-placeholder"
      >
        <!-- Graph rendering inside layout card placeholder -->
        <div v-if="item.item_type === 'graph'" class="graph-card-wrapper">
          <div class="graph-card-icon-container">
            <el-icon class="graph-network-icon"><i-ep-connection /></el-icon>
          </div>
          <div class="graph-card-name">{{ item.data?.graph_name || item.title }}</div>
          <div class="graph-card-desc larger-text">
            {{ item.data?.display || '关联关系力导布局图' }}
          </div>
        </div>
        <!-- Checklist rendering inside tall card placeholder -->
        <div v-else-if="item.data?.checklist && item.data.checklist.length > 0" class="template-checklist-wrapper-tall">
          <div v-for="(task, idx) in item.data.checklist" :key="idx" class="template-checklist-item">
            <el-checkbox :model-value="task.checked" disabled size="small">
              <span class="checklist-item-text" :class="{ 'is-checked': task.checked }">{{ task.text }}</span>
            </el-checkbox>
          </div>
          <div v-if="item.data.summary" class="checklist-summary" :title="item.data.summary">
            <strong>摘要: </strong>{{ item.data.summary }}
          </div>
        </div>
        <!-- Standard text desc rendering -->
        <div v-else class="placeholder-desc-sleek larger-text">
          {{ getInspirationSummary(item) }}
        </div>
        <div class="placeholder-footer-sleek">
          <span style="margin-left: auto;">{{ item.item_type === 'graph' ? '点击查看力导关系图 →' : '点击查阅讨论详情 →' }}</span>
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

      <!-- Star Button in top right corner (only for non-suggested cards) -->
      <div
        v-if="!item.data?.accept_status && item.data?.model !== 'local' && !item.id?.startsWith('local-')"
        class="result-favorite-star is-favorited"
        @click.stop="handleUnfavorite"
        title="取消收藏"
      >
        <el-icon><i-ep-star-filled /></el-icon>
      </div>

      <!-- Hover Overlay -->
      <div class="result-overlay" @click.stop="handleCardClick">
        <template v-if="item.item_type === 'media' || mediaUrl">
          <div class="overlay-top">
            <span v-if="item.space_id" class="space-badge">{{ getSpaceName(item.space_id) }}</span>
          </div>
          <div class="overlay-bottom">
            <div class="media-prompt-overlay" :title="item.data.prompt || item.data.template_text">
              {{ item.data.prompt || item.data.template_text || '(无提示词)' }}
            </div>
            <div class="overlay-bottom-row">
              <div class="time-info">{{ formatDate(item.created_at) }}</div>
              <div class="action-icons">
                <el-tooltip :content="isVideoItem ? '下载视频' : '下载图片'" placement="top">
                  <div class="icon-btn" @click.stop="downloadMedia(mediaUrl)">
                    <el-icon><i-ep-download /></el-icon>
                  </div>
                </el-tooltip>

                <el-tooltip content="复制到画布" placement="top">
                  <div class="icon-btn" @click="handleCopyToCanvas">
                    <el-icon><i-ep-copy-document /></el-icon>
                  </div>
                </el-tooltip>
                <el-tooltip content="复制提示词" placement="top">
                  <div class="icon-btn" @click.stop="handleCopyPrompt(item.data.prompt || item.data.template_text || '')">
                    <el-icon><i-ep-document-copy /></el-icon>
                  </div>
                </el-tooltip>
                
                <!-- Discuss Button if it is linked to a session -->
                <el-tooltip v-if="item.data?.chat_session_id" content="去讨论此灵感" placement="top">
                  <div class="icon-btn highlight-btn" @click.stop="goToDiscuss(item.data.chat_session_id, item.data.role_id)">
                    <el-icon><i-ep-chat-dot-round /></el-icon>
                  </div>
                </el-tooltip>

                <el-tooltip v-if="item.data?.model !== 'local' && !item.id?.startsWith('local-')" content="取消收藏" placement="top">
                  <div class="icon-btn danger" @click.stop="handleUnfavorite">
                    <el-icon><i-ep-delete /></el-icon>
                  </div>
                </el-tooltip>
              </div>
            </div>
          </div>
        </template>
        
        <template v-else>
          <!-- For Brainstorm and Steps Planning cards -->
          <div class="overlay-top text-card-overlay-header">
            <!-- Top empty -->
          </div>
          
          <div class="overlay-bottom text-card-overlay-footer-row">
            <!-- Left side: role avatar and microphone -->
            <div class="overlay-left-controls" @click.stop>
              <div v-if="item.data?.chat_session_id || item.item_type === 'graph'" style="display: flex; align-items: center; gap: 8px;">
                <el-tooltip :content="`设计助手: ${getAgentName(item.data.role_id)}`" placement="top">
                  <div class="agent-avatar-circle-hover">
                    <img :src="getAgentAvatar(item.data.role_id)" class="hover-agent-avatar-img" />
                  </div>
                </el-tooltip>
                <div 
                  class="hover-tts-btn" 
                  :class="{ 'is-active': isLoading || isPlaying }" 
                  @click.stop="playTTS"
                  title="播放朗读说明"
                >
                  <el-icon v-if="isLoading" class="is-loading"><i-ep-loading /></el-icon>
                  <el-icon v-else-if="isPlaying"><i-ep-video-pause /></el-icon>
                  <el-icon v-else><i-ep-microphone /></el-icon>
                </div>
              </div>
            </div>
            
            <!-- Right side: action buttons -->
            <div class="action-icons text-card-actions">
              <!-- Adopt Button (only for suggested step cards) -->
              <el-tooltip 
                v-if="item.data?.accept_status" 
                :content="item.data.accept_status === 'pending' ? '采纳步骤规划' : '已采纳'" 
                placement="top"
              >
                <div 
                  class="icon-btn circle-action-btn adopt-btn" 
                  :class="item.data.accept_status" 
                  @click.stop="toggleAcceptStatus"
                >
                  <el-icon v-if="item.data.accept_status === 'pending'"><i-ep-circle-check /></el-icon>
                  <el-icon v-else><i-ep-circle-check-filled /></el-icon>
                </div>
              </el-tooltip>

              <!-- Copy Content button -->
              <el-tooltip content="复制内容" placement="top">
                <div class="icon-btn circle-action-btn copy-btn" @click.stop="handleCopyPrompt(item.data.prompt || item.data.template_text || item.data.display || '')">
                  <el-icon><i-ep-document-copy /></el-icon>
                </div>
              </el-tooltip>

              <!-- Session Chat button -->
              <el-tooltip v-if="item.data?.chat_session_id" content="去讨论此灵感" placement="top">
                <div class="icon-btn circle-action-btn chat-btn" @click.stop="goToDiscuss(item.data.chat_session_id, item.data.role_id)">
                  <el-icon><i-ep-chat-dot-round /></el-icon>
                </div>
              </el-tooltip>
              
              <!-- Unfavorite button -->
              <el-tooltip content="取消收藏" placement="top">
                <div class="icon-btn circle-action-btn danger-btn" @click.stop="handleUnfavorite">
                  <el-icon><i-ep-delete /></el-icon>
                </div>
              </el-tooltip>
            </div>
          </div>
        </template>
      </div>
      </div>
    </template>
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
  transition: background-color 0.2s ease;
}

.result-header:hover {
  background-color: #f8fafc;
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

.icon-btn.highlight-btn {
  background: #10b981;
  border-color: #10b981;
  color: #ffffff;
}

.icon-btn.highlight-btn:hover {
  background: #059669;
  border-color: #059669;
  color: #ffffff;
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

/* 遮罩内操作 */

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

.preview-reference-media-list {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
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

.text-prompt-card-placeholder {
  width: 100%;
  height: 100%;
  min-height: 380px; /* Taller/more vertical! */
  background: linear-gradient(135deg, #f5f3ff 0%, #f0fdf4 100%);
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: left;
  position: relative;
  overflow: hidden;
  border-radius: 0 0 12px 12px;
}

.text-prompt-card-placeholder::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(circle at top right, rgba(16, 185, 129, 0.12) 0%, transparent 60%);
  pointer-events: none;
}

.card-placeholder-header {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}

.placeholder-icon-small {
  font-size: 14px;
}

.placeholder-category-label {
  font-size: 10px;
  font-weight: 700;
  color: #047857;
  background: rgba(16, 185, 129, 0.12);
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.placeholder-title-sleek {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 8px;
  line-height: 1.4;
  border-bottom: 1px solid rgba(226, 232, 240, 0.8);
  padding-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.placeholder-desc-sleek {
  font-size: 11px;
  color: #475569;
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 16; /* Show up to 16 lines! */
  -webkit-box-orient: vertical;
  flex: 1;
}

.placeholder-footer-sleek {
  margin-top: 8px;
  font-size: 10px;
  color: #6366f1;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between; /* Allow left alignment of inline footer */
}

.card-audio-footer-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 10;
}

.agent-avatar-container {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid #10b981;
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
  width: 20px;
  height: 20px;
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

.inspiration-header-title {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  margin-left: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

/* Checklist styling inside tall media card placeholder */
.template-checklist-wrapper-tall {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
  overflow: hidden;
  box-sizing: border-box;
}

.template-checklist-item {
  display: flex;
  align-items: center;
}

.checklist-item-text {
  font-size: 12px;
  color: #334155;
}

.checklist-item-text.is-checked {
  color: #94a3b8;
  text-decoration: line-through;
}

.checklist-summary {
  margin-top: auto;
  font-size: 11px;
  color: #64748b;
  border-top: 1px dashed rgba(99, 102, 241, 0.2);
  padding-top: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Accept Badge Styles */
.result-accept-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  z-index: 10;
}

.result-accept-badge.pending {
  background: #fef3c7;
  color: #d97706;
  border: 1px solid #fcd34d;
}

.result-accept-badge.pending:hover {
  background: #fde68a;
  transform: scale(1.05);
}

.result-accept-badge.accepted {
  background: #d1fae5;
  color: #059669;
  border: 1px solid #a7f3d0;
  cursor: default;
}

/* Text Card Hover Overlay layout */
.text-card-overlay-header {
  display: none;
}

.text-card-overlay-footer-row {
  display: flex !important;
  flex-direction: row !important;
  justify-content: space-between !important;
  align-items: flex-end !important;
  width: 100% !important;
  margin-top: auto !important;
}

.overlay-left-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-avatar-circle-hover {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.hover-agent-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hover-tts-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
}

.hover-tts-btn:hover {
  background: #ffffff;
  color: #10b981;
  transform: scale(1.05);
}

.hover-tts-btn.is-active {
  background: #10b981;
  color: #ffffff;
}

.placeholder-desc-sleek.larger-text {
  font-size: 13.5px;
  color: #1e293b;
  line-height: 1.7;
}

.text-card-actions {
  display: flex;
  gap: 8px;
}

/* Circle action buttons in hover mask */
.circle-action-btn {
  width: 28px;
  height: 28px;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.85) !important;
  border: 1px solid rgba(0, 0, 0, 0.05) !important;
  color: #475569 !important;
  transition: all 0.2s ease !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.circle-action-btn:hover {
  background: #ffffff !important;
  transform: scale(1.08);
}

/* Adopt Button Styles */
.circle-action-btn.adopt-btn.pending {
  color: #d97706 !important;
  background: #fffbeb !important;
  border: 1px solid #fcd34d !important;
}

.circle-action-btn.adopt-btn.pending:hover {
  background: #fef3c7 !important;
}

.circle-action-btn.adopt-btn.accepted {
  color: #ffffff !important;
  background: #10b981 !important;
  border: 1px solid #10b981 !important;
  cursor: default;
}

/* Chat Button style */
.circle-action-btn.chat-btn:hover {
  color: #3b82f6 !important;
}

/* Unfavorite Button Style */
.circle-action-btn.danger-btn:hover {
  color: #ef4444 !important;
}

/* Graph Card Styles */
.graph-card-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  padding: 16px;
  box-sizing: border-box;
}

.graph-card-icon-container {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.08);
  border: 1px dashed rgba(59, 130, 246, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  transition: all 0.3s ease;
}

.graph-network-icon {
  font-size: 26px;
  color: #3b82f6;
  transition: all 0.3s ease;
}

.graph-card-wrapper:hover .graph-card-icon-container {
  transform: rotate(45deg) scale(1.08);
  background: rgba(59, 130, 246, 0.12);
}

.graph-card-name {
  font-size: 14px;
  font-weight: 700;
  color: #3b82f6;
  margin-bottom: 10px;
  background: rgba(59, 130, 246, 0.05);
  padding: 3px 10px;
  border-radius: 20px;
  letter-spacing: 0.5px;
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.graph-card-desc {
  font-size: 13px;
  color: #475569;
  text-align: center;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 92%;
}

/* 文件夹卡片样式 */
.is-folder-card {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  border-radius: 12px;
  transition: all 0.2s ease;
}

.is-folder-card.is-dragover {
  border-color: #6366f1;
  background: #f8fafc;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1);
  transform: translateY(-2px);
}

.folder-card-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  cursor: pointer;
  position: relative;
  text-align: center;
  min-height: 180px;
}

.folder-card-icon {
  font-size: 48px;
  color: #f59e0b;
  margin-bottom: 12px;
  transition: transform 0.2s ease;
}

.is-folder-card:hover .folder-card-icon {
  transform: scale(1.1);
}

.folder-card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 8px;
}

.folder-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.is-folder-card:hover .folder-card-actions {
  opacity: 1;
}

.folder-action-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  color: #64748b;
  font-size: 13px;
  transition: all 0.2s ease;
}

.folder-action-btn:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.folder-action-btn.danger:hover {
  background: #fee2e2;
  color: #ef4444;
}

/* Folder preview cover style */
.folder-preview-wrapper {
  position: relative;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}

.folder-badge-tag {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(245, 158, 11, 0.95);
  color: #ffffff;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 10;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.folder-badge-icon {
  font-size: 12px;
}

.folder-preview-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  padding: 28px 12px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  z-index: 5;
}

.folder-preview-title {
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.folder-preview-actions {
  opacity: 0;
  transition: opacity 0.2s ease;
  display: flex;
}

.folder-preview-wrapper:hover .folder-preview-actions {
  opacity: 1;
}
</style>
