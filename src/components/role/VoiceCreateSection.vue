<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'

interface VoiceModel {
  id: number
  voice_character: string
  voice_code: string
  voice_model_type: string
  note: string
  is_enabled: boolean
  priority: number
  age_type: string
  sex: string
  full_voice?: string
  is_online?: boolean
  provider?: string
  is_custom?: boolean
  raw_id?: number
  type?: string
  status?: number
  prompt_text?: string
  tag?: string
  available_training_times?: number
  demo_text?: string
}

const props = defineProps<{
  voiceOnline: boolean
  retrainItem: VoiceModel | null
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'saved', val: string): void
}>()

// Form states
const createName = ref('')
const createProvider = ref('volcano')
const localProvider = ref('qwen3_local')
const createMode = ref('clone') // 'clone' or 'design'
const createDescription = ref('')
const createAgeType = ref('青年')
const createSex = ref('0')
const createPreviewText = ref('你好，我是你的专属AI克隆声音，希望未来可以好好相处哦')
const createPromptText = ref('')

// File upload states
const fileInputRef = ref<any>(null)
const uploadFile = ref<File | null>(null)
const uploadFileName = ref('')
const refAudioUrlToPreFill = ref('')
const isDragOver = ref(false)

// Tag states
const createTags = ref<string[]>([])
const tagInputText = ref('')

// Generation & player states
const isGenerating = ref(false)
const isGeneratingPreview = ref(false)
const isSaving = ref(false)
const showCandidatesSection = ref(false)
const candidates = ref<any[]>([])
const selectedCandidateId = ref<number | null>(null)

// Players
const isPlayingLocalFile = ref(false)
const localFileAudioUrl = ref('')
let localFileAudioInstance: HTMLAudioElement | null = null

const isPlayingCurrentVoice = ref(false)
let currentVoiceAudioInstance: HTMLAudioElement | null = null
const upgradedVoiceDemoAudioUrl = ref('')

const playingCandidateId = ref<number | null>(null)
let playingCandidateAudio: HTMLAudioElement | null = null

const infoDialogVisible = ref(false)
const isEditingOnly = ref(false)

function openMetadataEditOnly() {
  isEditingOnly.value = true
  if (props.retrainItem) {
    createName.value = props.retrainItem.voice_character.endsWith(' 2.0') ? props.retrainItem.voice_character.slice(0, -4) : props.retrainItem.voice_character
    createDescription.value = props.retrainItem.note && props.retrainItem.note !== '自定义克隆音色' && props.retrainItem.note !== '自定义设计音色' ? props.retrainItem.note : ''
    createAgeType.value = props.retrainItem.age_type || '青年'
    createSex.value = props.retrainItem.sex || '0'
    if (props.retrainItem.tag) {
      createTags.value = props.retrainItem.tag.split(',').map((t: string) => t.trim()).filter(Boolean)
    } else {
      createTags.value = []
    }
  }
  infoDialogVisible.value = true
}

// Watch retrain item to pre-populate or clear form
watch(() => props.retrainItem, (item) => {
  if (item) {
    createName.value = item.voice_character.endsWith(' 2.0') ? item.voice_character.slice(0, -4) : item.voice_character
    createProvider.value = item.provider || 'volcano'
    createMode.value = item.type === 'designed' ? 'design' : 'clone'
    createDescription.value = item.note && item.note !== '自定义克隆音色' && item.note !== '自定义设计音色' ? item.note : ''
    createAgeType.value = item.age_type || '青年'
    createSex.value = item.sex || '0'
    createPromptText.value = item.prompt_text || ''
    createPreviewText.value = item.demo_text || '你好，我是你的专属AI克隆声音，希望未来可以好好相处哦'
    
    upgradedVoiceDemoAudioUrl.value = item.full_voice || ''
    showCandidatesSection.value = false
    
    if (item.tag) {
      createTags.value = item.tag.split(',').map((t: string) => t.trim()).filter(Boolean)
    } else {
      createTags.value = []
    }
    tagInputText.value = ''
    
    if ((item as any).ref_audio_url) {
      refAudioUrlToPreFill.value = (item as any).ref_audio_url
      const urlParts = (item as any).ref_audio_url.split('/')
      const lastPart = urlParts[urlParts.length - 1].split('?')[0]
      uploadFileName.value = decodeURIComponent(lastPart) || '原参考音频.wav'
      uploadFile.value = null
    } else {
      refAudioUrlToPreFill.value = ''
      uploadFile.value = null
      uploadFileName.value = ''
    }
  } else {
    // Standard creation mode
    createName.value = ''
    createProvider.value = 'volcano'
    createMode.value = 'clone'
    createDescription.value = ''
    createAgeType.value = '青年'
    createSex.value = '0'
    createPreviewText.value = '你好，我是你的专属AI克隆声音，希望未来可以好好相处哦'
    createPromptText.value = ''
    
    upgradedVoiceDemoAudioUrl.value = ''
    showCandidatesSection.value = false
    createTags.value = []
    tagInputText.value = ''
    refAudioUrlToPreFill.value = ''
    uploadFile.value = null
    uploadFileName.value = ''
  }
  
  cleanupCandidates()
}, { immediate: true })

