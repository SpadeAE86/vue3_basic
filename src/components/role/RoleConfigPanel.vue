<script setup lang="ts">
import { ref, nextTick, onMounted, computed } from 'vue'
import VoiceSelectDialog from './VoiceSelectDialog.vue'

const props = defineProps<{
  roleId: string
  roleMeta: any
}>()

const emit = defineEmits<{
  (e: 'open-crop'): void
  (e: 'update-meta'): void
  (e: 'start-chat'): void
  (e: 'update-voice-character', voice: string): void
}>()

const inputTagVisible = ref(false)
const newTagValue = ref('')
const tagInputRef = ref<any>(null)
const dialogVisible = ref(false)
const voiceModels = ref<any[]>([])

async function fetchVoiceModels() {
  try {
    const cRes = await fetch('/api/audio/voices/cloned')
    const cData = await cRes.json()
    const dRes = await fetch('/api/audio/voices/designed')
    const dData = await dRes.json()
    
    // Default online models can be loaded too
    const oRes = await fetch('/api/audio/models?provider=all')
    const oData = await oRes.json()
    
    const all: any[] = []
    
    if (cData && cData.code === 200 && Array.isArray(cData.data)) {
      all.push(...cData.data)
    } else if (cData && Array.isArray(cData)) {
      all.push(...cData)
    }
    
    if (dData && dData.code === 200 && Array.isArray(dData.data)) {
      all.push(...dData.data)
    } else if (dData && Array.isArray(dData)) {
      all.push(...dData)
    }
    
    if (oData && oData.data) {
      if (oData.data.big && Array.isArray(oData.data.big)) all.push(...oData.data.big)
      if (oData.data.small && Array.isArray(oData.data.small)) all.push(...oData.data.small)
    }
    voiceModels.value = all
  } catch (e) {
    console.error('Failed to fetch voice models for display name resolution:', e)
  }
}

onMounted(() => {
  fetchVoiceModels()
})

const displayVoiceName = computed(() => {
  const code = props.roleMeta.voice_character
  if (!code) return '未配置'
  if (code === 'Vivi') return 'Vivi (默认)'
  
  // Find in cloned/designed custom speaker list
  const matchCustom = voiceModels.value.find(m => m.custom_speaker_id === code)
  if (matchCustom) {
    return matchCustom.voice_character
  }
  
  // Find in online model presets
  const matchPreset = voiceModels.value.find(m => m.voice_code === code)
  if (matchPreset) {
    return matchPreset.voice_character
  }
  
  return code
})

function handleRemoveTag(tag: string) {
  if (!props.roleMeta.tags) return
  props.roleMeta.tags = props.roleMeta.tags.filter((t: string) => t !== tag)
  emit('update-meta')
}

function showTagInput() {
  inputTagVisible.value = true
  nextTick(() => {
    tagInputRef.value?.focus()
  })
}

function handleInputTagConfirm() {
  const val = newTagValue.value.trim()
  if (val) {
    if (!props.roleMeta.tags) {
      props.roleMeta.tags = []
    }
    if (!props.roleMeta.tags.includes(val)) {
      props.roleMeta.tags.push(val)
      emit('update-meta')
    }
  }
  inputTagVisible.value = false
  newTagValue.value = ''
}

function openVoiceDialog() {
  fetchVoiceModels() // Refresh voice list when opening dialog to catch any renamed ones
  dialogVisible.value = true
}

function selectVoice(voiceCharacter: string) {
  emit('update-voice-character', voiceCharacter)
  dialogVisible.value = false
}
</script>


