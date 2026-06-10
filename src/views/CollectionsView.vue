<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useCollectionsStore, type CollectionItem, type ThemeSpace } from '@/stores/collections'
import { ElMessage, ElMessageBox } from 'element-plus'
import { copyToClipboard } from '@/utils/browser'
import MediaPreviewDialog from '@/components/image/MediaPreviewDialog.vue'

const collectionsStore = useCollectionsStore()

// 选中的大分类: 'media' | 'template'
const activeCategory = ref<'media' | 'template'>('media')

// 选中的空间ID (null/undefined 代表 "全部")
const selectedSpaceId = ref<string | null>(null)

// ─── 大图预览 ───
const previewVisible = ref(false)
const previewUrl = ref('')
const previewMediaType = ref('video')
const previewPrompt = ref('')
const viewerPromptVisible = ref(true)

function openPreview(item: CollectionItem) {
  const url = item.data.url || item.data.image_url || ''
  const isVid = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm')
  if (!isVid) return
  previewUrl.value = url
  previewMediaType.value = item.data.media_type || (isVid ? 'video' : 'image')
  previewPrompt.value = item.data.prompt || ''
  previewVisible.value = true
}

function onImagePreviewShow() {
  viewerPromptVisible.value = true
}

// ─── 新建/编辑主题空间 Dialog ───
const spaceDialogVisible = ref(false)
const spaceDialogMode = ref<'create' | 'edit'>('create')
const editingSpaceId = ref<string | null>(null)
const spaceForm = ref({
  name: '',
  description: '',
  space_tags_input: ''   // will be turned into tag pills
})

// Tag pill management for space_tags
const spaceTags = ref<string[]>([])
const spaceTagInput = ref('')
const spaceTagInputRef = ref<HTMLInputElement | null>(null)

function addSpaceTag() {
  const raw = spaceTagInput.value.trim()
  if (!raw) return
  const parts = raw.split(/[,，;；\s]+/).map(s => s.trim()).filter(Boolean)
  for (const p of parts) {
    if (!spaceTags.value.includes(p)) spaceTags.value.push(p)
  }
  spaceTagInput.value = ''
}

function removeSpaceTag(tag: string) {
  spaceTags.value = spaceTags.value.filter(t => t !== tag)
}

function onSpaceTagKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addSpaceTag()
  } else if (e.key === 'Backspace' && !spaceTagInput.value && spaceTags.value.length > 0) {
    spaceTags.value.pop()
  }
}

function openCreateSpaceDialog() {
  spaceDialogMode.value = 'create'
  editingSpaceId.value = null
  spaceForm.value = { name: '', description: '', space_tags_input: '' }
  spaceTags.value = []
  spaceDialogVisible.value = true
  nextTick(() => spaceTagInputRef.value?.focus())
}

function openEditSpaceDialog(space: ThemeSpace) {
  spaceDialogMode.value = 'edit'
  editingSpaceId.value = space.id
  spaceForm.value = { name: space.name, description: space.description || '', space_tags_input: '' }
  spaceTags.value = [...(space.space_tags || [])]
  spaceDialogVisible.value = true
  nextTick(() => spaceTagInputRef.value?.focus())
}

onMounted(() => {
  collectionsStore.init()
})

// 根据当前分类筛选主题空间
const filteredSpaces = computed(() => {
  return collectionsStore.themeSpaces.filter(s => {
    if (activeCategory.value === 'media') {
      return s.category === 'media'
    } else {
      return s.category === 'template' || s.category === 'prompt'
    }
  })
})

// 根据当前分类和选中的空间筛选收藏项
const filteredItems = computed(() => {
  return collectionsStore.items.filter(item => {
    if (activeCategory.value === 'media') {
      if (item.item_type !== 'media') return false
    } else {
      if (item.item_type !== 'template' && item.item_type !== 'prompt') return false
    }
    if (selectedSpaceId.value !== null) {
      return item.space_id === selectedSpaceId.value
    }
    return true
  })
})

