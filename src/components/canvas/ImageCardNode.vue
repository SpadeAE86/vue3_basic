<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { 
  Picture, Refresh, Delete, ZoomIn, Film, 
  Loading, Warning, CircleCheck, Edit, Close, Search, MagicStick, Headset
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { uploadToObs } from '@/utils/obs'
import { useCanvasStore } from '@/stores/canvas'
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
  media_type?: 'image' | 'video'
  source?: 'upload' | 'generate'
  status?: 'success' | 'generating' | 'failed'
  error_message?: string
  model?: string
  ratio?: string
  sizeLevel?: string
  videoResolution?: string
  videoDuration?: number
  reference_images?: string[]
  template_values?: Record<string, string>
  mode?: 'image' | 'video'
}

const props = defineProps<{
  id: string
  data: NodeData
}>()

const emit = defineEmits<{
  (e: 'change-image', id: string, url: string): void
  (e: 'delete', id: string): void
  (e: 'generate', id: string, form: {
    prompt: string;
    model: string;
    ratio: string;
    sizeLevel: string;
    mode?: 'image' | 'video';
    videoResolution?: string;
    videoDuration?: number;
  }): void
  (e: 'remove-edge', edgeId: string): void
}>()

const canvasStore = useCanvasStore()
const workspaceStore = useWorkspaceStore()

// Upload state
const isUploading = ref(false)
const uploadProgress = ref(0)
const fileInputRef = ref<HTMLInputElement | null>(null)
const elImageRef = ref<any>(null)
const imageRatio = ref(1.0)

// Editor state (for generated nodes)
const isExpanded = ref(false)
const prompt = ref(props.data.prompt || '')
const mode = ref<'image' | 'video'>(props.data.mode || (props.data.media_type === 'video' ? 'video' : 'image'))
const model = ref(props.data.model || (props.data.media_type === 'video' ? 'Seedance 2.0' : 'Seedream 5.0'))
const ratio = ref(props.data.ratio || (props.data.media_type === 'video' ? 'adaptive' : '9:16'))
const sizeLevel = ref<SizeLevel>((props.data.sizeLevel as SizeLevel) || '2K')
const videoResolution = ref(props.data.videoResolution || '720p')
const videoDuration = ref(props.data.videoDuration || 5)

const isMorphing = ref(false)

function switchMode(newMode: 'image' | 'video') {
  if (mode.value === newMode) return
  isMorphing.value = true
  
  // 模拟翻折至中途时瞬间变换模式卡片内容，实现连贯翻面体验
  setTimeout(() => {
    mode.value = newMode
  }, 180)
  
  setTimeout(() => {
    isMorphing.value = false
  }, 450)
}

// Watchers
watch(() => props.data.media_type, (newType) => {
  if (newType) {
    mode.value = newType
  }
})

watch(mode, async (newMode) => {
  if (newMode === 'video') {
    model.value = 'Seedance 2.0'
    ratio.value = 'adaptive'
  } else {
    model.value = 'Seedream 5.0'
    ratio.value = '9:16'
  }

  const workspaceId = workspaceStore.selectedWorkspaceId
  if (workspaceId) {
    const localNode = canvasStore.nodes.find(n => n.id === props.id)
    if (localNode) {
      const updatedData = {
        ...props.data,
        mode: newMode,
        media_type: newMode,
        model: model.value,
        ratio: ratio.value
      }
      localNode.data = updatedData
      await canvasStore.saveNode(workspaceId, {
        id: props.id,
        type: 'image_card',
        x: localNode.position.x,
        y: localNode.position.y,
        data: updatedData
      })
      canvasStore.pushHistory()
    }
  }
})

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

// Available options
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

const urlMediaType = computed(() => {
  const url = props.data.image_url || ''
  if (!url) return null
  return (url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm')) ? 'video' : 'image'
})

const hasValidMediaForCurrentMode = computed(() => {
  if (props.data.source !== 'generate') return true
  if (!props.data.image_url) return false
  return urlMediaType.value === mode.value
})

const isVideo = computed(() => {
  if (props.data.source === 'generate') {
    return urlMediaType.value === 'video'
  }
  if (props.data.media_type === 'video') return true
  const url = props.data.image_url || ''
  return url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm')
})

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
  if (!props.data.image_url || props.data.status === 'generating' || props.data.status === 'failed' || !hasValidMediaForCurrentMode.value) {
    return '150px'
  }
  const clampedRatio = Math.max(0.5, Math.min(2.0, imageRatio.value))
  return `${Math.round(220 / clampedRatio)}px`
})

