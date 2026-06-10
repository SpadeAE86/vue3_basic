<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Memo, Delete, Edit, MagicStick, CircleCheck, Close, Star, StarFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useCanvasStore } from '@/stores/canvas'
import { useWorkspaceStore } from '@/stores/workspace'
import { useCollectionsStore } from '@/stores/collections'

interface NodeData {
  display_id?: number
  name?: string
  template_text?: string
}

const props = defineProps<{
  id: string
  data: NodeData
}>()

const emit = defineEmits<{
  (e: 'delete', id: string): void
}>()

const canvasStore = useCanvasStore()
const workspaceStore = useWorkspaceStore()
const collectionsStore = useCollectionsStore()

const isFavorited = computed(() => {
  const text = props.data.template_text || ''
  if (!text) return false
  return collectionsStore.isFavorited('template', text)
})

function toggleFavorite() {
  const text = props.data.template_text || ''
  if (!text) {
    ElMessage.warning('模板文本为空，无法收藏')
    return
  }
  const name = props.data.name || '未命名模板'
  collectionsStore.toggleFavorite(
    'template',
    name,
    undefined,
    {
      name: name,
      template_text: text
    }
  )
}

onMounted(() => {
  collectionsStore.init()
})

const isDialogVisible = ref(false)
const templateName = ref(props.data.name || '未命名模板')
const templateText = ref(props.data.template_text || '')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// 模板文本缩略语预览
const previewText = computed(() => {
  const txt = props.data.template_text || ''
  if (txt.length <= 45) return txt
  return txt.substring(0, 45) + '...'
})

function openEditor() {
  templateName.value = props.data.name || '未命名模板'
  templateText.value = props.data.template_text || ''
  isDialogVisible.value = true
}

async function handleExtractVariable() {
  if (!textareaRef.value) return
  const start = textareaRef.value.selectionStart
  const end = textareaRef.value.selectionEnd
  
  if (start === undefined || end === undefined || start === end) {
    ElMessage.warning('请先在输入框中，用鼠标拖拽选中一段文字作为变量的默认值')
    return
  }
  
  const selectedText = templateText.value.substring(start, end)
  
  try {
    const { value: varName } = await ElMessageBox.prompt('请输入该槽位的变量名称（如：主体、风格、天气）', '提取模板变量', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '变量名不能为空',
      inputValue: ''
    })
    
    if (varName) {
      const key = varName.trim()
      const before = templateText.value.substring(0, start)
      const after = templateText.value.substring(end)
      
      templateText.value = `${before}{${key}: ${selectedText}}${after}`
      
      // 选中替换后的变量槽位
      nextTick(() => {
        if (textareaRef.value) {
          const newEnd = start + key.length + selectedText.length + 4 // {key: val}
          textareaRef.value.focus()
          textareaRef.value.setSelectionRange(start, newEnd)
        }
      })
      ElMessage.success(`成功将 "${selectedText}" 提取为变量槽位 {${key}}`)
    }
  } catch (e) {
    // 取消
  }
}

async function handleSave() {
  const localNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!localNode || !workspaceStore.selectedWorkspaceId) return
  
  const payload = {
    id: props.id,
    type: 'prompt_template',
    x: localNode.position.x,
    y: localNode.position.y,
    data: {
      display_id: props.data.display_id,
      name: templateName.value.trim() || '未命名模板',
      template_text: templateText.value
    }
  }
  
  try {
    await canvasStore.saveNode(workspaceStore.selectedWorkspaceId, payload)
    isDialogVisible.value = false
    
    // 联动重算所有连接的生图节点提示词
    await canvasStore.recomputeTemplatePrompts(workspaceStore.selectedWorkspaceId)
    await canvasStore.loadGraph(workspaceStore.selectedWorkspaceId)
    canvasStore.pushHistory()
    ElMessage.success('模板保存成功，已同步重算下游节点')
  } catch (e) {
    console.error(e)
    ElMessage.error('保存模板节点失败')
  }
}

function handleDelete() {
  emit('delete', props.id)
}

interface ParsedVar {
  key: string
  defaultValue: string
}

