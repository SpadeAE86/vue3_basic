<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import PromptPreviewDialog from './PromptPreviewDialog.vue'

const props = defineProps<{
  prompt: string
}>()

const emit = defineEmits<{
  (e: 'update:prompt', val: string): void
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

function getSectionPreviewText(secText: string): string {
  if (!secText) return ''
  const clean = secText.replace(SLOT_REGEX, (_match, _key, val) => val.trim())
  return clean.trim()
}

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

function removeSection(secIdx: number) {
  const rawSections = props.prompt.split('--split--')
  rawSections.splice(secIdx, 1)
  const newSections = rawSections.map(s => s.trim()).filter(Boolean)
  const updatedPrompt = newSections.join('\n--split--\n')
  emit('update:prompt', updatedPrompt)
  ElMessage.success('已移除该插槽模板段落')
}

const editingSecIdx = ref<number | null>(null)
const textareaRefs = ref<any[]>([])

function startEditSection(secIdx: number) {
  editingSecIdx.value = secIdx
  nextTick(() => {
    const component = textareaRefs.value[secIdx]
    if (component) {
      const textareaEl = component.$el?.querySelector('textarea') || component.querySelector?.('textarea')
      if (textareaEl) {
        textareaEl.focus()
      }
    }
  })
}

function updateSectionRawText(secIdx: number, newText: string) {
  const rawSections = props.prompt.split('--split--')
  rawSections[secIdx] = newText
  const updatedPrompt = rawSections.join('--split--')
  emit('update:prompt', updatedPrompt)
}

const previewVisible = ref(false)
const previewContent = ref('')
const previewTitle = ref('')

function openSectionPreview(text: string, title = '段落提示词预览') {
  previewContent.value = getSectionPreviewText(text)
  previewTitle.value = title
  previewVisible.value = true
}
</script>

<template>
  <div class="template-tag-view">
    <!-- 虚线框列表：按 --split-- 分割的多组插槽 -->
    <div class="dashed-boxes-list">
      <template v-for="(section, secIdx) in parsedSections" :key="secIdx">
        <!-- 有插槽的模板段落 -->
        <div
          v-if="section.slots.length > 0"
          class="tags-container-dashed"
        >
          <button
            class="section-remove-btn"
            @click="removeSection(secIdx)"
            title="移除此插槽模板段落"
          >
            <el-icon><i-ep-close /></el-icon>
          </button>

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

          <!-- Preview magnifier icon with popover -->
          <el-popover
            placement="right"
            :width="400"
            trigger="hover"
            popper-class="preview-popover"
            :teleported="true"
          >
            <template #reference>
              <button
                class="section-search-btn"
                title="预览段落内容"
                @click.stop="openSectionPreview(section.rawText, '段落提示词预览')"
              >
                <el-icon class="preview-search-icon"><i-ep-search /></el-icon>
              </button>
            </template>
            <div class="final-prompt-preview">
              <div class="preview-title">当前插槽块发送内容</div>
              <div class="preview-content scrollable-preview">{{ getSectionPreviewText(section.rawText) }}</div>
            </div>
          </el-popover>
        </div>

        <!-- 无插槽的纯文本段落 -->
        <div
          v-else-if="section.rawText.trim()"
          class="tags-container-dashed"
        >
          <button
            class="section-remove-btn"
            @click="removeSection(secIdx)"
            title="移除此文本段落"
          >
            <el-icon><i-ep-close /></el-icon>
          </button>

          <div class="tags-grid" style="width: 100%;">
            <el-input
              v-if="editingSecIdx === secIdx"
              :ref="(el: any) => { if (el) textareaRefs[secIdx] = el }"
              :model-value="section.rawText"
              @update:model-value="(val: string) => updateSectionRawText(secIdx, val)"
              @blur="editingSecIdx = null"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 4 }"
              class="plain-text-el-textarea"
              placeholder="输入段落内容..."
            />
            <span
              v-else
              class="plain-text-display-val"
              @dblclick="startEditSection(secIdx)"
              title="双击编辑此段落"
            >
              {{ section.rawText.trim() }}
            </span>
          </div>

          <!-- Preview magnifier icon with popover -->
          <el-popover
            placement="right"
            :width="400"
            trigger="hover"
            popper-class="preview-popover"
            :teleported="true"
          >
            <template #reference>
              <button
                class="section-search-btn"
                title="预览段落内容"
                @click.stop="openSectionPreview(section.rawText, '段落提示词预览')"
              >
                <el-icon class="preview-search-icon"><i-ep-search /></el-icon>
              </button>
            </template>
            <div class="final-prompt-preview">
              <div class="preview-title">当前插槽块发送内容</div>
              <div class="preview-content scrollable-preview">{{ getSectionPreviewText(section.rawText) }}</div>
            </div>
          </el-popover>
        </div>
      </template>
    </div>

    <PromptPreviewDialog
      v-model="previewVisible"
      :title="previewTitle"
      :content="previewContent"
    />
  </div>
</template>

<style scoped>
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
  position: relative;
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

.section-remove-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  z-index: 2;
}

.tags-container-dashed:hover .section-remove-btn {
  opacity: 1;
}

.section-remove-btn:hover {
  color: #ef4444;
  background: #f1f5f9;
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

.section-search-btn {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  z-index: 2;
}

.tags-container-dashed:hover .section-search-btn {
  opacity: 1;
}

.section-search-btn:hover {
  color: #6366f1;
  background: #f1f5f9;
}

.scrollable-preview {
  max-height: 250px;
  overflow-y: auto;
  white-space: pre-wrap;
  font-size: 12px;
  color: #4b5563;
  line-height: 1.5;
  word-break: break-all;
  padding-right: 4px;
}

.plain-text-display-val {
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
  cursor: pointer;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 6px 10px;
  border-radius: 6px;
  transition: background-color 0.2s, color 0.2s;
  display: block;
  width: 100%;
  box-sizing: border-box;
  text-align: left;
}

.plain-text-display-val:hover {
  background-color: #f1f5f9;
  color: #1e293b;
}

:deep(.plain-text-el-textarea) {
  width: 100%;
}

:deep(.plain-text-el-textarea .el-textarea__inner) {
  font-size: 13px;
  color: #334155;
  line-height: 1.6;
  border: 1px solid #dcdfe6 !important;
  box-shadow: none !important;
  background: #fff !important;
  padding: 6px 10px !important;
  resize: none !important;
  border-radius: 6px !important;
  font-family: inherit !important;
  text-align: left;
}

:deep(.plain-text-el-textarea .el-textarea__inner:focus) {
  border-color: #8b5cf6 !important;
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.1) !important;
}
</style>
