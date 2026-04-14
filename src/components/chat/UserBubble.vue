<script setup lang="ts">
import type { ChatEvent } from '@/types/chat'

defineProps<{ event: ChatEvent }>()
</script>

<template>
  <div class="bubble user-bubble">
    <div class="bubble-content">{{ event.content }}</div>
  </div>
</template>

<style scoped>
.user-bubble {
  display: flex;
  justify-content: flex-end;
}

.bubble-content {
  max-width: 75%;
  padding: 10px 14px;
  border-radius: 12px 12px 2px 12px;
  background: #6366f1;
  color: #fff;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}
</style>
