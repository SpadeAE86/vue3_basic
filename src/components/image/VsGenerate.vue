<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { beautifyPromptApi } from '@/api/generate'
import PromptComposer from '@/components/image/PromptComposer.vue'
import type { MediaFile } from '@/components/image/MediaUploader.vue'
import ResultCard from '@/components/image/ResultCard.vue'
import type { GenerateMode } from '@/types/generate'

import {
  useGenerateForm,
  IMAGE_MODELS,
  VIDEO_MODELS,
  VIDEO_RESOLUTION_OPTIONS,
  VIDEO_DURATION_OPTIONS,
  IMAGE_MODEL_LEVEL_OPTIONS
} from '@/composables/image/useGenerateForm'
import { usePromptTemplates } from '@/composables/image/usePromptTemplates'
import { useGenerateHistory } from '@/composables/image/useGenerateHistory'

const props = defineProps<{
  currentMode: GenerateMode
}>()

const currentModeRef = computed(() => props.currentMode)

// 共享表单状态
const {
  form: sharedForm,
  availableRatios,
  computedSize
} = useGenerateForm(currentModeRef)

// 模板状态
const {
  templates,
  selectedTemplate,
  beautifying,
  openNewTemplate,
  openEditTemplate,
  deleteTemplateByName,
  downloadSelectedTemplate,
  getTemplateContent,
  beautifyPrompt
} = usePromptTemplates()

// 历史记录（用于保存 VS 生成的结果）
const {
  generateImages,
  generatedImages,
  deleteImage
} = useGenerateHistory(currentModeRef)

// VS 模式特有状态
const rawPrompt = ref('')
const compareVariable = ref<'template' | 'model'>('template')
const vsStage = ref<1 | 2>(1) // 1: 准备/美化阶段, 2: 准备生图阶段

// 公共变量
const sharedModel = computed({
  get: () => props.currentMode === 'image' ? sharedForm.imageModel : sharedForm.videoModel,
  set: (val) => {
    if (props.currentMode === 'image') sharedForm.imageModel = val
    else sharedForm.videoModel = val
  }
})

const currentModels = computed(() => props.currentMode === 'image' ? IMAGE_MODELS : VIDEO_MODELS)

// A 组变量
const templateA = ref('')
const modelA = ref('')
const beautifiedPromptA = ref('')
const resultA = computed(() => generatedImages.value.find(img => img.id === lastGeneratedIdA.value))
const lastGeneratedIdA = ref('')

// B 组变量
const templateB = ref('')
const modelB = ref('')
const beautifiedPromptB = ref('')
const resultB = computed(() => generatedImages.value.find(img => img.id === lastGeneratedIdB.value))
const lastGeneratedIdB = ref('')

const generating = ref(false)

// 监听模板列表加载
watch(() => templates.value, (newTemplates) => {
  if (newTemplates.length > 0) {
    if (!templateA.value) templateA.value = newTemplates[0].name
    if (!templateB.value) templateB.value = newTemplates[0].name
  }
}, { immediate: true })

// 监听模型列表加载
watch(() => currentModels.value, (models) => {
  if (models.length > 0) {
    if (!modelA.value || !models.find(m => m.value === modelA.value)) modelA.value = models[0].value
    if (!modelB.value || !models.find(m => m.value === modelB.value)) modelB.value = models[0].value
  }
}, { immediate: true })

// 计算交集逻辑
const activeModels = computed(() => {
  if (compareVariable.value === 'model') {
    return [modelA.value, modelB.value].filter(Boolean)
  } else {
    return [sharedModel.value].filter(Boolean)
  }
})

const computedAvailableLevels = computed(() => {
  if (activeModels.value.length === 0) return ['2K']
  let intersection = IMAGE_MODEL_LEVEL_OPTIONS[activeModels.value[0]] || []
  for (let i = 1; i < activeModels.value.length; i++) {
    const opts = IMAGE_MODEL_LEVEL_OPTIONS[activeModels.value[i]] || []
    intersection = intersection.filter(x => opts.includes(x))
  }
  return intersection.length > 0 ? intersection : ['2K']
})

