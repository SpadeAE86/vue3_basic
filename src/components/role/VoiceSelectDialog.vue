<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import VoiceListSection from './VoiceListSection.vue'
import VoiceCreateSection from './VoiceCreateSection.vue'

const props = defineProps<{
  modelValue: boolean
  selectedVoiceCharacter: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'select-voice', voice: string): void
}>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

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
  ref_audio_url?: string
}

const voiceModels = ref<VoiceModel[]>([])
const voiceOnline = ref(true)
const isCreatingVoice = ref(false)
const retrainItem = ref<VoiceModel | null>(null)

// Sync voiceOnline state when voiceModels or selectedVoiceCharacter changes
watch(
  [() => props.selectedVoiceCharacter, voiceModels],
  ([char, models]) => {
    if (char && models && models.length > 0) {
      const match = models.find(m => m.voice_character === char)
      if (match) {
        voiceOnline.value = match.is_online === undefined ? true : Boolean(match.is_online)
      }
    }
  },
  { immediate: true }
)

function toggleVoiceOnline() {
  voiceOnline.value = !voiceOnline.value
}

async function fetchVoiceModels() {
  try {
    const res = await fetch('/api/audio/models?model_type=big')
    const data = await res.json()
    let presets: VoiceModel[] = []
    if (data.code === 200) {
      if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
        presets = data.data.big || []
      } else if (Array.isArray(data.data)) {
        presets = data.data
      }
    }

    // Fetch user cloned voices
    let clonedCustom: any[] = []
    try {
      const cRes = await fetch('/api/audio/voices/cloned')
      const cData = await cRes.json()
      if (cData.code === 200 && Array.isArray(cData.data)) {
        clonedCustom = cData.data
      }
    } catch (err) {
      console.error('Failed to fetch custom cloned voices:', err)
    }

    // Fetch user designed voices
    let designedCustom: any[] = []
    try {
      const dRes = await fetch('/api/audio/voices/designed')
      const dData = await dRes.json()
      if (dData.code === 200 && Array.isArray(dData.data)) {
        designedCustom = dData.data
      }
    } catch (err) {
      console.error('Failed to fetch custom designed voices:', err)
    }

    // Map custom voices to VoiceModel interface
    const mappedCloned: VoiceModel[] = clonedCustom
      .filter((item: any) => !item.voice_character.includes('_cand_'))
      .map(item => ({
        id: `cloned_${item.id}` as any,
        voice_character: item.voice_character,
        voice_code: item.custom_speaker_id,
        voice_model_type: '音色克隆',
        note: item.note || '自定义克隆音色',
        is_enabled: true,
        priority: 0,
        age_type: item.age_type || '青年',
        sex: item.sex || '0',
        full_voice: item.demo_audio_url || undefined,
        is_online: item.is_online === undefined ? true : Boolean(item.is_online),
        provider: item.provider,
        is_custom: true,
        raw_id: item.id,
        type: 'cloned',
        status: item.status,
        prompt_text: item.prompt_text,
        tag: item.tag,
        available_training_times: item.available_training_times,
        demo_text: item.demo_text,
        ref_audio_url: item.ref_audio_url
      }))

    const mappedDesigned: VoiceModel[] = designedCustom
      .filter((item: any) => !item.voice_character.includes('_cand_'))
      .map(item => ({
        id: `designed_${item.id}` as any,
        voice_character: item.voice_character,
        voice_code: item.custom_speaker_id,
        voice_model_type: '音色设计',
        note: item.note || '自定义设计音色',
        is_enabled: true,
        priority: 0,
        age_type: item.age_type || '青年',
        sex: item.sex || '0',
        full_voice: item.demo_audio_url || undefined,
        is_online: item.is_online === undefined ? true : Boolean(item.is_online),
        provider: item.provider,
        is_custom: true,
        raw_id: item.id,
        type: 'designed',
        status: item.status,
        prompt_text: item.text_prompt,
        tag: item.tag,
        available_training_times: item.available_training_times,
        demo_text: item.demo_text,
        ref_audio_url: item.ref_audio_url
      }))

    // Combine them and normalize age_type for female voices
    const allModels = [...presets, ...mappedCloned, ...mappedDesigned].map(m => {
      // Normalizing Chinese age_type names: '少年' means adolescent boy, so for females ('0') it should display as '少女' (adolescent girl)
      if (m.age_type === '少年' && (m.sex === '0' || m.sex === 0)) {
        m.age_type = '少女'
      }
      return m
    })

    // Sort: 1. Preset recommended first, then by priority desc, then name
    allModels.sort((a, b) => {
      const aCustom = (a as any).is_custom ? 1 : 0
      const bCustom = (b as any).is_custom ? 1 : 0
      if (aCustom !== bCustom) {
        return aCustom - bCustom // presets first
      }
      const aHasVoice = a.full_voice ? 1 : 0
      const bHasVoice = b.full_voice ? 1 : 0
      if (aHasVoice !== bHasVoice) {
        return bHasVoice - aHasVoice
      }
      if (b.priority !== a.priority) {
        return b.priority - a.priority
      }
      return a.voice_character.localeCompare(b.voice_character, 'zh')
    })

    voiceModels.value = allModels
  } catch (e) {
    console.error('Failed to fetch voice models:', e)
  }
}

