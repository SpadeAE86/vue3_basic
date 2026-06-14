<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import type { ChatEvent } from '@/types/chat'
import ResultCard from '@/components/image/ResultCard.vue'
import MiniGraph from './MiniGraph.vue'
import { useChatStore } from '@/stores/chat'
import { useWorkspaceStore } from '@/stores/workspace'

const props = defineProps<{ event: ChatEvent }>()

const chatStore = useChatStore()
const workspaceStore = useWorkspaceStore()
const router = useRouter()
const showArgs = ref(false)

// 终端类工具用黑底等宽字体
const terminalTools = ['bash', 'shell_exec', 'grep', 'file_search']
const isTerminal = computed(() => terminalTools.includes(props.event.toolName ?? ''))

const isResult = computed(() => props.event.type === 'tool_result')
const isGenerateImage = computed(() => props.event.toolName === 'generate_image')
const isMakeGraph = computed(() => props.event.toolName === 'make_graph')

const parsedResult = computed(() => {
  if (!isResult.value || !isGenerateImage.value || !props.event.content) return null
  try {
    return JSON.parse(props.event.content)
  } catch (e) {
    console.warn('解析生图工具返回结果失败:', e)
    return null
  }
})

const parsedGraphResult = computed(() => {
  if (!isResult.value || !isMakeGraph.value || !props.event.content) return null
  try {
    return JSON.parse(props.event.content)
  } catch (e) {
    console.warn('解析力导图工具结果失败:', e)
    return null
  }
})

function goToGraphPage(name: string) {
  if (!name) return
  workspaceStore.selectedWorkspaceId = name
  router.push({ name: 'graph' })
}

// 缩短 URL
function cleanValue(val: any): string {
  if (typeof val === 'string' && val.startsWith('http')) {
    try {
      const url = new URL(val)
      const filename = url.pathname.split('/').pop() || url.hostname
      return `"${filename}"`
    } catch (e) {
      return JSON.stringify(val)
    }
  }
  if (Array.isArray(val)) {
    return '[' + val.map(v => typeof v === 'string' && v.startsWith('http') ? cleanValue(v) : JSON.stringify(v)).join(', ') + ']'
  }
  return JSON.stringify(val)
}

function shortenUrlsInText(text: string): string {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  return text.replace(urlRegex, (urlStr) => {
    try {
      const cleanUrlStr = urlStr.replace(/[.,;:)\]]+$/, '')
      const url = new URL(cleanUrlStr)
      const filename = url.pathname.split('/').pop() || url.hostname
      return filename
    } catch (e) {
      return urlStr
    }
  })
}

// 简洁参数预览
const argsPreview = computed(() => {
  if (!props.event.toolArgs) return ''
  const keys = Object.keys(props.event.toolArgs)
  if (keys.length === 0) return '(无参数)'
  
  if (chatStore.debugMode) {
    return keys.map(k => `${k}: ${JSON.stringify(props.event.toolArgs![k])}`).join(', ')
  }
  
  return keys.map(k => {
    const val = props.event.toolArgs![k]
    return `${k}: ${cleanValue(val)}`
  }).join(', ')
})

// 清洗后的结果输出
const cleanedContent = computed(() => {
  const content = props.event.content
  if (!content) return ''
  
  if (chatStore.debugMode) {
    return content
  }
  
  if (props.event.toolName === 'get_canvas_graph') {
    const firstLine = content.split('\n')[0]
    return firstLine || '成功获取画布拓扑结构'
  }
  
  return shortenUrlsInText(content)
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
      <div v-if="isGenerateImage && parsedResult" class="image-card-output">
        <ResultCard :item="parsedResult" :model-label="parsedResult.model || 'Seedream 5.0'" />
      </div>
      <div v-else-if="isMakeGraph && parsedGraphResult" class="mini-graph-card-container">
        <div class="mini-graph-card" @click="goToGraphPage(parsedGraphResult.graph_name || parsedGraphResult.graph_id)">
          <div class="mini-graph-header">
            <span class="mini-graph-title-row">
              <el-icon class="graph-icon"><i-ep-share /></el-icon>
              <span class="title-text">{{ parsedGraphResult.graph_name || parsedGraphResult.graph_id || '力导向图' }}</span>
            </span>
            <el-tag size="small" type="info" round>
              {{ parsedGraphResult.node_count }} 节点 / {{ parsedGraphResult.edge_count }} 边
            </el-tag>
          </div>
          
          <MiniGraph :nodes="parsedGraphResult.nodes || []" :edges="parsedGraphResult.edges || []" />
          
          <div class="mini-graph-footer">
            <span>点击跳转至力导图详情页面</span>
            <el-icon><i-ep-right /></el-icon>
          </div>
        </div>
      </div>
      <pre v-else-if="isTerminal" class="terminal-output">{{ event.content }}</pre>
      <div v-else class="text-output">{{ cleanedContent }}</div>
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

.image-card-output {
  margin-top: 8px;
  max-width: 320px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
}

/* Mini Graph Card styles */
.mini-graph-card-container {
  margin-top: 8px;
}

.mini-graph-card {
  max-width: 320px;
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}

.mini-graph-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.15);
  border-color: #a5b4fc;
}

.mini-graph-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.mini-graph-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #1e293b;
  font-size: 13px;
}

.mini-graph-title-row .graph-icon {
  color: #6366f1;
}

.mini-graph-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  font-size: 11px;
  color: #6366f1;
  font-weight: 500;
}
</style>
