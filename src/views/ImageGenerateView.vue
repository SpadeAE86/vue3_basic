<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const API_BASE = 'http://127.0.0.1:8001'

interface GeneratedImage {
  model: string
  url: string | null
  loading: boolean
  error: string | null
}

interface TemplateInfo {
  name: string
  has_content: boolean
}

const models = [
  { value: 'Seedream 4.0', label: 'Seedream 4.0' },
  { value: 'Seedream 4.5', label: 'Seedream 4.5' },
  { value: 'Seedream 5.0', label: 'Seedream 5.0' },
]

const presetSizes = ['720x1280', '1024x1024', '1280x720', '1K', '2K', '3K', '4K']

const form = reactive({
  prompt: '星际穿越，黑洞，黑洞里冲出一辆快支离破碎的复古列车，抢视觉冲击力，电影大片，末日既视感，动感，对比色，oc渲染，光线追踪，动态模糊，景深，超现实主义，深蓝，画面通过细腻的丰富的色彩层次塑造主体与场景，质感真实，暗黑风背景的光影效果营造出氛围，整体兼具艺术幻想感，夸张的广角透视效果，耀光，反射，极致的光影，强引力，吞噬',
  size: '720x1280',
  model: 'Seedream 5.0',
})

const generatedImages = ref<GeneratedImage[]>([])
const generating = ref(false)

const templates = ref<TemplateInfo[]>([])
const selectedTemplate = ref<string>('')
const templateDialogVisible = ref(false)
const editingTemplate = reactive({
  name: '',
  content: '',
  isNew: false,
})
const beautifying = ref(false)

const localTemplates = new Map<string, string>()

onMounted(() => {
  loadTemplates()
})

async function loadTemplates() {
  try {
    const resp = await fetch(`${API_BASE}/prompt-templates`)
    if (resp.ok) {
      const data = await resp.json()
      templates.value = data
      if (templates.value.length > 0 && !selectedTemplate.value) {
        selectedTemplate.value = templates.value[0].name
      }
      for (const tpl of data) {
        localTemplates.set(tpl.name, '')
      }
    }
  } catch (e) {
    console.error('加载模板失败', e)
  }
}

async function getTemplateContent(name: string, useCache = true) {
  if (useCache && localTemplates.has(name) && localTemplates.get(name)) {
    return localTemplates.get(name)
  }
  try {
    const resp = await fetch(`${API_BASE}/prompt-templates/${encodeURIComponent(name)}`)
    if (resp.ok) {
      const data = await resp.json()
      localTemplates.set(name, data.content)
      return data.content
    }
  } catch (e) {
    console.error('获取模板内容失败', e)
  }
  return ''
}

function openNewTemplate() {
  editingTemplate.name = ''
  editingTemplate.content = ''
  editingTemplate.isNew = true
  templateDialogVisible.value = true
}

async function openEditTemplate() {
  if (!selectedTemplate.value) return
  const content = await getTemplateContent(selectedTemplate.value)
  editingTemplate.name = selectedTemplate.value
  editingTemplate.content = content
  editingTemplate.isNew = false
  templateDialogVisible.value = true
}

async function saveTemplate() {
  if (!editingTemplate.name.trim() || !editingTemplate.content.trim()) {
    ElMessage.warning('模板名称和内容不能为空')
    return
  }

  try {
    const resp = await fetch(`${API_BASE}/prompt-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editingTemplate.name,
        content: editingTemplate.content,
      }),
    })

    if (resp.ok) {
      ElMessage.success('模板保存成功')
      templateDialogVisible.value = false
      await loadTemplates()
      selectedTemplate.value = editingTemplate.name
      localTemplates.set(editingTemplate.name, editingTemplate.content)
    } else {
      ElMessage.error('模板保存失败')
    }
  } catch (e) {
    ElMessage.error('保存模板时出错')
  }
}

async function deleteTemplate() {
  if (!selectedTemplate.value) return

  try {
    await ElMessageBox.confirm('确定要删除这个模板吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })

    const resp = await fetch(`${API_BASE}/prompt-templates/${encodeURIComponent(selectedTemplate.value)}`, {
      method: 'DELETE',
    })

    if (resp.ok) {
      ElMessage.success('模板删除成功')
      localTemplates.delete(selectedTemplate.value)
      await loadTemplates()
      if (templates.value.length > 0) {
        selectedTemplate.value = templates.value[0].name
      } else {
        selectedTemplate.value = ''
      }
    } else {
      ElMessage.error('模板删除失败')
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除模板时出错')
    }
  }
}

async function beautifyPrompt() {
  if (!form.prompt.trim()) {
    ElMessage.warning('请输入提示词')
    return
  }

  if (!selectedTemplate.value) {
    ElMessage.warning('请选择一个系统提示词模板')
    return
  }

  beautifying.value = true

  try {
    const systemPrompt = await getTemplateContent(selectedTemplate.value)

    const resp = await fetch(`${API_BASE}/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: form.prompt,
        system_prompt: systemPrompt,
        model: 'Seed 2.0 Pro',
      }),
    })

    const data = await resp.json()

    if (data.success && data.text) {
      form.prompt = data.text
      ElMessage.success('提示词美化成功')
    } else {
      ElMessage.error(data.error || '美化失败')
    }
  } catch (e) {
    ElMessage.error('美化提示词时出错')
  } finally {
    beautifying.value = false
  }
}

