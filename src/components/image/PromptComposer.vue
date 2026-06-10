<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PromptTemplateSelect from './PromptTemplateSelect.vue'
import MediaUploader, { type MediaFile } from './MediaUploader.vue'
import PromptSlotDialog from './PromptSlotDialog.vue'
import { usePromptTemplates } from '@/composables/image/usePromptTemplates'
import { saveTemplateApi } from '@/api/generate'
import { useCollectionsStore } from '@/stores/collections'

interface TemplateInfo {
  name: string
  has_content: boolean
}

const props = defineProps<{
  prompt: string
  templates: TemplateInfo[]
  selectedTemplate: string
  beautifying?: boolean
  actionColor?: string
  referenceMedia?: MediaFile[]
  acceptTypes?: ('image' | 'video' | 'audio')[]
  disableMedia?: boolean
  isTemplateMode?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:prompt', v: string): void
  (e: 'update:selectedTemplate', v: string): void
  (e: 'update:referenceMedia', v: MediaFile[]): void
  (e: 'update:isUploading', v: boolean): void
  (e: 'createTemplate'): void
  (e: 'editTemplate'): void
  (e: 'downloadTemplate'): void
  (e: 'deleteTemplate', name: string): void
  (e: 'refreshTemplates'): void
  (e: 'beautify'): void
  (e: 'update:isTemplateMode', v: boolean): void
  (e: 'update:hasSlots', v: boolean): void
  (e: 'update:renderedPrompt', v: string): void
}>()

const SLOT_REGEX = /\{([^:]+):\s*([^}]+)\}/g

interface SectionSlot {
  key: string
  value: string
  raw: string
}

interface PromptSection {
  rawText: string
  slots: SectionSlot[]
}

// 视图模式开关
const isTemplateMode = ref(props.isTemplateMode ?? false)

watch(() => props.isTemplateMode, (val) => {
  if (val !== undefined) {
    isTemplateMode.value = val
  }
})

watch(isTemplateMode, (val) => {
  emit('update:isTemplateMode', val)
})

// 记录最后选中或保存的插槽模板名称
const selectedSlotTemplate = ref('')

// 列表种类：'beautify' (AI美化预设) 或 'slots' (我的插槽模板)
const activeTab = ref<'beautify' | 'slots'>('beautify')

// 获取全局共享的缓存
const { localTemplates, getTemplateContent } = usePromptTemplates()
const collectionsStore = useCollectionsStore()

const isPromptFavorited = computed(() => {
  if (!props.prompt.trim()) return false
  const isTemplate = !!props.prompt.match(SLOT_REGEX)
  return collectionsStore.isFavorited(isTemplate ? 'template' : 'prompt', props.prompt)
})

async function toggleFavoritePrompt() {
  if (!props.prompt.trim()) {
    ElMessage.warning('提示词内容不能为空，请先在输入框中输入提示词')
    return
  }

  const isTemplate = !!props.prompt.match(SLOT_REGEX)
  const itemType = isTemplate ? 'template' : 'prompt'

  if (isPromptFavorited.value) {
    const payload = isTemplate ? { template_text: props.prompt } : { prompt: props.prompt }
    await collectionsStore.toggleFavorite(itemType, '', undefined, payload)
    return
  }

  try {
    const defaultName = isTemplate ? '我的插槽模板' : '我的提示词'
    const { value: title } = await ElMessageBox.prompt(
      isTemplate ? '请输入收藏的插槽模板名称：' : '请输入收藏的提示词名称：',
      '收藏提示词',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '名称不能为空',
        inputValue: defaultName
      }
    )

    if (title) {
      const name = title.trim()
      const payload = isTemplate ? { name: name, template_text: props.prompt } : { prompt: props.prompt }
      const success = await collectionsStore.toggleFavorite(itemType, name, undefined, payload)
      if (success && isTemplate) {
        // Automatically save as a local slot template so it appears in the dropdown too
        await saveTemplateApi(name, props.prompt)
        emit('refreshTemplates')
      }
    }
  } catch {
    // cancelled
  }
}

