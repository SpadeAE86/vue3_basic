import { ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { CollectionItem } from '@/stores/collections'

export function useCollectionsPreview(
  currentGalleryFiles: Ref<CollectionItem[]>,
  getSpaceName: (spaceId: number | null) => string,
  updateItemTagsInStore: (id: number, tags: string[]) => Promise<boolean>
) {
  const router = useRouter()
  const previewVisible = ref(false)
  const previewUrl = ref('')
  const previewMediaType = ref('video')
  const previewPrompt = ref('')
  const previewTags = ref<string[]>([])
  const previewSpaceName = ref('')
  const previewItem = ref<CollectionItem | null>(null)

  function openPreview(item: CollectionItem) {
    previewItem.value = item
    const url = item.data.url || item.data.image_url || ''
    const isVid = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm')
    previewUrl.value = url
    previewMediaType.value = item.data.media_type || (isVid ? 'video' : 'image')
    previewPrompt.value = item.data.prompt || ''
    previewTags.value = item.tags || []
    previewSpaceName.value = getSpaceName(item.space_id)
    previewVisible.value = true
  }

  function handlePrevPreview() {
    if (!previewItem.value) return
    const files = currentGalleryFiles.value
    const index = files.findIndex(f => f.id === previewItem.value?.id)
    if (index > 0) {
      openPreview(files[index - 1])
    } else if (files.length > 0) {
      openPreview(files[files.length - 1])
    }
  }

  function handleNextPreview() {
    if (!previewItem.value) return
    const files = currentGalleryFiles.value
    const index = files.findIndex(f => f.id === previewItem.value?.id)
    if (index > -1 && index < files.length - 1) {
      openPreview(files[index + 1])
    } else if (files.length > 0) {
      openPreview(files[0])
    }
  }

  async function handleUpdateTags(tags: string[]) {
    if (!previewItem.value) return
    const success = await updateItemTagsInStore(previewItem.value.id, tags)
    if (success) {
      previewTags.value = tags
      previewItem.value.tags = tags
    }
  }

  function handlePrefillFromCollections() {
    if (!previewItem.value) return
    const data = previewItem.value.data
    const detail = {
      type: data.type || data.media_type || (previewMediaType.value === 'video' ? 't2v' : 't2i'),
      prompt: data.prompt || '',
      model: data.model || '',
      resolution: data.resolution || data.size || '',
      ratio: data.ratio || '',
      duration: data.duration,
      referenceMedia: data.referenceMedia || []
    }
    window.dispatchEvent(new CustomEvent('imagegen:prefill', { detail }))
    previewVisible.value = false
    router.push('/image')
  }

  return {
    previewVisible,
    previewUrl,
    previewMediaType,
    previewPrompt,
    previewTags,
    previewSpaceName,
    previewItem,
    openPreview,
    handlePrevPreview,
    handleNextPreview,
    handleUpdateTags,
    handlePrefillFromCollections
  }
}
