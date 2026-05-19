/**
 * useVideoMatchAudio.ts
 * 负责视频匹配页面的共享音频播放、TTS生成等相关逻辑
 */
import { ref, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { synthesizeShotAudioApi as generateTTS } from '@/api/video_match'

export function useVideoMatchAudio(matchHitRows: any) {
  const sharedAudioRef = ref<HTMLAudioElement | null>(null)
  const isPlayingAudio = ref(false)
  const currentPlayingUrl = ref('')
  const audioError = ref('')

  const handleAudioPlay = () => {
    isPlayingAudio.value = true
    audioError.value = ''
  }

  const handleAudioPause = () => {
    isPlayingAudio.value = false
  }

  const handleAudioEnded = () => {
    isPlayingAudio.value = false
    currentPlayingUrl.value = ''
    if (sharedAudioRef.value) {
      sharedAudioRef.value.src = ''
    }
  }

  const handleAudioError = (e: Event) => {
    console.error('Audio playback error', e)
    isPlayingAudio.value = false
    currentPlayingUrl.value = ''
    audioError.value = '音频加载或播放失败'
    ElMessage.error(audioError.value)
  }

  const triggerTTSAndPlay = async (row: any, ttsText: string, forceRegenerate = false) => {
    if (!ttsText || !ttsText.trim()) {
      ElMessage.warning('没有可用于生成的文本')
      return
    }

    if (currentPlayingUrl.value === row.tts_audio_url && isPlayingAudio.value && !forceRegenerate) {
      pauseAudio()
      return
    }

    if (!forceRegenerate && row.tts_audio_url) {
      playAudio(row.tts_audio_url)
      return
    }

    try {
      row.is_generating_tts = true
      const res = await generateTTS(ttsText)
      if (res && res.audio_url) {
        row.tts_audio_url = res.audio_url
        playAudio(res.audio_url)
      } else {
        ElMessage.error('TTS生成失败，未返回音频地址')
      }
    } catch (e: any) {
      console.error(e)
      ElMessage.error('TTS生成接口异常: ' + (e.message || String(e)))
    } finally {
      row.is_generating_tts = false
    }
  }

  const playAudio = (url: string) => {
    if (!url) return
    if (sharedAudioRef.value) {
      sharedAudioRef.value.src = url
      sharedAudioRef.value.play().catch(e => {
        console.error('播放失败:', e)
        ElMessage.error('播放失败，请检查浏览器限制或跨域问题')
        isPlayingAudio.value = false
        currentPlayingUrl.value = ''
      })
      currentPlayingUrl.value = url
    }
  }

  const pauseAudio = () => {
    if (sharedAudioRef.value) {
      sharedAudioRef.value.pause()
      isPlayingAudio.value = false
    }
  }

  const stopAllAudio = () => {
    pauseAudio()
    currentPlayingUrl.value = ''
    if (sharedAudioRef.value) {
      sharedAudioRef.value.src = ''
    }
  }

  onUnmounted(() => {
    stopAllAudio()
  })

  return {
    sharedAudioRef,
    isPlayingAudio,
    currentPlayingUrl,
    audioError,
    handleAudioPlay,
    handleAudioPause,
    handleAudioEnded,
    handleAudioError,
    triggerTTSAndPlay,
    playAudio,
    pauseAudio,
    stopAllAudio
  }
}