onMounted(() => {
  collectionsStore.init()
})

// 分类系统模板与插槽模板
const beautifyTemplates = computed(() => {
  return props.templates.filter((tpl) => {
    const content = localTemplates.get(tpl.name) || ''
    return !content.match(SLOT_REGEX)
  })
})

const slotTemplates = computed(() => {
  return props.templates.filter((tpl) => {
    const content = localTemplates.get(tpl.name) || ''
    return !!content.match(SLOT_REGEX)
  })
})

// 解析按 --split-- 分割出来的段落及其插槽
const parsedSections = computed<PromptSection[]>(() => {
  const sections: PromptSection[] = []
  const rawSections = props.prompt.split('--split--')

  rawSections.forEach((secText) => {
    const slots: SectionSlot[] = []
    let match
    const regex = new RegExp(SLOT_REGEX)
    while ((match = regex.exec(secText)) !== null) {
      slots.push({
        key: (match[1] || '').trim(),
        value: (match[2] || '').trim(),
        raw: match[0]
      })
    }
    sections.push({
      rawText: secText,
      slots
    })
  })

  return sections
})

// 最终渲染的干净提示词（发送给模型）
const renderedPrompt = computed(() => {
  let clean = props.prompt.replace(SLOT_REGEX, (_match, _key, val) => val.trim())
  clean = clean.replace(/--split--/g, '\n')
  return clean.trim()
})

// 当前提示词中是否含有插槽
const hasSlots = computed(() => {
  return parsedSections.value.some(sec => sec.slots.length > 0)
})

// 监听插槽存在状态：当含有插槽时，自动滑入胶囊视图；若插槽全无则退回普通编辑模式
watch(hasSlots, (newVal) => {
  emit('update:hasSlots', newVal)
  if (newVal) {
    isTemplateMode.value = true
  } else {
    isTemplateMode.value = false
  }
}, { immediate: true })

watch(renderedPrompt, (newVal) => {
  emit('update:renderedPrompt', newVal)
}, { immediate: true })

// 同步更新段落中的特定插槽值并合成完整 prompt
function updateSlotValueInSection(secIdx: number, slotIdx: number, newValue: string) {
  const section = parsedSections.value[secIdx]
  if (!section) return
  const slot = section.slots[slotIdx]
  if (!slot) return

  const newRaw = `{${slot.key}: ${newValue}}`
  const updatedSectionText = section.rawText.replace(slot.raw, newRaw)

  const rawSections = props.prompt.split('--split--')
  rawSections[secIdx] = updatedSectionText
  const updatedPrompt = rawSections.join('--split--')

  emit('update:prompt', updatedPrompt)
}

// 选择插槽模板时的追加逻辑（不覆盖，非首个追加时自动添加 --split--）
async function handleSelectSlotTemplate(name: string) {
  selectedSlotTemplate.value = name
  const content = localTemplates.get(name) || await getTemplateContent(name)
  if (content) {
    const current = props.prompt
    if (current.trim()) {
      emit('update:prompt', current + '\n--split--\n' + content)
    } else {
      emit('update:prompt', content)
    }
  }
}
// 插槽模板 Dialog 高级变量提取器
const isSlotDialogVisible = ref(false)
const isNewSlotTemplate = ref(true)
const slotTemplateName = ref('')

function handleCreateTemplate() {
  if (activeTab.value === 'slots') {
    slotTemplateName.value = ''
    isNewSlotTemplate.value = true
    isSlotDialogVisible.value = true
  } else {
    emit('createTemplate')
  }
}

