<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Loading, Picture, Refresh, Warning, CircleCheck, Delete } from '@element-plus/icons-vue'
import { useCanvasStore } from '@/stores/canvas'

interface NodeData {
  display_id?: number
  image_url?: string
  prompt?: string
  model?: string
  status?: 'success' | 'generating' | 'failed'
  error_message?: string
}

const props = defineProps<{
  id: string
  data: NodeData
}>()

const emit = defineEmits<{
  (e: 'regenerate', id: string): void
  (e: 'update-prompt', id: string, prompt: string): void
  (e: 'delete', id: string): void
}>()

const canvasStore = useCanvasStore()

function handleDelete() {
  emit('delete', props.id)
}

const statusText = computed(() => {
  const s = props.data.status || 'success'
  if (s === 'generating') return '生成中'
  if (s === 'failed') return '生成失败'
  return '生成成功'
})

const statusType = computed(() => {
  const s = props.data.status || 'success'
  if (s === 'generating') return 'warning'
  if (s === 'failed') return 'danger'
  return 'success'
})

function handlePromptBlur(e: FocusEvent) {
  const text = (e.target as HTMLInputElement).value
  emit('update-prompt', props.id, text)
}

function handleRegenerate() {
  emit('regenerate', props.id)
}
</script>

<template>
  <div class="node-wrapper-outer">
    <div v-if="canvasStore.showNodeId" class="node-id-badge">#{{ data.display_id }}</div>
    <div class="image-node-card" :class="`is-${data.status || 'success'}`">
    <!-- 连接端口 (左入右出) -->
    <Handle id="in" type="target" :position="Position.Left" class="node-handle" />
    <Handle id="out" type="source" :position="Position.Right" class="node-handle" />

    <!-- 头部：标题与状态 -->
    <div class="node-header">
      <span class="node-id">节点 #{{ id.slice(-4) }}</span>
      <div class="header-right">
        <el-tag :type="statusType" size="small" effect="dark" class="status-tag">
          <el-icon v-if="data.status === 'generating'" class="is-loading"><Loading /></el-icon>
          <el-icon v-else-if="data.status === 'failed'"><Warning /></el-icon>
          <el-icon v-else><CircleCheck /></el-icon>
          <span class="status-label">{{ statusText }}</span>
        </el-tag>
        <el-button 
          type="text" 
          class="delete-btn" 
          @click.stop="handleDelete" 
          :icon="Delete"
          title="删除节点"
        />
      </div>
    </div>

    <!-- 中部：图片预览区 -->
    <div class="node-body">
      <div v-if="data.status === 'generating'" class="image-placeholder loading">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span class="placeholder-text">绘制画面中...</span>
      </div>
      
      <div v-else-if="data.status === 'failed'" class="image-placeholder error">
        <el-icon :size="24" color="#f56c6c"><Warning /></el-icon>
        <span class="placeholder-text">绘图异常</span>
        <div class="error-tip" :title="data.error_message">{{ data.error_message || '未知错误' }}</div>
      </div>

      <div v-else-if="data.image_url" class="image-wrapper">
        <el-image 
          :src="data.image_url" 
          :preview-src-list="[data.image_url]"
          fit="cover" 
          class="node-image"
          hide-on-click-modal
          :preview-teleported="true"
        />
      </div>

      <div v-else class="image-placeholder empty">
        <el-icon :size="24"><Picture /></el-icon>
        <span class="placeholder-text">暂无画面</span>
      </div>
    </div>

    <!-- 底部：提示词与配置 -->
    <div class="node-footer">
      <div class="prompt-section">
        <el-input
          type="textarea"
          :rows="2"
          :model-value="data.prompt || ''"
          @blur="handlePromptBlur"
          placeholder="无提示词"
          class="prompt-textarea nodrag"
          resize="none"
        />
      </div>
      <div class="action-bar">
        <span class="model-badge" :title="data.model || 'gpt-5.4'">
          {{ data.model || 'gpt-5.4' }}
        </span>
        <el-button 
          v-if="data.status !== 'generating'" 
          type="primary" 
          size="small" 
          circle 
          :icon="Refresh"
          @click="handleRegenerate"
          class="action-btn"
          title="重新生成"
        />
      </div>
    </div>
  </div>
  </div>
</template>

<style scoped>
.image-node-card {
  width: 220px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden;
  box-sizing: border-box;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

.image-node-card:hover {
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.1);
  transform: translateY(-2px);
}

.image-node-card.is-generating {
  border-color: #f59e0b;
}

.image-node-card.is-failed {
  border-color: #ef4444;
}

.image-node-card.is-success {
  border-color: #10b981;
}

/* 端口圆点美化 */
.node-handle {
  width: 10px;
  height: 10px;
  background: #f59e0b;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
}

.node-handle:hover {
  transform: scale(1.3);
}

.node-handle::after {
  content: "";
  position: absolute;
  top: -10px;
  left: -10px;
  right: -10px;
  bottom: -10px;
  border-radius: 50%;
}

/* 头部样式 */
.node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.delete-btn {
  padding: 0;
  min-height: auto;
  color: #94a3b8;
  font-size: 14px;
  transition: color 0.2s;
}

.delete-btn:hover {
  color: #ef4444;
}

.node-id {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
}

.status-tag {
  display: flex;
  align-items: center;
  gap: 3px;
  border-radius: 4px;
  padding: 0 6px;
  height: 18px;
}

.status-label {
  font-size: 10px;
  font-weight: 500;
}

/* 中部画面区 */
.node-body {
  height: 140px;
  background: #f1f5f9;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-wrapper {
  width: 100%;
  height: 100%;
}

.node-image {
  width: 100%;
  height: 100%;
  display: block;
}

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #94a3b8;
  padding: 12px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.placeholder-text {
  font-size: 11px;
  font-weight: 500;
}

.error-tip {
  font-size: 9px;
  color: #ef4444;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  text-align: center;
  margin-top: 4px;
}

/* 底部功能区 */
.node-footer {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-section {
  flex: 1;
}

:deep(.prompt-textarea .el-textarea__inner) {
  padding: 6px 8px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  line-height: 1.4;
  color: #334155;
  transition: all 0.2s;
}

:deep(.prompt-textarea .el-textarea__inner:focus) {
  border-color: #6366f1;
  background: #ffffff;
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2);
}

.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.model-badge {
  font-size: 10px;
  color: #64748b;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-btn {
  background: #6366f1;
  border-color: #6366f1;
}

.action-btn:hover {
  background: #4f46e5;
  border-color: #4f46e5;
}
</style>
