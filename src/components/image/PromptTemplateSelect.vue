<script setup lang="ts">
import { computed } from 'vue'
import { useCollectionsStore } from '@/stores/collections'
import { usePromptTemplates } from '@/composables/image/usePromptTemplates'

interface TemplateInfo {
  name: string
  has_content: boolean
}

const props = defineProps<{
  modelValue: string
  templates: TemplateInfo[]
  beautifyTemplates: TemplateInfo[]
  slotTemplates: TemplateInfo[]
  activeTab: 'beautify' | 'slots'
  placeholder?: string
  slotPlaceholder?: string
  actionColor?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'update:activeTab', v: 'beautify' | 'slots'): void
  (e: 'selectSlotTemplate', name: string): void
  (e: 'create'): void
  (e: 'delete', name: string): void
  (e: 'refresh'): void
}>()

const collectionsStore = useCollectionsStore()
const { localTemplates, getTemplateContent } = usePromptTemplates()

const value = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v),
})

const currentTemplates = computed(() => {
  return props.activeTab === 'slots' ? props.slotTemplates : props.beautifyTemplates
})

const computedPlaceholder = computed(() => {
  if (props.activeTab === 'slots') {
    return props.slotPlaceholder ?? '选择插槽模板'
  }
  return props.placeholder ?? '选择系统模板'
})

function onChange(v: string) {
  if (v === '__create__') {
    emit('update:modelValue', props.modelValue)
    emit('create')
    return
  }
  if (props.activeTab === 'slots') {
    emit('selectSlotTemplate', v)
    emit('update:modelValue', v)
  } else {
    emit('update:modelValue', v)
  }
}

function handleDelete(e: MouseEvent, name: string) {
  e.preventDefault()
  e.stopPropagation()
  emit('delete', name)
}

function isTemplateFavorited(name: string): boolean {
  return collectionsStore.isFavorited('template', name)
}

async function handleToggleFavorite(e: MouseEvent, name: string) {
  e.preventDefault()
  e.stopPropagation()
  
  const content = localTemplates.get(name) || await getTemplateContent(name) || ''
  const payload = { name: name, template_text: content }
  
  await collectionsStore.toggleFavorite('template', name, undefined, payload)
}
</script>

<template>
  <el-select
    :model-value="value"
    @update:model-value="value = $event"
    @change="onChange"
    :placeholder="computedPlaceholder"
    size="small"
    placement="top-start"
    popper-class="template-select-dropdown"
    style="width: 220px"
    @visible-change="(v: boolean) => v && emit('refresh')"
  >
    <el-option :value="'__create__'" :label="'＋ 新建模板'" />

    <el-option v-for="tpl in currentTemplates" :key="tpl.name" :label="tpl.name" :value="tpl.name">
      <div class="opt-row">
        <span class="opt-label">{{ tpl.name }}</span>
        
        <el-button
          class="opt-fav"
          :class="{ 'is-active': isTemplateFavorited(tpl.name) }"
          link
          @click="(e: any) => handleToggleFavorite(e, tpl.name)"
          :title="isTemplateFavorited(tpl.name) ? '取消收藏' : '收藏'"
        >
          <el-icon v-if="isTemplateFavorited(tpl.name)"><i-ep-star-filled /></el-icon>
          <el-icon v-else><i-ep-star /></el-icon>
        </el-button>

        <el-button
          class="opt-del"
          link
          @click="(e: any) => handleDelete(e, tpl.name)"
          title="删除"
        >
          <el-icon><i-ep-close /></el-icon>
        </el-button>
      </div>
    </el-option>

    <template #footer>
      <div class="dropdown-tabs-footer" @click.stop>
        <div class="tabs-segment-control">
          <div 
            class="segment-item" 
            :class="{ active: activeTab === 'beautify' }"
            @click="emit('update:activeTab', 'beautify')"
          >
            AI 美化预设
          </div>
          <div 
            class="segment-item" 
            :class="{ active: activeTab === 'slots' }"
            @click="emit('update:activeTab', 'slots')"
          >
            📋 我的插槽模板
          </div>
        </div>
      </div>
    </template>
  </el-select>
</template>

<style scoped>
.opt-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 4px;
}

.opt-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opt-fav {
  color: #a8abb2;
  padding: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  width: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto !important;
}

.opt-fav.is-active {
  color: #fadb14 !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}

.opt-row:hover .opt-fav {
  opacity: 1;
  pointer-events: auto;
}

.opt-fav:hover {
  color: #eab308;
}

.opt-del {
  color: #a8abb2;
  opacity: 0;
  pointer-events: none;
  padding: 0;
  width: 18px;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.opt-row:hover .opt-del {
  opacity: 1;
  pointer-events: auto;
}

.opt-del:hover {
  color: #ef4444;
}

/* Eliminate default margins/paddings on buttons inside opt-row */
.opt-row :deep(.el-button) {
  margin: 0 !important;
  padding: 0 !important;
}

/* Force the el-option inner container to span full width of the dropdown item */
:deep(.el-select-dropdown__item) {
  display: flex !important;
  align-items: center;
  padding: 0 12px !important;
}

:deep(.el-select-dropdown__item > span) {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  width: 100%;
}

/* 底部标签切换栏 */
.dropdown-tabs-footer {
  padding: 6px;
  border-top: 1px solid #f1f5f9;
  background-color: #fafafa;
}

.tabs-segment-control {
  display: flex;
  background-color: #f1f5f9;
  border-radius: 6px;
  padding: 2px;
  width: 100%;
}

.segment-item {
  flex: 1;
  text-align: center;
  padding: 6px 0;
  border-radius: 4px;
  font-weight: 500;
  color: #64748b;
  font-size: 11px;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.segment-item:hover:not(.active) {
  color: #334155;
}

.segment-item.active {
  background-color: #fff;
  color: #6366f1;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
</style>

<style>
/* 下拉最多展示 5 条，滚动 */
.template-select-dropdown .el-select-dropdown__wrap {
  max-height: 170px;
}
</style>
