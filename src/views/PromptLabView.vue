<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import PromptComposer from '@/components/image/PromptComposer.vue'
import ResultGrid from '@/components/image/ResultGrid.vue'
import TemplateEditDialog from '@/components/image/TemplateEditDialog.vue'
import VsGenerate from '@/components/image/VsGenerate.vue'
import type { MediaFile } from '@/components/image/MediaUploader.vue'
import type { GenerateMode } from '@/types/generate'

import { useGenerateForm, IMAGE_MODELS, VIDEO_MODELS } from '@/composables/image/useGenerateForm'
import { usePromptTemplates } from '@/composables/image/usePromptTemplates'
import { useGenerateHistory } from '@/composables/image/useGenerateHistory'

const currentMode = ref<GenerateMode>('image')
const isVsMode = ref(false)
const isUploadingImage = ref(false)

const {
  form,
  availableLevels,
  availableVideoResolutions,
  availableRatios,
  disableMediaUpload,
  computedSize
} = useGenerateForm(currentMode)

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
  beautifyPrompt
} = usePromptTemplates()

const {
  generatedImages,
  generating,
  loadHistory,
  generateImages,
  clearAll,
  deleteImage,
  clearPolling
} = useGenerateHistory(currentMode)

onMounted(async () => {
  loadTemplates()
  await loadHistory()
})

watch(currentMode, async () => {
  generatedImages.value = []
  clearPolling()
  await loadHistory()
})

const TEMPLATE_ACTION_COLOR = '#6366f1'

function handleBeautify() {
  beautifyPrompt(form.prompt, (newPrompt) => {
    form.prompt = newPrompt
  }, {
    videoDuration: currentMode.value === 'video' ? form.videoDuration : undefined
  })
}

function handleTemplateRefresh() {
  // Force refresh when the dropdown opens
  loadTemplates(true)
}

function handleGenerate() {
  generateImages(form, computedSize.value)
}
</script>