function triggerFileSelect() {
  if (isUploading.value) return
  fileInputRef.value?.click()
}

async function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    ElMessage.warning('仅支持上传图片或视频文件')
    return
  }

  isUploading.value = true
  uploadProgress.value = 0
  
  try {
    const isVideoFile = file.type.startsWith('video/')
    const prefix = isVideoFile ? 'ai_picture/reference_video' : 'ai_picture/reference_image'
    
    const url = await uploadToObs(file, prefix, (percent) => {
      uploadProgress.value = percent
    })
    
    emit('change-image', props.id, url)
    ElMessage.success('上传成功')
  } catch (err: any) {
    console.error('上传失败:', err)
    ElMessage.error(`上传失败: ${err.message || err}`)
  } finally {
    isUploading.value = false
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}

function openPreview() {
  if (!props.data.image_url || isUploading.value) return
  if (!isVideo.value) {
    elImageRef.value?.showPreview?.()
  }
}

function handleDelete() {
  emit('delete', props.id)
}

function toggleExpand() {
  if (props.data.status === 'generating') return
  isExpanded.value = !isExpanded.value
}

// Template integrations
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

const activeMediaType = computed(() => {
  if (props.data.source === 'generate') {
    return mode.value
  }
  return props.data.media_type === 'video' ? 'video' : 'image'
})

const displayLabel = computed(() => {
  let label = activeMediaType.value === 'video' ? 'Video' : 'Image'
  if (props.data.source === 'upload' && props.data.image_url) {
    const url = props.data.image_url
    const parts = url.split('/')
    const lastPart = parts[parts.length - 1] || ''
    if (lastPart) {
      try {
        label = decodeURIComponent(lastPart)
        const match = label.match(/^\d{13}_(.+)$/)
        if (match && match[1]) {
          label = match[1]
        }
      } catch {
        label = lastPart
      }
    }
  }
  
  if (canvasStore.showNodeId) {
    return `${label} #${props.data.display_id}`
  }
  return label
})

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
      type: 'image_card',
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

const isPreviewDialogVisible = ref(false)
const previewResolvedPrompt = computed(() => {
  return props.data.prompt || ''
})

function openPromptPreview() {
  isPreviewDialogVisible.value = true
}

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

const activeRefPreviewUrl = ref('')
const refPreviewImage = ref<any>(null)

