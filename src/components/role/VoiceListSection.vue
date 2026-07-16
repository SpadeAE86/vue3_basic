<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
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
  selectedVoiceCharacter: string
  voiceModels: VoiceModel[]
  dialogVisible: boolean
}>()

const emit = defineEmits<{
  (e: 'select-voice', val: string): void
  (e: 'create-voice'): void
  (e: 'legacy-retrain', item: VoiceModel): void
  (e: 'refresh'): void
}>()

// Filter states
const filterSex = ref('')
const filterAge = ref('')
const filterProvider = ref('')
const searchQuery = ref('')
const filterTab = ref('explore') // 'explore' or 'mine'

// Player state
const playingVoiceId = ref<number | null>(null)
let previewAudio: HTMLAudioElement | null = null

function stopPreview() {
  if (previewAudio) {
    previewAudio.pause()
    previewAudio = null
  }
  playingVoiceId.value = null
}

function togglePlayVoice(item: VoiceModel) {
  if (!item.full_voice) return

  if (playingVoiceId.value === item.id) {
    stopPreview()
    return
  }

  stopPreview()
  
  playingVoiceId.value = item.id
  previewAudio = new Audio(item.full_voice)
  previewAudio.onended = () => {
    playingVoiceId.value = null
    previewAudio = null
  }
  previewAudio.onerror = () => {
    ElMessage.error('试听音频加载或播放失败')
    playingVoiceId.value = null
    previewAudio = null
  }
  previewAudio.play().catch(err => {
    console.error('播放失败:', err)
    ElMessage.error('播放失败')
    playingVoiceId.value = null
    previewAudio = null
  })
}

// Watch dialog visibility to stop playback
watch(() => props.dialogVisible, (val) => {
  if (!val) {
    stopPreview()
  }
})

onBeforeUnmount(() => {
  stopPreview()
})

const remainingVolcanoSlots = computed(() => {
  const usedPrepaid = props.voiceModels.filter(
    item => item.is_custom && item.provider === 'volcano' && item.voice_code?.startsWith('S_') && (item.status === 2 || item.status === 4)
  ).length
  return Math.max(0, 12 - usedPrepaid)
})

const filteredVoiceModels = computed(() => {
  const allNames = new Set(props.voiceModels.map(v => v.voice_character))
  
  return props.voiceModels.filter(item => {
    // 0. Filter out old 1.0 versions if 2.0 exists
    if (allNames.has(item.voice_character + " 2.0")) {
      return false
    }
    // 0.5 Tab filter
    const isCustom = Boolean((item as any).is_custom)
    if (filterTab.value === 'mine' && !isCustom) {
      return false
    }
    if (filterTab.value === 'explore' && isCustom) {
      return false
    }
    // 1. Gender filter
    if (filterSex.value !== '') {
      let unifiedSex = item.sex
      if (unifiedSex === '女' || unifiedSex === '0') {
        unifiedSex = '0'
      } else if (unifiedSex === '男' || unifiedSex === '1') {
        unifiedSex = '1'
      }
      if (unifiedSex !== filterSex.value) {
        return false
      }
    }
    // 2. Age filter
    if (filterAge.value) {
      if (filterAge.value === '少年') {
        if (item.age_type !== '少年/少女' && item.age_type !== '少年' && item.age_type !== '少女') {
          return false
        }
      } else {
        if (item.age_type !== filterAge.value) {
          return false
        }
      }
    }
    // 3. Online/Offline filter
    const isOnline = props.voiceOnline
    const itemOnline = item.is_online === undefined ? true : Boolean(item.is_online)
    if (itemOnline !== isOnline) {
      return false
    }
    // 4. Provider filter
    if (filterProvider.value !== '') {
      if (item.provider !== filterProvider.value) {
        return false
      }
    }
    // 5. Search query filter
    if (searchQuery.value) {
      const query = searchQuery.value.trim().toLowerCase()
      const charMatch = item.voice_character && item.voice_character.toLowerCase().includes(query)
      const noteMatch = item.note && item.note.toLowerCase().includes(query)
      if (!charMatch && !noteMatch) {
        return false
      }
    }
    return true
  })
})


</script>

