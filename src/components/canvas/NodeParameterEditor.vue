<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { Search, Close, ZoomIn, Refresh, Picture } from '@element-plus/icons-vue'
import { useCanvasStore } from '@/stores/canvas'
import { useWorkspaceStore } from '@/stores/workspace'
import { ElMessage } from 'element-plus'
import {
  IMAGE_MODELS,
  VIDEO_MODELS,
  VIDEO_RESOLUTION_OPTIONS,
  VIDEO_DURATION_OPTIONS,
  RATIO_OPTIONS,
  IMAGE_MODEL_LEVEL_OPTIONS,
  IMAGE_MODEL_DEFAULT_LEVEL,
  type SizeLevel
} from '@/composables/image/useGenerateForm'

interface NodeData {
  display_id?: number
  image_url?: string
  prompt?: string
  model?: string
  ratio?: string
  sizeLevel?: string
  status?: 'success' | 'generating' | 'failed'
  error_message?: string
  reference_images?: string[]
  template_values?: Record<string, string>
  mode?: 'image' | 'video'
  videoResolution?: string
  videoDuration?: number
}

const props = defineProps<{
  id: string
  data: NodeData
  nodeType: 'gen_node' | 'image_card'
}>()

const emit = defineEmits<{
  (e: 'generate', id: string, form: {
    prompt: string;
    model: string;
    ratio: string;
    sizeLevel: string;
    mode?: 'image' | 'video';
    videoResolution?: string;
    videoDuration?: number;
  }): void
  (e: 'delete', id: string): void
  (e: 'remove-edge', edgeId: string): void
}>()

const canvasStore = useCanvasStore()
const workspaceStore = useWorkspaceStore()

// Local form state
const prompt = ref(props.data.prompt || '')
const mode = ref<'image' | 'video'>(props.data.mode || 'image')
const model = ref(props.data.model || (props.data.mode === 'video' ? 'Seedance 2.0' : 'Seedream 5.0'))
const ratio = ref(props.data.ratio || (props.data.mode === 'video' ? 'adaptive' : '9:16'))
const sizeLevel = ref<SizeLevel>((props.data.sizeLevel as SizeLevel) || '2K')
const videoResolution = ref(props.data.videoResolution || '720p')
const videoDuration = ref(props.data.videoDuration || 5)

// Available options based on state
const availableLevels = computed(() => {
  return IMAGE_MODEL_LEVEL_OPTIONS[model.value] || ['2K']
})

const availableRatios = computed(() => {
  if (mode.value === 'video') {
    return RATIO_OPTIONS
  }
  return RATIO_OPTIONS.filter(o => o.value !== 'adaptive')
})

const availableModels = computed(() => {
  return mode.value === 'video' ? VIDEO_MODELS : IMAGE_MODELS
})

const availableVideoResolutions = computed(() => {
  if (model.value === 'Seedance 2.0' || model.value === 'Seedance 2.0 Fast') {
    return VIDEO_RESOLUTION_OPTIONS.filter(o => o.value !== '1080p')
  }
  return VIDEO_RESOLUTION_OPTIONS
})

// Connected template variables logic
const connectedTemplates = computed(() => {
  const tplNodes: any[] = []
  canvasStore.edges.forEach(edge => {
    if (edge.target === props.id) {
      const parentNode = canvasStore.nodes.find(n => n.id === edge.source)
      if (parentNode && parentNode.type === 'prompt_template') {
        tplNodes.push(parentNode)
      }
    }
  })
  return tplNodes.sort((a, b) => a.position.x - b.position.x)
})

const isUsingTemplate = computed(() => connectedTemplates.value.length > 0)

interface ParsedVar {
  key: string
  defaultValue: string
  currentValue: string
}