onBeforeUnmount(() => {
  stopLocalFilePreview()
  stopCurrentVoicePreview()
  if (playingCandidateAudio) {
    playingCandidateAudio.pause()
  }
})

// File Drag & Drop Handlers
function handleDragOver() {
  isDragOver.value = true
}
function handleDragLeave() {
  isDragOver.value = false
}
function handleDrop(e: DragEvent) {
  isDragOver.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    const file = files[0]
    if (file) {
      if (file.type.startsWith('audio/') || file.name.endsWith('.wav') || file.name.endsWith('.mp3') || file.name.endsWith('.ogg') || file.name.endsWith('.m4a') || file.name.endsWith('.aac')) {
        uploadFile.value = file
        uploadFileName.value = file.name
      } else {
        ElMessage.warning('只支持音频格式文件')
      }
    }
  }
}

function triggerFileSelect() {
  fileInputRef.value?.click()
}
function handleFileChange(event: any) {
  const files = event.target.files
  if (files && files.length > 0) {
    uploadFile.value = files[0]
    uploadFileName.value = files[0].name
  }
}
function clearUploadFile() {
  uploadFile.value = null
  refAudioUrlToPreFill.value = ''
  uploadFileName.value = ''
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
  stopLocalFilePreview()
}

// Local references player
function stopLocalFilePreview() {
  if (localFileAudioInstance) {
    localFileAudioInstance.pause()
    localFileAudioInstance = null
  }
  isPlayingLocalFile.value = false
}
function togglePlayLocalFile() {
  if (!uploadFile.value && !refAudioUrlToPreFill.value) return
  
  if (isPlayingLocalFile.value) {
    stopLocalFilePreview()
    return
  }
  
  let playUrl = ''
  if (uploadFile.value) {
    playUrl = URL.createObjectURL(uploadFile.value)
    localFileAudioUrl.value = playUrl
  } else if (refAudioUrlToPreFill.value) {
    playUrl = refAudioUrlToPreFill.value
  }
  
  if (!playUrl) return
  
  stopLocalFilePreview()
  stopCurrentVoicePreview()
  if (playingCandidateAudio) {
    playingCandidateAudio.pause()
    playingCandidateAudio = null
    playingCandidateId.value = null
  }
  
  isPlayingLocalFile.value = true
  localFileAudioInstance = new Audio(playUrl)
  localFileAudioInstance.onended = () => {
    isPlayingLocalFile.value = false
    localFileAudioInstance = null
    if (uploadFile.value) {
      URL.revokeObjectURL(playUrl)
    }
  }
  localFileAudioInstance.onerror = () => {
    ElMessage.error('无法播放此音频文件')
    isPlayingLocalFile.value = false
    localFileAudioInstance = null
    if (uploadFile.value) {
      URL.revokeObjectURL(playUrl)
    }
  }
  localFileAudioInstance.play().catch(err => {
    console.error(err)
    isPlayingLocalFile.value = false
    localFileAudioInstance = null
  })
}

// Original/Current Voice player
function stopCurrentVoicePreview() {
  if (currentVoiceAudioInstance) {
    currentVoiceAudioInstance.pause()
    currentVoiceAudioInstance = null
  }
  isPlayingCurrentVoice.value = false
}
function togglePlayCurrentVoice() {
  if (!upgradedVoiceDemoAudioUrl.value) return
  
  if (isPlayingCurrentVoice.value) {
    stopCurrentVoicePreview()
    return
  }
  
  stopLocalFilePreview()
  if (playingCandidateAudio) {
    playingCandidateAudio.pause()
    playingCandidateAudio = null
    playingCandidateId.value = null
  }
  
  isPlayingCurrentVoice.value = true
  currentVoiceAudioInstance = new Audio(upgradedVoiceDemoAudioUrl.value)
  currentVoiceAudioInstance.onended = () => {
    isPlayingCurrentVoice.value = false
    currentVoiceAudioInstance = null
  }
  currentVoiceAudioInstance.onerror = () => {
    ElMessage.error('播放原音色预览失败')
    isPlayingCurrentVoice.value = false
    currentVoiceAudioInstance = null
  }
  currentVoiceAudioInstance.play().catch(err => {
    console.error(err)
    isPlayingCurrentVoice.value = false
    currentVoiceAudioInstance = null
  })
}