<template>
  <div class="voice-selection-body">
    <!-- Filter and search controls -->
    <div class="voice-filters">
      <!-- First Row: Platform + Search Box -->
      <div class="voice-filters-row">
        <div class="filter-item">
          <span class="filter-label">平台:</span>
          <el-radio-group v-model="filterProvider" size="small">
            <el-radio-button label="">全部</el-radio-button>
            <el-radio-button label="volcano">火山引擎</el-radio-button>
            <el-radio-button label="qwen">阿里百炼</el-radio-button>
          </el-radio-group>
        </div>
        <div class="filter-item search-bar-right">
          <el-input
            v-model="searchQuery"
            placeholder="搜索音色名称..."
            size="small"
            clearable
            style="width: 180px;"
          >
            <template #prefix>
              <el-icon><i-ep-search /></el-icon>
            </template>
          </el-input>
        </div>
      </div>

      <!-- Second Row: Gender + Age Select Dropdown -->
      <div class="voice-filters-row second-row">
        <div class="filter-item">
          <span class="filter-label">性别:</span>
          <el-radio-group v-model="filterSex" size="small">
            <el-radio-button label="">全部</el-radio-button>
            <el-radio-button label="0">女</el-radio-button>
            <el-radio-button label="1">男</el-radio-button>
          </el-radio-group>
        </div>
        <div class="filter-item age-select-item">
          <span class="filter-label age-label">年龄段:</span>
          <el-select v-model="filterAge" placeholder="全部年龄段" size="small" style="width: 130px;" clearable>
            <el-option label="全部年龄段" value="" />
            <el-option label="儿童" value="儿童" />
            <el-option :label="filterSex === '0' ? '少女' : (filterSex === '1' ? '少年' : '少年/少女')" value="少年" />
            <el-option label="青年" value="青年" />
            <el-option label="中年" value="中年" />
            <el-option label="老年" value="老年" />
          </el-select>
        </div>
      </div>

      <!-- Third Row: Explore vs My Voices Switcher -->
      <div class="voice-filters-row third-row" style="margin-top: 10px; border-top: 1px dashed #e2e8f0; padding-top: 10px;">
        <div class="filter-item">
          <span class="filter-label">类别:</span>
          <el-radio-group v-model="filterTab" size="small" class="filter-tab-capsule">
            <el-radio-button label="explore">探索音色</el-radio-button>
            <el-radio-button label="mine">我的音色</el-radio-button>
          </el-radio-group>
        </div>
      </div>
    </div>

    <!-- Scrollable cards list -->
    <el-scrollbar max-height="400px" class="voice-list-scrollbar">
      <div class="voice-grid">
        <!-- Create voice card (Always shown) -->
        <div 
          class="voice-card create-voice-card"
          @click="emit('create-voice')"
        >
          <div class="create-voice-card-content">
            <el-icon class="create-voice-icon"><i-ep-plus /></el-icon>
            <div class="create-voice-title">创建我的音色</div>
            <div class="create-voice-sub-title">
              {{ props.voiceOnline ? '在线克隆/设计' : '本地克隆/设计' }}
            </div>
            <div v-if="props.voiceOnline" class="create-voice-slots-info" style="font-size: 10px; margin-top: 4px; color: #64748b;">
              火山引擎剩余槽位: {{ remainingVolcanoSlots }}
            </div>
          </div>
        </div>

        <div
          v-for="item in filteredVoiceModels"
          :key="item.id"
          class="voice-card"
          :class="{ 
            'is-active': props.selectedVoiceCharacter === item.voice_character || props.selectedVoiceCharacter === item.voice_code,
            'is-playing': playingVoiceId === item.id
          }"
          @click="emit('select-voice', item.voice_code || item.voice_character)"
        >
          <div class="voice-card-header">
            <span class="voice-name">{{ item.voice_character.endsWith(' 2.0') ? item.voice_character.slice(0, -4) : item.voice_character }}</span>
            <el-tag v-if="item.status === 1" size="small" type="warning" style="margin-left: 4px; display: inline-flex; align-items: center; gap: 2px;">
              <el-icon class="is-loading"><i-ep-loading /></el-icon> 训练中...
            </el-tag>
            <el-tag v-if="item.voice_character.startsWith('Vivi')" size="small" type="success">推荐</el-tag>
            <span v-if="item.sex" class="voice-gender-icon">
              {{ item.sex === '0' ? '♀️' : '♂️' }}
            </span>
          </div>
          
          <div class="voice-card-body">
            <p v-if="item.note && item.note.trim() && item.note !== '暂无说明'" class="voice-note" :title="item.note">{{ item.note }}</p>
            <div class="voice-tags">
              <el-tag size="small" type="info" v-if="item.age_type">{{ item.age_type }}</el-tag>
              <el-tag size="small" type="warning" v-if="item.voice_model_type && item.voice_model_type !== 'big' && item.voice_model_type !== 'small'">{{ item.voice_model_type }}</el-tag>
            </div>
          </div>

          <!-- Preview action -->
          <div class="voice-card-actions" v-if="item.full_voice" @click.stop>
            <el-button 
              circle
              size="small"
              :type="playingVoiceId === item.id ? 'danger' : 'primary'"
              @click.stop="togglePlayVoice(item)"
            >
              <el-icon v-if="playingVoiceId === item.id"><i-ep-video-pause /></el-icon>
              <el-icon v-else><i-ep-video-play /></el-icon>
            </el-button>
          </div>

          <!-- Hover Retrain Action -->
          <div class="voice-card-retrain-action" v-if="item.is_custom" @click.stop>
            <el-tooltip
              :content="item.provider === 'volcano' && (item.voice_code.startsWith('S_') || item.status === 4) ? `剩余可训练次数: ${item.available_training_times !== undefined && item.available_training_times !== null ? item.available_training_times : 0}` : '重新训练 (覆盖原音色)'"
              placement="top"
            >
              <span>
                <el-button
                  circle
                  size="small"
                  type="warning"
                  :disabled="(item.provider === 'volcano' && (item.voice_code.startsWith('S_') || item.status === 4) && item.available_training_times === 0) || item.status === 1"
                  @click.stop="emit('legacy-retrain', item)"
                >
                  <el-icon><i-ep-refresh /></el-icon>
                </el-button>
              </span>
            </el-tooltip>
          </div>
        </div>
      </div>
      <el-empty v-if="filteredVoiceModels.length === 0" description="未找到匹配的音色" />
    </el-scrollbar>
  </div>
