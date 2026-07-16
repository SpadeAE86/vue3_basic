<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useCollectionsStore } from '@/stores/collections'
import { uploadToObs } from '@/utils/obs'
import CollectionsImportDialog from '@/components/role/CollectionsImportDialog.vue'
import AiGenerateDialog from '@/components/role/AiGenerateDialog.vue'
import { getImageStatusApi } from '@/api/generate'

const route = useRoute()
const router = useRouter()
const collectionsStore = useCollectionsStore()
const itemId = computed(() => route.params.id as string)

// Form states
const title = ref('')
const tags = ref<string[]>([])
const templateText = ref('')
const coverUrl = ref('')
const gallery = ref<{ url: string; filename: string }[]>([])

// UI states
const previewUrl = ref('')
const saveLoading = ref(false)
const isImporting = ref(false)
const collectionsDialogVisible = ref(false)
const aiGenerateDialogVisible = ref(false)

// Dynamic tags input
const inputTagVisible = ref(false)
const newTagValue = ref('')
const tagInputRef = ref<any>(null)

// Title inline editing state
const isEditingTitle = ref(false)
const editTitleValue = ref('')
const titleInputRef = ref<any>(null)

// Textarea variables extraction state
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const editingKey = ref<string | null>(null)
const editingValue = ref('')

// Task polling state for AI generation
const generatingTasks = ref<Array<{ taskId: string; prompt: string }>>([])
const pollingIntervals: Record<string, number> = {}

const item = computed(() => collectionsStore.items.find(i => i.id === itemId.value))

// Load data on start and watch for changes
watch(item, (newVal) => {
  if (newVal) {
    title.value = newVal.title || ''
    tags.value = [...(newVal.tags || [])]
    templateText.value = newVal.data?.template_text || newVal.data?.prompt || ''
    coverUrl.value = newVal.cover_url || ''
    gallery.value = [...(newVal.data?.gallery || [])]
    
    // Default preview: cover_url -> first gallery image -> empty
    if (coverUrl.value) {
      previewUrl.value = coverUrl.value
    } else if (gallery.value.length > 0) {
      previewUrl.value = gallery.value[0]?.url || ''
    } else {
      previewUrl.value = ''
    }
  }
}, { immediate: true })

onMounted(() => {
  if (collectionsStore.items.length === 0) {
    collectionsStore.init()
  }
})

onUnmounted(() => {
  Object.values(pollingIntervals).forEach(clearInterval)
})

// Polling for AI image generation
function handleTaskSubmitted(task: { taskId: string; prompt: string }) {
  generatingTasks.value.push(task)
  startImagePolling(task.taskId)
}

async function startImagePolling(taskId: string) {
  if (pollingIntervals[taskId]) {
    clearInterval(pollingIntervals[taskId])
  }
  
  const startTime = Date.now()
  const MAX_POLLING_TIME = 15 * 60 * 1000 // 15 minutes
  
  const tick = async () => {
    try {
      if (Date.now() - startTime > MAX_POLLING_TIME) {
        clearInterval(pollingIntervals[taskId])
        delete pollingIntervals[taskId]
        generatingTasks.value = generatingTasks.value.filter(t => t.taskId !== taskId)
        ElMessage.error('生图任务超时')
        return
      }
      
      const data = await getImageStatusApi(taskId)
      if (!data.success) {
        clearInterval(pollingIntervals[taskId])
        delete pollingIntervals[taskId]
        generatingTasks.value = generatingTasks.value.filter(t => t.taskId !== taskId)
        ElMessage.error(data.error || '获取生图状态失败')
        return
      }
      
      const st = String(data.status || '').toLowerCase()
      const url = data.url
      
      if (st === 'failed' || st === 'error') {
        clearInterval(pollingIntervals[taskId])
        delete pollingIntervals[taskId]
        generatingTasks.value = generatingTasks.value.filter(t => t.taskId !== taskId)
        ElMessage.error(data.error || '图片生成失败')
        return
      }
      
      if (url) {
        clearInterval(pollingIntervals[taskId])
        delete pollingIntervals[taskId]
        
        try {
          const newImg = {
            url: url,
            filename: `ai_gen_${taskId}_${Math.random().toString(36).substring(2, 7)}.png`
          }
          gallery.value.push(newImg)
          
          if (!coverUrl.value) {
            coverUrl.value = url
            previewUrl.value = url
          }
          await saveChangesSilently()
          ElMessage.success('图片生成成功并存入相册')
        } catch (e) {
          ElMessage.error('添加图片至画廊失败')
        } finally {
          generatingTasks.value = generatingTasks.value.filter(t => t.taskId !== taskId)
        }
      }
    } catch (err) {
      console.error('Polling error for task:', taskId, err)
    }
  }
  
  pollingIntervals[taskId] = window.setInterval(tick, 3000)
  void tick()
}

