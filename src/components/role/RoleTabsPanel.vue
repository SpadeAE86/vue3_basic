<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import MarkdownIt from 'markdown-it'

const props = defineProps<{
  roleId: string
  voiceConfigured: boolean
  voiceCharacter: string
  userSettings: string
  identityContent: string
  soulContent: string
  habbitContent: string
  saveLoading: boolean
  roleDescription?: string
  roleTags?: string[]
}>()

const emit = defineEmits<{
  (e: 'update:userSettings', val: string): void
  (e: 'update:identityContent', val: string): void
  (e: 'update:soulContent', val: string): void
  (e: 'update:habbitContent', val: string): void
  (e: 'save-file', filename: string, content: string): void
}>()

const activeTab = ref('settings')

const md = new MarkdownIt({ html: true, linkify: true, typographer: true })

const isEditingSettings = ref(false)
const isEditingIdentity = ref(false)
const isEditingSoul = ref(false)

watch(() => props.userSettings, (newVal) => {
  if (!newVal) isEditingSettings.value = true
}, { immediate: true })

// ─── Habit (角色台词) ─────────────────────────────────────────────────────
const DEFAULT_HABBIT_KEYS = ['早安', '自我介绍', '休闲', '帮助', '担心', '生气', '晚安']

interface HabitLine {
  key: string
  value: string
  isDefault: boolean
}

const habbitLines = ref<HabitLine[]>([])
const hoveredIdx = ref<number | null>(null)
const activeEditIdx = ref<number | null>(null)

// Ghost slot state
const ghostActive = ref(false)
const ghostKey = ref('')
const ghostValue = ref('')
const ghostKeyInputRef = ref<HTMLInputElement | null>(null)
const ghostValueInputRef = ref<HTMLInputElement | null>(null)

// TTS preview state
const previewingIdx = ref<number | null>(null)
let currentAudio: HTMLAudioElement | null = null

function parseHabbitMarkdown(md_text: string): HabitLine[] {
  const lines: HabitLine[] = []
  const keysSeen = new Set<string>()

  function normalize(k: string): string {
    return k.replace(/[\s\(\)（）\-\_\*]/g, '').trim()
  }

  if (md_text.trim()) {
    const regex = /^-\s+\*\*(.+?)\*\*[:：]\s*(.*)/
    for (const line of md_text.split('\n')) {
      const match = line.match(regex)
      if (match) {
        const rawKey = match[1]!.trim()
        const value = match[2]!.trim()
        const normKey = normalize(rawKey)

        const matchedDefault = DEFAULT_HABBIT_KEYS.find(dk => normalize(dk) === normKey)
        const key = matchedDefault || rawKey
        const normKeyToUse = normalize(key)

        if (!keysSeen.has(normKeyToUse)) {
          keysSeen.add(normKeyToUse)
          lines.push({ key, value, isDefault: !!matchedDefault })
        }
      }
    }
  }

  const result: HabitLine[] = []
  for (const dk of DEFAULT_HABBIT_KEYS) {
    const found = lines.find(l => normalize(l.key) === normalize(dk))
    result.push(found ?? { key: dk, value: '', isDefault: true })
  }
  for (const l of lines) {
    if (!l.isDefault) result.push(l)
  }
  return result
}

function serializeHabbitLines(lines: HabitLine[]): string {
  return lines.filter(l => l.key.trim()).map(l => `- **${l.key}**: ${l.value}`).join('\n')
}

watch(() => props.habbitContent, (newVal) => {
  habbitLines.value = parseHabbitMarkdown(newVal)
}, { immediate: true })

watch(activeTab, () => {
  activeEditIdx.value = null
})

watch(activeEditIdx, async (newIdx) => {
  if (newIdx !== null) {
    await nextTick()
    setTimeout(() => {
      const activeTextarea = document.querySelector(`.habbit-row[data-idx="${newIdx}"] .habbit-value-textarea`) as HTMLTextAreaElement | null
      if (activeTextarea) {
        activeTextarea.focus()
        activeTextarea.style.height = 'auto'
        activeTextarea.style.height = activeTextarea.scrollHeight + 'px'
      }
    }, 50)
  }
})