function handleEditTemplate() {
  if (activeTab.value === 'slots') {
    if (!selectedSlotTemplate.value) {
      ElMessage.warning('请选择一个插槽模板进行编辑')
      return
    }
    slotTemplateName.value = selectedSlotTemplate.value
    isNewSlotTemplate.value = false
    isSlotDialogVisible.value = true
  } else {
    emit('editTemplate')
  }
}

// 下载模板函数 (支持插槽和系统预设)
function handleDownloadTemplate() {
  if (activeTab.value === 'slots') {
    if (!selectedSlotTemplate.value) return
    getTemplateContent(selectedSlotTemplate.value).then(content => {
      const blob = new Blob([content || ''], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const sanitizeName = selectedSlotTemplate.value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
      a.download = `${sanitizeName || 'untitled'}.md`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    })
  } else {
    emit('downloadTemplate')
  }
}

function onSlotTemplateSaved(name: string, content: string) {
  selectedSlotTemplate.value = name
  const current = props.prompt
  if (current.trim()) {
    emit('update:prompt', current + '\n--split--\n' + content)
  } else {
    emit('update:prompt', content)
  }
  emit('refreshTemplates')
}

// 选中框内文本，按 { 自动包裹为槽位 variables，并支持浏览器原生撤销 (Ctrl+Z) / 重做 (Ctrl+Y)
function handleKeydown(e: KeyboardEvent) {
  if (e.key === '{') {
    const target = e.target as HTMLTextAreaElement
    if (!target) return

    const start = target.selectionStart
    const end = target.selectionEnd

    if (start !== undefined && end !== undefined && start !== end) {
      e.preventDefault()

      const selectedText = target.value.substring(start, end)
      const replacement = `{: ${selectedText}}`

      // 显式聚焦并选中该范围，以便执行 insertText 命令
      target.focus()
      target.setSelectionRange(start, end)

      // 使用 insertText 插入内容，这样能原生保留 Ctrl+Z 撤销和 Ctrl+Y 重做历史
      const success = document.execCommand('insertText', false, replacement)
      if (!success) {
        // 兜底降级方案：若 execCommand 执行失败，则手动拼接字符串
        const val = props.prompt
        const newVal = val.substring(0, start) + replacement + val.substring(end)
        emit('update:prompt', newVal)
      }

      nextTick(() => {
        target.focus()
        target.setSelectionRange(start + 1, start + 1)
      })
    }
  }
}
</script>

<template>
  <div class="prompt-composer">
    <div class="composer-body-row">
      <div class="composer-input-container">
        <!-- 仅在胶囊填槽模式下显示插槽视图，移除了原有的 composer-header-bar-simple -->
        <div v-if="isTemplateMode && hasSlots" class="template-tag-view">
          <!-- 虚线框列表：按 --split-- 分割的多组插槽 -->
          <div class="dashed-boxes-list">
            <template v-for="(section, secIdx) in parsedSections" :key="secIdx">
              <div
                v-if="section.slots.length > 0"
                class="tags-container-dashed"
              >
                <div class="tags-grid">
                  <div
                    v-for="(slot, slotIdx) in section.slots"
                    :key="slotIdx"
                    class="capsule-tag"
                  >
                    <span class="tag-label">
                      <span class="tag-icon">🏷️</span>
                      {{ slot.key }}
                    </span>
                    <span class="tag-divider">:</span>
                    <input
                      :value="slot.value"
                      @input="(e: any) => updateSlotValueInSection(secIdx, slotIdx, e.target.value)"
                      class="capsule-input"
                      placeholder="输入值..."
                      :style="{ width: Math.max(50, slot.value.length * 8 + 12) + 'px' }"
                    />
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- 文本框模式，增加了 keydown Interceptor -->
        <el-input
          v-if="!isTemplateMode || !hasSlots"
          :model-value="prompt"
          @update:model-value="(v: string) => emit('update:prompt', v)"
          @keydown="handleKeydown"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 8 }"
          placeholder="请输入生成提示词..."
          class="prompt-textarea"
        />
      </div>
    </div>

    <div class="composer-footer">
      <div class="reference-images-container">
        <MediaUploader
          :model-value="referenceMedia || []"
          @update:model-value="(v: MediaFile[]) => emit('update:referenceMedia', v)"
          @update:is-uploading="(v: boolean) => emit('update:isUploading', v)"
          :max-count="5"
          :accept-types="acceptTypes"
          :disabled="disableMedia"
        />
      </div>

      <div class="footer-right-group">
        <div class="toolbar">
          <el-button-group class="left-btns">
            <el-button
              size="small"
              class="ghost-btn"
              :disabled="activeTab === 'slots' ? !selectedSlotTemplate : !selectedTemplate"
              @click="handleEditTemplate"
              title="编辑模板"
            >
              <el-icon><i-ep-edit /></el-icon>
            </el-button>
            <el-button
              size="small"
              class="ghost-btn"
              :disabled="activeTab === 'slots' ? !selectedSlotTemplate : !selectedTemplate"
              @click="handleDownloadTemplate"
              title="下载 .md"
            >
              <el-icon><i-ep-download /></el-icon>
            </el-button>
            <el-button
              size="small"
              class="ghost-btn"
              :disabled="!prompt.trim()"
              @click="toggleFavoritePrompt"
              title="收藏提示词"
            >
              <el-icon><i-ep-folder-add /></el-icon>
            </el-button>
          </el-button-group>

        <PromptTemplateSelect
          :model-value="activeTab === 'slots' ? selectedSlotTemplate : selectedTemplate"
          @update:model-value="(v) => activeTab === 'slots' ? (selectedSlotTemplate = v) : emit('update:selectedTemplate', v)"
          v-model:active-tab="activeTab"
          :beautify-templates="beautifyTemplates"
          :slot-templates="slotTemplates"
          :templates="templates"
          @select-slot-template="handleSelectSlotTemplate"
          @create="handleCreateTemplate"
          @delete="(name) => emit('deleteTemplate', name)"
          @refresh="emit('refreshTemplates')"
        />

        <el-button
          v-if="activeTab !== 'slots'"
          class="beautify-btn"
          circle
          size="small"
          :color="actionColor ?? '#6366f1'"
          :loading="beautifying"
          :disabled="!selectedTemplate"
          @click="emit('beautify')"
          title="美化提示词"
        >
          <el-icon v-if="!beautifying"><i-ep-magic-stick /></el-icon>
        </el-button>
      </div>
    </div>
  </div>

    <!-- 配置插槽模板的 Dialog （高阶变量提取器，类似于画布模板节点的功能） -->
    <PromptSlotDialog
      v-model:visible="isSlotDialogVisible"
      :is-new="isNewSlotTemplate"
      :initial-name="slotTemplateName"
      @saved="onSlotTemplateSaved"
    />
  </div>
