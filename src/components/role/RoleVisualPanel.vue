<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  roleId: string
  roleMeta: any
  galleryImages: any[]
  selectedGalleryImage: { filename: string; url: string } | null
  isImporting: boolean
}>()

const emit = defineEmits<{
  (e: 'select-thumbnail', img: any): void
  (e: 'set-portrait'): void
  (e: 'delete-image', img: any): void
  (e: 'open-import'): void
  (e: 'upload-success'): void
}>()

const displayPortraitUrl = computed(() => {
  if (props.selectedGalleryImage) {
    return props.selectedGalleryImage.url
  }
  return props.roleMeta?.portrait_url || ''
})

const isCurrentDisplayActivePortrait = computed(() => {
  if (props.selectedGalleryImage) {
    return props.selectedGalleryImage.filename === props.roleMeta?.portrait_filename
  }
  return !!props.roleMeta?.portrait_url
})

function beforeImageUpload(rawFile: any) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(rawFile.type)) {
    ElMessage.error('图片文件必须是 JPG/PNG/WebP 格式之一')
    return false
  }
  if (rawFile.size / 1024 / 1024 > 10) {
    ElMessage.error('图片大小不能超过 10MB')
    return false
  }
  return true
}

function handleGalleryUploadSuccess(response: any) {
  if (response.ok) {
    ElMessage.success('成功上传至角色画廊')
    emit('upload-success')
  } else {
    ElMessage.error(response.error || '上传失败')
  }
}

function getRoleGradient(roleId: string) {
  if (!roleId) return 'linear-gradient(135deg, #e9d5ff 0%, #fbcfe8 100%)'
  
  const gradients = [
    'linear-gradient(135deg, #f3e8ff 0%, #fae8ff 50%, #e0e7ff 100%)', // Soft Lavender
    'linear-gradient(135deg, #ffedd5 0%, #ffd6e8 100%)', // Soft Rose Sunset
    'linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%)', // Soft Sky Cyan
    'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', // Soft Mint Green
    'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', // Soft Cream Gold
    'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)', // Light Amethyst
  ]
  
  let hash = 0
  for (let i = 0; i < roleId.length; i++) {
    hash = roleId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % gradients.length
  return gradients[index]
}
</script>

<template>
  <div class="role-left-panel">
    <!-- 主立绘展示窗 -->
    <div class="portrait-display-window">
      <div class="portrait-image-wrapper" :style="{ background: getRoleGradient(props.roleId) }">
        <img v-if="displayPortraitUrl" :src="displayPortraitUrl" class="portrait-img" />
        <div v-else class="portrait-placeholder">
          <el-icon class="placeholder-icon"><i-ep-picture /></el-icon>
          <span>暂无预览图片</span>
        </div>
        
        <!-- 设为封面立绘的悬浮爱心图标 (Hover 呈现) -->
        <div 
          v-if="displayPortraitUrl" 
          class="portrait-heart-btn" 
          :class="{ 'is-active': isCurrentDisplayActivePortrait }"
          @click.stop="emit('set-portrait')"
          :title="isCurrentDisplayActivePortrait ? '已设为封面立绘' : '设为封面立绘'"
        >
          <el-icon v-if="isCurrentDisplayActivePortrait">
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

    <!-- 角色画廊/相册 (横向滚动或小网格) -->
    <div class="gallery-album-section">
      <div class="section-title">
        <span>角色相册</span>
        <el-button type="primary" link size="small" @click="emit('open-import')">从收藏导入</el-button>
      </div>
      <div class="gallery-grid">
        <!-- 缩略图列表 -->
        <div 
          v-for="img in props.galleryImages" 
          :key="img.filename" 
          class="gallery-thumbnail-card"
          :class="{ 
            'is-previewing': props.selectedGalleryImage && props.selectedGalleryImage.filename === img.filename
          }"
          @click="emit('select-thumbnail', img)"
        >
          <img :src="img.url" class="thumbnail-img" />
          <!-- 悬浮删除按钮 (x) -->
          <div class="thumbnail-delete-btn" @click.stop="emit('delete-image', img)" title="删除照片">
            <el-icon><i-ep-close /></el-icon>
          </div>
          <!-- 状态角标 -->
          <div class="thumbnail-badges" v-if="img.is_portrait">
            <span class="badge-portrait">立绘</span>
          </div>
        </div>

        <!-- 导入中的占位卡 -->
        <div v-if="props.isImporting" class="gallery-thumbnail-card is-loading-placeholder">
          <div class="loading-placeholder-content">
            <el-icon class="is-loading"><i-ep-loading /></el-icon>
            <span>导入中...</span>
          </div>
        </div>
        
        <!-- 上传相册图片 + 按钮 -->
        <el-upload
          class="gallery-uploader-card"
          :action="`/api/chat/roles/${props.roleId}/gallery`"
          :show-file-list="false"
          :before-upload="beforeImageUpload"
          :on-success="handleGalleryUploadSuccess"
        >
          <div class="uploader-placeholder">
            <el-icon><i-ep-plus /></el-icon>
            <span>上传照片</span>
          </div>
        </el-upload>
      </div>
    </div>
  </div>