// 归属的主题空间名称映射
function getSpaceName(spaceId?: string) {
  if (!spaceId) return ''
  const space = collectionsStore.themeSpaces.find(s => s.id === spaceId)
  return space ? space.name : ''
}

// 切换大分类时重置选中的空间
function handleCategoryChange(category: 'media' | 'template') {
  activeCategory.value = category
  selectedSpaceId.value = null
}

async function handleCopyToCanvas(item: CollectionItem) {
  const isTemplate = item.item_type === 'template' || !!(item.data.template_text || '').match(/\{([^:]+):\s*([^}]+)\}/g)
  const payload = {
    type: 'jottings-canvas-node',
    node_type: isTemplate ? 'prompt_template' : 'image_card',
    name: item.title || '收藏的提示词',
    template_text: item.data.template_text || item.data.prompt || ''
  }
  const success = await copyToClipboard(JSON.stringify(payload))
  if (success) {
    ElMessage.success('已复制卡片数据，可在画布页面按 Ctrl+V 粘贴为节点')
  } else {
    ElMessage.error('复制失败')
  }
}

// 新建主题空间
async function handleCreateSpace() {
  if (!spaceForm.value.name.trim()) {
    ElMessage.warning('请输入主题空间名称')
    return
  }
  // Flush any pending text in tag input
  if (spaceTagInput.value.trim()) addSpaceTag()

  const success = await collectionsStore.createThemeSpace(
    spaceForm.value.name.trim(),
    activeCategory.value,
    spaceForm.value.description.trim() || undefined,
    spaceTags.value
  )

  if (success) {
    spaceDialogVisible.value = false
    spaceForm.value = { name: '', description: '', space_tags_input: '' }
    spaceTags.value = []
  }
}

// 更新主题空间
async function handleUpdateSpace() {
  if (!editingSpaceId.value) return
  if (!spaceForm.value.name.trim()) {
    ElMessage.warning('请输入主题空间名称')
    return
  }
  if (spaceTagInput.value.trim()) addSpaceTag()

  const success = await collectionsStore.updateThemeSpace(
    editingSpaceId.value,
    spaceForm.value.name.trim(),
    spaceForm.value.description.trim() || undefined,
    spaceTags.value
  )

  if (success) {
    spaceDialogVisible.value = false
    editingSpaceId.value = null
  }
}