<template>
  <div class="image-generate-page">
    <div class="page-card">
      <div class="card-header">
        <span class="card-title">提示词对比 - 媒体生成</span>
        <el-tag
          :type="isVsMode ? 'danger' : 'success'"
          effect="dark"
          size="small"
          round
          class="mode-tag"
          style="margin-left: 12px;"
          @click="isVsMode = !isVsMode"
        >
          {{ isVsMode ? '⚖️ VS 对比模式' : '🧪 单体实验室' }}
        </el-tag>
        <div class="header-spacer" />
        <div class="mode-switch-capsule">
          <div 
            class="mode-btn" 
            :class="{ active: currentMode === 'image' }"
            @click="currentMode = 'image'"
          >
            <el-icon><i-ep-picture /></el-icon>
            图片生成
          </div>
          <div 
            class="mode-btn" 
            :class="{ active: currentMode === 'video' }"
            @click="currentMode = 'video'"
          >
            <el-icon><i-ep-video-camera /></el-icon>
            视频生成
          </div>
        </div>
        <el-button text size="small" @click="clearAll" :disabled="generatedImages.length === 0" style="margin-left: 16px;">
          <el-icon><i-ep-delete /></el-icon>
          清空
        </el-button>
      </div>

      <el-divider />

      <template v-if="!isVsMode">
        <div class="form-section">
          <el-form :model="form" label-width="100px">
            <el-form-item label="提示词">
            <PromptComposer
              :prompt="form.prompt"
              @update:prompt="(v: string) => (form.prompt = v)"
              :templates="templates"
              :selected-template="selectedTemplate"
              @update:selected-template="(v: string) => (selectedTemplate = v)"
              :reference-media="form.referenceMedia"
              @update:reference-media="(v: MediaFile[]) => (form.referenceMedia = v)"
              @update:is-uploading="(v: boolean) => (isUploadingImage = v)"
              :beautifying="beautifying"
              :action-color="TEMPLATE_ACTION_COLOR"
              :accept-types="currentMode === 'image' ? ['image'] : ['image', 'video', 'audio']"
              :disable-media="disableMediaUpload"
              @create-template="openNewTemplate"
              @edit-template="openEditTemplate"
              @download-template="downloadSelectedTemplate"
              @delete-template="deleteTemplateByName"
              @refresh-templates="handleTemplateRefresh"
              @beautify="handleBeautify"
            />
          </el-form-item>

          <!-- Image Specific Settings -->
          <template v-if="currentMode === 'image'">
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="分辨率">
                  <el-select v-model="form.sizeLevel" placeholder="选择等级" style="width: 100%">
                    <el-option
                      v-for="lvl in availableLevels"
                      :key="lvl"
                      :label="lvl"
                      :value="lvl"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="尺幅">
                  <el-select v-model="form.ratio" placeholder="选择比例" style="width: 100%">
                    <el-option
                      v-for="r in availableRatios"
                      :key="r.value"
                      :label="r.label"
                      :value="r.value"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="选择模型">
                  <el-select v-model="form.imageModel" placeholder="选择模型" style="width: 100%">
                    <el-option
                      v-for="model in IMAGE_MODELS"
                      :key="model.value"
                      :label="model.label"
                      :value="model.value"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="实际尺寸">
                  <el-input :model-value="computedSize" readonly />
                </el-form-item>
              </el-col>
            </el-row>
          </template>

          <!-- Video Specific Settings -->
          <template v-if="currentMode === 'video'">
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="分辨率">
                  <el-select v-model="form.videoResolution" placeholder="选择分辨率" style="width: 100%">
                    <el-option
                      v-for="res in availableVideoResolutions"
                      :key="res.value"
                      :label="res.label"
                      :value="res.value"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="尺幅">
                  <el-select v-model="form.ratio" placeholder="选择比例" style="width: 100%">
                    <el-option
                      v-for="r in availableRatios"
                      :key="r.value"
                      :label="r.label"
                      :value="r.value"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="选择模型">
                  <el-select v-model="form.videoModel" placeholder="选择模型" style="width: 100%">
                    <el-option
                      v-for="model in VIDEO_MODELS"
                      :key="model.value"
                      :label="model.label"
                      :value="model.value"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="视频时长">
                  <el-select v-model="form.videoDuration" placeholder="选择时长" style="width: 100%">
                    <el-option
                      v-for="dur in [5, 8, 11, 15]"
                      :key="dur"
                      :label="dur + '秒'"
                      :value="dur"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
          </template>

            <el-form-item>
              <el-button
                type="primary"
                @click="handleGenerate"
                :loading="generating"
                :disabled="!form.prompt.trim() || isUploadingImage"
              >
                <el-icon v-if="!generating"><i-ep-magic-stick /></el-icon>
                {{ isUploadingImage ? '正在上传参考素材...' : (currentMode === 'image' ? '生成图片' : '生成视频') }}
              </el-button>
            </el-form-item>
          </el-form>
        </div>

        <div v-if="generatedImages.length > 0" class="results-section">
          <el-divider />
          <ResultGrid :items="generatedImages" @delete="deleteImage" />
        </div>
      </template>

      <template v-else>
        <VsGenerate :current-mode="currentMode" />
      </template>
    </div>

    <TemplateEditDialog
      v-model="templateDialogVisible"
      :loading="templateDialogLoading"
      :is-new="editingTemplate.isNew"
      v-model:name="editingTemplate.name"
      v-model:content="editingTemplate.content"
      @save="saveTemplate"
    />
  </div>
</template>

<style scoped>
.image-generate-page {
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
}

.page-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 24px;
}

.card-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.header-spacer {
  flex: 1;
}

/* Capsule Switch Styles */
.mode-switch-capsule {
  display: flex;
  background-color: #f1f5f9;
  border-radius: 20px;
  padding: 4px;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.mode-btn:hover:not(.active) {
  color: #334155;
  background-color: rgba(255, 255, 255, 0.5);
}

.mode-btn.active {
  background-color: #fff;
  color: #6366f1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1);
}

.mode-btn .el-icon {
  font-size: 16px;
}

.form-section {
  margin-top: 24px;
  max-width: 900px;
}

.results-section {
  margin-top: 24px;
}
</style>