onMounted(() => {
  fetchVoiceModels()
})

watch(dialogVisible, (val) => {
  if (!val) {
    isCreatingVoice.value = false
    retrainItem.value = null
  }
})

function selectVoice(voiceCharacter: string) {
  emit('select-voice', voiceCharacter)
  dialogVisible.value = false
}

function openCreateVoice() {
  retrainItem.value = null
  isCreatingVoice.value = true
}

function handleLegacyRetrain(item: VoiceModel) {
  retrainItem.value = item
  isCreatingVoice.value = true
}

async function handleSaved(savedVoiceName: string) {
  await fetchVoiceModels()
  const match = voiceModels.value.find(m => m.voice_character === savedVoiceName)
  const codeToEmit = match ? (match.voice_code || match.voice_character) : savedVoiceName
  emit('select-voice', codeToEmit)
  isCreatingVoice.value = false
  retrainItem.value = null
}

function goBackToSelection() {
  isCreatingVoice.value = false
  retrainItem.value = null
}
</script>

<template>
  <div>
    <!-- 1. 选择音色弹窗 (主弹窗) -->
    <el-dialog
      v-model="dialogVisible"
      width="820px"
      top="8vh"
      destroy-on-close
      class="voice-select-dialog"
    >
      <!-- Custom Header -->
      <template #header>
        <div class="dialog-header-custom" style="display: flex; align-items: center; gap: 8px;">
          <el-button 
            v-if="isCreatingVoice" 
            link 
            @click="goBackToSelection" 
            style="padding: 0; font-size: 14px; margin-right: 4px; display: inline-flex; align-items: center; color: #6366f1;"
          >
            <el-icon><i-ep-arrow-left /></el-icon>
            返回列表
          </el-button>
          <span class="dialog-title-text">{{ isCreatingVoice ? (retrainItem ? '更新音色' : '创建音色') : '选择音色' }}</span>
          
          <!-- Online/Offline Capsule -->
          <div 
            class="voice-online-capsule" 
            :class="voiceOnline ? 'is-online' : 'is-offline'"
            @click="toggleVoiceOnline"
          >
            <el-icon class="capsule-icon" v-if="voiceOnline"><i-ep-connection /></el-icon>
            <el-icon class="capsule-icon" v-else><i-ep-lock /></el-icon>
            <span>{{ voiceOnline ? '在线版' : '离线版' }}</span>
          </div>
        </div>
      </template>

      <!-- Subform: Create/Audition or Standard List -->
      <VoiceListSection
        v-if="!isCreatingVoice"
        :voice-online="voiceOnline"
        :selected-voice-character="props.selectedVoiceCharacter"
        :voice-models="voiceModels"
        :dialog-visible="dialogVisible"
        @select-voice="selectVoice"
        @create-voice="openCreateVoice"
        @legacy-retrain="handleLegacyRetrain"
        @refresh="fetchVoiceModels"
      />

      <!-- 2. 创建自定义音色表单视图 -->
      <div v-else class="create-voice-form-wrapper" style="padding: 10px 24px;">
        <VoiceCreateSection
          :voice-online="voiceOnline"
          :retrain-item="retrainItem"
          @back="goBackToSelection"
          @saved="handleSaved"
        />
      </div>

      <!-- Footer Action Buttons (Only shown for main list view since VoiceCreateSection handles its own footer) -->
      <template #footer v-if="!isCreatingVoice">
        <div>
          <el-button size="small" @click="dialogVisible = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* Voice Select Dialog Styles */
.dialog-header-custom {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dialog-title-text {
  font-size: 18px;
  font-weight: 500;
  color: #1e293b;
}

.voice-online-capsule {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 500;
  border-radius: 99px;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  margin-left: 8px;
}

.capsule-icon {
  margin-right: 4px;
  font-size: 11px;
}

.voice-online-capsule.is-online {
  background-color: #10b981;
  color: #ffffff;
}

.voice-online-capsule.is-online:hover {
  background-color: #059669;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
}

.voice-online-capsule.is-offline {
  background-color: #e2e8f0;
  color: #64748b;
}

.voice-online-capsule.is-offline:hover {
  background-color: #cbd5e1;
  box-shadow: 0 4px 12px rgba(100, 116, 139, 0.15);
}
</style>
