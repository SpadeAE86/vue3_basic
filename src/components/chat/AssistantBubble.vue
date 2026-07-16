<script setup lang="ts">
import { ref, onMounted, watch, nextTick, computed, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
// @ts-ignore
import MarkdownIt from 'markdown-it'
import type { ChatEvent } from '@/types/chat'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  event: ChatEvent
  isExpanded: boolean
  avatarUrl?: string
  avatarName?: string
  voiceCharacter?: string
  roleId?: string
  roleDescription?: string
  isSsePlaying?: boolean
  isSsePaused?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-expand'): void
  (e: 'toggle-sse-audio'): void
  (e: 'stop-sse-audio'): void
}>()

const router = useRouter()

const popoverVisible = ref(false)
const isLocked = ref(false)
let hideTimeout: ReturnType<typeof setTimeout> | null = null

function handleMouseEnter() {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  if (!isLocked.value) {
    popoverVisible.value = true
  }
}

function handleMouseLeave() {
  if (!isLocked.value) {
    hideTimeout = setTimeout(() => {
      popoverVisible.value = false
    }, 200)
  }
}

function handleCardMouseEnter() {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
}

function handleCardMouseLeave() {
  handleMouseLeave()
}

function handleAvatarClick(e: Event) {
  e.stopPropagation()
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  isLocked.value = !isLocked.value
  popoverVisible.value = true
  
  if (isLocked.value) {
    document.addEventListener('click', closePopoverOnOutsideClick)
  } else {
    document.removeEventListener('click', closePopoverOnOutsideClick)
  }
}

function closePopoverOnOutsideClick() {
  isLocked.value = false
  popoverVisible.value = false
  document.removeEventListener('click', closePopoverOnOutsideClick)
}

function goToRoleSpace() {
  if (props.roleId && props.roleId !== 'default') {
    isLocked.value = false
    popoverVisible.value = false
    document.removeEventListener('click', closePopoverOnOutsideClick)
    
    router.push({
      name: 'role-space',
      params: { role_id: props.roleId },
      query: { from: 'chat' }
    })
  } else {
    ElMessage.warning('默认角色不支持配置。')
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('click', closePopoverOnOutsideClick)
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
})

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

function cleanDisplayContent(text: string): string {
  if (!text) return ''
  // 1. 移除 <speak>...</speak> 块及其内容
  let cleaned = text.replace(/<speak>[\s\S]*?<\/speak>/gi, '')
  cleaned = cleaned.replace(/<speak>[\s\S]*$/gi, '')
  
  // 移除 <summary>...</summary> 块及其内容
  cleaned = cleaned.replace(/<summary>[\s\S]*?<\/summary>/gi, '')
  cleaned = cleaned.replace(/<summary>[\s\S]*$/gi, '')
  
  // 2. 移除 <display>, </display>, <both>, </both> 标签本身，保留内部内容
  cleaned = cleaned.replace(/<\/?(display|both)>/gi, '')
  return cleaned
}

const renderedHtml = computed(() => {
  if (!props.event.content) return ''
  const displayContent = cleanDisplayContent(props.event.content)
  return md.render(displayContent)
})

const bubbleBodyRef = ref<HTMLElement | null>(null)
const isLongMessage = ref(false)

const activeAudio = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const isLoading = ref(false)
const ttsUrlCache: Record<string, string[]> = {}

