<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Loading, Warning, CircleCheck, Refresh, Edit, Delete, Picture, ZoomIn, Close, Search } from '@element-plus/icons-vue'
import { useCanvasStore } from '@/stores/canvas'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWorkspaceStore } from '@/stores/workspace'
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
const nodeRef = ref<HTMLElement | null>(null)

const isExpanded = computed({
  get: () => !!canvasStore.expandedNodes[props.id],
  set: (val: boolean) => {
    canvasStore.expandedNodes[props.id] = val
  }
})

// Local form state
const prompt = ref(props.data.prompt || '')
const mode = ref<'image' | 'video'>(props.data.mode || 'image')
const model = ref(props.data.model || (props.data.mode === 'video' ? 'Seedance 2.0' : 'Seedream 5.0'))
const ratio = ref(props.data.ratio || (props.data.mode === 'video' ? 'adaptive' : '9:16'))
const sizeLevel = ref<SizeLevel>((props.data.sizeLevel as SizeLevel) || '2K')
const videoResolution = ref(props.data.videoResolution || '720p')
const videoDuration = ref(props.data.videoDuration || 5)

// Available levels based on selected model
const availableLevels = computed(() => {
  return IMAGE_MODEL_LEVEL_OPTIONS[model.value] || ['2K']
})

// Aspect ratios from config
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

const isVideo = computed(() => {
  const url = props.data.image_url || ''
  return url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm')
})

const imageRatio = ref(1.0)

function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  if (img.naturalWidth && img.naturalHeight) {
    imageRatio.value = img.naturalWidth / img.naturalHeight
  }
}

function onVideoLoad(event: Event) {
  const video = event.target as HTMLVideoElement
  if (video.videoWidth && video.videoHeight) {
    imageRatio.value = video.videoWidth / video.videoHeight
  }
}

const computedUpperHeight = computed(() => {
  if (!props.data.image_url || props.data.status === 'generating' || props.data.status === 'failed') {
    return '150px'
  }
  const clampedRatio = Math.max(0.5, Math.min(2.0, imageRatio.value))
  return `${Math.round(240 / clampedRatio)}px`
})

// 找出连入该节点的所有 prompt_template 节点，并按 X 坐标从小到大排序
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

// 原地编辑变量相关状态
const editingKey = ref<string | null>(null)
const editingValue = ref('')