async function generateImages() {
  if (!form.prompt.trim()) {
    return
  }

  generating.value = true
  
  generatedImages.value = [{
    model: form.model,
    url: null,
    loading: true,
    error: null,
  }]

  try {
    const resp = await fetch(`${API_BASE}/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: form.prompt,
        size: form.size,
        model: form.model,
      }),
    })

    const data = await resp.json()
    
    if (data.success) {
      generatedImages.value[0].url = data.image_url
    } else {
      generatedImages.value[0].error = data.error || '生成失败'
    }
  } catch (e: any) {
    generatedImages.value[0].error = e.message || '网络错误'
  } finally {
    generatedImages.value[0].loading = false
    generating.value = false
  }
}

function getModelLabel(model: string) {
  return models.find(m => m.value === model)?.label || model
}

function clearAll() {
  generatedImages.value = []
}
</script>

<template>
  <div class="image-generate-page">
    <div class="page-card">
      <div class="card-header">
        <span class="card-title">提示词对比 - 图片生成</span>
        <div class="header-spacer" />
        <el-button text size="small" @click="clearAll" :disabled="generatedImages.length === 0">
          <el-icon><i-ep-delete /></el-icon>
          清空
        </el-button>
      </div>

      <el-divider />

      <div class="form-section">
        <el-form :model="form" label-width="100px">
          <el-form-item label="提示词">
            <div class="prompt-input-wrapper">
              <el-input
                v-model="form.prompt"
                type="textarea"
                :rows="4"
                placeholder="请输入图片生成提示词..."
                class="prompt-textarea"
              />
              <div class="prompt-footer">
                <div class="template-actions">
                  <el-button text size="small" @click="openEditTemplate" :disabled="!selectedTemplate">
                    <el-icon><i-ep-edit /></el-icon>
                  </el-button>
                  <el-button text size="small" @click="openNewTemplate">
                    <el-icon><i-ep-plus /></el-icon>
                  </el-button>
                </div>
                <div class="template-select-wrapper">
                  <el-select
                    v-model="selectedTemplate"
                    placeholder="选择系统模板"
                    style="width: 180px; margin-right: 8px"
                  >
                    <el-option
                      v-for="tpl in templates"
                      :key="tpl.name"
                      :label="tpl.name"
                      :value="tpl.name"
                    />
                  </el-select>
                  <el-button
                    type="primary"
                    size="small"
                    @click="beautifyPrompt"
                    :loading="beautifying"
                    :disabled="!selectedTemplate"
                  >
                    <el-icon><i-ep-magic-stick /></el-icon>
                    美化
                  </el-button>
                </div>
              </div>
            </div>
          </el-form-item>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="分辨率">
                <el-select v-model="form.size" placeholder="选择尺寸" style="width: 100%">
                  <el-option
                    v-for="size in presetSizes"
                    :key="size"
                    :label="size"
                    :value="size"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="选择模型">
                <el-select v-model="form.model" placeholder="选择模型" style="width: 100%">
                  <el-option
                    v-for="model in models"
                    :key="model.value"
                    :label="model.label"
                    :value="model.value"
                  />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <el-form-item>
            <el-button
              type="primary"
              @click="generateImages"
              :loading="generating"
              :disabled="!form.prompt.trim()"
            >
              <el-icon><i-ep-magic-stick /></el-icon>
              生成图片
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <div v-if="generatedImages.length > 0" class="results-section">
        <el-divider />
        <div class="results-grid">
          <div
            v-for="(img, index) in generatedImages"
            :key="index"
            class="result-card"
          >
            <div class="result-header">
              <el-tag size="small" type="info">{{ getModelLabel(img.model) }}</el-tag>
            </div>
            
            <div class="result-content">
              <div v-if="img.loading" class="loading-wrapper">
                <el-icon class="is-loading" :size="40"><i-ep-loading /></el-icon>
                <span class="loading-text">正在生成...</span>
              </div>
              
              <div v-else-if="img.error" class="error-wrapper">
                <el-icon :size="40" color="#f56c6c"><i-ep-warning-filled /></el-icon>
                <span class="error-text">{{ img.error }}</span>
              </div>
              
              <div v-else-if="img.url" class="image-wrapper">
                <img :src="img.url" class="generated-image" alt="generated" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="templateDialogVisible"
      :title="editingTemplate.isNew ? '新建模板' : '编辑模板'"
      width="700px"
    >
      <el-form :model="editingTemplate" label-width="80px">
        <el-form-item label="模板名称">
          <el-input v-model="editingTemplate.name" placeholder="请输入模板名称" :disabled="!editingTemplate.isNew" />
        </el-form-item>
        <el-form-item label="模板内容">
          <el-input
            v-model="editingTemplate.content"
            type="textarea"
            :rows="15"
            placeholder="请输入系统提示词内容..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="templateDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTemplate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.image-generate-page {
  height: 100%;
  overflow-y: auto;
}

.page-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.header-spacer {
  flex: 1;
}

.form-section {
  padding: 8px 0;
}

.prompt-input-wrapper {
  width: 100%;
}

.prompt-textarea {
  width: 100%;
}

.prompt-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.template-actions {
  display: flex;
  gap: 4px;
}

.template-select-wrapper {
  display: flex;
  align-items: center;
}

.results-section {
  padding-top: 8px;
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.result-card {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
}

.result-header {
  padding: 12px 16px;
  background: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
}

.result-content {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
}

.loading-wrapper,
.error-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #909399;
}

.loading-text,
.error-text {
  font-size: 14px;
}

.error-text {
  color: #f56c6c;
}

.image-wrapper {
  width: 100%;
}

.generated-image {
  width: 100%;
  height: auto;
  display: block;
}
</style>