const computedAvailableVideoResolutions = computed(() => {
  let opts = VIDEO_RESOLUTION_OPTIONS
  if (activeModels.value.some(m => m === 'Seedance 2.0' || m === 'Seedance 2.0 Fast')) {
    opts = opts.filter(o => o.value !== '1080p')
  }
  return opts
})

const computedDisableMediaUpload = computed(() => {
  if (props.currentMode !== 'video') return false
  return activeModels.value.some(m => m === 'Seedance 1.5 Pro')
})

// 自动纠正交集变化后的值
watch(computedAvailableLevels, (levels) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (props.currentMode === 'image' && !levels.includes(sharedForm.sizeLevel as any)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sharedForm.sizeLevel = levels[0] as any
  }
})

watch(computedAvailableVideoResolutions, (resolutions) => {
  if (props.currentMode === 'video' && !resolutions.find(r => r.value === sharedForm.videoResolution)) {
    sharedForm.videoResolution = resolutions[0].value
  }
})

watch(computedDisableMediaUpload, (disabled) => {
  if (disabled) {
    sharedForm.referenceMedia = []
  }
})

async function handleGenerateBoth() {
  if (!rawPrompt.value.trim()) {
    ElMessage.warning('请输入原始提示词')
    return
  }

  const templateForA = compareVariable.value === 'template' ? templateA.value : null
  const templateForB = compareVariable.value === 'template' ? templateB.value : null

  const modelForA = compareVariable.value === 'model' ? modelA.value : sharedModel.value
  const modelForB = compareVariable.value === 'model' ? modelB.value : sharedModel.value

  if (compareVariable.value === 'template' && (!templateForA || !templateForB)) {
    ElMessage.warning('请确保 A 组和 B 组的模板都已选择')
    return
  }

  if (!modelForA || !modelForB) {
    ElMessage.warning('请确保 A 组和 B 组的模型都已选择')
    return
  }

  generating.value = true

  try {
    // 1. 提示词美化阶段
    let finalPromptA = rawPrompt.value
    let finalPromptB = rawPrompt.value

    if (compareVariable.value === 'template') {
      const sysA = await getTemplateContent(templateForA!)
      const sysB = await getTemplateContent(templateForB!)
      
      const [resA, resB] = await Promise.all([
        beautifyPromptApi(rawPrompt.value, sysA, props.currentMode === 'video' ? sharedForm.videoDuration : undefined),
        beautifyPromptApi(rawPrompt.value, sysB, props.currentMode === 'video' ? sharedForm.videoDuration : undefined)
      ])

      if (resA.success && resA.text) {
        try {
          const parsed = JSON.parse(resA.text)
          finalPromptA = parsed.prompt || resA.text
        } catch {
          finalPromptA = resA.text
        }
      } else {
        throw new Error(resA.error || 'A组美化失败')
      }
      beautifiedPromptA.value = finalPromptA

      if (resB.success && resB.text) {
        try {
          const parsed = JSON.parse(resB.text)
          finalPromptB = parsed.prompt || resB.text
        } catch {
          finalPromptB = resB.text
        }
      } else {
        throw new Error(resB.error || 'B组美化失败')
      }
      beautifiedPromptB.value = finalPromptB

      vsStage.value = 2
      return // 结束第一阶段
    }

    // 2. 提交生成任务 (模型对比模式直接走到这里)
    const formA = { ...sharedForm, prompt: finalPromptA }
    if (props.currentMode === 'image') formA.imageModel = modelForA
    else formA.videoModel = modelForA

    const formB = { ...sharedForm, prompt: finalPromptB }
    if (props.currentMode === 'image') formB.imageModel = modelForB
    else formB.videoModel = modelForB

    // 并发生图
    const initialLength = generatedImages.value.length
    
    await Promise.all([
      generateImages(formA, computedSize.value).then(() => {
        // 找到最新生成的属于 A 的图片
        const newA = generatedImages.value.find(img => img.prompt === formA.prompt && img.model === (props.currentMode === 'image' ? formA.imageModel : formA.videoModel))
        if (newA) lastGeneratedIdA.value = newA.id
      }),
      generateImages(formB, computedSize.value).then(() => {
        // 找到最新生成的属于 B 的图片
        const newB = generatedImages.value.find(img => img.prompt === formB.prompt && img.model === (props.currentMode === 'image' ? formB.imageModel : formB.videoModel))
        if (newB) lastGeneratedIdB.value = newB.id
      })
    ])

    // 兜底逻辑：如果上面的精确查找失败（比如 prompt 和 model 完全一样），按顺序取最新的两个
    if (generatedImages.value.length >= initialLength + 2) {
      if (!lastGeneratedIdA.value || !lastGeneratedIdB.value) {
        lastGeneratedIdA.value = generatedImages.value[1].id
        lastGeneratedIdB.value = generatedImages.value[0].id
      }
    }

  } catch (e) {
    console.error('VS Generate Error:', e)
    ElMessage.error('生成过程中发生错误')
  } finally {
    generating.value = false
  }
}

