<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useCollectionsStore } from '@/stores/collections'

const props = defineProps<{
  modelValue: boolean
  roleId?: string
  galleryImages: any[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'importing'): void
  (e: 'imported'): void
  (e: 'select-image', url: string): void
}>()

const visible = ref(props.modelValue)
watch(() => props.modelValue, (newVal) => {
  visible.value = newVal
  if (newVal) {
    collectionsStore.loadCollections()
  }
})
watch(visible, (newVal) => {
  emit('update:modelValue', newVal)
})

const collectionsStore = useCollectionsStore()
const importingItemIds = ref<string[]>([])

const filteredCollectionsItems = computed(() => {
  return collectionsStore.items.filter((item: any) => {
    if (item.item_type !== 'media') return false
    const url = item.data.url || item.data.image_url || ''
    const isVid = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm')
    return !isVid
  })
})

function isAlreadyImported(item: any) {
  const url = item.data.url || item.data.image_url
  if (!url) return false
  return props.galleryImages.some(gImg => {
    if (typeof gImg === 'string') return gImg === url
    return gImg.source_url === url || gImg.url === url
  })
}

async function handleSelectImport(item: any) {
  const url = item.data.url || item.data.image_url
  if (!url) return
  if (importingItemIds.value.includes(item.id)) return
  
  if (!props.roleId) {
    emit('select-image', url)
    visible.value = false
    return
  }
  
  importingItemIds.value.push(item.id)
  emit('importing')
  visible.value = false
  ElMessage.info('正在从收藏空间导入图片...')
  
  try {
    const res = await fetch(`/api/chat/roles/${props.roleId}/gallery/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })
    const data = await res.json()
    if (data.ok) {
      ElMessage.success('成功从收藏空间导入图片')
    } else {
      ElMessage.error(data.error || '导入失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('网络请求失败')
  } finally {
    importingItemIds.value = importingItemIds.value.filter(id => id !== item.id)
    emit('imported')
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="从灵感收藏空间导入"
    width="640px"
    destroy-on-close
  >
    <div v-loading="collectionsStore.loading" class="collections-import-container">
      <div class="collections-import-grid" v-if="filteredCollectionsItems.length > 0">
        <div 
          v-for="item in filteredCollectionsItems" 
          :key="item.id" 
          class="import-item-card"
          :class="{ 
            'is-importing': importingItemIds.includes(item.id),
            'is-imported': isAlreadyImported(item)
          }"
          @click="isAlreadyImported(item) ? null : handleSelectImport(item)"
        >
          <img :src="item.data.url || item.data.image_url" class="import-item-img" />
          <div v-if="importingItemIds.includes(item.id)" class="import-loading-overlay">
            <el-icon class="is-loading"><i-ep-loading /></el-icon>
          </div>
          <!-- 已导入蒙版角标 -->
          <div v-if="isAlreadyImported(item)" class="import-checked-overlay">
            <el-icon><i-ep-check /></el-icon>
            <span>已导入</span>
          </div>
          <div class="import-item-title">{{ item.title }}</div>
        </div>
      </div>
      <div v-else class="import-empty">
        <el-icon :size="32"><i-ep-info-filled /></el-icon>
        <p>收藏空间中暂无可用的图片，快去创作和收藏吧！</p>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.collections-import-container {
  max-height: 400px;
  overflow-y: auto;
}

.collections-import-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.import-item-card {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: all 0.2s;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  position: relative;
}

.import-item-card:hover {
  border-color: #6366f1;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.import-item-img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}

.import-item-title {
  padding: 6px;
  font-size: 11px;
  color: #475569;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.import-item-card.is-importing {
  pointer-events: none;
  opacity: 0.75;
}

.import-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 24px;
  background: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.import-loading-overlay .el-icon {
  font-size: 24px;
  color: #6366f1;
}

.import-item-card.is-imported {
  pointer-events: none;
  opacity: 0.65;
  filter: grayscale(80%);
}

.import-checked-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 24px;
  background: rgba(148, 163, 184, 0.45);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  gap: 4px;
  backdrop-filter: blur(1px);
  -webkit-backdrop-filter: blur(1px);
}

.import-checked-overlay .el-icon {
  font-size: 20px;
  background: #34d399;
  border-radius: 50%;
  padding: 2px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.import-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: #94a3b8;
  font-size: 13px;
  gap: 12px;
}
</style>
