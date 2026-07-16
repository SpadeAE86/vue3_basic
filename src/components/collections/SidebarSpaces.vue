<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useCollectionsStore, type ThemeSpace } from '@/stores/collections'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps<{
  activeCategory: 'media' | 'template'
  selectedSpaceId: string | null
  selectedItemIds: string[]
}>()

const emit = defineEmits<{
  (e: 'update:selectedSpaceId', val: string | null): void
  (e: 'clear-selection'): void
  (e: 'drop-local-files', payload: { paths: string[], spaceId: string | null }): void
}>()

const collectionsStore = useCollectionsStore()

// ─── 拖拽分类 ───
const activeDropSpaceId = ref<string | null>(null)

function handleDragOver(space: ThemeSpace, event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  activeDropSpaceId.value = space.id
}

function handleDragLeave(space: ThemeSpace, event: DragEvent) {
  activeDropSpaceId.value = null
}

async function handleDropToSpace(space: ThemeSpace, event: DragEvent) {
  event.preventDefault()
  activeDropSpaceId.value = null
  let itemIds: string[] = []
  const rawData = event.dataTransfer?.getData('text/plain')
  if (rawData) {
    try {
      itemIds = JSON.parse(rawData)
    } catch (e) {
      console.warn('解析 rawData 失败，使用 store.draggedItemIds 兜底:', e)
    }
  }
  if (!itemIds || itemIds.length === 0) {
    itemIds = [...collectionsStore.draggedItemIds]
  }
  if (itemIds && itemIds.length > 0) {
    const localFileIds = itemIds.filter(id => id.startsWith('local-file-'))
    const normalItemIds = itemIds.filter(id => !id.startsWith('local-file-'))

    if (localFileIds.length > 0) {
      const paths = localFileIds.map(id => id.substring('local-file-'.length))
      emit('drop-local-files', { paths, spaceId: space.id })
    }

    if (normalItemIds.length > 0) {
      try {
        const success = await collectionsStore.batchMoveToSpace(normalItemIds, space.id)
        if (success) {
          ElMessage.success(`成功移动 ${normalItemIds.length} 个收藏项到 "${space.name}"`)
          emit('clear-selection')
        }
      } catch (e) {
        console.error('拖拽移入分类失败:', e)
      }
    }
  }
}

function handleDragOverAll(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  activeDropSpaceId.value = 'all'
}

function handleDragLeaveAll() {
  activeDropSpaceId.value = null
}

async function handleDropToAll(event: DragEvent) {
  event.preventDefault()
  activeDropSpaceId.value = null
  let itemIds: string[] = []
  const rawData = event.dataTransfer?.getData('text/plain')
  if (rawData) {
    try {
      itemIds = JSON.parse(rawData)
    } catch (e) {
      console.warn('解析 rawData 失败，使用 store.draggedItemIds 兜底:', e)
    }
  }
  if (!itemIds || itemIds.length === 0) {
    itemIds = [...collectionsStore.draggedItemIds]
  }
  if (itemIds && itemIds.length > 0) {
    const localFileIds = itemIds.filter(id => id.startsWith('local-file-'))
    const normalItemIds = itemIds.filter(id => !id.startsWith('local-file-'))

    if (localFileIds.length > 0) {
      const paths = localFileIds.map(id => id.substring('local-file-'.length))
      emit('drop-local-files', { paths, spaceId: null })
    }

    if (normalItemIds.length > 0) {
      try {
        const success = await collectionsStore.batchMoveToSpace(normalItemIds, null)
        if (success) {
          ElMessage.success(`成功将 ${itemIds.length} 个收藏项移动到 "全部收藏"`)
          emit('clear-selection')
        }
      } catch (e) {
        console.error('拖拽移动到全部收藏失败:', e)
      }
    }
  }
}

// ─── 新建/编辑主题空间 Dialog ───
const spaceDialogVisible = ref(false)
const spaceDialogMode = ref<'create' | 'edit'>('create')
const editingSpaceId = ref<string | null>(null)
const spaceForm = ref({
  name: '',
  description: '',
  space_tags_input: ''
})

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

// 新建主题空间
async function handleCreateSpace() {
  if (!spaceForm.value.name.trim()) {
    ElMessage.warning('请输入主题空间名称')
    return
  }
  if (spaceTagInput.value.trim()) addSpaceTag()

  const success = await collectionsStore.createThemeSpace(
    spaceForm.value.name.trim(),
    props.activeCategory,
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
    if (success && props.selectedSpaceId === space.id) {
      emit('update:selectedSpaceId', null)
    }
  } catch {
    // cancelled
  }
}

function getSpaceCount(spaceId: string) {
  return collectionsStore.items.filter(i => {
    const itemSpace = i.space_id ? collectionsStore.themeSpaces.find(s => s.id === i.space_id) : null
    const isInsideInspirationSpace = itemSpace?.category === 'inspiration'
    if (props.activeCategory === 'media') {
      return i.item_type === 'media' || !!i.cover_url || isInsideInspirationSpace
    } else {
      return i.item_type === 'template' || i.item_type === 'prompt'
    }
  }).filter(i => i.space_id === spaceId).length
}

function getSpaceLastUpdateTime(spaceId: string, spaceCreatedAt: string): number {
  const spaceItems = collectionsStore.items.filter(i => i.space_id === spaceId)
  if (spaceItems.length === 0) {
    return new Date(spaceCreatedAt || 0).getTime()
  }
  const times = spaceItems.map(i => new Date(i.created_at || i.created_at || 0).getTime())
  return Math.max(...times)
}