</template>

<style scoped>
.prompt-composer {
  position: relative;
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 12px;
  background-color: #fff;
  transition: border-color 0.2s;
  display: flex;
  flex-direction: column;
}

.composer-body-row {
  display: flex;
  align-items: flex-start;
  width: 100%;
}

.footer-right-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.composer-input-container {
  flex: 1;
}

.prompt-composer:focus-within {
  border-color: #409eff;
}

/* 顶部状态栏与切换 */
.composer-header-bar-simple {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px 8px 16px;
  background-color: #fff;
  border-radius: 12px 12px 0 0;
  border-bottom: 1px solid #f1f5f9;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-title {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.preview-search-icon {
  font-size: 15px;
  color: #6366f1;
  cursor: pointer;
  transition: transform 0.2s, color 0.2s;
  margin-left: 2px;
}

.preview-search-icon:hover {
  transform: scale(1.2);
  color: #4f46e5;
}

.view-switch-link-simple {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #94a3b8;
  cursor: pointer;
  transition: color 0.2s;
  user-select: none;
  width: fit-content;
}

.view-switch-link-simple:hover {
  color: #6366f1;
}

/* 悬浮切换按钮样式 */
.view-switch-btn {
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.06);
  border: 1px solid rgba(99, 102, 241, 0.15);
  cursor: pointer;
  user-select: none;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.view-switch-btn:hover {
  background: rgba(99, 102, 241, 0.12);
  border-color: rgba(99, 102, 241, 0.3);
  transform: translateY(-1px);
}