function startEditInline(key: string, currentValue: string) {
  editingKey.value = key
  editingValue.value = currentValue
  nextTick(() => {
    // 聚焦到对应的 inline input
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
      type: 'gen_node',
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

// 预览完整提示词
const isPreviewDialogVisible = ref(false)
const previewResolvedPrompt = computed(() => {
  return props.data.prompt || ''
})

function openPromptPreview() {
  isPreviewDialogVisible.value = true
}

watch(mode, (newMode) => {
  if (newMode === 'video') {
    model.value = 'Seedance 2.0'
    ratio.value = 'adaptive'
  } else {
    model.value = 'Seedream 5.0'
    ratio.value = '9:16'
  }
})

// Watch model to reset size level if not supported
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

// Sync props.data changes
watch(() => props.data, (newData) => {
  if (newData.prompt !== undefined && !isExpanded.value) {
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

// Toggle expansion
function toggleExpand() {
  if (props.data.status === 'generating') return
  isExpanded.value = !isExpanded.value
}

// Click outside handler to collapse editor
function handleClickOutside(event: MouseEvent) {
  if (!nodeRef.value) return
  
  // 0. 如果当前正在连线或刚刚完成连线交互，直接忽略 outside click，避免误折叠
  if (canvasStore.isConnectingOrJustConnected) {
    return
  }
  
  const target = event.target as HTMLElement
  if (!target) return
  
  // 1. 如果点击或交互在当前节点内部，不折叠
  if (nodeRef.value.contains(target)) {
    return
  }
  
  // 2. 如果点击或交互在连接端口（Handle）上，不折叠
  if (target.closest('.vue-flow__handle') || target.closest('.node-handle')) {
    return
  }
  
  // 3. 如果点击或交互在连线（Edge）或连接线相关 SVG 上，不折叠
  if (
    target.closest('.vue-flow__edge') || 
    target.closest('.vue-flow__edges') || 
    target.closest('.vue-flow__connection') || 
    target.closest('.vue-flow__connection-path') ||
    target.tagName.toLowerCase() === 'path' || 
    target.tagName.toLowerCase() === 'svg'
  ) {
    return
  }
  
  // 4. 其余外部点击（如画布空白处、其他节点内部），折叠编辑器
  isExpanded.value = false
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  // If no image, default to expanded so user can see they need to configure
  if (canvasStore.expandedNodes[props.id] === undefined) {
    if (!props.data.image_url && props.data.status !== 'generating') {
      canvasStore.expandedNodes[props.id] = true
    }
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})

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
  isExpanded.value = false
}

function handleDelete() {
  emit('delete', props.id)
}

const elImageRef = ref<any>(null)
function openPreview() {
  if (!props.data.image_url || props.data.status === 'generating') return
  if (!isVideo.value) {
    elImageRef.value?.showPreview?.()
  }
}

const activeRefPreviewUrl = ref('')
const refPreviewImage = ref<any>(null)

function openRefImagePreview(url: string) {
  activeRefPreviewUrl.value = url
  nextTick(() => {
    refPreviewImage.value?.showPreview?.()
  })
}

// canvasStore imported above

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
</script>

<template>
  <div class="node-wrapper-outer">
    <div v-if="canvasStore.showNodeId" class="node-id-badge">#{{ data.display_id }}</div>
    <div ref="nodeRef" class="gen-node-card" :class="[`is-${data.status || 'success'}`, { 'is-expanded': isExpanded }]">
    <!-- 连接端口 (左入右出) -->
    <Handle id="in" type="target" :position="Position.Left" class="node-handle" />
    <Handle v-if="data.image_url" id="out" type="source" :position="Position.Right" class="node-handle" />

    <div class="gen-node-inner">
      <!-- 上半部分：预览/生成区/占位区 -->
      <div class="node-upper" :style="{ height: computedUpperHeight }">
        <!-- 生成中 -->
        <div v-if="data.status === 'generating'" class="media-container loading">
          <el-icon class="is-loading" :size="28"><Loading /></el-icon>
          <span class="status-text">正在绘制中...</span>
        </div>

        <!-- 生成失败 -->
        <div v-else-if="data.status === 'failed'" class="media-container error" @click.stop="toggleExpand">
          <el-icon :size="28" color="#ef4444"><Warning /></el-icon>
          <span class="status-text text-danger">生成失败</span>
          <div class="error-detail" :title="data.error_message">{{ data.error_message || '接口调用异常' }}</div>
          
          <div class="hover-overlay-actions">
            <el-tooltip content="编辑并重试" placement="top">
              <button class="action-icon-btn" @click.stop="toggleExpand">
                <el-icon><Edit /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip content="删除节点" placement="top">
              <button class="action-icon-btn danger" @click.stop="handleDelete">
                <el-icon><Delete /></el-icon>
              </button>
            </el-tooltip>
          </div>
        </div>

        <!-- 成功生成 -->
        <div v-else-if="data.image_url" class="media-container success">
          <video 
            v-if="isVideo" 
            :src="data.image_url" 
            class="node-media" 
            autoplay 
            loop 
            muted 
            playsinline 
            @loadedmetadata="onVideoLoad"
          />
          <el-image
            v-else
            ref="elImageRef"
            :src="data.image_url"
            :preview-src-list="[data.image_url]"
            fit="cover"
            class="node-media"
            preview-teleported
            hide-on-click-modal
            @load="onImageLoad"
          />
          
          <!-- Model Tag -->
          <span class="model-tag">{{ data.model || 'gpt-5.4' }}</span>

          <!-- Hover Overlay Actions -->
          <div class="hover-overlay-actions">
            <el-tooltip content="大图预览" placement="top" v-if="!isVideo">
              <button class="action-icon-btn" @click.stop="openPreview">
                <el-icon><ZoomIn /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip content="重新编辑" placement="top">
              <button class="action-icon-btn" @click.stop="toggleExpand">
                <el-icon><Edit /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip content="重新生成" placement="top">
              <button class="action-icon-btn" @click.stop="handleGenerate">
                <el-icon><Refresh /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip content="删除节点" placement="top">
              <button class="action-icon-btn danger" @click.stop="handleDelete">
                <el-icon><Delete /></el-icon>
              </button>
            </el-tooltip>
          </div>
        </div>

        <!-- 未生成占位 -->
        <div v-else class="media-container empty" @click.stop="toggleExpand">
          <el-icon :size="28" class="placeholder-icon"><Picture /></el-icon>
          <span class="placeholder-text">点击配置并生成</span>
          <button class="empty-delete-btn" @click.stop="handleDelete" title="删除节点">
            <el-icon><Delete /></el-icon>
          </button>
        </div>
      </div>

      <!-- 下半部分：参数编辑器 (可展开收起) -->
      <transition name="slide-fade">
        <div v-show="isExpanded" class="node-lower-editor">
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
      </div>
    </transition>
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
  </div>
</template>

<style scoped>
.gen-node-card {
  width: 240px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  overflow: visible;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.2s, transform 0.2s;
}

.gen-node-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.1);
}

.gen-node-inner {
  width: 100%;
  height: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.gen-node-card.is-generating .gen-node-inner {
  border-color: #f59e0b;
}

.gen-node-card.is-failed .gen-node-inner {
  border-color: #ef4444;
}

.gen-node-card.is-success .gen-node-inner {
  border-color: #10b981;
}

/* 连线参考图样式 */
.editor-media-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.media-item {
  width: 50px;
  height: 50px;
  position: relative;
  cursor: pointer;
}

.media-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.media-hover {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  color: #ffffff;
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
  font-size: 14px;
  border-radius: 6px;
  overflow: hidden;
}

.media-item:hover .media-hover {
  opacity: 1;
}

.remove-ref-btn {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.9);
  color: #ffffff;
  border: 1px solid #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s, background-color 0.2s, opacity 0.2s;
  z-index: 10;
  padding: 0;
  opacity: 0;
}

.media-item:hover .remove-ref-btn {
  opacity: 1;
}

.remove-ref-btn:hover {
  transform: scale(1.1);
  background: #ef4444;
}

.remove-ref-btn :deep(.el-icon) {
  font-size: 8px;
  stroke-width: 4;
}

/* 上半部分：画面/占位区 */
.node-upper {
  height: 150px;
  position: relative;
  background: #f8fafc;
  overflow: hidden;
  transition: height 0.2s ease;
}

.media-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.node-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

:deep(.node-media .el-image__inner) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

/* Model Tag */
.model-tag {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(4px);
  color: #ffffff;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 500;
  pointer-events: none;
}

/* Empty Placeholder */
.media-container.empty {
  cursor: pointer;
  background: #f8fafc;
  border-bottom: 1px dashed #cbd5e1;
  transition: background-color 0.2s;
}

.media-container.empty:hover {
  background: #f1f5f9;
}

.placeholder-icon {
  color: #94a3b8;
  margin-bottom: 4px;
}

.media-container.empty:hover .placeholder-icon {
  color: #6366f1;
}

.placeholder-text {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

/* Loading & Error States */
.media-container.loading {
  background: #fffbeb;
  color: #d97706;
}

.media-container.loading .status-text {
  font-size: 12px;
  font-weight: 500;
  margin-top: 6px;
}

.media-container.error {
  background: #fef2f2;
  color: #dc2626;
  padding: 12px;
  cursor: pointer;
}

.media-container.error .status-text {
  font-size: 12px;
  font-weight: 600;
  margin-top: 4px;
}

.error-detail {
  font-size: 10px;
  color: #ef4444;
  text-align: center;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 4px;
}

/* Hover Actions Overlay */
.hover-overlay-actions {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 50%, rgba(0, 0, 0, 0.7) 100%);
  opacity: 0;
  transition: opacity 0.25s ease;
  display: flex;
  justify-content: flex-end; /* Align right */
  align-items: flex-end;     /* Align bottom */
  padding: 12px;
  box-sizing: border-box;
  z-index: 2;
  pointer-events: none;      /* Let mouse hover pass when hidden */
}

.hover-overlay-actions * {
  pointer-events: auto;      /* Enable mouse interaction for actions */
}

.media-container:hover .hover-overlay-actions {
  opacity: 1;
}

.action-icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  transition: transform 0.2s, background-color 0.2s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.action-icon-btn:hover {
  transform: scale(1.1);
  background: rgba(255, 255, 255, 0.45);
  color: #ffffff;
}

.action-icon-btn.danger:hover {
  background: rgba(239, 68, 68, 0.85);
  color: #ffffff;
}

/* 下半部分：参数编辑器 */
.node-lower-editor {
  padding: 12px;
  border-top: 1px solid #f1f5f9;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mode-toggle-group {
  width: 100%;
}

.mode-toggle-group :deep(.el-radio-button) {
  flex: 1;
}

.mode-toggle-group :deep(.el-radio-button__inner) {
  width: 100%;
  font-size: 11px;
  padding: 6px 12px;
}

.editor-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}

:deep(.editor-textarea .el-textarea__inner) {
  padding: 6px 8px;
  font-size: 11px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  line-height: 1.4;
  color: #334155;
}

:deep(.editor-textarea .el-textarea__inner:focus) {
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

.editor-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.generate-btn {
  width: 100%;
  height: 28px;
  border-radius: 6px;
  background: #6366f1;
  border-color: #6366f1;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.generate-btn:hover {
  background: #4f46e5;
  border-color: #4f46e5;
}

/* Transitions */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.25s ease-out;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-8px);
  opacity: 0;
}

/* Ports */
.node-handle {
  width: 10px;
  height: 10px;
  background: #6366f1;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
  z-index: 5;
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

.empty-delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.05);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: background-color 0.2s, color 0.2s, transform 0.2s;
  z-index: 10;
}

.empty-delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  transform: scale(1.1);
}

.field-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
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

.prompt-preview-box {
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: #334155;
  word-break: break-all;
  white-space: pre-wrap;
  max-height: 250px;
  overflow-y: auto;
}
</style>
