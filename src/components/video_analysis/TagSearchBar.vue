<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'

export type TokenJoin = 'AND' | 'OR'

export type SearchToken = {
  id: string
  text: string
  join?: TokenJoin // join with previous token (ignored for first)
  not?: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue: SearchToken[]
    fuzzy?: boolean
    placeholder?: string
    maxPreviewChars?: number
    radius?: string
  }>(),
  {
    modelValue: () => [],
    fuzzy: false,
    placeholder: '输入标签回车添加；空格可分词',
    maxPreviewChars: 6,
    radius: '999px',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: SearchToken[]): void
  (e: 'update:fuzzy', v: boolean): void
}>()

const inputText = ref('')
const editing = ref<SearchToken | null>(null)
const editorOpen = ref(false)
const popoverAnchor = ref<HTMLElement | null>(null)

const tokens = computed(() => props.modelValue ?? [])

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeTokens(s: string) {
  return String(s)
    .split(/[\s,，;；]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function addFromInput() {
  const raw = inputText.value.trim()
  if (!raw) return

  const parts = normalizeTokens(raw)
  const next: SearchToken[] = [...tokens.value]
  for (const p of parts) {
    next.push({
      id: uid(),
      text: p,
      join: next.length === 0 ? 'AND' : 'AND',
      not: false,
    })
  }
  emit('update:modelValue', next)
  inputText.value = ''
}

function removeToken(id: string) {
  const next = tokens.value.filter((t) => t.id !== id)
  emit('update:modelValue', next)
}

function openEditor(e: MouseEvent, t: SearchToken) {
  popoverAnchor.value = e.currentTarget as HTMLElement
  editing.value = { ...t }
  editorOpen.value = true
}

function saveEditor() {
  if (!editing.value) return
  const t = editing.value
  const text = t.text.trim()
  if (!text) {
    ElMessage.warning('内容不能为空')
    return
  }
  const next = tokens.value.map((x) => (x.id === t.id ? { ...t, text } : x))
  emit('update:modelValue', next)
  editorOpen.value = false
}

function previewText(t: SearchToken) {
  const s = t.text ?? ''
  const max = props.maxPreviewChars
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function tagType(t: SearchToken): 'primary' | 'success' | 'danger' | 'info' {
  if (t.not) return 'danger'
  // >=10 chars => treat as natural language (different color)
  if ((t.text ?? '').trim().length >= 10) return 'info'
  if ((t.join ?? 'AND') === 'OR') return 'success'
  return 'primary'
}

function toggleFuzzy() {
  emit('update:fuzzy', !props.fuzzy)
}
</script>

<template>
  <div class="searchbar">
    <div class="token-box">
      <el-tag
        v-for="(t, idx) in tokens"
        :key="t.id"
        :type="tagType(t)"
        effect="plain"
        :round="true"
        class="token"
        :style="{ borderRadius: radius }"
        @click="(e) => openEditor(e, t)"
      >
        <span v-if="idx !== 0" class="join">{{ t.join ?? 'AND' }}</span>
        <span v-if="t.not" class="not">NOT</span>
        <el-tooltip :content="t.text" placement="top" :show-after="350">
          <span class="txt">{{ previewText(t) }}</span>
        </el-tooltip>
        <el-icon class="x" @click.stop="removeToken(t.id)"><i-ep-close /></el-icon>
      </el-tag>

      <el-input
        v-model="inputText"
        :placeholder="placeholder"
        class="inp"
        @keydown.enter.prevent="addFromInput"
      />

      <el-tag
        :type="fuzzy ? 'warning' : 'success'"
        effect="dark"
        size="small"
        round
        class="toggle"
        @click="toggleFuzzy"
      >
        <el-icon class="ic">
          <i-ep-magic-stick v-if="fuzzy" />
          <i-ep-aim v-else />
        </el-icon>
        {{ fuzzy ? '模糊检索' : '精准匹配' }}
      </el-tag>
    </div>

    <el-popover
      v-model:visible="editorOpen"
      placement="bottom-start"
      :width="360"
      trigger="manual"
      :virtual-ref="popoverAnchor"
      virtual-triggering
    >

      <div v-if="editing" class="editor">
        <div class="row">
          <span class="lab">逻辑</span>
          <el-checkbox v-model="editing.not" label="NOT" />
        </div>

        <div class="row">
          <span class="lab">连接</span>
          <el-segmented
            v-model="editing.join"
            :options="['AND', 'OR']"
            size="small"
            style="width: 160px"
          />
        </div>

        <div class="row">
          <span class="lab">内容</span>
          <el-input v-model="editing.text" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" />
        </div>

        <div class="btns">
          <el-button size="small" @click="editorOpen = false">取消</el-button>
          <el-button size="small" type="primary" @click="saveEditor">保存</el-button>
        </div>
      </div>
    </el-popover>
  </div>
</template>

<style scoped>
.searchbar {
  display: block;
}

.token-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  min-height: 40px;
}

.token {
  cursor: pointer;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ensure tag content vertically centered */
.token :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.join {
  font-size: 11px;
  opacity: 0.75;
  line-height: 1;
}

.not {
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.txt {
  max-width: 92px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1;
}

.x {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.token:hover .x {
  opacity: 0.65;
}

.inp {
  flex: 1;
  min-width: 180px;
}

.inp :deep(.el-input__wrapper) {
  box-shadow: none !important;
  border: none !important;
  background: transparent;
}

.toggle {
  cursor: pointer;
  user-select: none;
}

.ic {
  margin-right: 6px;
}

.editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lab {
  width: 48px;
  color: #6b7280;
  font-size: 12px;
}

.btns {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>

