<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
}>()

const inputText = ref('')

function handleSend() {
  const text = inputText.value.trim()
  if (!text || props.disabled) return
  emit('send', text)
  inputText.value = ''
}

function handleKeydown(e: KeyboardEvent) {
  // Enter 发送, Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="chat-input-wrapper">
    <el-input
      v-model="inputText"
      type="textarea"
      :autosize="{ minRows: 1, maxRows: 4 }"
      placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
      :disabled="disabled"
      @keydown="handleKeydown"
      resize="none"
    />
    <el-button
      type="primary"
      :icon="''" 
      :disabled="disabled || !inputText.trim()"
      @click="handleSend"
      class="send-btn"
    >
      发送
    </el-button>
  </div>
</template>

<style scoped>
.chat-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding: 12px 16px;
  background: #fff;
  border-top: 1px solid #ebeef5;
}

.chat-input-wrapper :deep(.el-textarea__inner) {
  box-shadow: none;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.5;
  transition: border-color 0.2s;
}

.chat-input-wrapper :deep(.el-textarea__inner:focus) {
  border-color: #6366f1;
}

.send-btn {
  flex-shrink: 0;
  border-radius: 8px;
  height: 36px;
  padding: 0 20px;
  background: #6366f1;
  border-color: #6366f1;
}

.send-btn:hover:not(:disabled) {
  background: #4f46e5;
  border-color: #4f46e5;
}
</style>