// Audition candidates player
function togglePlayCandidate(cand: any) {
  if (!cand.demo_audio_url) {
    ElMessage.warning('预览音频尚未生成完毕，请稍候...')
    return
  }

  if (playingCandidateId.value === cand.id) {
    if (playingCandidateAudio) {
      playingCandidateAudio.pause()
      playingCandidateAudio = null
    }
    playingCandidateId.value = null
    return
  }

  if (playingCandidateAudio) {
    playingCandidateAudio.pause()
  }

  stopLocalFilePreview()
  stopCurrentVoicePreview()

  playingCandidateId.value = cand.id
  playingCandidateAudio = new Audio(cand.demo_audio_url)
  
  playingCandidateAudio.onended = () => {
    playingCandidateId.value = null
    playingCandidateAudio = null
  }
  playingCandidateAudio.onerror = () => {
    ElMessage.error('播放预览音频失败')
    playingCandidateId.value = null
    playingCandidateAudio = null
  }
  playingCandidateAudio.play().catch(err => {
    console.error('播放失败:', err)
    playingCandidateId.value = null
    playingCandidateAudio = null
  })
}

// Tag inputs helpers
function addCreateTag() {
  const val = tagInputText.value.trim()
  if (val) {
    const tags = val.split(/[，,；;]+/).map(t => t.trim()).filter(t => t && !createTags.value.includes(t))
    createTags.value.push(...tags)
  }
  tagInputText.value = ''
}
function removeCreateTag(tag: string) {
  createTags.value = createTags.value.filter(t => t !== tag)
}

// Cleanup candidates
async function cleanupCandidates() {
  if (playingCandidateAudio) {
    playingCandidateAudio.pause()
    playingCandidateAudio = null
  }
  playingCandidateId.value = null
  stopLocalFilePreview()
  stopCurrentVoicePreview()

  if (candidates.value.length === 0) return

  const toDelete = [...candidates.value]
  candidates.value = []
  selectedCandidateId.value = null

  for (const cand of toDelete) {
    try {
      const isClone = cand.type === 'cloned'
      const endpoint = isClone ? `/api/audio/voices/cloned/${cand.id}` : `/api/audio/voices/designed/${cand.id}`
      await fetch(endpoint, { method: 'DELETE' })
    } catch (e) {
      console.error(`Failed to clean up candidate ${cand.id}:`, e)
    }
  }
}