async function handleGenerateImagesStage2() {
  generating.value = true
  try {
    const modelForA = sharedModel.value
    const modelForB = sharedModel.value

    const formA = { ...sharedForm, prompt: beautifiedPromptA.value }
    if (props.currentMode === 'image') formA.imageModel = modelForA
    else formA.videoModel = modelForA

    const formB = { ...sharedForm, prompt: beautifiedPromptB.value }
    if (props.currentMode === 'image') formB.imageModel = modelForB
    else formB.videoModel = modelForB

    // 并发生图
    const initialLength = generatedImages.value.length
    
    await Promise.all([
      generateImages(formA, computedSize.value).then(() => {
        // 找到最新生成的属于 A 的图片
        const newA = generatedImages.value.find(img => img.prompt === formA.prompt && img.model === (props.currentMode === 'image' ? formA.imageModel : formA.videoModel))
        if (newA) lastGeneratedIdA.value = newA.id
      }),
      generateImages(formB, computedSize.value).then(() => {
        // 找到最新生成的属于 B 的图片
        const newB = generatedImages.value.find(img => img.prompt === formB.prompt && img.model === (props.currentMode === 'image' ? formB.imageModel : formB.videoModel))
        if (newB) lastGeneratedIdB.value = newB.id
      })
    ])

    // 兜底逻辑：如果上面的精确查找失败（比如 prompt 和 model 完全一样），按顺序取最新的两个
    if (generatedImages.value.length >= initialLength + 2) {
      if (!lastGeneratedIdA.value || !lastGeneratedIdB.value) {
        lastGeneratedIdA.value = generatedImages.value[1].id
        lastGeneratedIdB.value = generatedImages.value[0].id
      }
    }
  } catch (e) {
    console.error('VS Generate Stage 2 Error:', e)
    ElMessage.error('生成过程中发生错误')
  } finally {
    generating.value = false
  }
}

// 监听模式切换，重置阶段
watch(compareVariable, () => {
  vsStage.value = 1
  beautifiedPromptA.value = ''
  beautifiedPromptB.value = ''
})

function handleBeautifyRawPrompt() {
  beautifyPrompt(rawPrompt.value, (newPrompt: string) => {
    rawPrompt.value = newPrompt
  })
}
</script>