</template>

<style scoped>
.role-left-panel {
  flex: 0 0 35%;
  max-width: 35%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.portrait-display-window {
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid #ebeef5;
  box-shadow: 0 4px 16px rgba(148, 163, 184, 0.05);
  overflow: hidden;
  aspect-ratio: 2 / 3;
  position: relative;
}

.portrait-image-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.portrait-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.portrait-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #94a3b8;
  font-size: 14px;
}

.placeholder-icon {
  font-size: 48px;
  opacity: 0.7;
}

.portrait-heart-btn {
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: 10;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  transition: all 0.2s ease, opacity 0.3s ease;
  opacity: 0;
  transform: scale(0.8);
}

.portrait-display-window:hover .portrait-heart-btn {
  opacity: 1;
  transform: scale(1);
}

.portrait-heart-btn:hover {
  transform: scale(1.1) !important;
  color: #ef4444;
  background: #ffffff;
}

.portrait-heart-btn.is-active {
  color: #ef4444;
}

.gallery-album-section {
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid #ebeef5;
  box-shadow: 0 4px 16px rgba(148, 163, 184, 0.05);
  padding: 20px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.gallery-thumbnail-card {
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  border: 2px solid #f1f5f9;
  cursor: pointer;
  background: #f8fafc;
  transition: all 0.2s;
}

.gallery-thumbnail-card.is-previewing {
  border-color: #34d399;
  box-shadow: 0 0 0 2.5px rgba(52, 211, 153, 0.45);
}

.gallery-thumbnail-card.is-loading-placeholder {
  border: 2px dashed #34d399;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(52, 211, 153, 0.05);
  color: #34d399;
  font-size: 11px;
  cursor: default;
}

.loading-placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.loading-placeholder-content .el-icon {
  font-size: 18px;
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnail-delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 5;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s ease;
  font-size: 10px;
}

.gallery-thumbnail-card:hover .thumbnail-delete-btn {
  opacity: 1;
}

.thumbnail-delete-btn:hover {
  background: #ef4444;
  transform: scale(1.1);
}

.thumbnail-badges {
  position: absolute;
  bottom: 4px;
  left: 4px;
  display: flex;
  gap: 2px;
}

.badge-portrait {
  font-size: 8px;
  padding: 1px 4px;
  border-radius: 3px;
  color: #fff;
  font-weight: bold;
  background: #6366f1;
}

.gallery-uploader-card {
  aspect-ratio: 1;
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;
  background: transparent;
}

.gallery-uploader-card:hover {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.02);
}

.uploader-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 500;
}

.gallery-uploader-card:hover .uploader-placeholder {
  color: #6366f1;
}
</style>
