import { reactive, computed, watch, type Ref } from 'vue'
import type { MediaFile } from '@/components/image/MediaUploader.vue'
import type { GenerateMode } from '@/types/generate'

export type SizeLevel = '1K' | '2K' | '3K' | '4K'
export type RatioKey = '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive'

export const IMAGE_MODELS = [
  { value: 'Seedream 4.0', label: 'Seedream 4.0' },
  { value: 'Seedream 4.5', label: 'Seedream 4.5' },
  { value: 'Seedream 5.0', label: 'Seedream 5.0' },
  { value: 'gpt-image-2', label: 'GPT Image 2' },
]

export const VIDEO_MODELS = [
  { value: 'Seedance 2.0', label: 'Seedance 2.0' },
  { value: 'Seedance 2.0 Fast', label: 'Seedance 2.0 Fast' },
  { value: 'Seedance 1.5 Pro', label: 'Seedance 1.5 Pro' },
]

export const VIDEO_RESOLUTION_OPTIONS = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
]

export const VIDEO_DURATION_OPTIONS = [
  { value: 5, label: '5秒' },
  { value: 8, label: '8秒' },
  { value: 11, label: '11秒' },
  { value: 15, label: '15秒' },
]

export const RATIO_OPTIONS: Array<{ value: RatioKey; label: string; r: number }> = [
  { value: '16:9', label: '16:9', r: 16 / 9 },
  { value: '4:3', label: '4:3', r: 4 / 3 },
  { value: '1:1', label: '1:1', r: 1 },
  { value: '3:4', label: '3:4', r: 3 / 4 },
  { value: '9:16', label: '9:16', r: 9 / 16 },
  { value: 'adaptive', label: '自适应 (Adaptive)', r: 1 },
]

export const IMAGE_MODEL_LEVEL_OPTIONS: Record<string, SizeLevel[]> = {
  'Seedream 4.0': ['1K', '2K', '4K'],
  'Seedream 4.5': ['2K', '4K'],
  'Seedream 5.0': ['2K', '3K'],
  'gpt-image-2': ['1K', '2K'],
}

export const IMAGE_MODEL_DEFAULT_LEVEL: Record<string, SizeLevel> = {
  'Seedream 4.0': '1K',
  'Seedream 4.5': '2K',
  'Seedream 5.0': '2K',
  'gpt-image-2': '1K',
}

const LEVEL_TARGET_PIXELS: Record<SizeLevel, number> = {
  '1K': 1280 * 720,
  '2K': 2560 * 1440,
  '3K': 3072 * 1728,
  '4K': 4096 * 2304,
}

function ceilToMultiple(n: number, m: number) {
  return Math.max(m, Math.ceil(n / m) * m)
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function modelPixelBounds(model: string) {
  if (model === 'gpt-image-2') {
    // 与 Seedream 4.0 同档像素预算即可；宽高仍由 computeSizePx 对齐 16
    return { min: 1280 * 720, max: 4096 * 4096 }
  }
  if (model === 'Seedream 4.5' || model === 'Seedream 5.0') {
    return { min: 2560 * 1440, max: 4096 * 4096 }
  }
  return { min: 1280 * 720, max: 4096 * 4096 }
}

function computeSizePx(model: string, level: SizeLevel, ratio: RatioKey) {
  const r = RATIO_OPTIONS.find((x) => x.value === ratio)?.r ?? 1
  const { min, max } = modelPixelBounds(model)
  const target = clamp(LEVEL_TARGET_PIXELS[level], min, max)

  let w = Math.sqrt(target * r)
  let h = w / r
  w = ceilToMultiple(w, 16)
  h = ceilToMultiple(h, 16)

  const pixels = w * h
  if (pixels < min) {
    if (w >= h) w = ceilToMultiple(Math.sqrt(min * r), 16)
    else h = ceilToMultiple(Math.sqrt(min / r), 16)
  }

  const finalW = clamp(w, 64, 8192)
  const finalH = clamp(h, 64, 8192)
  return `${Math.round(finalW)}x${Math.round(finalH)}`
}

export function useGenerateForm(currentMode: Ref<GenerateMode>) {
  const form = reactive({
    prompt: '星际穿越，黑洞，黑洞里冲出一辆快支离破碎的复古列车...',
    sizeLevel: '2K' as SizeLevel,
    ratio: '9:16' as RatioKey,
    imageModel: 'Seedream 5.0',
    videoModel: 'Seedance 2.0',
    videoResolution: '720p',
    videoDuration: 5,
    referenceMedia: [] as MediaFile[],
  })

  const availableLevels = computed(() => IMAGE_MODEL_LEVEL_OPTIONS[form.imageModel] ?? ['2K'])

  const availableVideoResolutions = computed(() => {
    if (form.videoModel === 'Seedance 2.0' || form.videoModel === 'Seedance 2.0 Fast') {
      return VIDEO_RESOLUTION_OPTIONS.filter(o => o.value !== '1080p')
    }
    return VIDEO_RESOLUTION_OPTIONS
  })

  const availableRatios = computed(() => {
    if (currentMode.value === 'image') {
      return RATIO_OPTIONS.filter(o => o.value !== 'adaptive')
    }
    return RATIO_OPTIONS
  })

  const disableMediaUpload = computed(() => {
    return currentMode.value === 'video' && form.videoModel === 'Seedance 1.5 Pro'
  })

  const computedSize = computed(() => {
    if (currentMode.value === 'video') return form.videoResolution
    return computeSizePx(form.imageModel, form.sizeLevel, form.ratio as RatioKey)
  })

  watch(
    () => form.imageModel,
    (m) => {
      if (currentMode.value !== 'image') return
      const allowed = IMAGE_MODEL_LEVEL_OPTIONS[m] ?? []
      if (allowed.length === 0) return
      if (!allowed.includes(form.sizeLevel)) {
        form.sizeLevel = IMAGE_MODEL_DEFAULT_LEVEL[m] ?? allowed[0]!
      }
    },
    { immediate: true },
  )

  watch(
    () => form.videoModel,
    (m) => {
      if (currentMode.value !== 'video') return
      if ((m === 'Seedance 2.0' || m === 'Seedance 2.0 Fast') && form.videoResolution === '1080p') {
        form.videoResolution = '720p'
      }
      if (m === 'Seedance 1.5 Pro') {
        form.referenceMedia = []
      }
    }
  )

  watch(currentMode, (mode) => {
    if (mode === 'video' && form.ratio === '9:16') {
      form.ratio = 'adaptive'
    } else if (mode === 'image' && form.ratio === 'adaptive') {
      form.ratio = '9:16'
    }
  })

  return {
    form,
    availableLevels,
    availableVideoResolutions,
    availableRatios,
    disableMediaUpload,
    computedSize
  }
}