<template>
  <div class="role-right-header">
    <div class="role-avatar-title-row">
      <!-- 圆形头像，Hover 可编辑，点击打开裁剪 -->
      <div class="space-avatar-wrapper" @click="emit('open-crop')" title="点击调整裁剪头像">
        <img v-if="props.roleMeta.avatar_url" :src="props.roleMeta.avatar_url" class="space-avatar-img" />
        <div v-else class="space-avatar-letter">
          {{ props.roleMeta.name.charAt(0).toUpperCase() }}
        </div>
        <div class="avatar-edit-overlay">
          <el-icon><i-ep-camera /></el-icon>
          <span>裁切</span>
        </div>
      </div>
      <div class="role-title-column">
        <div class="role-name-row">
          <h2 class="role-space-name">{{ props.roleMeta.name }}</h2>
          <el-tag size="small" type="success" v-if="props.roleMeta.voice_configured">🎵 音色就绪</el-tag>
        </div>
        <p class="role-space-id" @click="openVoiceDialog" style="cursor: pointer;" title="点击更换或配置音色">
          角色音色: <code>{{ displayVoiceName }}</code>
        </p>
      </div>
      <!-- 右侧操作按钮组 -->
      <div class="role-top-actions">
        <!-- 开始对话按钮 -->
        <el-tooltip content="开始对话" placement="top">
          <div class="top-action-btn chat-btn" @click="emit('start-chat')">
            <el-icon><i-ep-chat-dot-round /></el-icon>
          </div>
        </el-tooltip>
        <!-- 晚安信铃铛按钮 -->
        <el-tooltip
          :content="props.roleMeta.daily_message_enabled ? '晚安信：开启（点击关闭）' : '晚安信：关闭（点击开启）'"
          placement="top"
        >
          <div
            class="top-action-btn bell-btn"
            :class="{ 'bell-btn--active': props.roleMeta.daily_message_enabled }"
            @click="() => { props.roleMeta.daily_message_enabled = !props.roleMeta.daily_message_enabled; emit('update-meta') }"
          >
            <el-icon class="bell-icon">
              <i-ep-bell-filled v-if="props.roleMeta.daily_message_enabled" />
              <i-ep-bell v-else />
            </el-icon>
          </div>
        </el-tooltip>
      </div>
    </div>

    <!-- 角色名字及人设修改输入框 -->
    <div class="role-desc-row">
      <el-form label-position="left" label-width="80px">
        <el-form-item label="角色名称">
          <el-input 
            v-model="props.roleMeta.name" 
            placeholder="角色名称" 
            size="small"
            @blur="emit('update-meta')"
          />
        </el-form-item>
        <el-form-item label="角色简介">
          <el-input 
            v-model="props.roleMeta.description" 
            type="textarea"
            :rows="2"
            placeholder="请输入角色描述/一句话人设" 
            size="small"
            @blur="emit('update-meta')"
          />
        </el-form-item>
      </el-form>
    </div>

    <!-- 角色标签编辑 -->
    <div class="role-tags-row">
      <span class="tags-label">人设标签:</span>
      <el-tag
        v-for="tag in props.roleMeta.tags"
        :key="tag"
        closable
        class="tag-item"
        @close="handleRemoveTag(tag)"
      >
        {{ tag }}
      </el-tag>
      <el-input
        v-if="inputTagVisible"
        ref="tagInputRef"
        v-model="newTagValue"
        class="new-tag-input"
        size="small"
        @keyup.enter="handleInputTagConfirm"
        @blur="handleInputTagConfirm"
      />
      <el-button v-else class="button-new-tag" size="small" @click="showTagInput">
        + 新标签
      </el-button>
    </div>

    <!-- 音色选择及创建弹窗 -->
    <VoiceSelectDialog
      v-model="dialogVisible"
      :selected-voice-character="props.roleMeta.voice_character"
      @select-voice="selectVoice"
    />
  </div>
</template>

<style scoped>
.role-right-header {
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid #ebeef5;
  box-shadow: 0 4px 16px rgba(148, 163, 184, 0.05);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.role-avatar-title-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.space-avatar-wrapper {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 4px 10px rgba(99, 102, 241, 0.15);
  position: relative;
  cursor: pointer;
}

.avatar-edit-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.25s ease;
  gap: 2px;
  pointer-events: none;
}

.space-avatar-wrapper:hover .avatar-edit-overlay {
  opacity: 1;
}

.avatar-edit-overlay .el-icon {
  font-size: 14px;
}

.avatar-edit-overlay span {
  font-size: 10px;
  font-weight: 500;
}

.space-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.space-avatar-letter {
  font-size: 24px;
  font-weight: bold;
  color: #ffffff;
}

.role-title-column {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.role-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-space-name {
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.role-space-id {
  font-size: 12px;
  color: #64748b;
  margin: 0;
}

.role-space-id code {
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  color: #475569;
}

.role-desc-row {
  margin-top: 4px;
}

.role-tags-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: #475569;
}

.tags-label {
  font-weight: 600;
  margin-right: 4px;
}

.tag-item {
  border-radius: 12px;
}

.new-tag-input {
  width: 80px;
}

.button-new-tag {
  height: 24px;
  padding-top: 0;
  padding-bottom: 0;
  border-radius: 12px;
}

.role-space-id code {
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  color: #475569;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.role-space-id:hover code {
  background: #eef2ff;
  color: #6366f1;
  border-color: #c7d2fe;
}

/* 右侧操作按钮组 */
.role-top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}

.top-action-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.25s ease;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
  box-sizing: border-box;
}

.top-action-btn:hover {
  background: #ede9fe;
  border-color: #a78bfa;
  transform: scale(1.08);
}

.chat-btn:hover {
  background: #eef2ff;
  color: #6366f1;
  border-color: #a5b4fc;
}

.bell-btn--active {
  background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
  border-color: #6366f1 !important;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35) !important;
  color: #ffffff !important;
}

.bell-btn--active .bell-icon {
  color: #ffffff !important;
}

.bell-icon {
  font-size: 18px;
  transition: color 0.2s ease;
}
</style>