const parsedVariables = computed<ParsedVar[]>(() => {
  const vars: ParsedVar[] = []
  const seenKeys = new Set<string>()
  const regex = /\{([^:]+):\s*([^}]+)\}/g
  let match
  while ((match = regex.exec(templateText.value)) !== null) {
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
    const inputs = document.querySelectorAll('.dialog-inline-capsule-input')
    const input = Array.from(inputs).find(el => {
      return (el as HTMLInputElement).value === defaultValue
    }) as HTMLInputElement || inputs[0] as HTMLInputElement
    
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
  templateText.value = templateText.value.replace(regex, `{${key}: ${newValue}}`)
  ElMessage.success(`变量 [ ${key} ] 的默认值已更新为 "${newValue}"`)
}

function removeVariableTag(key: string, defaultValue: string) {
  const escapedKey = escapeRegExp(key)
  const escapedVal = escapeRegExp(defaultValue)
  const regex = new RegExp(`\\{${escapedKey}:\\s*${escapedVal}\\}`, 'g')
  templateText.value = templateText.value.replace(regex, defaultValue)
  ElMessage.success(`已删除变量槽位 {${key}}，还原为普通提示词`)
}
</script>

<template>
  <div class="node-wrapper-outer">
    <div v-if="canvasStore.showNodeId" class="node-id-badge">#{{ data.display_id }}</div>
    <div class="prompt-template-node">
      <!-- 只有右侧出端口 (作为提示词源连向生图节点) -->
      <Handle id="out" type="source" :position="Position.Right" class="node-handle" />

      <div class="card-inner">
        <!-- 头部 -->
        <div class="card-header">
          <div class="header-left">
            <el-icon class="template-icon"><Memo /></el-icon>
            <span class="header-title">提示词模板</span>
          </div>
          <div class="header-actions-group">
            <button 
              class="header-favorite-star-btn" 
              :class="{ 'is-favorited': isFavorited }" 
              @click.stop="toggleFavorite"
              title="收藏模板"
            >
              <el-icon>
                <StarFilled v-if="isFavorited" />
                <Star v-else />
              </el-icon>
            </button>
            <button class="delete-btn" @click.stop="handleDelete" title="删除模板">
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </div>

        <!-- 主体预览 -->
        <div class="card-body" @click="openEditor">
          <div class="template-name-title">{{ data.name || '未命名模板' }}</div>
          <div class="template-preview" v-if="previewText">
            {{ previewText }}
          </div>
          <div class="template-preview empty" v-else>
            点击编辑提示词模板内容
          </div>
        </div>

        <!-- 底部配置按钮 -->
        <div class="card-footer">
          <el-button type="primary" size="small" class="edit-template-btn" @click.stop="openEditor">
            <el-icon><Edit /></el-icon>编辑模板内容
          </el-button>
        </div>
      </div>
    </div>

    <!-- 模态框浮窗编辑器 -->
    <el-dialog
      v-model="isDialogVisible"
      title="配置提示词模板"
      width="600px"
      append-to-body
      class="template-editor-dialog"
    >
      <div class="dialog-form">
        <div class="form-field">
          <label class="form-label">模板名称</label>
          <el-input v-model="templateName" placeholder="输入模板名称，如：背景氛围、角色五官等" />
        </div>
        
        <div class="form-field">
          <div class="textarea-header">
            <label class="form-label">模板提示词文本</label>
            <el-button 
              type="primary" 
              size="small" 
              plain 
              :icon="MagicStick"
              @click="handleExtractVariable"
              class="extract-btn"
            >
              提取选定文本为变量
            </el-button>
          </div>
          <p class="extract-tip">
            提示：在下方选中文本片段（如 "girl"），点击上方“提取”按钮，即可快速将其定义为变量槽位。
          </p>
          
          <!-- 可视化槽位变量编辑区 -->
          <div v-if="parsedVariables.length > 0" class="dialog-variables-panel">
            <div class="panel-title">已提取的变量槽位（点击原地编辑，悬浮点击 x 还原为文本）：</div>
            <div class="dialog-tags-list">
              <div 
                v-for="v in parsedVariables" 
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
                  <el-icon><Close /></el-icon>
                </button>
              </div>
            </div>
          </div>

          <textarea
            ref="textareaRef"
            v-model="templateText"
            rows="8"
            placeholder="例如: A majestic {主体: golden dragon} flying high in the {天空: stormy sky}..."
            class="native-template-textarea"
          ></textarea>
        </div>
      </div>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="isDialogVisible = false">取消</el-button>
          <el-button type="primary" :icon="CircleCheck" @click="handleSave">保存并应用</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.prompt-template-node {
  width: 220px;
  background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
  border-radius: 12px;
  box-shadow: 0 4px 14px rgba(139, 92, 246, 0.1);
  overflow: visible;
  position: relative;
  box-sizing: border-box;
  transition: transform 0.2s, box-shadow 0.2s;
  border: 1px solid rgba(139, 92, 246, 0.2);
}

.prompt-template-node:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(139, 92, 246, 0.2);
}

.card-inner {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border-radius: 12px;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.5);
  border-bottom: 1px solid rgba(139, 92, 246, 0.15);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.template-icon {
  font-size: 14px;
  color: #8b5cf6;
}

.header-title {
  font-size: 11px;
  font-weight: 700;
  color: #6d28d9;
}

.delete-btn {
  padding: 0;
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: color 0.2s;
}

.delete-btn:hover {
  color: #ef4444;
}

.header-actions-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-favorite-star-btn {
  background: none;
  border: none;
  padding: 0;
  color: #cbd5e1;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: all 0.2s ease;
  opacity: 0;
  transform: scale(0.8);
}

.prompt-template-node:hover .header-favorite-star-btn,
.header-favorite-star-btn.is-favorited {
  opacity: 1;
  transform: scale(1);
}

.header-favorite-star-btn:hover {
  color: #eab308;
  transform: scale(1.1) !important;
}

.header-favorite-star-btn.is-favorited {
  color: #eab308;
}

.card-body {
  padding: 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 80px;
}

.template-name-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e1b4b;
  word-break: break-all;
}

.template-preview {
  font-size: 11px;
  color: #6b7280;
  line-height: 1.4;
  word-break: break-all;
  font-style: italic;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.template-preview.empty {
  color: #9ca3af;
}

.card-footer {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.4);
  border-top: 1px solid rgba(139, 92, 246, 0.1);
  display: flex;
  justify-content: center;
}

.edit-template-btn {
  width: 100%;
  height: 28px;
  border-radius: 6px;
  background: #8b5cf6;
  border-color: #8b5cf6;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.edit-template-btn:hover {
  background: #7c3aed;
  border-color: #7c3aed;
}

/* Ports */
.node-handle {
  width: 10px;
  height: 10px;
  background: #8b5cf6;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
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