function openRefImagePreview(url: string) {
  activeRefPreviewUrl.value = url
  nextTick(() => {
    refPreviewImage.value?.showPreview?.()
  })
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

function handleOutsideClick(event: MouseEvent) {
  if (canvasStore.isConnectingOrJustConnected) return
  const target = event.target as HTMLElement
  if (!target) return
  
  // Collapse generated editor if clicked outside of this node
  const nodeEl = document.querySelector(`.vue-flow__node[data-id="${props.id}"]`)
  if (nodeEl && !nodeEl.contains(target) && !target.closest('.vue-flow__handle') && !target.closest('.node-handle')) {
    isExpanded.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  if (props.data.source === 'generate' && (!props.data.image_url || !hasValidMediaForCurrentMode.value) && props.data.status !== 'generating') {
    isExpanded.value = true
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
})
</script>

<template>
  <div class="node-wrapper-outer">
    <!-- Floating Tab Ears on the right-bottom edge -->
    <div v-if="isExpanded && data.source === 'generate' && data.status !== 'generating'" class="node-tab-ears nodrag">
      <el-tooltip content="切换为图像生成" placement="right" :show-after="400">
        <div 
          class="tab-ear" 
          :class="{ active: mode === 'image', 'ear-image': mode === 'image' }"
          @click.stop="switchMode('image')"
        >
          <el-icon><Picture /></el-icon>
        </div>
      </el-tooltip>
      <el-tooltip content="切换为视频生成" placement="right" :show-after="400">
        <div 
          class="tab-ear" 
          :class="{ active: mode === 'video', 'ear-video': mode === 'video' }"
          @click.stop="switchMode('video')"
        >
          <el-icon><Film /></el-icon>
        </div>
      </el-tooltip>
      <el-tooltip content="音频生成 (即将推出)" placement="right" :show-after="400">
        <div class="tab-ear disabled">
          <el-icon><Headset /></el-icon>
        </div>
      </el-tooltip>
    </div>

    <!-- Display ID badge floating on top-left -->
    <div class="node-top-badge-bar">
      <div class="type-badge" :class="activeMediaType === 'video' ? 'video' : 'image'">
        <el-icon class="badge-icon">
          <Film v-if="activeMediaType === 'video'" />
          <Picture v-else />
        </el-icon>
        <span class="badge-text" :title="displayLabel">{{ displayLabel }}</span>
      </div>
    </div>

    <div 
      class="image-card-node" 
      :class="[
        { 'is-expanded': isExpanded && data.source === 'generate' }, 
        `is-${data.status || 'success'}`,
        { 'is-morphing': isMorphing }
      ]"
    >
      <!-- Ports (Input port only for generated nodes. Output port only if image_url exists) -->
      <Handle 
        v-if="data.source === 'generate'"
        id="in" 
        type="target" 
        :position="Position.Left" 
        class="node-handle handle-in" 
        :class="activeMediaType === 'video' ? 'handle-video-color' : 'handle-image-color'"
      />
      <Handle 
        v-if="data.image_url && hasValidMediaForCurrentMode"
        id="out" 
        type="source" 
        :position="Position.Right" 
        class="node-handle handle-out"
        :class="data.media_type === 'video' ? 'handle-video-color' : 'handle-image-color'"
      />

      <div class="card-content">
        <!-- Upper Area: Media Zone -->
        <div class="node-upper" :style="{ height: computedUpperHeight }">
          <!-- Loading Overlay (local upload or generation) -->
          <div v-if="isUploading || data.status === 'generating'" class="media-overlay loading">
            <el-icon class="is-loading" :size="28"><Loading /></el-icon>
            <span class="status-text">{{ isUploading ? '上传中...' : '正在绘制中...' }}</span>
            <el-progress v-if="isUploading" type="line" :percentage="uploadProgress" :stroke-width="3" style="width: 80%; margin-top: 8px;" />
          </div>

          <!-- Failed generation -->
          <div v-else-if="data.status === 'failed'" class="media-overlay error" @click.stop="toggleExpand">
            <el-icon :size="28" color="#ef4444"><Warning /></el-icon>
            <span class="status-text text-danger">生成失败</span>
            <div class="error-detail" :title="data.error_message">{{ data.error_message || '接口调用异常' }}</div>
            
            <div class="hover-actions-overlay">
              <el-tooltip content="编辑并重试" placement="top">
                <button class="hover-action-btn" @click.stop="toggleExpand">
                  <el-icon><Edit /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="删除节点" placement="top">
                <button class="hover-action-btn danger" @click.stop="handleDelete">
                  <el-icon><Delete /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </div>

          <!-- Successful Media Display -->
          <div v-else-if="data.image_url && hasValidMediaForCurrentMode" class="media-overlay success">
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
            
            <!-- Hover actions -->
            <div class="hover-actions-overlay">
              <el-tooltip content="大图预览" placement="top" v-if="!isVideo">
                <button class="hover-action-btn" @click.stop="openPreview">
                  <el-icon><ZoomIn /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="重新配置" placement="top" v-if="data.source === 'generate'">
                <button class="hover-action-btn" @click.stop="toggleExpand">
                  <el-icon><Edit /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="重新生成" placement="top" v-if="data.source === 'generate'">
                <button class="hover-action-btn" @click.stop="handleGenerate">
                  <el-icon><Refresh /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="更换素材" placement="top" v-if="data.source === 'upload'">
                <button class="hover-action-btn" @click.stop="triggerFileSelect">
                  <el-icon><Refresh /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="删除节点" placement="top">
                <button class="hover-action-btn danger" @click.stop="handleDelete">
                  <el-icon><Delete /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </div>

          <!-- Empty placeholders -->
          <div v-else class="media-overlay empty" @click.stop="data.source === 'generate' ? toggleExpand() : triggerFileSelect()">
            <el-icon :size="28" class="placeholder-icon">
              <Film v-if="activeMediaType === 'video'" />
              <Picture v-else />
            </el-icon>
            <span class="placeholder-text">
              {{ data.source === 'generate' ? '点击配置并生成' : (activeMediaType === 'video' ? '选择或拖入视频' : '选择或拖入图片') }}
            </span>
            <button class="empty-delete-btn" @click.stop="handleDelete" title="删除节点">
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </div>

        <!-- Lower Area: Parameter collapsible editor (Only for generate nodes) -->
        <transition name="slide-fade">
          <div v-show="isExpanded && data.source === 'generate'" class="node-lower-editor">
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
              
              <!-- Templates boxes -->
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
                      :title="'点击编辑 ' + v.key"
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
                placeholder="请输入提示词..."
                class="editor-textarea nodrag"
                resize="none"
              />
            </div>

            <!-- Reference media lists -->
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
                  <button class="remove-ref-btn" @click.stop="handleRemoveReference(img)">
                    <el-icon><Close /></el-icon>
                  </button>
                </div>
              </div>
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

      <!-- Hidden file input for uploads -->
      <input 
        ref="fileInputRef" 
        type="file" 
        accept="image/*,video/*" 
        style="display: none;" 
        @change="handleFileChange"
      />
    </div>

    <!-- Hidden Ref Image preview element -->
    <el-image
      ref="refPreviewImage"
      style="display: none;"
      :src="activeRefPreviewUrl"
      :preview-src-list="[activeRefPreviewUrl]"
      preview-teleported
    />

    <!-- Template prompt preview dialog -->
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
.node-wrapper-outer {
  position: relative;
  overflow: visible;
}

.node-top-badge-bar {
  position: absolute;
  top: -22px;
  left: 2px;
  z-index: 50;
  display: flex;
  gap: 6px;
  align-items: center;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
  transition: all 0.2s ease;
  max-width: 230px;
}

.type-badge.image,
.type-badge.video {
  color: #64748b;
}

.type-badge:hover {
  color: #475569;
}

.badge-icon {
  font-size: 13px;
  display: flex;
  align-items: center;
  color: #64748b;
}

.type-badge:hover .badge-icon {
  color: #475569;
}

.badge-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 210px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.image-card-node {
  width: 240px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  overflow: visible;
  position: relative;
  box-sizing: border-box;
  transition: transform 0.2s, box-shadow 0.2s;
  border: 1px solid #cbd5e1;
}

.image-card-node:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.15);
}

