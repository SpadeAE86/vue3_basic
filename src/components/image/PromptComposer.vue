<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PromptTemplateSelect from './PromptTemplateSelect.vue'
import MediaUploader, { type MediaFile } from './MediaUploader.vue'
import { usePromptTemplates } from '@/composables/image/usePromptTemplates'
import { saveTemplateApi } from '@/api/generate'

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
const slotTemplateText = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

interface DialogParsedVar {
  key: string
  defaultValue: string
}

const dialogParsedVariables = computed<DialogParsedVar[]>(() => {
  const vars: DialogParsedVar[] = []
  const seenKeys = new Set<string>()
  const regex = /\{([^:]+):\s*([^}]+)\}/g
  let match
  while ((match = regex.exec(slotTemplateText.value)) !== null) {
    const key = (match[1] || '').trim()
    const defaultValue = (match[2] || '').trim()
    if (key && !seenKeys.has(key)) {
      seenKeys.add(key)
      vars.push({ key, defaultValue })
    }
  }
  return vars
})

const editingKey = ref<string | null>(null)
const editingValue = ref('')

function startEditInline(key: string, defaultValue: string) {
  editingKey.value = key
  editingValue.value = defaultValue
  nextTick(() => {
    const input = document.querySelector('.dialog-inline-capsule-input') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  })
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function saveInlineEdit(key: string, oldValue: string) {
  if (editingKey.value !== key) return
  const newValue = editingValue.value.trim()
  editingKey.value = null
  if (!newValue) return

  const escapedKey = escapeRegExp(key)
  const escapedVal = escapeRegExp(oldValue)
  const regex = new RegExp(`\\{${escapedKey}:\\s*${escapedVal}\\}`, 'g')
  slotTemplateText.value = slotTemplateText.value.replace(regex, `{${key}: ${newValue}}`)
  ElMessage.success(`变量 [ ${key} ] 的默认值已更新为 "${newValue}"`)
}

function removeVariableTag(key: string, defaultValue: string) {
  const escapedKey = escapeRegExp(key)
  const escapedVal = escapeRegExp(defaultValue)
  const regex = new RegExp(`\\{${escapedKey}:\\s*${escapedVal}\\}`, 'g')
  slotTemplateText.value = slotTemplateText.value.replace(regex, defaultValue)
  ElMessage.success(`已删除变量槽位 {${key}}，还原为普通文本`)
}

async function handleExtractVariable() {
  if (!textareaRef.value) return
  const start = textareaRef.value.selectionStart
  const end = textareaRef.value.selectionEnd

  if (start === undefined || end === undefined || start === end) {
    ElMessage.warning('请先在输入框中，用鼠标拖拽选中一段文字作为变量的默认值')
    return
  }

  const selectedText = slotTemplateText.value.substring(start, end)

  try {
    const { value: varName } = await ElMessageBox.prompt('请输入该槽位的变量名称（如：主体、风格）', '提取模板变量', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '变量名不能为空',
      inputValue: ''
    })

    if (varName) {
      const key = varName.trim()
      const before = slotTemplateText.value.substring(0, start)
      const after = slotTemplateText.value.substring(end)
      slotTemplateText.value = `${before}{${key}: ${selectedText}}${after}`

      nextTick(() => {
        if (textareaRef.value) {
          const newEnd = start + key.length + selectedText.length + 4
          textareaRef.value.focus()
          textareaRef.value.setSelectionRange(start, newEnd)
        }
      })
      ElMessage.success(`成功将 "${selectedText}" 提取为变量槽位 {${key}}`)
    }
  } catch (e) {
    // cancelled
  }
}

async function handleSaveSlotTemplate() {
  if (!slotTemplateName.value.trim() || !slotTemplateText.value.trim()) {
    ElMessage.warning('模板名称和内容不能为空')
    return
  }

  const name = slotTemplateName.value.trim()
  const content = slotTemplateText.value
  try {
    await saveTemplateApi(name, content)
    ElMessage.success('插槽模板保存成功')

    // 立即在输入框中应用并追加该插槽模板，且设置为下拉框选中状态
    selectedSlotTemplate.value = name
    const current = props.prompt
    if (current.trim()) {
      emit('update:prompt', current + '\n--split--\n' + content)
    } else {
      emit('update:prompt', content)
    }

    isSlotDialogVisible.value = false
    emit('refreshTemplates')
  } catch (e) {
    console.error(e)
    ElMessage.error('保存模板失败')
  }
}