/* 胶囊 Tag 预览/编辑区域 */
.template-tag-view {
  min-height: 108px;
  max-height: 220px;
  overflow-y: auto;
  border-radius: 12px 12px 0 0;
  background: #fff;
  display: flex;
  flex-direction: column;
}

/* 虚线框列表 */
.dashed-boxes-list {
  padding: 12px 16px 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 虚线边框容器 */
.tags-container-dashed {
  border: 1.5px dashed rgba(139, 92, 246, 0.25);
  border-radius: 8px;
  padding: 10px;
  background-color: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.tags-container-dashed:hover {
  border-color: rgba(139, 92, 246, 0.45);
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.05);
}

/* 胶囊 Tag 列表 */
.tags-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.capsule-tag {
  display: flex;
  align-items: center;
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 20px;
  padding: 4px 10px;
  font-size: 12px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.capsule-tag:hover {
  background: #ede9fe;
  border-color: #c4b5fd;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.1);
}

.tag-label {
  color: #4f46e5;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}

.tag-icon {
  font-size: 11px;
}

.tag-divider {
  margin: 0 4px;
  color: #a78bfa;
}

.capsule-input {
  border: none;
  background: transparent;
  color: #1f2937;
  font-weight: 500;
  outline: none;
  padding: 0;
  margin: 0;
  font-size: 12px;
  transition: width 0.2s ease, border-bottom 0.2s ease;
}

.capsule-input:focus {
  border-bottom: 1px solid #8b5cf6;
}

/* 最终提示词 Popover 预览区 */
.final-prompt-preview {
  padding: 8px;
}

.preview-title {
  font-size: 12px;
  font-weight: 600;
  color: #4f46e5;
  margin-bottom: 4px;
}

.preview-content {
  font-size: 12px;
  color: #4b5563;
  line-height: 1.5;
  word-break: break-all;
}

.composer-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 0 10px 10px 10px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 999px;
  background: #f3f4f6;
}

.reference-images-container {
  z-index: 10;
}

:deep(.prompt-textarea .el-textarea__inner) {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  padding-bottom: 8px;
  border-radius: 12px 12px 0 0;
  resize: none;
}

.left-btns :deep(.el-button) {
  padding: 0 10px;
}

.beautify-btn {
  margin-left: 2px;
}

:deep(.toolbar .ghost-btn) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: #6b7280;
}

:deep(.toolbar .ghost-btn:hover) {
  background: rgba(99, 102, 241, 0.08);
  color: #6366f1;
}

:deep(.toolbar .ghost-btn:disabled) {
  opacity: 0.4;
}

:deep(.toolbar .el-select__wrapper) {
  border: none !important;
  box-shadow: none !important;
  background: transparent;
  border-radius: 999px;
}

:deep(.toolbar .el-select__selection) {
  padding-left: 2px;
}

:deep(.toolbar .el-button),
:deep(.toolbar .el-button-group) {
  box-shadow: none !important;
}

:deep(.toolbar .el-button) {
  border: none !important;
}

:deep(.left-btns .el-button) {
  border-radius: 999px;
}

:deep(.beautify-btn) {
  background: #6366f1 !important;
  border: none !important;
  color: white !important;
  box-shadow: 0 6px 18px rgba(99, 102, 241, 0.35);
}

:deep(.beautify-btn:hover) {
  background: #4f46e5 !important;
  transform: translateY(-1px);
}

</style>