// 删除主题空间
async function handleDeleteSpace(space: ThemeSpace) {
  try {
    await ElMessageBox.confirm(`确定要删除空间 "${space.name}" 吗？其下的收藏项不会被删除，仅解绑分类。`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const success = await collectionsStore.deleteThemeSpace(space.id)
    if (success && selectedSpaceId.value === space.id) {
      selectedSpaceId.value = null
    }
  } catch {
    // cancelled
  }
}

// 取消收藏单个项目
async function handleUnfavorite(item: CollectionItem) {
  const payload = item.item_type === 'media' ? { url: item.data.url } : item.item_type === 'template' ? { template_text: item.data.template_text } : { prompt: item.data.prompt }
  await collectionsStore.toggleFavorite(item.item_type, item.title, undefined, payload)
}

// 修改收藏项的分类空间
async function handleMoveSpace(item: CollectionItem, spaceId: string | null) {
  await collectionsStore.moveToSpace(item.id, spaceId)
}

// 复制提示词
async function handleCopyPrompt(prompt: string) {
  const success = await copyToClipboard(prompt)
  if (success) ElMessage.success('提示词已复制到剪贴板')
}

// 格式化日期
function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <div class="collections-page">
    <!-- 头部导航 -->
    <header class="collections-header">
      <div class="header-left">
        <h1 class="page-title">✨ 我的灵感收藏空间</h1>
        <p class="page-subtitle">沉淀创意片段，分类规划您的图像、视频与提示词模板空间。</p>
      </div>

      <div class="category-tabs">
        <button 
          class="tab-btn" 
          :class="{ active: activeCategory === 'media' }"
          @click="handleCategoryChange('media')"
        >
          <el-icon><i-ep-picture /></el-icon>
          <span>多媒体画廊</span>
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeCategory === 'template' }"
          @click="handleCategoryChange('template')"
        >
          <el-icon><i-ep-memo /></el-icon>
          <span>提示词模板</span>
        </button>
      </div>
    </header>

    <div class="collections-content">
      <!-- 左边栏：主题空间 -->
      <aside class="spaces-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">📁 主题分类空间</span>
          <el-button 
            type="primary" 
            link
            size="small"
            @click="openCreateSpaceDialog"
            title="新建主题分类空间"
          >
            <el-icon><i-ep-plus /></el-icon> 新建
          </el-button>
        </div>

        <ul class="spaces-list">
          <li 
            class="space-item" 
            :class="{ active: selectedSpaceId === null }"
            @click="selectedSpaceId = null"
          >
            <el-icon class="folder-icon"><i-ep-folder-opened /></el-icon>
            <span class="space-name">全部收藏</span>
            <span class="item-count">{{ collectionsStore.items.filter(i => i.item_type === activeCategory).length }}</span>
          </li>
          
          <li 
            v-for="space in filteredSpaces" 
            :key="space.id"
            class="space-item"
            :class="{ active: selectedSpaceId === space.id }"
            @click="selectedSpaceId = space.id"
          >
            <el-icon class="folder-icon"><i-ep-folder /></el-icon>
            <span class="space-name" :title="space.name">{{ space.name }}</span>
            
            <div class="space-actions" @click.stop>
              <el-tooltip content="编辑空间" placement="top">
                <button class="space-action-btn" @click="openEditSpaceDialog(space)">
                  <el-icon><i-ep-setting /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="删除空间" placement="top">
                <button class="space-action-btn danger" @click="handleDeleteSpace(space)">
                  <el-icon><i-ep-delete /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </li>

          <li v-if="filteredSpaces.length === 0" class="sidebar-empty">
            无自定义空间
          </li>
        </ul>
      </aside>

      <!-- 主区域：瀑布流与卡片网格 -->
      <main class="main-gallery">
        <!-- 列表状态 -->
        <div v-if="collectionsStore.loading" class="loading-state">
          <el-icon class="is-loading" :size="32"><i-ep-loading /></el-icon>
          <span>加载数据中...</span>
        </div>

        <div v-else-if="filteredItems.length === 0" class="empty-state">
          <el-empty description="当前空间空空如也，快去画布或提示词对比页面点亮星星收藏吧！" />
        </div>

        <div v-else class="gallery-wrapper">
          <!-- 1. 多媒体画廊 (媒体瀑布流) -->
          <div v-if="activeCategory === 'media'" class="masonry-grid">
            <div 
              v-for="item in filteredItems" 
              :key="item.id" 
              class="masonry-item"
            >
              <div class="result-card">
                <div class="result-header">
                  <el-tag size="small" type="info">{{ item.data.model || '生成模型' }}</el-tag>
                  <el-tag size="small" :type="item.data.media_type === 'video' ? 'danger' : 'primary'">
                    {{ item.data.media_type === 'video' ? '视频' : '图片' }}
                  </el-tag>
                </div>

                <div class="image-wrapper" @click="openPreview(item)">
                  <video 
                    v-if="item.data.url?.toLowerCase().endsWith('.mp4') || item.data.url?.toLowerCase().endsWith('.webm')" 
                    :src="item.data.url" 
                    class="generated-image"
                    autoplay
                    loop
                    muted
                    playsinline
                  />
                  <el-image
                    v-else
                    :src="item.data.url || item.data.image_url"
                    fit="contain"
                    class="generated-image-el"
                    :preview-src-list="item.data.url || item.data.image_url ? [item.data.url || item.data.image_url] : []"
                    preview-teleported
                    @show="onImagePreviewShow"
                  >
                    <template #viewer>
                      <div
                        class="result-preview-prompt-dock"
                        @mousedown.stop
                        @touchstart.stop
                      >
                        <div v-show="viewerPromptVisible" class="result-preview-prompt-inner">
                          <div class="result-preview-prompt-head">
                            <span class="result-preview-label">提示词</span>
                            <el-button
                              type="info"
                              link
                              size="small"
                              class="result-preview-toggle-link"
                              @click.stop="viewerPromptVisible = false"
                            >
                              隐藏
                            </el-button>
                          </div>
                          <p class="result-preview-text">{{ item.data.prompt?.trim() ? item.data.prompt : '—' }}</p>
                          <div class="result-preview-actions">
                            <el-button type="primary" link size="small" @click.stop="handleCopyPrompt(item.data.prompt || '')">
                              复制全文
                            </el-button>
                          </div>
                        </div>
                        <el-button
                          v-show="!viewerPromptVisible"
                          type="primary"
                          round
                          size="small"
                          class="result-preview-restore-btn"
                          @click.stop="viewerPromptVisible = true"
                        >
                          显示提示词
                        </el-button>
                      </div>
                    </template>
                  </el-image>

                  <!-- Star Button in top right corner -->
                  <div 
                    class="result-favorite-star is-favorited" 
                    @click.stop="handleUnfavorite(item)"
                    title="取消收藏"
                  >
                    <el-icon><i-ep-star-filled /></el-icon>
                  </div>

                  <!-- Hover Overlay -->
                  <div class="result-overlay" @click.stop>
                    <div class="overlay-top">
                      <span v-if="item.space_id" class="space-badge">{{ getSpaceName(item.space_id) }}</span>
                    </div>
                    <div class="overlay-bottom">
                      <div class="media-prompt-overlay" :title="item.data.prompt">
                        {{ item.data.prompt || '(无提示词)' }}
                      </div>
                      <div class="overlay-bottom-row">
                        <div class="time-info">{{ formatDate(item.created_at) }}</div>
                        <div class="action-icons">
                          <!-- Classify dropdown -->
                          <el-dropdown trigger="click" size="small" @command="(id: string | null) => handleMoveSpace(item, id)">
                            <div class="icon-btn" title="分类归属">
                              <el-icon><i-ep-folder /></el-icon>
                            </div>
                            <template #dropdown>
                              <el-dropdown-menu>
                                <el-dropdown-item :command="null">未分类</el-dropdown-item>
                                <el-dropdown-item 
                                  v-for="s in collectionsStore.themeSpaces.filter(sp => sp.category === 'media')" 
                                  :key="s.id" 
                                  :command="s.id"
                                >
                                  {{ s.name }}
                                </el-dropdown-item>
                              </el-dropdown-menu>
                            </template>
                          </el-dropdown>

                          <el-tooltip content="复制到画布" placement="top">
                            <div class="icon-btn" @click="handleCopyToCanvas(item)">
                              <el-icon><i-ep-copy-document /></el-icon>
                            </div>
                          </el-tooltip>
                          <el-tooltip content="复制提示词" placement="top">
                            <div class="icon-btn" @click="handleCopyPrompt(item.data.prompt)">
                              <el-icon><i-ep-document-copy /></el-icon>
                            </div>
                          </el-tooltip>
                          <el-tooltip content="取消收藏" placement="top">
                            <div class="icon-btn danger" @click="handleUnfavorite(item)">
                              <el-icon><i-ep-delete /></el-icon>
                            </div>
                          </el-tooltip>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. 提示词模板展示 -->
          <div v-else-if="activeCategory === 'template'" class="templates-grid">
            <div 
              v-for="item in filteredItems" 
              :key="item.id" 
              class="template-card-container"
            >
              <div class="result-card">
                <div class="result-header">
                  <el-tag size="small" type="info">{{ item.item_type === 'template' ? '插槽模板' : '纯提示词' }}</el-tag>
                  <span class="tpl-header-title" :title="item.title">{{ item.title }}</span>
                </div>

                <div class="image-wrapper template-text-content-wrapper">
                  <div class="template-text-display">
                    {{ item.data.template_text || item.data.prompt }}
                  </div>

                  <!-- Star Button in top right corner -->
                  <div 
                    class="result-favorite-star is-favorited" 
                    @click.stop="handleUnfavorite(item)"
                    title="取消收藏"
                  >
                    <el-icon><i-ep-star-filled /></el-icon>
                  </div>

                  <!-- Hover Overlay -->
                  <div class="result-overlay" @click.stop>
                    <div class="overlay-top">
                      <span v-if="item.space_id" class="space-badge">{{ getSpaceName(item.space_id) }}</span>
                    </div>
                    <div class="overlay-bottom">
                      <div class="overlay-bottom-row">
                        <div class="time-info">{{ formatDate(item.created_at) }}</div>
                        <div class="action-icons">
                          <!-- Classify dropdown -->
                          <el-dropdown trigger="click" size="small" @command="(id: string | null) => handleMoveSpace(item, id)">
                            <div class="icon-btn" title="分类归属">
                              <el-icon><i-ep-folder /></el-icon>
                            </div>
                            <template #dropdown>
                              <el-dropdown-menu>
                                <el-dropdown-item :command="null">未分类</el-dropdown-item>
                                <el-dropdown-item 
                                  v-for="s in collectionsStore.themeSpaces.filter(sp => sp.category === 'template' || sp.category === 'prompt')" 
                                  :key="s.id" 
                                  :command="s.id"
                                >
                                  {{ s.name }}
                                </el-dropdown-item>
                              </el-dropdown-menu>
                            </template>
                          </el-dropdown>

                          <el-tooltip content="复制到画布" placement="top">
                            <div class="icon-btn" @click="handleCopyToCanvas(item)">
                              <el-icon><i-ep-copy-document /></el-icon>
                            </div>
                          </el-tooltip>
                          <el-tooltip content="复制提示词文本" placement="top">
                            <div class="icon-btn" @click="handleCopyPrompt(item.data.template_text || item.data.prompt)">
                              <el-icon><i-ep-document-copy /></el-icon>
                            </div>
                          </el-tooltip>
                          <el-tooltip content="取消收藏" placement="top">
                            <div class="icon-btn danger" @click="handleUnfavorite(item)">
                              <el-icon><i-ep-delete /></el-icon>
                            </div>
                          </el-tooltip>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <MediaPreviewDialog
      v-model="previewVisible"
      :url="previewUrl"
      :media-type="previewMediaType"
      :prompt="previewPrompt"
    />

    <!-- ─── 新建/编辑主题分类空间 Dialog ─── -->
    <el-dialog
      v-model="spaceDialogVisible"
      :title="spaceDialogMode === 'create' ? '新建主题分类空间' : '编辑主题分类空间'"
      width="480px"
      append-to-body
    >
      <el-form :model="spaceForm" label-position="top">
        <el-form-item label="空间名称" required>
          <el-input v-model="spaceForm.name" placeholder="请输入空间名称，如：娘化厂商、赛博朋克等" />
        </el-form-item>
        <el-form-item label="空间描述">
          <el-input 
            v-model="spaceForm.description" 
            type="textarea" 
            :rows="2" 
            placeholder="描述此主题空间的具体收纳内容"
          />
        </el-form-item>
        <el-form-item label="专属候选标准标签">
          <!-- Tag pill input -->
          <div class="tag-pill-input-box" @click="spaceTagInputRef?.focus()">
            <span
              v-for="tag in spaceTags"
              :key="tag"
              class="tag-pill"
            >
              {{ tag }}
              <button class="tag-pill-remove" @click.stop="removeSpaceTag(tag)">×</button>
            </span>
            <input
              ref="spaceTagInputRef"
              v-model="spaceTagInput"
              class="tag-pill-input"
              placeholder="输入标签后按 Enter 或逗号确认"
              @keydown="onSpaceTagKeydown"
              @blur="addSpaceTag"
            />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="spaceDialogVisible = false">取消</el-button>
          <el-button 
            type="primary" 
            @click="spaceDialogMode === 'create' ? handleCreateSpace() : handleUpdateSpace()"
          >
            {{ spaceDialogMode === 'create' ? '确认创建' : '保存修改' }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.collections-page {
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1e293b;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: calc(100vh - 120px);
}

.collections-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 20px;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 6px 0;
}