<template>
  <div class="vs-generate-container">
    <!-- 顶部：公共变量设置 -->
    <div class="shared-controls">
      <el-form label-width="80px" label-position="right">
        <el-form-item label="原始提示词">
          <PromptComposer
            :prompt="rawPrompt"
            @update:prompt="(v: string) => (rawPrompt = v)"
            :templates="templates"
            :selected-template="selectedTemplate"
            @update:selected-template="(v: string) => (selectedTemplate = v)"
            :reference-media="sharedForm.referenceMedia"
            @update:reference-media="(v: MediaFile[]) => (sharedForm.referenceMedia = v)"
            :beautifying="beautifying"
            :accept-types="currentMode === 'image' ? ['image'] : ['image', 'video', 'audio']"
            :disable-media="computedDisableMediaUpload"
            @create-template="openNewTemplate"
            @edit-template="openEditTemplate"
            @download-template="downloadSelectedTemplate"
            @delete-template="deleteTemplateByName"
            @beautify="handleBeautifyRawPrompt"
          />
        </el-form-item>

        <!-- 其他公共参数 -->
        <el-row :gutter="16">
          <template v-if="currentMode === 'image'">
            <el-col :span="12">
              <el-form-item label="分辨率">
                <el-select v-model="sharedForm.sizeLevel">
                  <el-option v-for="lvl in computedAvailableLevels" :key="lvl" :label="lvl" :value="lvl" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="尺幅">
                <el-select v-model="sharedForm.ratio">
                  <el-option v-for="r in availableRatios" :key="r.value" :label="r.label" :value="r.value" />
                </el-select>
              </el-form-item>
            </el-col>
          </template>
          <template v-else>
            <el-col :span="12">
              <el-form-item label="分辨率">
                <el-select v-model="sharedForm.videoResolution">
                  <el-option v-for="res in computedAvailableVideoResolutions" :key="res.value" :label="res.label" :value="res.value" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="尺幅">
                <el-select v-model="sharedForm.ratio">
                  <el-option v-for="r in availableRatios" :key="r.value" :label="r.label" :value="r.value" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="视频时长">
                <el-select v-model="sharedForm.videoDuration">
                  <el-option v-for="dur in VIDEO_DURATION_OPTIONS" :key="dur.value" :label="dur.label" :value="dur.value" />
                </el-select>
              </el-form-item>
            </el-col>
          </template>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <div class="custom-form-item">
              <div class="custom-label">
                <div
                  class="clickable-label"
                  :class="{ active: compareVariable === 'template' }"
                  @click="compareVariable = 'template'"
                >
                  提示词模板
                </div>
              </div>
              <div class="custom-content">
                <div v-if="compareVariable !== 'template'" style="color: #94a3b8; font-size: 13px; line-height: 32px; white-space: nowrap;">
                  (对比模型时不自动美化提示词)
                </div>
              </div>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="custom-form-item">
              <div class="custom-label">
                <div
                  class="clickable-label"
                  :class="{ active: compareVariable === 'model' }"
                  @click="compareVariable = 'model'"
                >
                  生成模型
                </div>
              </div>
              <div class="custom-content">
                <el-select v-if="compareVariable !== 'model'" v-model="sharedModel" style="width: 100%">
                  <el-option v-for="m in currentModels" :key="m.value" :label="m.label" :value="m.value" />
                </el-select>
              </div>
            </div>
          </el-col>
        </el-row>
      </el-form>
    </div>

    <el-divider border-style="dashed" />

    <!-- 底部：A/B 列对比 -->
    <div class="vs-columns">
      <!-- A 组 -->
      <div class="vs-column">
        <div class="column-header a-header">A 组</div>
        <div class="column-config">
          <el-select v-if="compareVariable === 'template'" v-model="templateA" placeholder="选择模板 A" style="width: 100%">
            <el-option v-for="t in templates" :key="t.name" :label="t.name" :value="t.name" />
          </el-select>
          <el-select v-else v-model="modelA" placeholder="选择模型 A" style="width: 100%">
            <el-option v-for="m in currentModels" :key="m.value" :label="m.label" :value="m.value" />
          </el-select>
        </div>
        <div class="prompt-diff-box" v-if="beautifiedPromptA">
          <div class="diff-title">美化后提示词 A：</div>
          <div class="diff-content">{{ beautifiedPromptA }}</div>
        </div>
        <div class="result-box">
          <ResultCard v-if="resultA" :item="resultA" :model-label="resultA.model" @delete="deleteImage" />
          <div v-else class="empty-result">等待生成...</div>
        </div>
      </div>

      <!-- B 组 -->
      <div class="vs-column">
        <div class="column-header b-header">B 组</div>
        <div class="column-config">
          <el-select v-if="compareVariable === 'template'" v-model="templateB" placeholder="选择模板 B" style="width: 100%">
            <el-option v-for="t in templates" :key="t.name" :label="t.name" :value="t.name" />
          </el-select>
          <el-select v-else v-model="modelB" placeholder="选择模型 B" style="width: 100%">
            <el-option v-for="m in currentModels" :key="m.value" :label="m.label" :value="m.value" />
          </el-select>
        </div>
        <div class="prompt-diff-box" v-if="beautifiedPromptB">
          <div class="diff-title">美化后提示词 B：</div>
          <div class="diff-content">{{ beautifiedPromptB }}</div>
        </div>
        <div class="result-box">
          <ResultCard v-if="resultB" :item="resultB" :model-label="resultB.model" @delete="deleteImage" />
          <div v-else class="empty-result">等待生成...</div>
        </div>
      </div>
    </div>

    <!-- 全局生成按钮 -->
    <div class="vs-action-bar">
      <template v-if="compareVariable === 'template'">
        <template v-if="vsStage === 1">
          <el-button type="primary" size="large" @click="handleGenerateBoth" :loading="generating" class="generate-btn">
            <el-icon v-if="!generating"><i-ep-magic-stick /></el-icon>
            VS 一键对决 (美化提示词)
          </el-button>
        </template>
        <template v-else>
          <el-button type="primary" size="large" @click="handleGenerateImagesStage2" :loading="generating" class="generate-btn">
            <el-icon v-if="!generating"><i-ep-video-play /></el-icon>
            继续生图
          </el-button>
          <el-button size="large" @click="handleGenerateBoth" :loading="generating" class="refresh-btn" title="重新美化提示词">
            <el-icon v-if="!generating"><i-ep-refresh /></el-icon>
          </el-button>
        </template>
      </template>
      <template v-else>
        <el-button type="primary" size="large" @click="handleGenerateBoth" :loading="generating" class="generate-btn">
          <el-icon v-if="!generating"><i-ep-magic-stick /></el-icon>
          VS 一键对决 (直接生图)
        </el-button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.vs-generate-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.shared-controls {
  background: #f8fafc;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.shared-controls :deep(.el-form-item__label) {
  padding: 0 !important; /* 移除所有内边距 */
  margin-right: 12px;
}



