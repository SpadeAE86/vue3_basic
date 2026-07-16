<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import PromptComposer from '../image/PromptComposer.vue'
import TemplateEditDialog from '../image/TemplateEditDialog.vue'
import PromptPreviewDialog from '../image/PromptPreviewDialog.vue'
import type { MediaFile } from '../image/MediaUploader.vue'
import { generateImageApi } from '@/api/generate'
import { usePromptTemplates } from '@/composables/image/usePromptTemplates'
import { computeSizePx } from '@/composables/image/useGenerateForm'

const props = withDefaults(defineProps<{
  modelValue: boolean
  roleId: string
  roleName: string
  roleDescription: string
  isInspiration?: boolean
}>(), {
  isInspiration: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'task-submitted', task: { taskId: string; prompt: string }): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const currentMode = ref<'image'>('image')

// Form is pre-configured with locked resolution 2K and ratio 3:4
const form = reactive({
  prompt: '',
  imageModel: 'Seedream 5.0',
  sizeLevel: '2K',
  ratio: '3:4',
  referenceMedia: [] as MediaFile[]
})

const IMAGE_MODELS = [
  { value: 'Seedream 5.0', label: 'Seedream 5.0' },
  { value: 'Seedream 4.5', label: 'Seedream 4.5' },
  { value: 'Seedream 4.0', label: 'Seedream 4.0' },
  { value: 'gpt-image-2', label: 'GPT-Image-2' },
]

const {
  templates,
  selectedTemplate,
  templateDialogVisible,
  templateDialogLoading,
  editingTemplate,
  beautifying,
  loadTemplates,
  openNewTemplate,
  openEditTemplate,
  saveTemplate,
  deleteTemplateByName,
  downloadSelectedTemplate,
  beautifyPrompt,
  getTemplateContent
} = usePromptTemplates()

// PromptComposer internal view bindings
const isTemplateMode = ref(false)
const hasSlots = ref(false)
const renderedPrompt = ref('')
const isUploadingImage = ref(false)

const previewVisible = ref(false)
const previewContent = ref('')
const previewTitle = ref('')

function openFullPromptPreview() {
  previewContent.value = renderedPrompt.value
  previewTitle.value = '完整提示词预览'
  previewVisible.value = true
}

async function handleTemplateSelected(name: string) {
  selectedTemplate.value = name
  if (name) {
    const content = await getTemplateContent(name)
    if (content) {
      const SLOT_REGEX = /\{([^:]+):\s*([^}]+)\}/g
      if (SLOT_REGEX.test(content)) {
        form.prompt = content
      }
    }
  }
}

function handleBeautify() {
  const cleanPrompt = form.prompt
    .replace(/\{([^:]+):\s*([^}]+)\}/g, (_match, _key, val) => val.trim())
    .replace(/\s*--split--\s*/g, '\n\n')
  beautifyPrompt(cleanPrompt, (newPrompt) => {
    form.prompt = newPrompt
  }, {
    referenceImageList: form.referenceMedia?.filter((m: MediaFile) => m.type === 'image' && m.url).map((m: MediaFile) => m.url)
  })
}

function handleTemplateRefresh() {
  loadTemplates(true)
}

onMounted(() => {
  loadTemplates()
})

// Auto-fill prompt when opened
watch(() => props.modelValue, (isOpen) => {
  if (isOpen && !form.prompt) {
    if (props.isInspiration) {
      form.prompt = props.roleDescription ? props.roleDescription.trim() : ''
    } else {
      const desc = props.roleDescription ? props.roleDescription.trim() : ''
      const descSummary = desc.length > 80 ? desc.slice(0, 80) + '...' : desc
      form.prompt = `一幅精致的二次元动漫角色立绘，主体是角色 ${props.roleName}，${descSummary}`
    }
  }
})

const submitting = ref(false)