.image-card-node.is-generating {
  border-color: #f59e0b;
}

.image-card-node.is-failed {
  border-color: #ef4444;
}

.image-card-node.is-success {
  border-color: #10b981;
}

.card-content {
  width: 100%;
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
}

.node-upper {
  width: 100%;
  position: relative;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 150px;
}

.media-overlay {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  position: relative;
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

/* Hover Action Overlays */
.hover-actions-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 50%, rgba(0, 0, 0, 0.7) 100%);
  opacity: 0;
  transition: opacity 0.25s ease;
  display: flex;
  justify-content: flex-end;
  align-items: flex-end;
  padding: 12px;
  box-sizing: border-box;
  border-radius: 12px;
  pointer-events: none;
  z-index: 10;
}

.hover-actions-overlay * {
  pointer-events: auto;
}

.media-overlay:hover .hover-actions-overlay {
  opacity: 1;
}

.hover-action-btn {
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
  margin-left: 6px;
}

.hover-action-btn:hover {
  transform: scale(1.1);
  background: rgba(255, 255, 255, 0.45);
}

.hover-action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.85);
}

/* Placeholder Empty States */
.media-overlay.empty {
  cursor: pointer;
  padding: 16px;
  gap: 8px;
  transition: background-color 0.2s;
}

.media-overlay.empty:hover {
  background-color: #f1f5f9;
}

.placeholder-icon {
  color: #94a3b8;
}

.placeholder-text {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
  text-align: center;
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
  transition: background-color 0.2s, color 0.2s;
}

.empty-delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.status-text {
  font-size: 12px;
  color: #64748b;
  margin-top: 8px;
}

.text-danger {
  color: #ef4444 !important;
}

.error-detail {
  font-size: 10px;
  color: #94a3b8;
  width: 90%;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 4px;
}