const filteredSpaces = computed(() => {
  const list = collectionsStore.themeSpaces.filter(s => {
    if (s.category === 'inspiration') return true
    if (props.activeCategory === 'media') {
      return s.category === 'media'
    } else {
      return s.category === 'template' || s.category === 'prompt'
    }
  })
  
  return [...list].sort((a, b) => {
    // 1. Keep "先普通再灵感"
    const aIsInsp = a.category === 'inspiration' ? 1 : 0
    const bIsInsp = b.category === 'inspiration' ? 1 : 0
    if (aIsInsp !== bIsInsp) {
      return aIsInsp - bIsInsp
    }
    
    // 2. Sort by update time desc
    const timeA = getSpaceLastUpdateTime(a.id, a.created_at)
    const timeB = getSpaceLastUpdateTime(b.id, b.created_at)
    if (timeA !== timeB) {
      return timeB - timeA
    }
    
    // 3. Sort by item count desc
    return getSpaceCount(b.id) - getSpaceCount(a.id)
  })
})

const displayAllCount = computed(() => {
  const categoryItems = collectionsStore.items.filter(i => {
    const itemSpace = i.space_id ? collectionsStore.themeSpaces.find(s => s.id === i.space_id) : null
    const isInsideInspirationSpace = itemSpace?.category === 'inspiration'
    if (isInsideInspirationSpace) return false
    
    if (props.activeCategory === 'media') {
      return i.item_type === 'media' || !!i.cover_url
    } else {
      return i.item_type === 'template' || i.item_type === 'prompt'
    }
  })
  if (collectionsStore.showUnclassifiedOnly) {
    return categoryItems.filter(i => !i.space_id).length
  }
  return categoryItems.length
})
</script>

<template>
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

    <ul class="spaces-list" :class="{ 'is-dragging': collectionsStore.draggedItemIds.length > 0 }">
      <li 
        class="space-item" 
        :class="{ 
          active: selectedSpaceId === null,
          'drag-over': activeDropSpaceId === 'all'
        }"
        @click="emit('update:selectedSpaceId', null)"
        @dragover.prevent="handleDragOverAll($event)"
        @dragleave="handleDragLeaveAll"
        @drop="handleDropToAll($event)"
      >
        <el-icon class="folder-icon"><i-ep-folder-opened /></el-icon>
        <span class="space-name">全部收藏</span>
        
        <!-- Toggle button to switch to showing unclassified only -->
        <el-tooltip :content="collectionsStore.showUnclassifiedOnly ? '显示所有收藏' : '仅显示未分类收藏'" placement="top">
          <button 
            class="unclassified-toggle-btn"
            :class="{ active: collectionsStore.showUnclassifiedOnly }"
            @click.stop="collectionsStore.showUnclassifiedOnly = !collectionsStore.showUnclassifiedOnly"
          >
            <el-icon v-if="collectionsStore.showUnclassifiedOnly"><i-ep-filter /></el-icon>
            <el-icon v-else><i-ep-operation /></el-icon>
          </button>
        </el-tooltip>

        <span class="item-count">{{ displayAllCount }}</span>
      </li>
      
      <li 
        v-for="space in filteredSpaces" 
        :key="space.id"
        class="space-item"
        :class="{ 
          active: selectedSpaceId === space.id,
          'drag-over': activeDropSpaceId === space.id
        }"
        @click="emit('update:selectedSpaceId', space.id)"
        @dragover.prevent="handleDragOver(space, $event)"
        @dragleave="handleDragLeave(space, $event)"
        @drop="handleDropToSpace(space, $event)"
      >
        <el-icon class="folder-icon" :style="space.category === 'inspiration' ? 'color: #10b981; filter: drop-shadow(0 0 2px rgba(16, 185, 129, 0.4));' : ''">
          <i-ep-folder-opened v-if="selectedSpaceId === space.id" />
          <i-ep-folder v-else />
        </el-icon>
        <span class="space-name" :title="space.name">{{ space.name }}</span>
        
        <span class="item-count">{{ getSpaceCount(space.id) }}</span>
        
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
</template>

<style scoped>
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
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
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
  gap: 6px;
  max-height: 580px;
  overflow-y: auto;
  padding-right: 4px;
}

.spaces-list::-webkit-scrollbar {
  width: 4px;
}

.spaces-list::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.spaces-list::-webkit-scrollbar-track {
  background: transparent;
}

.space-item {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  color: #475569;
  font-weight: 500;
  position: relative;
  gap: 8px;
  overflow: hidden;
  flex-shrink: 0;
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

.space-item:hover:has(.space-actions) .item-count {
  display: none;
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

.space-item.drag-over {
  background-color: #eef2ff !important;
  border: 1px dashed #6366f1;
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

/* ─── Unclassified Toggle Button Styles ─── */
.unclassified-toggle-btn {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.2s ease;
  margin-right: 4px;
  flex-shrink: 0;
}

.unclassified-toggle-btn:hover {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

.unclassified-toggle-btn.active {
  color: #6366f1;
  background: rgba(99, 102, 241, 0.15);
}

/* ─── Pointer events prevention to simplify drops ─── */
.spaces-list.is-dragging .space-item * {
  pointer-events: none;
}
</style>