// Title inline editing functions
function startEditTitle() {
  editTitleValue.value = title.value
  isEditingTitle.value = true
  nextTick(() => {
    titleInputRef.value?.focus()
  })
}

function confirmEditTitle() {
  if (!isEditingTitle.value) return
  const val = editTitleValue.value.trim()
  if (val && val !== title.value) {
    title.value = val
    saveChangesSilently()
  }
  isEditingTitle.value = false
}

// Tag editor functions
function handleRemoveTag(tag: string) {
  tags.value = tags.value.filter(t => t !== tag)
}

function showTagInput() {
  inputTagVisible.value = true
  nextTick(() => {
    tagInputRef.value?.focus()
  })
}

function handleInputTagConfirm() {
  const val = newTagValue.value.trim()
  if (val) {
    if (!tags.value.includes(val)) {
      tags.value.push(val)
    }
  }
  inputTagVisible.value = false
  newTagValue.value = ''
}

// Variables extraction regex & computation
const SLOT_REGEX = /\{([^:]*):\s*([^}]+)\}/g

interface ParsedVar {
  key: string
  defaultValue: string
}

const dialogParsedVariables = computed<ParsedVar[]>(() => {
  const vars: ParsedVar[] = []
  const seenKeys = new Set<string>()
  const regex = new RegExp(SLOT_REGEX)
  let match
  while ((match = regex.exec(templateText.value)) !== null) {
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

// Variables Inline Editing
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
  templateText.value = templateText.value.replace(regex, `{${key}: ${newValue}}`)
  ElMessage.success(`变量 [ ${key || '未命名'} ] 的默认值已更新为 "${newValue}"`)
}

function removeVariableTag(key: string, defaultValue: string) {
  const escapedKey = escapeRegExp(key)
  const escapedVal = escapeRegExp(defaultValue)
  const regex = new RegExp(`\\{${escapedKey}:\\s*${escapedVal}\\}`, 'g')
  templateText.value = templateText.value.replace(regex, defaultValue)
  ElMessage.success(`已删除变量槽位 {${key || '未命名'}}，还原为普通文本`)
}

// Variables extraction common logic
async function extractVariableCommon(start: number, end: number, selectedText: string, textarea: HTMLTextAreaElement) {
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
      
      textarea.focus()
      textarea.setSelectionRange(start, end)
      
      const success = document.execCommand('insertText', false, replacement)
      if (!success) {
        const val = templateText.value
        templateText.value = val.substring(0, start) + replacement + val.substring(end)
      } else {
        templateText.value = textarea.value
      }
      
      ElMessage.success(`成功将 "${selectedText}" 提取为变量槽位 {${key}}`)
    }
  } catch {
    // cancelled
  }
}

async function handleExtractVariable() {
  const textarea = textareaRef.value
  if (!textarea) return
  const start = textarea.selectionStart
  const end = textarea.selectionEnd

  if (start === undefined || end === undefined || start === end) {
    ElMessage.warning('请先在输入框中，用鼠标拖拽选中一段文字作为变量的默认值')
    return
  }

  const selectedText = textarea.value.substring(start, end)
  await extractVariableCommon(start, end, selectedText, textarea)
}