</template>

<style scoped>
.voice-filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
  padding: 14px 16px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}

.voice-filters-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.voice-filters-row.second-row {
  justify-content: flex-start;
  gap: 32px;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  width: 45px;
  flex-shrink: 0;
}

.age-label {
  width: auto;
}

.search-bar-right {
  margin-left: auto;
}

.voice-list-scrollbar {
  padding-right: 8px;
}

.voice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  padding: 4px;
}

.voice-card {
  position: relative;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100px;
  overflow: hidden;
}

.voice-card:hover {
  transform: translateY(-2px);
  border-color: #6366f1;
  box-shadow: 0 8px 20px rgba(99, 102, 241, 0.08);
}

.voice-card.is-active {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.04);
  box-shadow: 0 0 0 1px #6366f1, 0 8px 20px rgba(99, 102, 241, 0.08);
}

.voice-card.is-playing {
  border-color: #f43f5e;
  background: rgba(244, 63, 94, 0.02);
}

.voice-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.voice-name {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}

.voice-gender-icon {
  font-size: 13px;
  margin-left: auto;
}

.voice-card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.voice-note {
  font-size: 11px;
  color: #64748b;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
  margin-bottom: 4px;
}

.voice-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.voice-tags .el-tag {
  height: 20px;
  padding: 0 6px;
  font-size: 10px;
  border-radius: 4px;
}

.voice-card-actions {
  position: absolute;
  right: 10px;
  top: 10px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.voice-card:hover .voice-card-actions,
.voice-card.is-playing .voice-card-actions {
  opacity: 1;
}

.create-voice-card {
  border: 1px dashed #cbd5e1;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.create-voice-card:hover {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.02);
}

.create-voice-card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #64748b;
  transition: color 0.2s ease;
}

.create-voice-card:hover .create-voice-card-content {
  color: #6366f1;
}

.create-voice-icon {
  font-size: 24px;
}

.create-voice-title {
  font-size: 13px;
  font-weight: 600;
}

.create-voice-sub-title {
  font-size: 10px;
  opacity: 0.8;
}

.filter-tab-capsule .el-radio-button__inner {
  border-radius: 20px !important;
  margin-right: 8px;
}

.voice-card-retrain-action {
  position: absolute;
  right: 10px;
  bottom: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
}

.voice-card:hover .voice-card-retrain-action {
  opacity: 1;
}
</style>