function saveHabbit() {
  const content = serializeHabbitLines(habbitLines.value)
  emit('update:habbitContent', content)
  emit('save-file', 'HABIT.md', content)
  delete originalContents.value['habbit']
}

function handleSaveTab(filename: string, content: string, tabName: string) {
  emit('save-file', filename, content)
  delete originalContents.value[tabName]
}

function adjustTextareaHeight(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function removeCustomLine(idx: number) {
  habbitLines.value.splice(idx, 1)
}

// Ghost slot actions
async function activateGhost() {
  activeEditIdx.value = null
  ghostActive.value = true
  ghostKey.value = ''
  ghostValue.value = ''
  await nextTick()
  ghostKeyInputRef.value?.focus()
}

async function focusGhostValue() {
  await nextTick()
  ghostValueInputRef.value?.focus()
}

function commitGhost() {
  const key = ghostKey.value.trim()
  if (!key) { cancelGhost(); return }
  if (habbitLines.value.some(l => l.key === key)) {
    ElMessage.warning('已存在该台词场景')
    return
  }
  habbitLines.value.push({ key, value: ghostValue.value, isDefault: false })
  ghostActive.value = false
  ghostKey.value = ''
  ghostValue.value = ''
}

function cancelGhost() {
  ghostActive.value = false
  ghostKey.value = ''
  ghostValue.value = ''
}

// TTS Preview via SSE
async function handlePreviewLine(line: HabitLine, idx: number) {
  if (!props.voiceConfigured || !line.value.trim()) return

  // Stop any playing audio
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  if (previewingIdx.value === idx) {
    previewingIdx.value = null
    return
  }

  previewingIdx.value = idx
  const audioChunks: Uint8Array[] = []

  try {
    const response = await fetch('/api/chat/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: line.value.trim(),
        voice: props.voiceCharacter,
        speed: 1.0,
        byte_stream: true
      })
    })

    if (!response.ok || !response.body) {
      ElMessage.error('TTS 请求失败')
      previewingIdx.value = null
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const rawLine of lines) {
        if (!rawLine.startsWith('data: ')) continue
        const payload = rawLine.slice(6).trim()
        if (payload === '[DONE]') break
        try {
          const evt = JSON.parse(payload)
          if (evt.event_type === 'voice_chunk' && evt.data_type === 'base64' && evt.data) {
            const bytes = Uint8Array.from(atob(evt.data), c => c.charCodeAt(0))
            audioChunks.push(bytes)
          } else if (evt.event_type === 'audio_chunk' && evt.audio_base64) {
            const bytes = Uint8Array.from(atob(evt.audio_base64), c => c.charCodeAt(0))
            audioChunks.push(bytes)
          }
        } catch { /* skip */ }
      }
    }

    if (audioChunks.length === 0) {
      ElMessage.warning('未收到音频数据')
      previewingIdx.value = null
      return
    }

    const totalLen = audioChunks.reduce((s, c) => s + c.length, 0)
    const merged = new Uint8Array(totalLen)
    let offset = 0
    for (const chunk of audioChunks) { merged.set(chunk, offset); offset += chunk.length }

    const blob = new Blob([merged], { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    currentAudio = new Audio(url)
    currentAudio.onended = () => {
      previewingIdx.value = null
      URL.revokeObjectURL(url)
    }
    currentAudio.onerror = () => {
      previewingIdx.value = null
      ElMessage.error('音频播放失败')
    }
    await currentAudio.play()
  } catch (e) {
    ElMessage.error('试听请求发生异常')
    previewingIdx.value = null
  }
}

// ─── Magic Wand ──────────────────────────────────────────────────────────────
const isCalibrating = ref(false)
const originalContents = ref<Record<string, string | HabitLine[]>>({})
const hasUndoState = computed(() => activeTab.value in originalContents.value)