function getVariablesForTemplate(tplNode: any) {
  const vars: ParsedVar[] = []
  const text = tplNode.data?.template_text || ''
  const templateValues = props.data.template_values || {}
  
  const regex = /\{([^:]+):\s*([^}]+)\}/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const key = (match[1] || '').trim()
    const defaultValue = (match[2] || '').trim()
    if (key && !vars.some(v => v.key === key)) {
      vars.push({
        key,
        defaultValue,
        currentValue: templateValues[key] !== undefined ? templateValues[key] : defaultValue
      })
    }
  }
  return vars
}

const editingKey = ref<string | null>(null)
const editingValue = ref('')

function startEditInline(key: string, currentValue: string) {
  editingKey.value = key
  editingValue.value = currentValue
  nextTick(() => {
    const inputs = document.querySelectorAll('.inline-capsule-input')
    const input = Array.from(inputs).find(el => {
      return (el as HTMLInputElement).value === currentValue
    }) as HTMLInputElement || inputs[0] as HTMLInputElement
    
    if (input) {
      input.focus()
      input.select()
    }
  })
}

async function saveInlineEdit(key: string) {
  if (editingKey.value !== key) return
  const val = editingValue.value.trim()
  editingKey.value = null
  
  const workspaceId = workspaceStore.selectedWorkspaceId
  if (!workspaceId) return
  
  const newTemplateValues = {
    ...(props.data.template_values || {}),
    [key]: val
  }
  
  const updatedData = {
    ...props.data,
    template_values: newTemplateValues
  }
  
  const localNode = canvasStore.nodes.find(n => n.id === props.id)
  if (localNode) {
    localNode.data = updatedData
    await canvasStore.saveNode(workspaceId, {
      id: props.id,
      type: props.nodeType,
      x: localNode.position.x,
      y: localNode.position.y,
      data: updatedData
    })
    
    await canvasStore.recomputeTemplatePrompts(workspaceId)
    await canvasStore.loadGraph(workspaceId)
    canvasStore.pushHistory()
    ElMessage.success(`变量 [ ${key} ] 已更新`)
  }
}

function handleDisconnectTemplate(tplNodeId: string) {
  const edge = canvasStore.edges.find(e => e.source === tplNodeId && e.target === props.id)
  if (edge) {
    emit('remove-edge', edge.id)
    ElMessage.success('已断开该模板的连线')
  }
}

function handleRemoveReference(imageUrl: string) {
  const sourceNode = canvasStore.nodes.find(n => n.data?.image_url === imageUrl)
  if (!sourceNode) {
    ElMessage.warning('找不到该参考图的来源节点')
    return
  }
  
  const targetEdge = canvasStore.edges.find(e => e.source === sourceNode.id && e.target === props.id)
  if (!targetEdge) {
    ElMessage.warning('未找到对应的连接线')
    return
  }
  
  emit('remove-edge', targetEdge.id)
}

// Preview resolved prompt
const isPreviewDialogVisible = ref(false)
const previewResolvedPrompt = computed(() => {
  return props.data.prompt || ''
})

function openPromptPreview() {
  isPreviewDialogVisible.value = true
}

// Media Preview
const activeRefPreviewUrl = ref('')
const refPreviewImage = ref<any>(null)

function openRefImagePreview(url: string) {
  activeRefPreviewUrl.value = url
  nextTick(() => {
    refPreviewImage.value?.showPreview?.()
  })
}

// Watchers to keep form state in sync with props.data
watch(mode, (newMode) => {
  if (newMode === 'video') {
    model.value = 'Seedance 2.0'
    ratio.value = 'adaptive'
  } else {
    model.value = 'Seedream 5.0'
    ratio.value = '9:16'
  }
})

watch(model, (newModel) => {
  if (mode.value === 'image') {
    const allowed = IMAGE_MODEL_LEVEL_OPTIONS[newModel] || []
    if (allowed.length > 0 && !allowed.includes(sizeLevel.value)) {
      sizeLevel.value = (IMAGE_MODEL_DEFAULT_LEVEL[newModel] || allowed[0]) as SizeLevel
    }
  } else {
    if ((newModel === 'Seedance 2.0' || newModel === 'Seedance 2.0 Fast') && videoResolution.value === '1080p') {
      videoResolution.value = '720p'
    }
  }
})