function handleCreateTemplate() {
  if (activeTab.value === 'slots') {
    slotTemplateName.value = ''
    slotTemplateText.value = ''
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
    getTemplateContent(selectedSlotTemplate.value).then(content => {
      if (content) {
        slotTemplateText.value = content
      }
    })
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

// 快速保存提示词为模板（没插槽也能保存）
async function handleQuickSaveTemplate() {
  if (!props.prompt.trim()) {
    ElMessage.warning('提示词内容不能为空，请先在输入框中输入提示词')
    return
  }

  try {
    const { value: templateName } = await ElMessageBox.prompt(
      '请输入新建的提示词模板名称（如：复古人像、科幻背景）',
      '保存提示词为模板',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '模板名称不能为空',
        inputValue: ''
      }
    )

    if (templateName) {
      const name = templateName.trim()
      await saveTemplateApi(name, props.prompt)
      ElMessage.success('提示词模板保存成功')
      emit('refreshTemplates')

      const hasSlotVars = !!props.prompt.match(SLOT_REGEX)
      activeTab.value = hasSlotVars ? 'slots' : 'beautify'
      if (hasSlotVars) {
        selectedSlotTemplate.value = name
      } else {
        emit('update:selectedTemplate', name)
      }
    }
  } catch (e) {
    if (e !== 'cancel') {
      console.error(e)
      ElMessage.error('保存模板失败')
    }
  }
}
</script>

<template>
  <div class="prompt-composer">
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
            @click="handleQuickSaveTemplate"
            title="保存为模板"
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

    <!-- 配置插槽模板的 Dialog （高阶变量提取器，类似于画布模板节点的功能） -->
    <el-dialog
      v-model="isSlotDialogVisible"
      title="配置提示词插槽模板"
      width="600px"
      append-to-body
      class="template-editor-dialog"
    >
      <div class="dialog-form">
        <div class="form-field">
          <label class="form-label">模板名称</label>
          <el-input v-model="slotTemplateName" :disabled="!isNewSlotTemplate" placeholder="输入模板名称，如：背景氛围、角色五官等" />
        </div>

        <div class="form-field">
          <div class="textarea-header">
            <label class="form-label">模板提示词文本</label>
            <el-button
              type="primary"
              size="small"
              plain
              @click="handleExtractVariable"
              class="extract-btn"
            >
              <el-icon><i-ep-magic-stick /></el-icon>
              提取选定文本为变量
            </el-button>
          </div>
          <p class="extract-tip">
            提示：在下方选中文本片段（如 "girl"），点击上方“提取”按钮，即可快速将其定义为变量槽位。
          </p>

          <!-- 可视化槽位变量编辑区 -->
          <div v-if="dialogParsedVariables.length > 0" class="dialog-variables-panel">
            <div class="panel-title">已提取的变量槽位（点击原值编辑，点击 x 还原为文本）：</div>
            <div class="dialog-tags-list">
              <div
                v-for="v in dialogParsedVariables"
                :key="v.key"
                class="dialog-capsule-tag"
                @click.stop="startEditInline(v.key, v.defaultValue)"
              >
                <span class="capsule-label">🏷️ {{ v.key }}:</span>
                <input
                  v-if="editingKey === v.key"
                  class="dialog-inline-capsule-input"
                  v-model="editingValue"
                  @blur="saveInlineEdit(v.key, v.defaultValue)"
                  @keyup.enter="saveInlineEdit(v.key, v.defaultValue)"
                  @click.stop
                />
                <span v-else class="capsule-value">{{ v.defaultValue }}</span>
                <button
                  class="capsule-delete-btn"
                  @click.stop="removeVariableTag(v.key, v.defaultValue)"
                  title="还原为普通文本"
                >
                  <el-icon><i-ep-close /></el-icon>
                </button>
              </div>
            </div>
          </div>

          <textarea
            ref="textareaRef"
            v-model="slotTemplateText"
            rows="8"
            placeholder="例如: A majestic {主体: golden dragon} flying high in the {天空: stormy sky}..."
            class="native-template-textarea"
          ></textarea>
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="isSlotDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSaveSlotTemplate">
            <el-icon><i-ep-circle-check /></el-icon>
            保存并应用
          </el-button>
        </span>
      </template>
    </el-dialog>
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

/* Dialog Form Styles */
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.textarea-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.extract-btn {
  font-size: 11px;
}

.extract-tip {
  font-size: 11px;
  color: #6b7280;
  margin: 0;
  background: #f9fafb;
  padding: 6px 10px;
  border-radius: 6px;
  border-left: 3px solid #8b5cf6;
}

.native-template-textarea {
  width: 100%;
  padding: 10px;
  box-sizing: border-box;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  font-size: 13px;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  color: #1f2937;
  resize: vertical;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.native-template-textarea:focus {
  border-color: #8b5cf6;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
}

/* Dialog 中的可视化槽位变量样式 */
.dialog-variables-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #faf5ff;
  border: 1px dashed #d8b4fe;
  border-radius: 8px;
  padding: 10px;
  box-sizing: border-box;
}

.panel-title {
  font-size: 11px;
  font-weight: 600;
  color: #7c3aed;
}

.dialog-tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dialog-capsule-tag {
  display: inline-flex;
  align-items: center;
  background: #ffffff;
  border: 1px solid #e9d5ff;
  border-radius: 20px;
  padding: 2px 8px;
  padding-right: 4px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  font-size: 11px;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  user-select: none;
  position: relative;
  box-sizing: border-box;
}

.dialog-capsule-tag:hover {
  transform: translateY(-1px);
  border-color: #a855f7;
  box-shadow: 0 2px 6px rgba(168, 85, 247, 0.15);
}

.dialog-capsule-tag .capsule-delete-btn {
  background: none;
  border: none;
  padding: 0 4px;
  color: #cbd5e1;
  cursor: pointer;
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
  font-size: 11px;
}

.dialog-capsule-tag:hover .capsule-delete-btn {
  opacity: 1;
}

.dialog-capsule-tag .capsule-delete-btn:hover {
  color: #ef4444;
}

.dialog-inline-capsule-input {
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
</style>