// Selection extraction shortcut '{' supporting Ctrl+Z/Ctrl+Y native undo/redo history
async function handleKeydown(e: KeyboardEvent) {
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
        const val = templateText.value
        templateText.value = val.substring(0, start) + replacement + val.substring(end)
      } else {
        templateText.value = textarea.value
      }
      
      nextTick(() => {
        textarea.focus()
        textarea.setSelectionRange(start + 1, start + 1)
      })
    }
  }
}

// Auto-suggest tags from existing collections
const existingTags = computed(() => {
  const allTags = new Set<string>()
  collectionsStore.items.forEach(i => {
    if (i.tags) {
      i.tags.forEach(t => allTags.add(t))
    }
  })
  return Array.from(allTags)
})

// Image aspect ratio styling gradient helper
function getBackgroundGradient(id: string) {
  if (!id) return 'linear-gradient(135deg, #e0e7ff 0%, #fbcfe8 100%)'
  const gradients = [
    'linear-gradient(135deg, #f5f3ff 0%, #edd8fc 50%, #e0e7ff 100%)',
    'linear-gradient(135deg, #ffedd5 0%, #ffd6e8 100%)',
    'linear-gradient(135deg, #e0f2fe 0%, #e8f2ff 100%)',
    'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
    'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)'
  ]
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % gradients.length
  return gradients[index]
}

// Set cover
async function handleSetCover(url: string) {
  coverUrl.value = url
  await saveChangesSilently()
  ElMessage.success('成功设为提示词封面')
}

// Delete image from gallery
async function handleDeleteGalleryImage(img: any) {
  gallery.value = gallery.value.filter(g => g.filename !== img.filename)
  if (coverUrl.value === img.url) {
    if (gallery.value.length > 0) {
      coverUrl.value = gallery.value[0]?.url || ''
      previewUrl.value = gallery.value[0]?.url || ''
    } else {
      coverUrl.value = ''
      previewUrl.value = ''
    }
  } else if (previewUrl.value === img.url) {
    if (gallery.value.length > 0) {
      previewUrl.value = gallery.value[0]?.url || ''
    } else {
      previewUrl.value = ''
    }
  }
  await saveChangesSilently()
  ElMessage.success('已从相册中删除')
}

// Local upload handler
async function handleUploadLocalFile(uploadFile: any) {
  const rawFile = uploadFile.raw
  if (!rawFile) return
  
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(rawFile.type)) {
    ElMessage.error('图片文件必须是 JPG/PNG/WebP 格式之一')
    return
  }
  if (rawFile.size / 1024 / 1024 > 10) {
    ElMessage.error('图片大小不能超过 10MB')
    return
  }
  
  isImporting.value = true
  try {
    const url = await uploadToObs(rawFile, 'collections_gallery')
    if (!url) throw new Error('上传结果URL为空')
    
    const newImg = {
      url: url,
      filename: `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${rawFile.name.split('.').pop() || 'png'}`
    }
    gallery.value.push(newImg)
    
    if (!coverUrl.value) {
      coverUrl.value = url
      previewUrl.value = url
    }
    await saveChangesSilently()
    ElMessage.success('上传并导入相册成功')
  } catch (err: any) {
    console.error('上传文件失败:', err)
    ElMessage.error(err.message || '上传文件失败')
  } finally {
    isImporting.value = false
  }
}

// Import from collections handler
async function handleImportFromCollections(url: string) {
  if (gallery.value.some(img => img.url === url)) {
    ElMessage.warning('图片已在相册中')
    return
  }
  
  const newImg = {
    url: url,
    filename: `imported_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.png`
  }
  gallery.value.push(newImg)
  
  if (!coverUrl.value) {
    coverUrl.value = url
    previewUrl.value = url
  }
  await saveChangesSilently()
  ElMessage.success('导入相册成功')
}

// Silently save updates
async function saveChangesSilently() {
  try {
    await fetch(`/api/collections/${itemId.value}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.value,
        tags: tags.value,
        cover_url: coverUrl.value,
        template_text: templateText.value,
        gallery: gallery.value
      })
    })
    await collectionsStore.loadCollections()
  } catch (e) {
    console.error('静默保存修改失败:', e)
  }
}

// Explicit manual save
async function handleSaveChanges() {
  saveLoading.value = true
  try {
    const resp = await fetch(`/api/collections/${itemId.value}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.value,
        tags: tags.value,
        cover_url: coverUrl.value,
        template_text: templateText.value,
        gallery: gallery.value
      })
    })
    const res = await resp.json()
    if (res.success) {
      ElMessage.success('保存成功')
      await collectionsStore.loadCollections()
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (e) {
    console.error('保存修改失败:', e)
    ElMessage.error('保存失败，请检查网络连接')
  } finally {
    saveLoading.value = false
  }
}