watch(() => props.data, (newData) => {
  if (newData.prompt !== undefined) {
    prompt.value = newData.prompt || ''
  }
  if (newData.mode !== undefined) {
    mode.value = newData.mode || 'image'
  }
  if (newData.model !== undefined) {
    model.value = newData.model || (mode.value === 'video' ? 'Seedance 2.0' : 'Seedream 5.0')
  }
  if (newData.ratio !== undefined) {
    ratio.value = newData.ratio || (mode.value === 'video' ? 'adaptive' : '9:16')
  }
  if (newData.sizeLevel !== undefined) {
    sizeLevel.value = (newData.sizeLevel || '2K') as SizeLevel
  }
  if (newData.videoResolution !== undefined) {
    videoResolution.value = newData.videoResolution || '720p'
  }
  if (newData.videoDuration !== undefined) {
    videoDuration.value = newData.videoDuration || 5
  }
}, { deep: true })

function handleGenerate() {
  const finalPrompt = isUsingTemplate.value ? (props.data.prompt || '') : prompt.value
  if (!finalPrompt.trim()) {
    ElMessage.warning('请输入提示词')
    return
  }
  emit('generate', props.id, {
    prompt: finalPrompt,
    model: model.value,
    ratio: ratio.value,
    sizeLevel: sizeLevel.value,
    mode: mode.value,
    videoResolution: videoResolution.value,
    videoDuration: videoDuration.value
  })
}
</script>

