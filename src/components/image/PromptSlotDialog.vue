<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { saveTemplateApi } from '@/api/generate'
import { usePromptTemplates } from '@/composables/image/usePromptTemplates'

const props = withDefaults(defineProps<{
  visible: boolean
  isNew: boolean
  initialName: string
  mode?: 'preset' | 'collections'
  initialSubtype?: 'inspiration' | 'prompt' | 'beautify'
}>(), {
  mode: 'preset',
  initialSubtype: 'prompt'
})

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'saved', name: string, content: string, subtype?: 'inspiration' | 'prompt' | 'beautify'): void
}>()

const { getTemplateContent } = usePromptTemplates()

const isSlotDialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const slotTemplateName = ref('')
const slotTemplateText = ref('')
const selectedSubtype = ref<'inspiration' | 'prompt' | 'beautify'>('prompt')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

watch(() => props.visible, async (val) => {
  if (val) {
    slotTemplateName.value = props.isNew ? '' : props.initialName
    editingKey.value = null
    selectedSubtype.value = props.initialSubtype || 'prompt'
    
    if (props.isNew) {
      slotTemplateText.value = ''
    } else {
      slotTemplateText.value = ''
      const content = await getTemplateContent(props.initialName)
      if (content) {
        slotTemplateText.value = content
      }
    }
  }
})

// 解析变量规则
const SLOT_REGEX = /\{([^:]*):\s*([^}]+)\}/g

interface DialogParsedVar {
  key: string
  defaultValue: string
}

const dialogParsedVariables = computed<DialogParsedVar[]>(() => {
  const vars: DialogParsedVar[] = []
  const seenKeys = new Set<string>()
  const regex = new RegExp(SLOT_REGEX)
  let match
  while ((match = regex.exec(slotTemplateText.value)) !== null) {
    const key = (match[1] || '').trim()
    const defaultValue = (match[2] || '').trim()
    if (key === '') {
      vars.push({ key, defaultValue })
    } else if (!seenKeys.has(key)) {
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
  ElMessage.success(`变量 [ ${key || '未命名'} ] 的默认值已更新为 "${newValue}"`)
}

function removeVariableTag(key: string, defaultValue: string) {
  const escapedKey = escapeRegExp(key)
  const escapedVal = escapeRegExp(defaultValue)
  const regex = new RegExp(`\\{${escapedKey}:\\s*${escapedVal}\\}`, 'g')
  slotTemplateText.value = slotTemplateText.value.replace(regex, defaultValue)
  ElMessage.success(`已删除变量槽位 {${key || '未命名'}}，还原为普通文本`)
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
      const replacement = `{${key}: ${selectedText}}`
      
      const textarea = textareaRef.value
      textarea.focus()
      textarea.setSelectionRange(start, end)
      
      const success = document.execCommand('insertText', false, replacement)
      if (!success) {
        const before = slotTemplateText.value.substring(0, start)
        const after = slotTemplateText.value.substring(end)
        slotTemplateText.value = `${before}${replacement}${after}`
      } else {
        slotTemplateText.value = textarea.value
      }

      nextTick(() => {
        if (textareaRef.value) {
          const newEnd = start + key.length + selectedText.length + 4
          textareaRef.value.focus()
          textareaRef.value.setSelectionRange(start, newEnd)
        }
      })
      ElMessage.success(`成功将 "${selectedText}" 提取为变量槽位 {${key}}`)
    }
  } catch {
    // cancelled
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === '{') {
    const textarea = e.target as HTMLTextAreaElement
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd

    if (start !== undefined && end !== undefined && start !== end) {
      e.preventDefault()
      const selectedText = textarea.value.substring(start, end)
      const replacement = `{: ${selectedText}}`
      
      textarea.focus()
      textarea.setSelectionRange(start, end)
      
      const success = document.execCommand('insertText', false, replacement)
      if (!success) {
        const val = slotTemplateText.value
        slotTemplateText.value = val.substring(0, start) + replacement + val.substring(end)
      } else {
        slotTemplateText.value = textarea.value
      }
      
      nextTick(() => {
        textarea.focus()
        textarea.setSelectionRange(start + 1, start + 1)
      })
    }
  }
}

async function handleSaveSlotTemplate() {
  if (!slotTemplateName.value.trim() || !slotTemplateText.value.trim()) {
    ElMessage.warning('模板名称和内容不能为空')
    return
  }

  const name = slotTemplateName.value.trim()
  const content = slotTemplateText.value

  if (props.mode === 'collections') {
    emit('saved', name, content, selectedSubtype.value)
    isSlotDialogVisible.value = false
    return
  }

  try {
    await saveTemplateApi(name, content)
    ElMessage.success('收藏成功')
    emit('saved', name, content)
    isSlotDialogVisible.value = false
  } catch (e) {
    console.error(e)
    ElMessage.error('保存模板失败')
  }
}
</script>

<template>
  <el-dialog
    v-model="isSlotDialogVisible"
    :title="mode === 'collections' ? '新建/导入灵感与模板' : '配置提示词插槽模板'"
    width="600px"
    append-to-body
    class="template-editor-dialog"
  >
    <div class="dialog-form">
      <!-- 只有在 collections 导入模式下才允许选择模板子分类 -->
      <div v-if="mode === 'collections'" class="form-field">
        <label class="form-label">模板内容类型</label>
        <el-radio-group v-model="selectedSubtype" size="small">
          <el-radio-button value="inspiration">💡 创作点子</el-radio-button>
          <el-radio-button value="prompt">📝 提示词模板</el-radio-button>
          <el-radio-button value="beautify">✨ 美化模板</el-radio-button>
        </el-radio-group>
      </div>

      <div class="form-field">
        <label class="form-label">模板名称</label>
        <el-input v-model="slotTemplateName" :disabled="!isNew" placeholder="输入模板名称，如：背景氛围、角色五官等" />
      </div>

      <div class="form-field">
        <div class="textarea-header">
          <label class="form-label">模板提示词文本</label>
          <el-button
            type="primary"
            size="small"
            plain
            :disabled="selectedSubtype === 'beautify'"
            @click="handleExtractVariable"
            class="extract-btn"
          >
            <el-icon><i-ep-magic-stick /></el-icon>
            提取选定文本为变量
          </el-button>
        </div>
        <p class="extract-tip">
          提示：{{ selectedSubtype === 'beautify' ? '当前为美化类型，已禁用变量插槽提取。' : '在下方选中文本片段（如 "girl"），点击上方“提取”按钮，即可快速将其定义为变量槽位。' }}
        </p>

        <!-- 可视化槽位变量编辑区 -->
        <div v-if="dialogParsedVariables.length > 0" class="dialog-variables-panel">
          <div class="panel-title">已提取的变量槽位（点击原值编辑，点击 x 还原为文本）：</div>
          <div class="dialog-tags-list">
            <div
              v-for="(v, index) in dialogParsedVariables"
              :key="v.key + '_' + index"
              class="dialog-capsule-tag"
              @click.stop="startEditInline(v.key, v.defaultValue)"
            >
              <span class="capsule-label">🏷️ {{ v.key || '(未命名)' }}:</span>
              <input
                v-if="editingKey === v.key"
                class="dialog-inline-capsule-input"
                v-model="editingValue"
                :style="{ width: (editingValue.length * 8 + 20) + 'px' }"
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
          @keydown="handleKeydown"
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
</template>

<style scoped>
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