async function playTTS() {
  // 如果是当前正在播放或暂停的 SSE 流式音频，触发播放/暂停状态切换
  if (props.isSsePlaying || props.isSsePaused) {
    emit('toggle-sse-audio')
    return
  }

  const text = props.event.content
  if (!text) return

  // 播放普通的 TTS 音频时，先让可能正在播放的 SSE 流式音频停下来
  emit('stop-sse-audio')

  const voice = props.voiceCharacter || 'Vivi'
  const cacheKey = `${text}_${voice}`

  if (activeAudio.value) {
    activeAudio.value.pause()
    activeAudio.value = null
  }

  if (isPlaying.value) {
    isPlaying.value = false
    isLoading.value = false
    return
  }

  // 如果当前设置的音色和流式生成该气泡时的音色不匹配，说明音色已在角色面板被切换，此时应当失效旧音色分片，重新请求新音色
  const isVoiceMatch = !props.event.voiceCharacterUsed || props.event.voiceCharacterUsed === voice
  let cachedUrls = (isVoiceMatch ? props.event.voiceChunks?.filter(Boolean) : null) || ttsUrlCache[cacheKey]

  isLoading.value = true
  isPlaying.value = true

  const urls: string[] = []
  let isFetchingDone = false
  let currentIndex = 0
  let isAudioPlaying = false

  function playNext() {
    if (!isPlaying.value) {
      isAudioPlaying = false
      return
    }

    if (currentIndex < urls.length) {
      isLoading.value = false
      isAudioPlaying = true
      let audio = activeAudio.value
      if (!audio || audio.src.startsWith('blob:')) {
        audio = new Audio(urls[currentIndex] || '')
        activeAudio.value = audio
      } else {
        audio.src = urls[currentIndex] || ''
      }
      audio.onended = () => {
        currentIndex++
        playNext()
      }
      audio.onerror = () => {
        ElMessage.error('音频加载或播放失败')
        isPlaying.value = false
        isAudioPlaying = false
        activeAudio.value = null
      }
      audio.play().catch(err => {
        console.error('播放失败:', err)
        ElMessage.error('播放失败')
        isPlaying.value = false
        isAudioPlaying = false
        activeAudio.value = null
      })
    } else {
      isAudioPlaying = false
      if (isFetchingDone) {
        isPlaying.value = false
        activeAudio.value = null
      } else {
        isLoading.value = true
      }
    }
  }

  if (cachedUrls && cachedUrls.length > 0) {
    urls.push(...cachedUrls)
    isFetchingDone = true
    playNext()
    return
  }

  const byte_stream = new URLSearchParams(window.location.search).get('byte_stream') !== 'false'

  let mediaSource: MediaSource | null = null
  let sourceBuffer: SourceBuffer | null = null
  let chunkQueue: Uint8Array[] = []
  let mediaSourceOpened = false
  let useMSE = byte_stream && (typeof window.MediaSource !== 'undefined' && window.MediaSource.isTypeSupported('audio/mpeg'))

  function appendNextFromQueue() {
    if (!sourceBuffer || sourceBuffer.updating || chunkQueue.length === 0) {
      if (isFetchingDone && chunkQueue.length === 0 && sourceBuffer && !sourceBuffer.updating && mediaSource && mediaSource.readyState === 'open') {
        try {
          mediaSource.endOfStream()
        } catch (e) {
          console.warn('MSE endOfStream failed:', e)
        }
      }
      return
    }
    const nextChunk = chunkQueue.shift()!
    try {
      sourceBuffer.appendBuffer(nextChunk as any)
      if (activeAudio.value && activeAudio.value.paused && !isAudioPlaying) {
        isLoading.value = false
        isAudioPlaying = true
        activeAudio.value.play().catch(err => {
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
    activeAudio.value = audio
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
      activeAudio.value = null
    }
    audio.onerror = () => {
      console.error('MSE Audio error:', audio.error)
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
        bubble_id: props.event.id,
        byte_stream: byte_stream
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
        urls.push(chunkUrl)
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
                  if (activeAudio.value) {
                    activeAudio.value.src = raw.url
                  }
                }
                flushCurrentSegment()
                urls.push(raw.url)
                if (!isAudioPlaying) {
                  playNext()
                }
              }
            } else if (raw.event_type === 'sentence_end') {
              flushCurrentSegment()
            } else if (raw.event_type === 'merged_audio' && raw.url) {
              cachedUrls = [raw.url]
              ttsUrlCache[cacheKey] = [raw.url]
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

    if (urls.length > 0) {
      ttsUrlCache[cacheKey] = urls
    }

  } catch (err: any) {
    console.error(err)
    ElMessage.error(err.message || '语音合成失败')
    isLoading.value = false
    isPlaying.value = false
    isAudioPlaying = false
    if (activeAudio.value) {
      activeAudio.value.pause()
      activeAudio.value = null
    }
  }
}

function checkHeight() {
  nextTick(() => {
    if (bubbleBodyRef.value) {
      const textEl = bubbleBodyRef.value.querySelector('.markdown-body')
      if (textEl) {
        isLongMessage.value = textEl.scrollHeight > 260
      } else {
        isLongMessage.value = bubbleBodyRef.value.scrollHeight > 260
      }
    }
  })
}

watch(() => props.event.content, checkHeight)

onMounted(() => {
  checkHeight()
  setTimeout(checkHeight, 150)
})
</script>

<template>
  <div class="bubble assistant-bubble">
    <el-popover
      v-model:visible="popoverVisible"
      placement="right-start"
      :width="280"
      trigger="contextmenu"
      popper-class="avatar-popover"
    >
      <template #reference>
        <div
          class="avatar clickable-avatar"
          @mouseenter="handleMouseEnter"
          @mouseleave="handleMouseLeave"
          @click="handleAvatarClick"
        >
          <img v-if="avatarUrl" :src="avatarUrl" class="avatar-img" />
          <template v-else-if="avatarName">{{ avatarName.charAt(0).toUpperCase() }}</template>
          <template v-else>A</template>
        </div>
      </template>

      <div
        class="role-hover-card"
        @click.stop
        @mouseenter="handleCardMouseEnter"
        @mouseleave="handleCardMouseLeave"
      >
        <div
          class="role-card-link"
          v-if="roleId && roleId !== 'default'"
          @click="goToRoleSpace"
        >
          >> 进入角色空间
        </div>

        <div class="role-card-header">
          <img v-if="avatarUrl" :src="avatarUrl" class="role-card-avatar" />
          <div v-else class="role-card-avatar-placeholder">
            {{ avatarName ? avatarName.charAt(0).toUpperCase() : 'A' }}
          </div>
          <div class="role-card-meta">
            <h4 class="role-card-name">{{ avatarName || 'AI角色' }}</h4>
            <span class="role-card-tag" v-if="voiceCharacter">音色: {{ voiceCharacter }}</span>
          </div>
        </div>
        
        <div class="role-card-desc">
          {{ roleDescription || '这个角色还没有设定一句话核心人设。' }}
        </div>
      </div>
    </el-popover>
    <div
      ref="bubbleBodyRef"
      class="bubble-body"
      :class="{
        'is-long': isLongMessage,
        'is-collapsed': isLongMessage && !isExpanded
      }"
    >
      <!-- 滚动文本容器 -->
      <div class="bubble-scroll-container">
        <div class="markdown-body" v-html="renderedHtml" />
        <span v-if="event.streaming" class="cursor-blink">▍</span>
      </div>
      
      <!-- 渐变阴影遮罩 -->
      <div v-if="isLongMessage && !isExpanded" class="fade-overlay" />
      
      <!-- 折叠/展开控制 -->
      <div v-if="isLongMessage" class="toggle-container" :class="{ 'is-sticky': isExpanded }">
        <button class="toggle-btn" @click.stop="emit('toggle-expand')">
          {{ isExpanded ? '收起全文' : '展开全文' }}
        </button>
      </div>

      <!-- TTS Read Aloud Icon -->
      <div 
        class="tts-bubble-btn" 
        :class="{ 'is-active': isLoading || isPlaying || isSsePlaying || isSsePaused }" 
        @click.stop="playTTS"
        title="朗读此条回复"
      >
        <el-icon v-if="isLoading" class="is-loading"><i-ep-loading /></el-icon>
        <el-icon v-else-if="isPlaying || isSsePlaying"><i-ep-video-pause /></el-icon>
        <el-icon v-else><i-ep-microphone /></el-icon>
      </div>
    </div>
  </div>
</template>

<style scoped>
.assistant-bubble {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.avatar {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bubble-body {
  position: relative;
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 2px 12px 12px 12px;
  background: #fff;
  border: 1px solid #ebeef5;
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: max-height 0.25s ease;
}

.bubble-body.is-collapsed {
  max-height: 260px;
  display: flex;
  flex-direction: column;
  padding-bottom: 28px; /* 留出底部控制按钮空间 */
}

.bubble-body.is-collapsed .bubble-scroll-container {
  max-height: 100%;
  overflow-y: auto;
}

/* 滚动条美化 */
.bubble-scroll-container::-webkit-scrollbar {
  width: 4px;
}
.bubble-scroll-container::-webkit-scrollbar-track {
  background: transparent;
}
.bubble-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
}
.bubble-scroll-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}

.fade-overlay {
  position: absolute;
  bottom: 28px;
  left: 1px;
  right: 1px;
  height: 40px;
  background: linear-gradient(to top, #fff 20%, rgba(255, 255, 255, 0) 100%);
  pointer-events: none;
  z-index: 4;
}

.toggle-container {
  position: absolute;
  bottom: 4px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 5;
  background: #fff;
  padding-top: 4px;
  padding-bottom: 4px;
  border-radius: 0 0 12px 12px;
}

.toggle-container.is-sticky {
  position: sticky;
  bottom: 12px;
  left: 0;
  right: 0;
  margin-top: 10px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  width: fit-content;
  margin-left: auto;
  margin-right: auto;
  padding: 4px 12px;
  border: 1px solid #ebeef5;
}

.toggle-btn {
  background: none;
  border: none;
  color: #6366f1;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: rgba(99, 102, 241, 0.08);
  color: #4f46e5;
}

/* markdown 基础样式 */
.markdown-body :deep(p) {
  margin: 0 0 8px 0;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}
.markdown-body :deep(code) {
  background: #f0f0f5;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', monospace;
}
.markdown-body :deep(pre) {
  background: #1e1e2e;
  color: #cdd6f4;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}
.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}
.markdown-body :deep(ul), .markdown-body :deep(ol) {
  padding-left: 20px;
  margin: 4px 0;
}

.cursor-blink {
  animation: blink 1s infinite;
  color: #6366f1;
  font-weight: 300;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* --- TTS Read Aloud Button --- */
.tts-bubble-btn {
  position: absolute;
  right: 8px;
  bottom: 8px;
  cursor: pointer;
  color: #909399;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 50%;
  background: #f1f5f9;
  width: 20px;
  height: 20px;
  z-index: 10;
  transition: all 0.2s;
  box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.tts-bubble-btn:hover {
  color: #6366f1;
  background: rgba(99, 102, 241, 0.12);
}
.bubble-body:hover .tts-bubble-btn {
  display: inline-flex;
}
.tts-bubble-btn.is-active {
  display: inline-flex;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.12);
}

/* Avatar Hover Effects */
.clickable-avatar {
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.clickable-avatar:hover {
  transform: scale(1.1);
}

/* Hover Card Styling */
.role-hover-card {
  position: relative;
  padding: 8px;
  background: #ffffff;
}

.role-card-link {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 11px;
  color: #6366f1;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.15s ease;
  user-select: none;
}

.role-card-link:hover {
  color: #4f46e5;
  text-decoration: underline;
  transform: translateX(2px);
}

.role-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.role-card-avatar {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid #e2e8f0;
}

.role-card-avatar-placeholder {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
}

.role-card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.role-card-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.role-card-tag {
  font-size: 11px;
  color: #64748b;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
  width: fit-content;
}

.role-card-desc {
  font-size: 12px;
  color: #475569;
  line-height: 1.5;
  margin-bottom: 12px;
  word-break: break-word;
  background: #f8fafc;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #f1f5f9;
}

/* configure-role-btn style removed */

:deep(.el-popper.avatar-popover) {
  padding: 12px !important;
  border-radius: 8px !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
  border: 1px solid #e2e8f0 !important;
}
</style>