// Parallel candidate generation
async function handleCreateVoice() {
  const isOnline = props.voiceOnline
  const provider = isOnline ? createProvider.value : 'qwen3_local'
  
  if (isOnline) {
    if (createMode.value === 'clone') {
      if (!uploadFile.value && !refAudioUrlToPreFill.value) {
        ElMessage.warning('请选择参考音频文件')
        return
      }
    }
    if (createMode.value === 'design' && !createPromptText.value.trim()) {
      ElMessage.warning('请输入声音设计提示词')
      return
    }
  } else {
    if (!uploadFile.value && !createPromptText.value.trim()) {
      ElMessage.warning('请上传参考音频或输入声音设计提示词（至少提供一项）')
      return
    }
  }

  if (createPreviewText.value.length > 50) {
    ElMessage.warning('测试朗读文本不能超过50个字')
    return
  }

  isGenerating.value = true
  addCreateTag()
  const tagString = createTags.value.join(',')

  try {
    await cleanupCandidates()

    const tempNamePrefix = 'custom_cand'
    const requests = Array.from({ length: 3 }, (_, i) => {
      const formData = new FormData()
      formData.append('is_online', String(isOnline ? 1 : 0))
      formData.append('provider', provider)
      const randomSuffix = Math.random().toString(36).substring(2, 8)
      const tempCharacterName = `${tempNamePrefix}_${i + 1}_${randomSuffix}`
      formData.append('voice_character', tempCharacterName)
      formData.append('tag', tagString)
      formData.append('description', createDescription.value.trim())
      formData.append('age_type', createAgeType.value)
      formData.append('sex', createSex.value)
      formData.append('demo_text', createPreviewText.value.trim())
      
      if (uploadFile.value) {
        formData.append('file', uploadFile.value)
      } else if (refAudioUrlToPreFill.value) {
        formData.append('ref_audio_url', refAudioUrlToPreFill.value)
      }
      
      if (isOnline) {
        if (createMode.value === 'design') {
          formData.append('text', createPromptText.value.trim())
        } else if (createMode.value === 'clone' && provider === 'volcano') {
          formData.append('text', createPromptText.value.trim())
        }
      } else {
        if (createPromptText.value.trim()) {
          formData.append('text', createPromptText.value.trim())
        }
      }
      return formData
    })

    ElMessage.info('正在同时生成 3 个备选音色，这可能需要一些时间，请稍候...')

    const results = await Promise.all(
      requests.map(async (formData) => {
        const response = await fetch('/api/audio/timbre', {
          method: 'POST',
          body: formData
        })
        const resData = await response.json()
        if (response.status !== 200 || resData.code !== 200) {
          throw new Error(resData.detail || resData.message || '创建自定义音色失败')
        }
        return resData.data
      })
    )

    ElMessage.success('3 个备选音色均已提交或生成成功！正在拉取音频预览，请稍候...')
    showCandidatesSection.value = true
    
    candidates.value = results.map((res: any, index: number) => {
      const isClone = createMode.value === 'clone'
      return {
        ...res,
        type: isClone ? 'cloned' : 'designed',
        label: `效果${index + 1}`,
        demo_audio_url: res.demo_audio_url || '',
        error: ''
      }
    })

    selectedCandidateId.value = candidates.value[0].id
    isGeneratingPreview.value = true
    
    let pollAttempts = 0
    const maxAttempts = 35

    async function checkStatus() {
      pollAttempts++
      try {
        const clonedRes = await fetch('/api/audio/voices/cloned')
        const clonedData = await clonedRes.json()
        const designedRes = await fetch('/api/audio/voices/designed')
        const designedData = await designedRes.json()
        
        const allCloned = clonedData.code === 200 && Array.isArray(clonedData.data) ? clonedData.data : []
        const allDesigned = designedData.code === 200 && Array.isArray(designedData.data) ? designedData.data : []
        
        let allReady = true
        for (const cand of candidates.value) {
          if (cand.demo_audio_url) continue
          
          const rawId = cand.id
          let dbRecord: any = null
          
          if (cand.type === 'cloned') {
            dbRecord = allCloned.find((v: any) => v.id === rawId)
            if (!dbRecord || !dbRecord.demo_audio_url) {
              try {
                const sRes = await fetch(`/api/audio/voices/cloned/${rawId}/status`)
                const sData = await sRes.json()
                if (sData.code === 200 && sData.data) {
                  dbRecord = sData.data
                }
              } catch (e) {}
            }
          } else {
            dbRecord = allDesigned.find((v: any) => v.id === rawId)
          }
          
          if (dbRecord) {
            if (dbRecord.demo_audio_url) {
              cand.demo_audio_url = dbRecord.demo_audio_url
            } else if (dbRecord.status === 3) {
              cand.error = dbRecord.error_message || '训练失败'
            }
          }
          
          if (!cand.demo_audio_url && !cand.error) {
            allReady = false
          }
        }
        
        if (allReady) {
          isGeneratingPreview.value = false
          if (candidates.value[0] && candidates.value[0].demo_audio_url) {
            togglePlayCandidate(candidates.value[0])
          }
          return
        }
      } catch (err) {
        console.error('Polling candidates error:', err)
      }

      if (pollAttempts < maxAttempts && candidates.value.length > 0) {
        setTimeout(checkStatus, 3000)
      } else {
        isGeneratingPreview.value = false
      }
    }

    setTimeout(checkStatus, 1500)
  } catch (err: any) {
    console.error(err)
    ElMessage.error(err.message || '音色生成失败')
  } finally {
    isGenerating.value = false
  }
}

// Confirmation info modal
function openInfoDialog() {
  if (selectedCandidateId.value === null) {
    ElMessage.warning('请选择一个音色效果')
    return
  }
  if (!createAgeType.value) createAgeType.value = '青年'
  if (!createSex.value) createSex.value = '0'
  isEditingOnly.value = false
  infoDialogVisible.value = true
}