/* Ports with customized theme coloring */
.node-handle {
  width: 10px;
  height: 10px;
  border: 2px solid #ffffff !important;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
  z-index: 100;
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

.handle-image-color {
  background: #f59e0b !important; /* Yellow for image ports */
}

.handle-video-color {
  /* Dynamic gradient purple-blue for video ports */
  background: linear-gradient(135deg, #a855f7 0%, #3b82f6 100%) !important;
  animation: handleGlow 3s infinite alternate;
}

@keyframes handleGlow {
  0% { filter: drop-shadow(0 0 1px rgba(168, 85, 247, 0.6)); }
  100% { filter: drop-shadow(0 0 5px rgba(59, 130, 246, 0.9)); }
}

/* Lower config editor layout */
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
}

:deep(.editor-textarea .el-textarea__inner) {
  padding: 6px 8px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  line-height: 1.4;
  color: #334155;
  transition: all 0.2s;
}

:deep(.editor-textarea .el-textarea__inner:focus) {
  border-color: #6366f1;
  background: #ffffff;
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2);
}

.editor-row {
  display: flex;
  gap: 10px;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.flex-1 {
  flex: 1;
}

.editor-actions {
  display: flex;
  margin-top: 4px;
}

.generate-btn {
  width: 100%;
  height: 32px;
  background: #6366f1;
  border-color: #6366f1;
  font-weight: 600;
}

.generate-btn:hover {
  background: #4f46e5;
  border-color: #4f46e5;
}

/* Templates layout */
.templates-boxes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 4px;
}

.template-box {
  background: #fbf7ff;
  border: 1px solid #e9d5ff;
  border-radius: 8px;
  padding: 8px;
  box-sizing: border-box;
}

.template-box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.tpl-name {
  font-size: 11px;
  font-weight: 700;
  color: #7c3aed;
}

.tpl-disconnect-btn {
  background: none;
  border: none;
  color: #cbd5e1;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
  display: flex;
  align-items: center;
}

.tpl-disconnect-btn:hover {
  color: #ef4444;
}

.template-box-body {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.capsule-tag {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  padding: 1px 6px;
  border-radius: 12px;
  font-size: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
}

.capsule-tag:hover {
  border-color: #7c3aed;
  background: #fbf7ff;
}

.capsule-label {
  color: #7c3aed;
  font-weight: 600;
}

.capsule-value {
  color: #475569;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.inline-capsule-input {
  border: none;
  background: #f3e8ff;
  outline: none;
  font-size: 10px;
  color: #1f2937;
  padding: 0 4px;
  width: 60px;
  border-radius: 4px;
}

.no-variables-hint {
  font-size: 10px;
  color: #94a3b8;
  font-style: italic;
}

.editor-media-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  transition: opacity 0.2s;
}

.media-item:hover .media-hover {
  opacity: 1;
}

.remove-ref-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.media-item:hover .remove-ref-btn {
  opacity: 1;
}

.remove-ref-btn:hover {
  background: rgba(239, 68, 68, 0.9);
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

/* Animations */
.slide-fade-enter-active {
  transition: all 0.3s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}

/* --- Floating Tab Ears Switcher --- */
.node-wrapper-outer {
  perspective: 1000px; /* Enable 3D space for the card flip */
}

.node-tab-ears {
  position: absolute;
  right: -32px;
  bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 10;
}

.tab-ear {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.tab-ear:hover:not(.disabled) {
  transform: scale(1.15) translateX(2px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  color: #1e293b;
}

/* Image Active Glow */
.tab-ear.active.ear-image {
  background: #fef08a; /* light yellow */
  border-color: #f59e0b;
  color: #b45309;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
}

/* Video Active Glow */
.tab-ear.active.ear-video {
  background: #f3e8ff; /* light purple */
  border-color: #a855f7;
  color: #7e22ce;
  box-shadow: 0 0 8px rgba(168, 85, 247, 0.4);
}

.tab-ear.disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: rgba(241, 245, 249, 0.8);
  border-color: #e2e8f0;
  color: #94a3b8;
}

/* --- Card Flip Morphing Animation --- */
.image-card-node {
  transform-style: preserve-3d;
  backface-visibility: hidden;
  transition: box-shadow 0.3s;
}

.image-card-node.is-morphing {
  animation: cardFlipMorph 0.45s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes cardFlipMorph {
  0% {
    transform: rotateY(0deg) scale(1);
  }
  40% {
    transform: rotateY(90deg) scale(0.92);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  }
  60% {
    transform: rotateY(90deg) scale(0.92);
  }
  100% {
    transform: rotateY(0deg) scale(1);
  }
}
</style>