.clickable-label {
  display: inline-block;
  padding: 0 12px;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s;
  color: #606266;
  line-height: 28px;
  font-weight: normal;
  user-select: none;
  border: 1px solid transparent;
  white-space: nowrap;
}

.custom-content {
  flex: 1; /* 自动填满剩余空间 */
}

.custom-form-item {
  display: flex;
  align-items: center;
  gap: 8px; /* label 和 select 之间间距 */
}

.clickable-label:hover:not(.active) {
  background-color: #f0f2f5;
}

.clickable-label.active {
  background-color: #f56c6c;
  color: white;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(245, 108, 108, 0.3);
}

.vs-columns {
  display: flex;
  gap: 24px;
  margin-top: 8px;
}

.vs-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.column-header {
  font-size: 18px;
  font-weight: bold;
  text-align: center;
  padding-bottom: 12px;
  border-bottom: 2px solid #e2e8f0;
}

.a-header {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

.b-header {
  color: #f59e0b;
  border-bottom-color: #f59e0b;
}

.prompt-diff-box {
  background: #f1f5f9;
  padding: 12px;
  border-radius: 6px;
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
}

.diff-title {
  font-weight: 600;
  margin-bottom: 6px;
  color: #475569;
}

.result-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 300px;
}

.empty-result {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  background: #f8fafc;
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
}

.vs-action-bar {
  margin-top: 24px;
  display: flex;
  justify-content: center;
  gap: 16px;
  align-items: center;
}

.generate-btn {
  width: 300px;
  font-size: 16px;
  font-weight: bold;
  border-radius: 24px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border: none;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  transition: transform 0.2s, box-shadow 0.2s;
}

.generate-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
}

.refresh-btn {
  border-radius: 50%;
  width: 48px;
  height: 48px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.refresh-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
}
</style>