async function handleSubmit() {
  // Use renderedPrompt for actual generation (stripping slots)
  const actualPrompt = renderedPrompt.value.trim()
  if (!actualPrompt) {
    ElMessage.warning('请输入提示词')
    return
  }
  submitting.value = true
  
  // Resolve actual resolution using pre-calculated bounds based on selected ratio
  const size = computeSizePx(form.imageModel, form.sizeLevel as any, form.ratio as any)
  
  try {
    const res = await generateImageApi({
      prompt: actualPrompt,
      size,
      model: form.imageModel,
      ratio: form.ratio,
      resolution: form.sizeLevel,
      type: form.referenceMedia.length > 0 ? 'i2i' : 't2i',
      reference_image_list: form.referenceMedia.length > 0
        ? form.referenceMedia.filter(m => m.type === 'image').map(m => m.url)
        : undefined
    })
    if (res.success && res.task_id) {
      ElMessage.success('生图任务已提交至后台')
      emit('task-submitted', {
        taskId: res.task_id,
        prompt: actualPrompt
      })
      visible.value = false
    } else {
      ElMessage.error(res.error || '提交任务失败')
    }
  } catch (err) {
    ElMessage.error('生图请求发生异常')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="🪄 AI 灵感生图"
    width="800px"
    class="ai-generate-dialog"
    append-to-body
    destroy-on-close
  >
    <div class="dialog-content">
      <div class="composer-container">
        <!-- 头部插槽提示与操作 -->
        <div class="composer-header">
          <div class="prompt-header-left">
            <span class="section-title">提示词</span>
            <el-popover placement="right" :width="400" trigger="hover" popper-class="preview-popover" :teleported="true">
              <template #reference>
                <button 
                  class="preview-search-button-raw" 
                  title="点击查看完整提示词"
                  @click="openFullPromptPreview"
                >
                  <el-icon class="preview-search-icon"><i-ep-search /></el-icon>
                </button>
              </template>
              <div class="final-prompt-preview">
                <div class="preview-title">当前渲染提示词（发送给模型）</div>
                <div class="preview-content scrollable-preview">{{ renderedPrompt }}</div>
              </div>
            </el-popover>
          </div>
          <div 
            class="view-switch-link-simple" 
            @click="isTemplateMode = !isTemplateMode"
            :title="isTemplateMode ? '切换到文本编辑模式' : '切换到胶囊参数模式'"
          >
            <el-icon>
              <i-ep-edit v-if="isTemplateMode" />
              <i-ep-menu v-else />
            </el-icon>
            <span>{{ isTemplateMode ? '查看文本' : '查看插槽' }}</span>
          </div>
        </div>

        <PromptComposer
          :prompt="form.prompt"
          @update:prompt="(v: string) => (form.prompt = v)"
          v-model:is-template-mode="isTemplateMode"
          @update:has-slots="(v: boolean) => hasSlots = v"
          @update:rendered-prompt="(v: string) => renderedPrompt = v"
          :templates="templates"
          :selected-template="selectedTemplate"
          @update:selected-template="handleTemplateSelected"
          :reference-media="form.referenceMedia"
          @update:reference-media="(v: MediaFile[]) => (form.referenceMedia = v)"
          @update:is-uploading="(v: boolean) => (isUploadingImage = v)"
          :beautifying="beautifying"
          action-color="#6366f1"
          :accept-types="['image']"
          :disable-media="false"
          @create-template="openNewTemplate"
          @edit-template="openEditTemplate"
          @download-template="downloadSelectedTemplate"
          @delete-template="deleteTemplateByName"
          @refresh-templates="handleTemplateRefresh"
          @beautify="handleBeautify"
        />
      </div>

      <!-- 生图配置行 -->
      <div class="settings-row">
        <div class="setting-item">
          <span class="setting-label">选择模型</span>
          <el-select v-model="form.imageModel" size="default" style="width: 200px">
            <el-option
              v-for="model in IMAGE_MODELS"
              :key="model.value"
              :label="model.label"
              :value="model.value"
            />
          </el-select>
        </div>
        <div class="setting-item">
          <span class="setting-label">画幅比例</span>
          <el-select v-model="form.ratio" size="default" style="width: 140px">
            <el-option value="3:4" label="3:4 (人像)" />
            <el-option value="4:3" label="4:3 (风景)" />
            <el-option value="1:1" label="1:1 (头像)" />
            <el-option value="16:9" label="16:9 (宽屏)" />
            <el-option value="9:16" label="9:16 (竖屏)" />
          </el-select>
        </div>
      </div>
    </div>
    
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button 
          type="primary" 
          :loading="submitting || isUploadingImage" 
          :disabled="!form.prompt.trim() || isUploadingImage"
          @click="handleSubmit"
        >
          <el-icon style="margin-right: 4px"><i-ep-magic-stick /></el-icon>
          {{ isUploadingImage ? '正在上传参考图...' : '开始生图' }}
        </el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 支撑 Dialogs 确保在 Modal 上方正常运行 -->
  <TemplateEditDialog
    v-model="templateDialogVisible"
    :loading="templateDialogLoading"
    :is-new="editingTemplate.isNew"
    v-model:name="editingTemplate.name"
    v-model:content="editingTemplate.content"
    @save="saveTemplate"
  />

  <PromptPreviewDialog
    v-model="previewVisible"
    :title="previewTitle"
    :content="previewContent"
  />
</template>

<style scoped>
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.composer-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.composer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.prompt-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.preview-search-button-raw {
  background: transparent;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  padding: 2px;
  outline: none;
}

.preview-search-icon {
  font-size: 14px;
  color: #94a3b8;
  transition: color 0.2s;
}
.preview-search-button-raw:hover .preview-search-icon {
  color: #6366f1;
}

.view-switch-link-simple {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #6366f1;
  cursor: pointer;
  user-select: none;
  font-weight: 500;
}
.view-switch-link-simple:hover {
  color: #4f46e5;
}

.settings-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1.5px solid #f1f5f9;
  align-items: center;
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.locked-tag {
  background: #e2e8f0;
  color: #475569;
  border-color: #cbd5e1;
  font-weight: 500;
}

.size-text {
  font-size: 13px;
  font-weight: 700;
  color: #6366f1;
  font-family: monospace;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 覆盖 PromptComposer 自带的内边距，使其在小窗中更自然 */
.composer-container :deep(.prompt-composer-card) {
  border: 1.5px solid #cbd5e1;
  box-shadow: none;
}
</style>
