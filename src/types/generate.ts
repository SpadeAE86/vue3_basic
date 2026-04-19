import type { MediaFile } from '@/components/image/MediaUploader.vue'

export type GenerateMode = 'image' | 'video'

export interface GeneratedItem {
  id: string
  model: string
  url: string | null
  loading: boolean
  error: string | null
  prompt: string
  size?: string
  resolution?: string
  ratio: string
  duration?: number
  time: string
  type: string
  referenceMedia?: MediaFile[]
  taskId?: string
}