<template>
  <div class="node-lower-editor">
    <div class="editor-field">
      <div class="field-title-row">
        <label class="field-label">提示词</label>
        <el-icon 
          v-if="isUsingTemplate" 
          class="preview-search-icon" 
          @click.stop="openPromptPreview"
          title="预览最终替换后的提示词"
        >
          <Search />
        </el-icon>
      </div>
      
      <div v-if="isUsingTemplate" class="templates-boxes nodrag">
        <div 
          v-for="tpl in connectedTemplates" 
          :key="tpl.id" 
          class="template-box"
        >
          <div class="template-box-header">
            <span class="tpl-name">{{ tpl.data.name || '未命名模板' }}</span>
            <button 
              class="tpl-disconnect-btn" 
              @click.stop="handleDisconnectTemplate(tpl.id)"
              title="断开模板连接"
            >
              <el-icon><Close /></el-icon>
            </button>
          </div>
          
          <div class="template-box-body">
            <div 
              v-for="v in getVariablesForTemplate(tpl)" 
              :key="v.key" 
              class="capsule-tag"
              @click.stop="startEditInline(v.key, v.currentValue)"
              :title="'点击原地编辑 ' + v.key"
            >
              <span class="capsule-label">🏷️ {{ v.key }}:</span>
              <input
                v-if="editingKey === v.key"
                class="inline-capsule-input nodrag"
                v-model="editingValue"
                @blur="saveInlineEdit(v.key)"
                @keyup.enter="saveInlineEdit(v.key)"
                @click.stop
              />
              <span v-else class="capsule-value">{{ v.currentValue }}</span>
            </div>
            <div v-if="getVariablesForTemplate(tpl).length === 0" class="no-variables-hint">
              无变量槽位
            </div>
          </div>
        </div>
      </div>
      
      <el-input
        v-else
        v-model="prompt"
        type="textarea"
        :rows="3"
        placeholder="请输入生图提示词..."
        class="editor-textarea nodrag"
        resize="none"
      />
    </div>

    <!-- 连线参考图显示 -->
    <div v-if="data.reference_images && data.reference_images.length > 0" class="editor-field">
      <label class="field-label">连线参考图 ({{ data.reference_images.length }})</label>
      <div class="editor-media-list">
        <div 
          v-for="(img, idx) in data.reference_images" 
          :key="idx" 
          class="media-item"
          @click.stop="openRefImagePreview(img)"
        >
          <img :src="img" class="media-thumb" />
          <div class="media-hover">
            <el-icon><ZoomIn /></el-icon>
          </div>
          <!-- 移除参考图/断开连接线按钮 -->
          <button class="remove-ref-btn" @click.stop="handleRemoveReference(img)">
            <el-icon><Close /></el-icon>
          </button>
        </div>
      </div>
    </div>

    <div class="editor-field">
      <label class="field-label">生成类型</label>
      <el-radio-group v-model="mode" size="small" class="mode-toggle-group nodrag">
        <el-radio-button label="image">图片生成</el-radio-button>
        <el-radio-button label="video">视频生成</el-radio-button>
      </el-radio-group>
    </div>

    <div class="editor-row">
      <div class="editor-field flex-1">
        <label class="field-label">选择模型</label>
        <el-select v-model="model" size="small" style="width: 100%">
          <el-option
            v-for="m in availableModels"
            :key="m.value"
            :label="m.label"
            :value="m.value"
          />
        </el-select>
      </div>
    </div>

    <template v-if="mode === 'image'">
      <div class="editor-row grid-2">
        <div class="editor-field">
          <label class="field-label">比例</label>
          <el-select v-model="ratio" size="small" style="width: 100%">
            <el-option
              v-for="r in availableRatios"
              :key="r.value"
              :label="r.label"
              :value="r.value"
            />
          </el-select>
        </div>

        <div class="editor-field">
          <label class="field-label">分辨率</label>
          <el-select v-model="sizeLevel" size="small" style="width: 100%">
            <el-option
              v-for="lvl in availableLevels"
              :key="lvl"
              :label="lvl"
              :value="lvl"
            />
          </el-select>
        </div>
      </div>
    </template>

    <template v-else-if="mode === 'video'">
      <div class="editor-row grid-2">
        <div class="editor-field">
          <label class="field-label">比例</label>
          <el-select v-model="ratio" size="small" style="width: 100%">
            <el-option
              v-for="r in availableRatios"
              :key="r.value"
              :label="r.label"
              :value="r.value"
            />
          </el-select>
        </div>

        <div class="editor-field">
          <label class="field-label">分辨率</label>
          <el-select v-model="videoResolution" size="small" style="width: 100%">
            <el-option
              v-for="res in availableVideoResolutions"
              :key="res.value"
              :label="res.label"
              :value="res.value"
            />
          </el-select>
        </div>
      </div>

      <div class="editor-row">
        <div class="editor-field flex-1">
          <label class="field-label">时长</label>
          <el-select v-model="videoDuration" size="small" style="width: 100%">
            <el-option
              v-for="dur in VIDEO_DURATION_OPTIONS"
              :key="dur.value"
              :label="dur.label"
              :value="dur.value"
            />
          </el-select>
        </div>
      </div>
    </template>

    <div class="editor-actions">
      <el-button type="primary" size="small" class="generate-btn" @click.stop="handleGenerate">
        <el-icon><Refresh /></el-icon>开始生成
      </el-button>
    </div>

    <!-- 隐藏的用于大图预览的组件 -->
    <el-image
      ref="refPreviewImage"
      style="display: none;"
      :src="activeRefPreviewUrl"
      :preview-src-list="[activeRefPreviewUrl]"
      preview-teleported
    />

    <!-- 提示词最终预览浮窗 -->
    <el-dialog
      v-model="isPreviewDialogVisible"
      title="预览最终提示词"
      width="500px"
      append-to-body
    >
      <div class="prompt-preview-box">
        {{ previewResolvedPrompt || '(空)' }}
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button type="primary" @click="isPreviewDialogVisible = false">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* Parameter Editor scoped styles */
.node-lower-editor {
  padding: 12px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.editor-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.preview-search-icon {
  font-size: 13px;
  color: #6366f1;
  cursor: pointer;
  transition: transform 0.2s, color 0.2s;
}

.preview-search-icon:hover {
  transform: scale(1.15);
  color: #4f46e5;
}

.editor-textarea {
  width: 100%;
}

.editor-textarea :deep(.el-textarea__inner) {
  padding: 6px 8px;
  font-size: 11px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  line-height: 1.4;
  color: #334155;
  transition: all 0.2s;
}

.editor-textarea :deep(.el-textarea__inner:focus) {
  border-color: #6366f1;
  background: #ffffff;
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2);
}