const wandEnabled = computed(() => {
  if (activeTab.value === 'settings') {
    return props.roleDescription && props.roleDescription.trim().length > 0
  }
  return ['identity', 'soul', 'habit'].includes(activeTab.value) && props.userSettings.trim().length > 0
})

async function handleCalibrate() {
  const tab = activeTab.value
  if (tab === 'settings') {
    if (!props.roleDescription || !props.roleDescription.trim()) { ElMessage.warning('请先填写角色简介'); return }
  } else {
    if (!props.userSettings.trim()) { ElMessage.warning('请先填写角色人设'); return }
  }

  activeEditIdx.value = null
  let currentContent = ''
  if (tab === 'settings') currentContent = props.userSettings
  else if (tab === 'identity') currentContent = props.identityContent
  else if (tab === 'soul') currentContent = props.soulContent
  else if (tab === 'habit') currentContent = serializeHabbitLines(habbitLines.value)
  else return

  if (tab === 'habit') originalContents.value[tab] = JSON.parse(JSON.stringify(habbitLines.value))
  else originalContents.value[tab] = currentContent

  isCalibrating.value = true
  try {
    const resp = await fetch(`/api/chat/roles/${props.roleId}/calibrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_settings: props.userSettings,
        tab_name: tab,
        current_content: currentContent,
        role_description: props.roleDescription || '',
        role_tags: props.roleTags || []
      })
    })
    const data = await resp.json()
    if (data.ok) {
      const calibrated: string = data.calibrated_content
      if (tab === 'settings') emit('update:userSettings', calibrated)
      else if (tab === 'identity') emit('update:identityContent', calibrated)
      else if (tab === 'soul') emit('update:soulContent', calibrated)
      else if (tab === 'habit') {
        habbitLines.value = parseHabbitMarkdown(calibrated)
        emit('update:habbitContent', calibrated)
      }
      ElMessage.success('AI 校准完成，可点击撤回恢复原版内容')
    } else {
      delete originalContents.value[tab]
      ElMessage.error(data.error || 'AI 校准失败')
    }
  } catch {
    delete originalContents.value[tab]
    ElMessage.error('请求 AI 校准接口发生异常')
  } finally {
    isCalibrating.value = false
  }
}

function handleUndo() {
  const tab = activeTab.value
  activeEditIdx.value = null
  const backup = originalContents.value[tab]
  if (backup === undefined) return
  if (tab === 'settings') emit('update:userSettings', backup as string)
  else if (tab === 'identity') emit('update:identityContent', backup as string)
  else if (tab === 'soul') emit('update:soulContent', backup as string)
  else if (tab === 'habit') {
    habbitLines.value = backup as HabitLine[]
    emit('update:habbitContent', serializeHabbitLines(habbitLines.value))
  }
  delete originalContents.value[tab]
  ElMessage.success('已撤回到 AI 校准前的内容')
}
</script>

<template>
  <div class="role-body-card">
    <!-- 魔棒工具栏 -->
    <div class="wand-toolbar">
      <transition name="undo-fade">
        <el-button
          v-if="hasUndoState && !isCalibrating"
          class="undo-btn"
          size="small"
          plain
          @click="handleUndo"
        >
          <el-icon style="margin-right: 4px"><i-ep-refresh-left /></el-icon>
          撤回
        </el-button>
      </transition>
      <el-tooltip
        :content="wandEnabled ? (activeTab === 'settings' ? '根据角色简介和标签快速生成/校准角色人设' : '根据角色人设 AI 校准当前页签内容') : (activeTab === 'settings' ? '请先在上方填写「角色简介」以启用' : '请先在「角色人设」页签填写内容以启用')"
        placement="top"
      >
        <el-button
          class="wand-btn"
          :class="{ 'wand-btn--active': wandEnabled }"
          :disabled="!wandEnabled || isCalibrating"
          :loading="isCalibrating"
          size="small"
          circle
          @click="handleCalibrate"
        >
          <el-icon v-if="!isCalibrating"><i-ep-magic-stick /></el-icon>
        </el-button>
      </el-tooltip>
    </div>

    <el-tabs v-model="activeTab" class="role-tabs">

      <!-- 角色人设 Tab -->
      <el-tab-pane label="角色人设" name="settings">
        <div class="tab-content">
          <div class="tab-header-row">
            <p class="tab-tip">💡 这部分由你（用户）来手写定义，用来定制你的 AI 伙伴扮演什么角色、有什么性格或偏好。</p>
            <el-button size="small" type="primary" plain @click="isEditingSettings = !isEditingSettings" class="toggle-edit-btn">
              <el-icon style="margin-right: 4px">
                <i-ep-edit v-if="!isEditingSettings" />
                <i-ep-view v-else />
              </el-icon>
              {{ isEditingSettings ? '预览效果' : '编辑内容' }}
            </el-button>
          </div>
          <template v-if="isEditingSettings">
            <el-input :model-value="props.userSettings" @input="emit('update:userSettings', $event)" type="textarea" :rows="15" placeholder="请输入你想定义的人设内容 (支持 Markdown 格式)..." />
            <div class="save-actions">
              <el-button type="primary" :loading="props.saveLoading" @click="handleSaveTab('USER_SETTINGS.md', props.userSettings, 'settings')">保存人设</el-button>
            </div>
          </template>
          <template v-else>
            <div v-if="props.userSettings" v-html="md.render(props.userSettings)" class="markdown-preview"></div>
            <div v-else class="markdown-empty"><span>暂无人设内容，点击右上角"编辑内容"进行填写。</span></div>
          </template>
        </div>
      </el-tab-pane>

      <!-- 角色身份 Tab -->
      <el-tab-pane label="角色身份" name="identity">
        <div class="tab-content">
          <div class="tab-header-row">
            <p class="tab-tip">🤖 这是 AI 在跟你聊天的过程中，自己维护并持续补充的身份特征。你也可以手动进行修改。</p>
            <el-button size="small" type="primary" plain @click="isEditingIdentity = !isEditingIdentity" class="toggle-edit-btn">
              <el-icon style="margin-right: 4px">
                <i-ep-edit v-if="!isEditingIdentity" />
                <i-ep-view v-else />
              </el-icon>
              {{ isEditingIdentity ? '预览效果' : '编辑内容' }}
            </el-button>
          </div>
          <template v-if="isEditingIdentity">
            <el-input :model-value="props.identityContent" @input="emit('update:identityContent', $event)" type="textarea" :rows="15" placeholder="请输入角色身份特征内容 (支持 Markdown 格式)..." />
            <div class="save-actions">
              <el-button type="primary" :loading="props.saveLoading" @click="handleSaveTab('IDENTITY.md', props.identityContent, 'identity')">保存身份</el-button>
            </div>
          </template>
          <template v-else>
            <div v-if="props.identityContent" v-html="md.render(props.identityContent)" class="markdown-preview"></div>
            <div v-else class="markdown-empty"><span>暂无身份特征信息，点击右上角"编辑内容"进行填写。</span></div>
          </template>
        </div>
      </el-tab-pane>

      <!-- 行为准则 Tab -->
      <el-tab-pane label="行为准则" name="soul">
        <div class="tab-content">
          <div class="tab-header-row">
            <p class="tab-tip">🧠 这是 AI 伙伴的核心运转灵魂约束与安全规范要求。你也可以手动进行修改。</p>
            <el-button size="small" type="primary" plain @click="isEditingSoul = !isEditingSoul" class="toggle-edit-btn">
              <el-icon style="margin-right: 4px">
                <i-ep-edit v-if="!isEditingSoul" />
                <i-ep-view v-else />
              </el-icon>
              {{ isEditingSoul ? '预览效果' : '编辑内容' }}
            </el-button>
          </div>
          <template v-if="isEditingSoul">
            <el-input :model-value="props.soulContent" @input="emit('update:soulContent', $event)" type="textarea" :rows="15" placeholder="请输入行为准则与灵魂规范内容 (支持 Markdown 格式)..." />
            <div class="save-actions">
              <el-button type="primary" :loading="props.saveLoading" @click="handleSaveTab('SOUL.md', props.soulContent, 'soul')">保存准则</el-button>
            </div>
          </template>
          <template v-else>
            <div v-if="props.soulContent" v-html="md.render(props.soulContent)" class="markdown-preview"></div>
            <div v-else class="markdown-empty"><span>暂无行为准则规范，点击右上角"编辑内容"进行填写。</span></div>
          </template>
        </div>
      </el-tab-pane>

      <!-- 角色台词 Tab -->
      <el-tab-pane label="角色台词" name="habbit">
        <div class="tab-content">
          <div class="tab-header-row">
            <p class="tab-tip">🎭 定义各场景下的角色台词，让 AI 在特定时刻（如问候、自我介绍等）说出符合性格的话。</p>
          </div>

          <!-- 台词卡片流 -->
          <div class="habbit-list">
            <!-- 已有台词行 -->
            <div
              v-for="(line, idx) in habbitLines"
              :key="line.key"
              class="habbit-row"
              :class="{ 'habbit-row--expanded': activeEditIdx === idx }"
              :data-idx="idx"
              @mouseenter="hoveredIdx = idx"
              @mouseleave="hoveredIdx = null"
              @click="activeEditIdx = idx"
            >
              <!-- 收起状态 -->
              <template v-if="activeEditIdx !== idx">
                <div class="habbit-tag" :class="{ 'habbit-tag--default': line.isDefault, 'habbit-tag--custom': !line.isDefault }">
                  <span class="habbit-tag-text">{{ line.key }}</span>
                </div>
                <div class="habbit-divider"></div>
                <div class="habbit-value-preview">
                  <span v-if="line.value">{{ line.value.length > 50 ? line.value.slice(0, 50) + '...' : line.value }}</span>
                  <span v-else class="habbit-value-placeholder">点击填写「{{ line.key || '场景' }}」台词...</span>
                </div>
                <transition name="actions-fade">
                  <div v-show="hoveredIdx === idx" class="habbit-row-actions">
                    <!-- 朗读按钮：有音色才亮起 -->
                    <el-tooltip
                      :content="voiceConfigured ? (previewingIdx === idx ? '停止试听' : '试听台词') : '请先配置音色'"
                      placement="top"
                    >
                      <button
                        class="habbit-action-btn"
                        :class="{
                          'habbit-action-btn--speaker': true,
                          'habbit-action-btn--speaker-active': voiceConfigured && previewingIdx !== idx,
                          'habbit-action-btn--speaker-playing': previewingIdx === idx,
                          'habbit-action-btn--disabled': !voiceConfigured
                        }"
                        @click.stop="handlePreviewLine(line, idx)"
                      >
                        <el-icon>
                          <i-ep-video-pause v-if="previewingIdx === idx" />
                          <i-ep-headset v-else />
                        </el-icon>
                      </button>
                    </el-tooltip>
                    <!-- 删除按钮：仅自定义场景 -->
                    <el-tooltip v-if="!line.isDefault" content="删除此台词" placement="top">
                      <button class="habbit-action-btn habbit-action-btn--danger" @click.stop="removeCustomLine(idx)">
                        <el-icon><i-ep-delete /></el-icon>
                      </button>
                    </el-tooltip>
                  </div>
                </transition>
              </template>

              <!-- 展开态 -->
              <template v-else>
                <div class="habbit-tag" :class="{ 'habbit-tag--default': line.isDefault, 'habbit-tag--custom': !line.isDefault }">
                  <span v-if="line.isDefault" class="habbit-tag-text">{{ line.key }}</span>
                  <input
                    v-else
                    v-model="line.key"
                    class="habbit-tag-editable"
                    :placeholder="'场景名'"
                    :size="Math.max(3, line.key.length || 4)"
                    @click.stop
                  />
                </div>
                <div class="habbit-divider"></div>
                <div class="textarea-wrapper" @click.stop>
                  <textarea
                    v-model="line.value"
                    class="habbit-value-textarea"
                    :placeholder="`填写「${line.key || '场景'}」台词...`"
                    maxlength="500"
                    @input="adjustTextareaHeight"
                    @focus="adjustTextareaHeight"
                  ></textarea>
                  <span class="word-limit-counter">{{ line.value?.length || 0 }}/500</span>
                </div>
                <div class="habbit-row-actions habbit-row-actions--visible" @click.stop>
                  <!-- 朗读按钮：有音色才亮起 -->
                  <el-tooltip
                    :content="voiceConfigured ? (previewingIdx === idx ? '停止试听' : '试听台词') : '请先配置音色'"
                    placement="top"
                  >
                    <button
                      class="habbit-action-btn"
                      :class="{
                        'habbit-action-btn--speaker': true,
                        'habbit-action-btn--speaker-active': voiceConfigured && previewingIdx !== idx,
                        'habbit-action-btn--speaker-playing': previewingIdx === idx,
                        'habbit-action-btn--disabled': !voiceConfigured
                      }"
                      @click="handlePreviewLine(line, idx)"
                    >
                      <el-icon>
                        <i-ep-video-pause v-if="previewingIdx === idx" />
                        <i-ep-headset v-else />
                      </el-icon>
                    </button>
                  </el-tooltip>
                  <!-- 删除按钮：仅自定义场景 -->
                  <el-tooltip v-if="!line.isDefault" content="删除此台词" placement="top">
                    <button class="habbit-action-btn habbit-action-btn--danger" @click="removeCustomLine(idx)">
                      <el-icon><i-ep-delete /></el-icon>
                    </button>
                  </el-tooltip>
                </div>
              </template>
            </div>

            <!-- 虚线空槽（Ghost Slot） -->
            <template v-if="!ghostActive">
              <div class="habbit-ghost-slot" @click="activateGhost">
                <el-icon class="ghost-plus-icon"><i-ep-plus /></el-icon>
                <span class="ghost-text">点击添加自定义台词场景...</span>
              </div>
            </template>
            <template v-else>
              <div class="habbit-row habbit-row--ghost">
                <div class="habbit-tag habbit-tag--custom">
                  <input
                    ref="ghostKeyInputRef"
                    v-model="ghostKey"
                    class="habbit-tag-editable"
                    placeholder="场景名"
                    :size="Math.max(3, ghostKey.length || 4)"
                    @keydown.tab.prevent="focusGhostValue"
                    @keydown.enter="focusGhostValue"
                    @keydown.escape="cancelGhost"
                  />
                </div>
                <div class="habbit-divider"></div>
                <input
                  ref="ghostValueInputRef"
                  v-model="ghostValue"
                  class="habbit-value-input"
                  :placeholder="ghostKey ? `填写「${ghostKey}」台词...` : '先在左侧输入场景名称'"
                  @keydown.enter="commitGhost"
                  @keydown.escape="cancelGhost"
                />
                <div class="habbit-row-actions habbit-row-actions--visible">
                  <el-tooltip content="确认添加 (Enter)" placement="top">
                    <button class="habbit-action-btn habbit-action-btn--confirm" @click="commitGhost">
                      <el-icon><i-ep-check /></el-icon>
                    </button>
                  </el-tooltip>
                  <el-tooltip content="取消" placement="top">
                    <button class="habbit-action-btn habbit-action-btn--cancel" @click="cancelGhost">
                      <el-icon><i-ep-close /></el-icon>
                    </button>
                  </el-tooltip>
                </div>
              </div>
            </template>
          </div>

          <div class="save-actions">
            <el-button type="primary" :loading="props.saveLoading" @click="saveHabbit">保存台词</el-button>
          </div>
        </div>
      </el-tab-pane>

    </el-tabs>
  </div>
</template>

<style scoped>
.role-body-card {
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid #ebeef5;
  box-shadow: 0 4px 16px rgba(148, 163, 184, 0.05);
  padding: 24px;
  position: relative;
}

/* ─── 魔棒工具栏 ─── */
.wand-toolbar {
  position: absolute;
  top: 22px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 10;
}

.wand-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  padding: 0;
  font-size: 14px;
  color: #94a3b8;
  border-color: #e2e8f0;
  background: #f8fafc;
  transition: all 0.2s ease;
}
.wand-btn:not(:disabled):hover { color: #6366f1; border-color: #a5b4fc; background: #eef2ff; }
.wand-btn--active { color: #6366f1 !important; border-color: #a5b4fc !important; background: #eef2ff !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }

.undo-btn { height: 28px; font-size: 12px; padding: 0 10px; color: #f59e0b; border-color: #fde68a; background: #fffbeb; }
.undo-btn:hover { color: #d97706; border-color: #fbbf24; background: #fef3c7; }

.undo-fade-enter-active, .undo-fade-leave-active { transition: all 0.2s ease; }
.undo-fade-enter-from, .undo-fade-leave-to { opacity: 0; transform: translateX(6px); }

/* ─── Tabs ─── */
.role-tabs :deep(.el-tabs__item) { font-size: 14px; font-weight: 600; }

.tab-content { display: flex; flex-direction: column; gap: 16px; padding-top: 10px; }
.tab-header-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.tab-tip { flex: 1; font-size: 12px; color: #475569; background: #f8fafc; padding: 10px 16px; border-radius: 8px; margin: 0; border-left: 4px solid #6366f1; }
.toggle-edit-btn { flex-shrink: 0; height: 32px; }
.save-actions { display: flex; justify-content: flex-end; }

/* ─── 台词卡片流 ─── */
.habbit-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.habbit-row {
  display: flex;
  align-items: center;
  border: 1.5px solid #e8edf5;
  border-radius: 10px;
  background: #fafbfe;
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  min-height: 42px;
}

.habbit-row:hover {
  border-color: #c7d2fe;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
  background: #fdfdff;
}

.habbit-row--expanded {
  border-color: #6366f1 !important;
  background: #ffffff !important;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.12) !important;
  align-items: stretch !important;
}

.habbit-value-preview {
  flex: 1;
  padding: 10px 12px;
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
  cursor: text;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  text-align: left;
}

.habbit-value-placeholder {
  color: #94a3b8;
  font-style: italic;
}

.habbit-value-textarea {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  padding: 10px 12px;
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
  min-width: 0;
  resize: none;
  font-family: inherit;
  overflow: hidden;
}

.textarea-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
}

.word-limit-counter {
  align-self: flex-end;
  font-size: 10px;
  color: #94a3b8;
  padding-right: 12px;
  padding-bottom: 6px;
  pointer-events: none;
  user-select: none;
}

.habbit-row--ghost {
  border-style: dashed;
  border-color: #c7d2fe;
  background: #f5f7ff;
}

/* 场景标签 */
.habbit-tag {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  min-width: 64px;
  flex-shrink: 0;
  align-self: stretch;
}

.habbit-tag--default {
  background: linear-gradient(135deg, #eef2ff, #f0f9ff);
}

.habbit-tag--custom {
  background: linear-gradient(135deg, #fdf4ff, #f5f3ff);
}

.habbit-tag-text {
  font-size: 13px;
  font-weight: 700;
  color: #4f46e5;
  white-space: nowrap;
  letter-spacing: 0.5px;
}

.habbit-tag-editable {
  font-size: 13px;
  font-weight: 700;
  color: #7c3aed;
  background: transparent;
  border: none;
  outline: none;
  min-width: 40px;
  max-width: 100px;
  text-align: center;
  caret-color: #7c3aed;
}
.habbit-tag-editable::placeholder { color: #c4b5fd; font-weight: 400; }

/* 分割线 */
.habbit-divider {
  width: 1px;
  align-self: stretch;
  background: #e2e8f0;
  flex-shrink: 0;
}

/* 台词内容输入 */
.habbit-value-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  padding: 10px 12px;
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
  min-width: 0;
}
.habbit-value-input::placeholder { color: #b0bec5; }

/* Hover 操作区 */
.habbit-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  flex-shrink: 0;
}
.habbit-row-actions--visible { opacity: 1; }

.habbit-action-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.15s ease;
  background: transparent;
  color: #94a3b8;
  padding: 0;
}

/* 朗读按钮 */
.habbit-action-btn--speaker { color: #94a3b8; }
.habbit-action-btn--speaker-active { color: #6366f1; }
.habbit-action-btn--speaker-active:hover { background: #eef2ff; color: #4f46e5; }
.habbit-action-btn--speaker-playing {
  color: #6366f1;
  background: #eef2ff;
  animation: pulse-ring 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.habbit-action-btn--disabled { color: #e2e8f0; cursor: not-allowed; }

/* 删除按钮 */
.habbit-action-btn--danger:hover { background: #fee2e2; color: #ef4444; }

/* 确认/取消按钮 (ghost slot) */
.habbit-action-btn--confirm { color: #10b981; }
.habbit-action-btn--confirm:hover { background: #d1fae5; color: #059669; }
.habbit-action-btn--cancel { color: #94a3b8; }
.habbit-action-btn--cancel:hover { background: #f1f5f9; color: #475569; }

/* actions 淡入淡出 */
.actions-fade-enter-active, .actions-fade-leave-active { transition: opacity 0.15s ease; }
.actions-fade-enter-from, .actions-fade-leave-to { opacity: 0; }

/* 播放动画 */
@keyframes pulse-ring {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

/* ─── 虚线空槽 ─── */
.habbit-ghost-slot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1.5px dashed #d1d5db;
  border-radius: 10px;
  color: #94a3b8;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 2px;
  min-height: 42px;
}
.habbit-ghost-slot:hover {
  border-color: #a5b4fc;
  color: #6366f1;
  background: #f5f7ff;
}

.ghost-plus-icon { font-size: 14px; color: inherit; }
.ghost-text { font-size: 13px; }

/* ─── Markdown 预览 ─── */
.markdown-preview { padding: 8px 4px; overflow-y: auto; }
.markdown-preview :deep(h1), .markdown-preview :deep(h2), .markdown-preview :deep(h3) { margin-top: 16px; margin-bottom: 10px; font-weight: 600; color: #0f172a; }
.markdown-preview :deep(h1) { font-size: 17px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
.markdown-preview :deep(h2) { font-size: 15px; }
.markdown-preview :deep(h3) { font-size: 14px; }
.markdown-preview :deep(p) { margin-top: 0; margin-bottom: 10px; line-height: 1.6; color: #334155; font-size: 13.5px; }
.markdown-preview :deep(ul), .markdown-preview :deep(ol) { margin-top: 0; margin-bottom: 10px; padding-left: 20px; }
.markdown-preview :deep(li) { margin-bottom: 6px; line-height: 1.5; color: #334155; font-size: 13.5px; }
.markdown-preview :deep(code) { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 12px; color: #ea580c; }
.markdown-preview :deep(pre) { background: #f8fafc; padding: 14px; border-radius: 8px; overflow-x: auto; border: 1px solid #e2e8f0; margin-bottom: 12px; }
.markdown-preview :deep(pre code) { background: none; padding: 0; color: #334155; }
.markdown-preview :deep(blockquote) { border-left: 4px solid #cbd5e1; padding: 6px 0 6px 14px; color: #64748b; margin: 0 0 12px 0; font-style: italic; background: #f8fafc; }

.markdown-empty { display: flex; align-items: center; justify-content: center; padding: 60px 0; color: #94a3b8; font-size: 13px; border: 1px dashed #e2e8f0; border-radius: 8px; background: #fafbfe; }
</style>