function goToDiscuss(sessionId: string, roleId: string) {
  router.push(`/chat?role_id=${roleId || 'default'}&session_id=${sessionId}`)
}
</script>

<template>
  <div class="inspiration-space-container">
    <!-- Header Back Navigation -->
    <div class="back-navigation-wrapper">
      <div class="back-navigation-header" @click="router.push('/collections')" title="返回我的收藏">
        <el-icon class="back-icon"><i-ep-arrow-left /></el-icon>
        <span>返回我的收藏</span>
      </div>
    </div>

    <div class="inspiration-space-layout" v-if="item">
      <!-- Left Column: Visual Area (Big Preview & Gallery) -->
      <div class="inspiration-left-panel">
        <!-- Big Preview Window (Flexible Aspect Ratio Support) -->
        <div class="portrait-display-window">
          <div class="portrait-image-wrapper" :style="{ background: getBackgroundGradient(itemId) }">
            <img v-if="previewUrl" :src="previewUrl" class="portrait-img" />
            <div v-else class="portrait-placeholder">
              <el-icon class="placeholder-icon"><i-ep-picture /></el-icon>
              <span>暂无预览图片</span>
            </div>
            
            <!-- Set Cover Heart Button (Hover shown at bottom-right corner) -->
            <div 
              v-if="previewUrl" 
              class="portrait-heart-btn" 
              :class="{ 'is-active': coverUrl === previewUrl }"
              @click.stop="handleSetCover(previewUrl)"
              :title="coverUrl === previewUrl ? '当前已是封面' : '设为封面'"
            >
              <el-icon v-if="coverUrl === previewUrl">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                </svg>
              </el-icon>
              <el-icon v-else>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </el-icon>
            </div>
          </div>
        </div>

        <!-- Inspiration Gallery Album -->
        <div class="gallery-album-section">
          <div class="section-title">
            <span>效果相册</span>
            <el-button type="primary" link size="small" @click="collectionsDialogVisible = true">从收藏导入</el-button>
          </div>

          <div class="gallery-grid">
            <!-- 缩略图列表 -->
            <div 
              v-for="img in gallery" 
              :key="img.filename" 
              class="gallery-thumbnail-card"
              :class="{ 'is-previewing': previewUrl === img.url }"
              @click="previewUrl = img.url"
            >
              <img :src="img.url" class="thumbnail-img" />
              
              <!-- Delete Photo (x) -->
              <div class="thumbnail-delete-btn" @click.stop="handleDeleteGalleryImage(img)" title="删除图片">
                <el-icon><i-ep-close /></el-icon>
              </div>
            </div>

            <!-- Import loading placeholder -->
            <div v-if="isImporting" class="gallery-thumbnail-card is-loading-placeholder">
              <div class="loading-placeholder-content">
                <el-icon class="is-loading"><i-ep-loading /></el-icon>
                <span>导入中...</span>
              </div>
            </div>

            <!-- AI Generating placeholder -->
            <div v-for="task in generatingTasks" :key="task.taskId" class="gallery-thumbnail-card is-generating-placeholder">
              <div class="generating-placeholder-content">
                <el-icon class="is-loading"><i-ep-magic-stick /></el-icon>
                <span class="generating-text">AI 生图中...</span>
              </div>
            </div>

            <!-- AI 生图 Button -->
            <div class="gallery-ai-generator-card" @click="aiGenerateDialogVisible = true" title="通过 AI 生图">
              <div class="uploader-placeholder">
                <el-icon><i-ep-magic-stick /></el-icon>
                <span>AI 生图</span>
              </div>
            </div>

            <!-- Upload Photo Button -->
            <el-upload
              class="gallery-uploader-card"
              action=""
              :show-file-list="false"
              :auto-upload="false"
              :on-change="handleUploadLocalFile"
            >
              <div class="uploader-placeholder">
                <el-icon><i-ep-plus /></el-icon>
                <span>上传照片</span>
              </div>
            </el-upload>
          </div>
        </div>
      </div>

      <!-- Right Column: Editing Form -->
      <div class="inspiration-right-panel">
        <div class="edit-card">
          <!-- Inspiration Title Header (Directly Display Name & Edit Button) -->
          <div class="card-header-row">
            <div class="title-display-group" v-if="!isEditingTitle">
              <h2 class="inspiration-space-name">{{ title }}</h2>
              <el-button 
                type="primary" 
                link 
                size="small" 
                class="edit-title-btn" 
                @click="startEditTitle"
                title="编辑提示词名称"
              >
                <el-icon><i-ep-edit /></el-icon>
              </el-button>
            </div>
            <div class="title-edit-group" v-else>
              <el-input 
                v-model="editTitleValue" 
                ref="titleInputRef"
                size="default" 
                class="title-edit-input"
                @keyup.enter="confirmEditTitle"
                @blur="confirmEditTitle"
              />
            </div>
          </div>

          <el-form label-position="top">
            <!-- 提示词标签 (Dotted/Tag Editor style) -->
            <el-form-item label="提示词标签">
              <div class="role-tags-row">
                <el-tag
                  v-for="tag in tags"
                  :key="tag"
                  closable
                  class="tag-item"
                  @close="handleRemoveTag(tag)"
                >
                  {{ tag }}
                </el-tag>
                <el-input
                  v-if="inputTagVisible"
                  ref="tagInputRef"
                  v-model="newTagValue"
                  class="new-tag-input"
                  size="small"
                  @keyup.enter="handleInputTagConfirm"
                  @blur="handleInputTagConfirm"
                />
                <el-button v-else class="button-new-tag" size="small" @click="showTagInput">
                  + 新标签
                </el-button>
              </div>
            </el-form-item>

            <!-- 灵感正文 (Reused Canvas prompt node style variables panel editor) -->
            <el-form-item>
              <div class="textarea-header">
                <span class="form-item-label">模板提示词文本</span>
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
                提示：在下方选中文本片段（如 "girl"），点击上方“提取”按钮，或直接按键盘 { 键，即可快速将其定义为变量槽位。
              </p>

              <!-- 已提取的变量槽位（点击原值编辑，悬浮点击 x 还原为文本）： -->
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

              <!-- native-template-textarea supports keypress '{' extraction & Undo/Redo history -->
              <textarea
                ref="textareaRef"
                v-model="templateText"
                rows="14"
                placeholder="请输入模板正文..."
                class="native-template-textarea"
                @keydown="handleKeydown"
              ></textarea>
            </el-form-item>

            <div class="form-actions">
              <!-- Discuss Button if it is linked to a session -->
              <el-button
                v-if="item?.data?.chat_session_id"
                type="success"
                plain
                @click="goToDiscuss(item.data.chat_session_id, item.data.role_id)"
                class="discuss-btn"
                style="margin-right: auto;"
              >
                <el-icon><i-ep-chat-dot-round /></el-icon> 去讨论
              </el-button>

              <el-button 
                type="primary" 
                @click="handleSaveChanges" 
                :loading="saveLoading"
                class="save-changes-btn"
              >
                保存修改
              </el-button>
            </div>
          </el-form>
        </div>
      </div>
    </div>

    <!-- Reusable Collections Import Dialog -->
    <CollectionsImportDialog
      v-model="collectionsDialogVisible"
      :gallery-images="gallery"
      @select-image="handleImportFromCollections"
    />

    <!-- Reusable AI Generate Dialog -->
    <AiGenerateDialog
      v-model="aiGenerateDialogVisible"
      :role-id="itemId"
      :role-name="title || ''"
      :role-description="templateText || ''"
      :is-inspiration="true"
      @task-submitted="handleTaskSubmitted"
    />
  </div>
</template>

<style scoped src="@/assets/styles/inspiration-space.css"></style>
