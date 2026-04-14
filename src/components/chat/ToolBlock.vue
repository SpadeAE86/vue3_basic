<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ChatEvent } from '@/types/chat'

const props = defineProps<{ event: ChatEvent }>()

const showArgs = ref(false)

// 终端类工具用黑底等宽字体
const terminalTools = ['bash', 'shell_exec', 'grep', 'file_search']
const isTerminal = computed(() => terminalTools.includes(props.event.toolName ?? ''))

const isResult = computed(() => props.event.type === 'tool_result')

// 简洁参数预览
const argsPreview = computed(() => {
  if (!props.event.toolArgs) return ''
  const keys = Object.keys(props.event.toolArgs)
  if (keys.length === 0) return '(无参数)'
  return keys.map(k => `${k}: ${JSON.stringify(props.event.toolArgs![k])}`).join(', ')
})
</script>

<template>
  <div class="tool-block" :class="{ 'is-result': isResult }">
    <!-- 标题行 -->
    <div class="tool-header">
      <span class="tool-icon">{{ isResult ? '📦' : '🔧' }}</span>
      <el-tag size="small" :type="isResult ? (event.toolSuccess ? 'success' : 'danger') : 'warning'" effect="dark" round>
        {{ event.toolName }}
      </el-tag>
      <span class="tool-label">{{ isResult ? (event.toolSuccess ? '成功' : '失败') : '调用' }}</span>
    </div>

    <!-- tool_call: 显示参数预览 (可展开) -->
    <template v-if="!isResult && event.toolArgs">
      <div class="args-preview" @click="showArgs = !showArgs">
        <span class="preview-text">{{ argsPreview }}</span>
        <el-icon class="expand-icon" :class="{ rotated: showArgs }">
          <i-ep-arrow-right />
        </el-icon>
      </div>
      <Transition name="slide">
        <pre v-show="showArgs" class="args-json">{{ JSON.stringify(event.toolArgs, null, 2) }}</pre>
      </Transition>
    </template>

    <!-- tool_result: 显示输出 -->
    <template v-if="isResult && event.content">
      <pre v-if="isTerminal" class="terminal-output">{{ event.content }}</pre>
      <div v-else class="text-output">{{ event.content }}</div>
    </template>
  </div>
</template>

<style scoped>
.tool-block {
  margin-left: 40px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #fffbf0;
  border: 1px solid #fde68a;
}

.tool-block.is-result {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.tool-block.is-result:has(.terminal-output) {
  background: #1e1e2e;
  border-color: #45475a;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #606266;
}

.tool-icon {
  font-size: 14px;
}

.tool-label {
  font-size: 12px;
  color: #909399;
}

.args-preview {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #909399;
}

.preview-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Consolas', 'Monaco', monospace;
}

.expand-icon {
  transition: transform 0.2s;
  font-size: 11px;
  flex-shrink: 0;
}
.expand-icon.rotated {
  transform: rotate(90deg);
}

.args-json {
  margin-top: 6px;
  padding: 8px 10px;
  background: #fefce8;
  border-radius: 6px;
  font-size: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  line-height: 1.5;
  overflow-x: auto;
  color: #854d0e;
  white-space: pre-wrap;
  word-break: break-all;
}

.terminal-output {
  margin-top: 6px;
  padding: 10px 12px;
  background: #1e1e2e;
  color: #a6e3a1;
  border-radius: 6px;
  font-size: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.text-output {
  margin-top: 6px;
  font-size: 13px;
  color: #166534;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 折叠动画 */
.slide-enter-active, .slide-leave-active {
  transition: all 0.2s ease;
  max-height: 400px;
  overflow: hidden;
}
.slide-enter-from, .slide-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