async function handleConfirmVoice() {
  if (!createName.value.trim()) {
    ElMessage.warning('请输入音色名称')
    return
  }

  addCreateTag()
  const tagString = createTags.value.join(',')

  isSaving.value = true
  try {
    if (isEditingOnly.value) {
      if (!props.retrainItem) return
      const response = await fetch(`/api/audio/voices/${props.retrainItem.type}/${props.retrainItem.raw_id}/metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          voice_character: createName.value.trim(),
          note: createDescription.value.trim(),
          tag: tagString,
          sex: createSex.value,
          age_type: createAgeType.value
        })
      })
      const resData = await response.json()
      if (response.status !== 200 || resData.code !== 200) {
        throw new Error(resData.detail || resData.message || '修改音色元数据失败')
      }
      ElMessage.success('音色元数据修改成功！')
      infoDialogVisible.value = false
      emit('saved', createName.value.trim())
      return
    }

    if (selectedCandidateId.value === null) {
      ElMessage.warning('请选择一个音色效果')
      isSaving.value = false
      return
    }

    const selectedCand = candidates.value.find(c => c.id === selectedCandidateId.value)
    if (!selectedCand) {
      isSaving.value = false
      return
    }

    const candidateIds = candidates.value.map(c => c.id)
    const response = await fetch('/api/audio/timbre/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        selected_id: selectedCandidateId.value,
        selected_type: selectedCand.type,
        target_name: createName.value.trim(),
        candidate_ids: candidateIds,
        tag: tagString,
        description: createDescription.value.trim(),
        age_type: createAgeType.value,
        sex: createSex.value,
        update_to_link_id: props.retrainItem ? props.retrainItem.raw_id : null,
        update_to_link_type: props.retrainItem ? props.retrainItem.type : null
      })
    })

    const resData = await response.json()
    if (response.status !== 200 || resData.code !== 200) {
      throw new Error(resData.detail || resData.message || '确认并保存音色失败')
    }

    ElMessage.success('自定义音色保存成功！')
    
    candidates.value = []
    selectedCandidateId.value = null
    
    if (playingCandidateAudio) {
      playingCandidateAudio.pause()
      playingCandidateAudio = null
    }
    playingCandidateId.value = null

    infoDialogVisible.value = false
    emit('saved', createName.value.trim())
  } catch (err: any) {
    console.error(err)
    ElMessage.error(err.message || '保存音色失败')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div>
    <!-- Display Selected Voice for Retraining -->
    <div v-if="props.retrainItem" class="retrain-info-card" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; background-color: #f8fafc; padding: 10px 16px; border-radius: 10px; border: 1px solid #e2e8f0;">
      <div style="font-size: 13px; font-weight: 600; color: #475569; display: flex; align-items: center; gap: 8px;">
        <span>当前更新音色:</span>
        <span style="color: #4f46e5; font-weight: 700; background: #e0e7ff; padding: 2px 8px; border-radius: 6px;">{{ props.retrainItem.voice_character }}</span>
      </div>
      <el-button 
        type="primary" 
        size="small" 
        plain
        @click="openMetadataEditOnly"
        style="border-color: #6366f1; color: #6366f1;"
      >
        <el-icon style="margin-right: 4px;"><i-ep-edit /></el-icon>
        只修改元数据
      </el-button>
    </div>

    <el-form label-position="top">
      <!-- Options Row: Provider and Mode side-by-side on one row -->
      <div class="options-row" style="display: flex; gap: 32px; align-items: center; margin-bottom: 20px; background-color: #f8fafc; padding: 10px 16px; border-radius: 10px; border: 1px dashed #e2e8f0;">
        <!-- Service Provider -->
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 13px; font-weight: 600; color: #475569; white-space: nowrap;">服务商/模型:</span>
          <el-radio-group v-if="props.voiceOnline" v-model="createProvider" size="small">
            <el-radio-button label="volcano">火山引擎</el-radio-button>
            <el-radio-button label="qwen">阿里百炼</el-radio-button>
          </el-radio-group>
          <el-radio-group v-else v-model="localProvider" size="small">
            <el-radio-button label="qwen3_local">Qwen3-TTS (本地)</el-radio-button>
          </el-radio-group>
        </div>

        <!-- Creation Mode -->
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 13px; font-weight: 600; color: #475569; white-space: nowrap;">创建方式:</span>
          <el-radio-group v-model="createMode" size="small">
            <el-radio-button label="clone">声音克隆</el-radio-button>
            <el-radio-button label="design">声音设计</el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <!-- 3. 声音克隆输入：参考音频上传 (仅 clone 模式显示) -->
      <div v-if="createMode === 'clone'">
        <el-form-item label="上传参考音频 (格式: wav/mp3/ogg 等)" required style="margin-bottom: 16px;">
          <div 
            class="upload-drop-zone" 
            :class="{ 'is-dragover': isDragOver }"
            @click="triggerFileSelect" 
            @dragover.prevent="handleDragOver"
            @dragenter.prevent="handleDragOver"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleDrop"
            style="padding: 20px 16px; text-align: center;"
          >
            <input 
              type="file" 
              ref="fileInputRef" 
              style="display: none" 
              accept="audio/*" 
              @change="handleFileChange" 
            />
            <el-icon class="upload-icon" style="font-size: 24px; margin-bottom: 8px;"><i-ep-upload-filled /></el-icon>
            <div v-if="!uploadFile && !refAudioUrlToPreFill" class="upload-text" style="font-size: 13px;">点击或拖拽音频文件到此处上传</div>
            <div v-else class="upload-file-info" style="font-size: 13px; display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
              <el-button 
                circle 
                size="small" 
                :type="isPlayingLocalFile ? 'danger' : 'primary'"
                @click.stop="togglePlayLocalFile"
                style="margin-right: 4px;"
              >
                <el-icon v-if="isPlayingLocalFile"><i-ep-video-pause /></el-icon>
                <el-icon v-else><i-ep-video-play /></el-icon>
              </el-button>
              <span class="file-name" style="max-width: 240px; font-weight: 500; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle;">{{ uploadFileName }}</span>
              <el-button link type="danger" @click.stop="clearUploadFile" size="small" style="margin-left: 8px; vertical-align: middle;">删除</el-button>
            </div>
          </div>
        </el-form-item>
        
        <!-- 离线/火山在线克隆可同时输入提示文本 -->
        <el-form-item v-if="!props.voiceOnline || createProvider === 'volcano'" label="音频对应文本 (选填)" style="margin-bottom: 16px;">
          <el-input 
            v-model="createPromptText" 
            type="textarea" 
            :rows="2" 
            placeholder="请输入您上传的音频中朗读的文本内容 (非必填)" 
            size="small"
          />
        </el-form-item>
      </div>

      <!-- 4. 声音设计输入：描述提示词 (仅 design 模式显示) -->
      <el-form-item v-if="createMode === 'design'" label="声音设计提示词" required style="margin-bottom: 16px;">
        <el-input
          v-model="createPromptText"
          type="textarea"
          :rows="3"
          placeholder="请用文字描述您想要的声音，例如：'一个甜美温柔的年轻女性声音，说话语速偏慢，带有微笑感。'"
          size="small"
        />
      </el-form-item>

      <!-- 5. 测试朗读文本 (预览生成) -->
      <el-form-item label="测试朗读预览 (可选，不超过50字)" style="margin-bottom: 16px;">
        <el-input
          v-model="createPreviewText"
          type="textarea"
          :rows="2"
          placeholder="输入想要试听的测试文本"
          maxlength="50"
          show-word-limit
          size="small"
        />
      </el-form-item>

      <!-- 6. 当前音频效果 (Step 3: Only visible when retrainItem exists, stays static) -->
      <div v-if="props.retrainItem" class="current-voice-effect-section" style="margin-top: 24px; border-top: 1px dashed #e2e8f0; padding-top: 16px;">
        <div class="section-title" style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <span class="step-num" style="display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #6366f1; color: white; font-size: 10px;">3</span>
          当前音频效果
        </div>
        
        <div 
          class="current-voice-card"
          :class="{ 'is-playing': isPlayingCurrentVoice }"
          @click="togglePlayCurrentVoice"
          style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; cursor: pointer; transition: all 0.2s;"
        >
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="play-btn-circle" style="width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: #6366f1; color: white; transition: all 0.2s;">
              <el-icon v-if="isPlayingCurrentVoice"><i-ep-video-pause /></el-icon>
              <el-icon v-else><i-ep-video-play /></el-icon>
            </div>
            <span style="font-size: 13px; font-weight: 500; color: #334155;">当前音色试听预览</span>
          </div>
          <div style="font-size: 12px; color: #64748b;">点击播放原音色效果</div>
        </div>
      </div>

      <!-- 7. 备选音色结果区 (Step 4 when retrainItem exists, otherwise Step 3) -->
      <div v-if="showCandidatesSection && candidates.length > 0" class="candidates-result-section" style="margin-top: 24px; border-top: 1px dashed #e2e8f0; padding-top: 16px;">
        <div class="section-title" style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <span class="step-num" style="display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #6366f1; color: white; font-size: 10px;">{{ props.retrainItem ? '4' : '3' }}</span>
          生成音色结果 (请试听并选择最喜欢的效果)
        </div>

        <div class="candidates-container" style="display: flex; flex-direction: column; gap: 8px;">
          <div 
            v-for="(cand, idx) in candidates" 
            :key="cand.id" 
            class="candidate-card-premium"
            :class="{ 
              'is-selected': selectedCandidateId === cand.id,
              'is-playing': playingCandidateId === cand.id
            }"
            @click="selectedCandidateId = cand.id"
            style="padding: 10px 16px; border-radius: 12px;"
          >
            <div class="card-left">
              <div class="play-btn-circle" @click.stop="togglePlayCandidate(cand)" style="width: 30px; height: 30px; font-size: 13px;">
                <el-icon v-if="playingCandidateId === cand.id"><i-ep-video-pause /></el-icon>
                <el-icon v-else><i-ep-video-play /></el-icon>
              </div>
              <span class="cand-label" style="font-size: 13px;">效果{{ idx + 1 }}</span>
            </div>

            <!-- Waveform decoration -->
            <div class="waveform-premium" style="margin: 0 20px; height: 28px;">
              <span v-if="!cand.demo_audio_url && !cand.error" class="waveform-loading-text" style="font-size: 11px;">音色生成中...</span>
              <span v-else-if="cand.error" class="waveform-error-text" style="font-size: 11px;">{{ cand.error }}</span>
              <div class="waveform-bars" :class="{ 'is-active-playing': playingCandidateId === cand.id }" style="gap: 3px;">
                <span class="wbar wbar-1" style="width: 2.5px;"></span>
                <span class="wbar wbar-2" style="width: 2.5px;"></span>
                <span class="wbar wbar-3" style="width: 2.5px;"></span>
                <span class="wbar wbar-4" style="width: 2.5px;"></span>
                <span class="wbar wbar-5" style="width: 2.5px;"></span>
                <span class="wbar wbar-6" style="width: 2.5px;"></span>
                <span class="wbar wbar-7" style="width: 2.5px;"></span>
                <span class="wbar wbar-8" style="width: 2.5px;"></span>
                <span class="wbar wbar-9" style="width: 2.5px;"></span>
                <span class="wbar wbar-10" style="width: 2.5px;"></span>
              </div>
            </div>

            <div class="card-right">
              <div class="selection-indicator">
                <div class="indicator-circle" style="width: 18px; height: 18px;">
                  <el-icon class="check-icon" v-if="selectedCandidateId === cand.id" style="font-size: 10px;"><i-ep-check /></el-icon>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-form>

    <!-- Dialog footer-style actions -->
    <div class="dialog-footer-actions" style="display: flex; flex-direction: column; gap: 8px; margin-top: 24px;">
      <div class="volcano-warning-notice" v-if="candidates.length > 0 && props.voiceOnline && createProvider === 'volcano'" style="color: #f56c6c; font-size: 12px; text-align: left; background-color: #fef0f0; padding: 8px; border-radius: 4px; border: 1px solid #fde2e2;">
        ⚠️ 提示：火山引擎音色有剩余调整次数限制，请谨慎重新生成。
      </div>
      <div class="footer-buttons" style="display: flex; justify-content: flex-end; gap: 8px; width: 100%;">
        <el-button @click="emit('back')" size="small">取消</el-button>
        <el-button
          type="primary"
          :loading="isGenerating"
          @click="handleCreateVoice"
          size="small"
          style="background: #4f46e5; border-color: #4f46e5; color: #ffffff;"
        >
          {{ (candidates.length > 0 || (props.retrainItem && showCandidatesSection)) ? '重新生成' : '生成试听音色' }}
        </el-button>
        <el-button
          v-if="candidates.length > 0"
          type="primary"
          @click="openInfoDialog"
          size="small"
          style="background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none;"
        >
          保存音色
        </el-button>
      </div>
    </div>

    <!-- 二级弹窗：编辑音色元数据并最终保存 -->
    <el-dialog
      v-model="infoDialogVisible"
      width="460px"
      title="编辑音色信息"
      append-to-body
      class="voice-info-dialog"
    >
      <div class="voice-info-header" style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
        <div class="avatar-placeholder" style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #e0e7ff, #c7d2fe); display: flex; align-items: center; justify-content: center; color: #6366f1; flex-shrink: 0;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 24px; height: 24px;">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10a1 1 0 0 0-1 1 6 6 0 0 1-12 0 1 1 0 0 0-2 0 8 8 0 0 0 7 7.93V21H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.07A8 8 0 0 0 19 11a1 1 0 0 0-1-1Z" />
          </svg>
        </div>
        <div class="header-text">
          <div style="font-size: 15px; font-weight: 700; color: #1e293b;">编辑音色信息</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">请填写最终音色名称与元数据以完成保存</div>
        </div>
      </div>

      <el-form label-position="top">
        <el-form-item label="音色名称" required style="margin-bottom: 16px;">
          <el-input v-model="createName" placeholder="如：胡桃、温柔姐姐" maxlength="20" show-word-limit size="small" />
        </el-form-item>

        <div style="display: flex; gap: 16px; margin-bottom: 16px;">
          <el-form-item label="性别" style="flex: 1; margin-bottom: 0;">
            <el-radio-group v-model="createSex" size="small">
              <el-radio label="0">女</el-radio>
              <el-radio label="1">男</el-radio>
            </el-radio-group>
          </el-form-item>
          
          <el-form-item label="年龄段" style="flex: 1; margin-bottom: 0;">
            <el-select v-model="createAgeType" placeholder="选择年龄段" size="small" style="width: 100%;">
              <el-option label="儿童" value="儿童" />
              <el-option :label="createSex === '0' ? '少女' : (createSex === '1' ? '少年' : '少年/少女')" value="少年" />
              <el-option label="青年" value="青年" />
              <el-option label="中年" value="中年" />
              <el-option label="老年" value="老年" />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item label="标签 (可选)" style="margin-bottom: 16px;">
          <div class="voice-tags-input-wrapper">
            <div class="voice-tags-list" v-if="createTags.length > 0">
              <el-tag
                v-for="tag in createTags"
                :key="tag"
                closable
                size="small"
                class="voice-tag-item"
                @close="removeCreateTag(tag)"
              >
                {{ tag }}
              </el-tag>
            </div>
            <el-input
              v-model="tagInputText"
              placeholder="输入标签按回车或逗号添加"
              size="small"
              class="voice-tag-input"
              @keyup.enter="addCreateTag"
              @blur="addCreateTag"
            />
          </div>
        </el-form-item>

        <el-form-item label="音色描述 (可选)" style="margin-bottom: 0;">
          <el-input v-model="createDescription" type="textarea" :rows="3" placeholder="简要描述此音色的特色，方便以后挑选" size="small" />
        </el-form-item>
      </el-form>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <el-button @click="infoDialogVisible = false" size="small">取消</el-button>
          <el-button
            type="primary"
            :loading="isSaving"
            @click="handleConfirmVoice"
            size="small"
            style="background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none;"
          >
            确定
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.upload-drop-zone {
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  background-color: #fafafa;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.upload-drop-zone:hover {
  border-color: #409eff;
  background-color: #f5f7fa;
}

.upload-icon {
  font-size: 28px;
  color: #909399;
}

.upload-text {
  font-size: 13px;
  color: #606266;
}

.upload-file-info {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.upload-file-info .file-name {
  color: #303133;
  font-weight: 500;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Premium Candidate Cards Styles */
.candidates-result-section {
  animation: fadeIn 0.4s ease;
}

.candidate-card-premium {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 14px 20px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 6px rgba(148, 163, 184, 0.03);
  position: relative;
  overflow: hidden;
}

.candidate-card-premium:hover {
  border-color: #c7d2fe;
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.05);
  transform: translateY(-1px);
}

.candidate-card-premium.is-selected {
  border-color: #6366f1;
  background: #f5f6ff;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.1);
}

.card-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.play-btn-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #475569;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 15px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.play-btn-circle:hover {
  background: #334155;
  transform: scale(1.06);
}

.candidate-card-premium.is-selected .play-btn-circle {
  background: #6366f1;
}

.candidate-card-premium.is-selected .play-btn-circle:hover {
  background: #4f46e5;
}

.cand-label {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.candidate-card-premium.is-selected .cand-label {
  color: #4f46e5;
}

/* Waveform decorations */
.waveform-premium {
  flex: 1;
  margin: 0 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
}

.waveform-loading-text {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
}

.waveform-error-text {
  font-size: 12px;
  color: #ef4444;
}

.waveform-bars {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
}

.wbar {
  width: 3px;
  background: #e2e8f0;
  border-radius: 1.5px;
  transition: height 0.2s ease, background-color 0.2s ease;
}

.wbar-1 { height: 12px; }
.wbar-2 { height: 20px; }
.wbar-3 { height: 14px; }
.wbar-4 { height: 26px; }
.wbar-5 { height: 18px; }
.wbar-6 { height: 32px; }
.wbar-7 { height: 16px; }
.wbar-8 { height: 22px; }
.wbar-9 { height: 10px; }
.wbar-10 { height: 6px; }

.candidate-card-premium.is-selected .wbar {
  background: #cbd5e1;
}

.waveform-bars.is-active-playing .wbar {
  background: #818cf8;
  animation: wave-bounce 1.0s ease-in-out infinite alternate;
}

.candidate-card-premium.is-selected .waveform-bars.is-active-playing .wbar {
  background: #6366f1;
}

.waveform-bars.is-active-playing .wbar-1 { animation-delay: 0.1s; }
.waveform-bars.is-active-playing .wbar-2 { animation-delay: 0.3s; }
.waveform-bars.is-active-playing .wbar-3 { animation-delay: 0.15s; }
.waveform-bars.is-active-playing .wbar-4 { animation-delay: 0.4s; }
.waveform-bars.is-active-playing .wbar-5 { animation-delay: 0.2s; }
.waveform-bars.is-active-playing .wbar-6 { animation-delay: 0.35s; }
.waveform-bars.is-active-playing .wbar-7 { animation-delay: 0.25s; }
.waveform-bars.is-active-playing .wbar-8 { animation-delay: 0.45s; }
.waveform-bars.is-active-playing .wbar-9 { animation-delay: 0.05s; }
.waveform-bars.is-active-playing .wbar-10 { animation-delay: 0.15s; }

@keyframes wave-bounce {
  0% {
    transform: scaleY(0.4);
  }
  100% {
    transform: scaleY(1.1);
  }
}

/* Selection radio indicators */
.card-right {
  display: flex;
  align-items: center;
}

.selection-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
}

.indicator-circle {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  background: #ffffff;
}

.candidate-card-premium:hover .indicator-circle {
  border-color: #a5b4fc;
}

.candidate-card-premium.is-selected .indicator-circle {
  border-color: #6366f1;
  background: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.check-icon {
  color: #ffffff;
  font-size: 10px;
  font-weight: bold;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.upload-drop-zone.is-dragover {
  border-color: #6366f1;
  background-color: #f5f6ff;
}

.voice-tags-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.voice-tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0;
}

.voice-tag-item {
  border-radius: 6px;
}
</style>
