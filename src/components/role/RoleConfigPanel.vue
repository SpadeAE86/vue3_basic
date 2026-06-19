<script setup lang="ts">
import { ref, nextTick } from 'vue'

const props = defineProps<{
  roleId: string
  roleMeta: any
}>()

const emit = defineEmits<{
  (e: 'open-crop'): void
  (e: 'update-meta'): void
  (e: 'start-chat'): void
}>()

const inputTagVisible = ref(false)
const newTagValue = ref('')
const tagInputRef = ref<any>(null)

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
        <p class="role-space-id">角色 ID: <code>{{ props.roleMeta.id }}</code></p>
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

    <!-- 音色状态开关 -->
    <div class="role-voice-row">
      <span class="tags-label">音色状态:</span>
      <el-switch
        v-model="props.roleMeta.voice_configured"
        active-text="音色就绪"
        inactive-text="未配置音色"
        @change="emit('update-meta')"
      />
    </div>

    <div class="role-header-actions">
      <el-button type="primary" @click="emit('start-chat')">
        <el-icon style="margin-right: 4px"><i-ep-chat-dot-round /></el-icon>
        开始对话
      </el-button>
    </div>
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

.role-voice-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #475569;
}

.role-header-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}
</style>