.editor-row {
  display: flex;
  gap: 8px;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.flex-1 {
  flex: 1;
}

.mode-toggle-group {
  width: 100%;
}

.mode-toggle-group :deep(.el-radio-button) {
  flex: 1;
}

.mode-toggle-group :deep(.el-radio-button__inner) {
  width: 100%;
  padding: 6px 0;
  font-size: 11px;
}

:deep(.el-select .el-input__inner) {
  font-size: 11px;
}

:deep(.el-select .el-input__wrapper) {
  padding: 2px 8px;
}

/* 连线参考图样式 */
.editor-media-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.media-item {
  width: 46px;
  height: 46px;
  position: relative;
  cursor: pointer;
  border-radius: 6px;
  overflow: hidden;
}

.media-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}

.media-hover {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  border-radius: 6px;
  opacity: 0;
  transition: opacity 0.2s;
  font-size: 14px;
}

.media-item:hover .media-hover {
  opacity: 1;
}

.remove-ref-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  z-index: 5;
  opacity: 0;
  transition: opacity 0.2s;
}

.media-item:hover .remove-ref-btn {
  opacity: 1;
}

.remove-ref-btn:hover {
  background: rgba(239, 68, 68, 0.9);
  transform: scale(1.1);
}

/* 模板插槽盒子样式 (Purple Premium Theme) */
.templates-boxes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}

.template-box {
  background: #fdfaff;
  border: 1px dashed #d8b4fe;
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.template-box:hover {
  border-color: #a855f7;
}

.template-box-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f3e8ff;
  padding-bottom: 4px;
}

.tpl-name {
  font-size: 10px;
  font-weight: 700;
  color: #7c3aed;
  text-transform: uppercase;
}

.tpl-disconnect-btn {
  padding: 0;
  background: none;
  border: none;
  color: #cbd5e1;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: color 0.2s, transform 0.1s;
}

.tpl-disconnect-btn:hover {
  color: #ef4444;
  transform: scale(1.1);
}

.template-box-body {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.capsule-tag {
  display: inline-flex;
  align-items: center;
  background: #ffffff;
  border: 1px solid #e9d5ff;
  border-radius: 20px;
  padding: 2px 8px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  font-size: 11px;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  user-select: none;
  max-width: 100%;
  box-sizing: border-box;
}

.capsule-tag:hover {
  transform: translateY(-1px);
  border-color: #a855f7;
  box-shadow: 0 2px 6px rgba(168, 85, 247, 0.15);
}

.capsule-label {
  color: #9333ea;
  font-weight: 600;
  margin-right: 4px;
}

.capsule-value {
  color: #4b5563;
  word-break: break-all;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.inline-capsule-input {
  border: none;
  background: #f3e8ff;
  outline: none;
  font-size: 11px;
  color: #1f2937;
  padding: 0 4px;
  margin: 0;
  width: 80px;
  border-radius: 4px;
  font-family: inherit;
}

.no-variables-hint {
  font-size: 10px;
  color: #94a3b8;
  font-style: italic;
  width: 100%;
}

.editor-actions {
  display: flex;
  margin-top: 4px;
}

.generate-btn {
  width: 100%;
  height: 32px;
  border-radius: 6px;
  background: #6366f1;
  border-color: #6366f1;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.generate-btn:hover {
  background: #4f46e5;
  border-color: #4f46e5;
}

.prompt-preview-box {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 12px;
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
  word-break: break-all;
  max-height: 250px;
  overflow-y: auto;
}
</style>