.page-subtitle {
  font-size: 13px;
  color: #64748b;
  margin: 0;
}

.category-tabs {
  display: flex;
  background-color: #f1f5f9;
  border-radius: 20px;
  padding: 4px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  border-radius: 16px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  background: none;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.tab-btn:hover:not(.active) {
  color: #334155;
  background-color: rgba(255, 255, 255, 0.5);
}

.tab-btn.active {
  background-color: #ffffff;
  color: #6366f1;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1);
}

.collections-content {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 24px;
  align-items: start;
}

/* Sidebar Spaces styling */
.spaces-sidebar {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sidebar-title {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.spaces-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.space-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  color: #475569;
  font-weight: 500;
  position: relative;
  gap: 8px;
  overflow: hidden;
}

.space-item:hover {
  background-color: #f8fafc;
  color: #0f172a;
}

.space-item.active {
  background-color: #eef2ff;
  color: #6366f1;
  font-weight: 600;
}

.folder-icon {
  font-size: 16px;
  color: #a78bfa;
  flex-shrink: 0;
}

.space-item.active .folder-icon {
  color: #6366f1;
}

.space-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-count {
  font-size: 11px;
  background-color: #f1f5f9;
  color: #64748b;
  padding: 1px 6px;
  border-radius: 10px;
}

.space-item.active .item-count {
  background-color: #6366f1;
  color: #ffffff;
}

/* Space action buttons (gear + delete) - hidden until hover */
.space-actions {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.space-item:hover .space-actions {
  display: flex;
}

.space-action-btn {
  width: 22px;
  height: 22px;
  border: none;
  background: none;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #94a3b8;
  font-size: 13px;
  transition: all 0.2s;
  padding: 0;
}

.space-action-btn:hover {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

.space-action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.sidebar-empty {
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
  padding: 20px 0;
  font-style: italic;
}

/* Main gallery layout */
.main-gallery {
  min-height: 400px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: #64748b;
  font-size: 14px;
  gap: 12px;
}

.gallery-wrapper {
  width: 100%;
}

/* Masonry Grid waterfall flow */
.masonry-grid {
  columns: 4;
  column-gap: 16px;
}

@media (max-width: 1200px) {
  .masonry-grid {
    columns: 3;
  }
}
@media (max-width: 900px) {
  .masonry-grid {
    columns: 2;
  }
}

.masonry-item {
  break-inside: avoid;
  margin-bottom: 16px;
}

.result-card {
  border: 1px solid #ebeef5;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.3s ease;
  width: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
}

.result-card:hover {
  transform: scale(1.02);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  z-index: 10;
}

.result-header {
  padding: 10px 14px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-start;
}

.tpl-header-title {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.image-wrapper {
  width: 100%;
  position: relative;
  padding: 0;
  background: #fafafa;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
}

.generated-image {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 0 0 12px 12px;
}

/* 与提示词对比页一致：图片使用 el-image 的 viewer 预览 */
.generated-image-el {
  width: 100%;
  display: block;
  border-radius: 0 0 12px 12px;
}

.generated-image-el :deep(.el-image__wrapper) {
  width: 100% !important;
}

.generated-image-el :deep(.el-image__inner) {
  position: relative;
  width: 100% !important;
  height: auto !important;
  vertical-align: top;
  border-radius: 0 0 12px 12px;
}

/* Template text display content styling */
.template-text-content-wrapper {
  background: #faf5ff;
  min-height: 160px;
  max-height: 240px;
  padding: 20px;
  box-sizing: border-box;
  overflow: hidden;
  cursor: default;
}

.template-text-display {
  font-size: 13px;
  line-height: 1.6;
  color: #5b21b6;
  font-style: italic;
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
  padding: 0 10px;
  word-break: break-all;
}

/* Favorite Star Button */
.result-favorite-star {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 15;
  color: #94a3b8;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.2s ease;
  pointer-events: auto;
}

.image-wrapper:hover .result-favorite-star,
.result-favorite-star.is-favorited {
  opacity: 1;
  transform: scale(1);
}

.result-favorite-star:hover {
  transform: scale(1.1) !important;
  color: #eab308;
}

.result-favorite-star.is-favorited {
  color: #eab308 !important;
  background: #fff !important;
  border-color: #f59e0b !important;
}

/* Hover Overlay */
.result-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(0,0,0,0.75) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px;
  pointer-events: none;
  box-sizing: border-box;
  z-index: 10;
}

.image-wrapper:hover .result-overlay {
  opacity: 1;
}

.overlay-top {
  display: flex;
  justify-content: flex-start;
  width: 100%;
}

.space-badge {
  background: rgba(99, 102, 241, 0.7);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  backdrop-filter: blur(4px);
}

.overlay-bottom {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.media-prompt-overlay {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.4;
  margin: 0;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 1px 2px rgba(0,0,0,0.6);
}

.overlay-bottom-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.time-info {
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.action-icons {
  display: flex;
  gap: 8px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.4);
  transform: scale(1.1);
}

.icon-btn.danger:hover {
  background: rgba(245, 108, 108, 0.8);
  border-color: rgba(245, 108, 108, 0.8);
}

/* Template Grid layout */
.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.template-card-container {
  display: flex;
  width: 100%;
}

/* 大图预览提示词 dock：对齐提示词对比页的 viewer 交互 */
.result-preview-prompt-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 16px;
  box-sizing: border-box;
}

.result-preview-prompt-inner {
  pointer-events: auto;
  width: min(100%, 720px);
  max-height: min(30vh, 240px);
  overflow-y: auto;
  margin-bottom: 100px;
  padding: 12px 14px 10px;
  background: rgba(30, 30, 38, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
}

.result-preview-prompt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.result-preview-toggle-link {
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.75) !important;
}

.result-preview-label {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.06em;
}

.result-preview-restore-btn {
  pointer-events: auto;
  margin-bottom: 100px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.result-preview-text {
  font-size: 13px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.92);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0 0 6px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.result-preview-actions {
  display: flex;
  justify-content: flex-end;
}

/* ─── Tag Pill Input ─── */
.tag-pill-input-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  cursor: text;
  min-height: 38px;
  transition: border-color 0.2s;
  width: 100%;
  box-sizing: border-box;
}

.tag-pill-input-box:focus-within {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
}

.tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  color: #4f46e5;
  border-radius: 20px;
  padding: 2px 8px 2px 10px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: default;
  transition: all 0.15s;
}

.tag-pill:hover {
  background: #e0e7ff;
}

.tag-pill-remove {
  background: none;
  border: none;
  color: #818cf8;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.15s;
  flex-shrink: 0;
}

.tag-pill-remove:hover {
  background: #c7d2fe;
  color: #4f46e5;
}

.tag-pill-input {
  border: none;
  outline: none;
  font-size: 13px;
  color: #374151;
  background: transparent;
  flex: 1;
  min-width: 120px;
  padding: 2px 0;
}

.tag-pill-input::placeholder {
  color: #9ca3af;
}
</style>
