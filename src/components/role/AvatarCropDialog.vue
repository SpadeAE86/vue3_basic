<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
  roleId: string
  sourceUrl: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'cropped'): void
}>()

const visible = ref(props.modelValue)
watch(() => props.modelValue, (newVal) => {
  visible.value = newVal
})
watch(visible, (newVal) => {
  emit('update:modelValue', newVal)
})

const cropSliderVal = ref(1.0)
const cropImgRef = ref<HTMLImageElement | null>(null)

// 基准渲染尺寸
const baseWidth = ref(320)
const baseHeight = ref(320)

// 拖拽计算状态
const dragOffset = ref({ x: 0, y: 0 })
let isDragging = false
let dragStart = { x: 0, y: 0 }
let lastOffset = { x: 0, y: 0 }

function onImageLoad(e: Event) {
  const img = e.target as HTMLImageElement
  const imgW = img.naturalWidth
  const imgH = img.naturalHeight
  if (imgW <= 0 || imgH <= 0) return
  
  const viewportSize = 320
  const ratio = imgW / imgH
  if (ratio > 1) {
    // 宽图：高度撑满 320，宽度放大
    baseHeight.value = viewportSize
    baseWidth.value = viewportSize * ratio
  } else {
    // 长图：宽度撑满 320，高度放大
    baseWidth.value = viewportSize
    baseHeight.value = viewportSize / ratio
  }
  
  // 重置状态
  cropSliderVal.value = 1.0
  dragOffset.value = { x: 0, y: 0 }
  lastOffset = { x: 0, y: 0 }
}

function handlePointerDown(e: PointerEvent) {
  isDragging = true
  dragStart = { x: e.clientX, y: e.clientY }
  if (cropImgRef.value) {
    cropImgRef.value.setPointerCapture(e.pointerId)
  }
}

function handlePointerMove(e: PointerEvent) {
  if (!isDragging) return
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y
  dragOffset.value = {
    x: lastOffset.x + dx,
    y: lastOffset.y + dy
  }
}

function handlePointerUp() {
  if (!isDragging) return
  isDragging = false
  lastOffset = { x: dragOffset.value.x, y: dragOffset.value.y }
}

function handleWheelZoom(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY < 0 ? 0.05 : -0.05
  cropSliderVal.value = Math.max(1.0, Math.min(3.0, cropSliderVal.value + delta))
}

async function handleConfirmCrop() {
  if (!cropImgRef.value) return
  
  const img = cropImgRef.value
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 400
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  // 视口尺寸固定为 320
  const viewportSize = 320
  const scale = cropSliderVal.value
  const scaledW = baseWidth.value * scale
  const scaledH = baseHeight.value * scale
  
  // 视口中裁剪框左上角是 (40, 40)，裁剪框范围是 240x240
  // 物理 canvas 尺寸是 400x400，映射比例为 400 / 240
  const cropCircleLeft = 40
  const cropCircleTop = 40
  const cropCircleSize = 240
  const scaleRatio = 400 / cropCircleSize
  
  // 视口中图片渲染的左上角坐标
  const imgViewportX = 160 + dragOffset.value.x - (scaledW / 2)
  const imgViewportY = 160 + dragOffset.value.y - (scaledH / 2)
  
  // 计算图片相对于裁剪圆框左上角的偏移，并等比缩放到 400x400 Canvas
  const canvasX = (imgViewportX - cropCircleLeft) * scaleRatio
  const canvasY = (imgViewportY - cropCircleTop) * scaleRatio
  const canvasW = scaledW * scaleRatio
  const canvasH = scaledH * scaleRatio
  
  ctx.clearRect(0, 0, 400, 400)
  ctx.drawImage(img, canvasX, canvasY, canvasW, canvasH)
  
  canvas.toBlob(async (blob) => {
    if (!blob) return
    const file = new File([blob], `avatar_crop_${Date.now()}.png`, { type: 'image/png' })
    const formData = new FormData()
    formData.append('file', file)
    
    try {
      ElMessage.info('正在保存头像...')
      // 上传至头像专用接口，该接口不会写入画廊相册
      const res = await fetch(`/api/chat/roles/${props.roleId}/avatar`, {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      if (data.ok) {
        ElMessage.success('头像裁剪并设置成功')
        visible.value = false
        emit('cropped')
      } else {
        ElMessage.error(data.error || '上传裁剪头像失败')
      }
    } catch (err) {
      console.error(err)
      ElMessage.error('上传头像发生网络异常')
    }
  }, 'image/png')
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="调整头像裁切区域"
    width="420px"
    destroy-on-close
    class="avatar-crop-dialog"
  >
    <div class="crop-container-wrapper">
      <div 
        class="crop-viewport"
        @wheel="handleWheelZoom"
      >
        <!-- 源图，绑定 Pointer 事件来平移拖动 -->
        <img 
          ref="cropImgRef"
          :src="props.sourceUrl" 
          class="crop-source-image" 
          :style="{
            width: `${baseWidth}px`,
            height: `${baseHeight}px`,
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: '0 0',
            transform: `translate3d(${160 + dragOffset.x - (baseWidth * cropSliderVal) / 2}px, ${160 + dragOffset.y - (baseHeight * cropSliderVal) / 2}px, 0) scale(${cropSliderVal})`
          }"
          @load="onImageLoad"
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerUp"
          @pointercancel="handlePointerUp"
          draggable="false"
        />
        <!-- 半透明遮罩，通过 radial-gradient 挖出中间圆孔 -->
        <div class="crop-circular-overlay"></div>
        <!-- 圆形裁剪边界指引线 -->
        <div class="crop-circular-guide"></div>
      </div>
      
      <!-- 缩放控制滑块 -->
      <div class="crop-zoom-slider">
        <el-icon><i-ep-picture /></el-icon>
        <el-slider 
          v-model="cropSliderVal" 
          :min="1.0" 
          :max="3.0" 
          :step="0.01" 
          :show-tooltip="false"
        />
        <el-icon style="font-size: 1.3em"><i-ep-picture /></el-icon>
      </div>
      
      <div class="crop-tips">
        💡 可以在视口内拖动或滚动鼠标滑轮调整头像区域
      </div>
    </div>
    
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleConfirmCrop">确定并保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.crop-container-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 10px 0;
}

.crop-viewport {
  width: 320px;
  height: 320px;
  position: relative;
  overflow: hidden;
  background: #000000;
  border-radius: 8px;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8), 0 4px 16px rgba(0, 0, 0, 0.1);
  cursor: grab;
  touch-action: none;
}

.crop-viewport:active {
  cursor: grabbing;
}

.crop-source-image {
  position: absolute;
  top: 50%;
  left: 50%;
  user-select: none;
  pointer-events: auto;
  max-width: none !important;
  max-height: none !important;
}

.crop-circular-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  background: rgba(15, 23, 42, 0.65);
  mask: radial-gradient(circle 120px at center, transparent 99%, #000 100%);
  -webkit-mask: radial-gradient(circle 120px at center, transparent 99%, #000 100%);
}

.crop-circular-guide {
  position: absolute;
  top: 40px;
  left: 40px;
  width: 240px;
  height: 240px;
  border: 2px dashed rgba(255, 255, 255, 0.95);
  border-radius: 50%;
  pointer-events: none;
  box-sizing: border-box;
}

.crop-zoom-slider {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 12px;
  padding: 0 10px;
  color: #64748b;
}

.crop-zoom-slider :deep(.el-slider) {
  flex: 1;
}

.crop-tips {
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
}
</style>
