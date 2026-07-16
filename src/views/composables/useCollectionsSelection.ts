import { ref, type Ref } from 'vue'
import type { CollectionItem } from '@/stores/collections'

export function useCollectionsSelection(
  currentGalleryFiles: Ref<CollectionItem[]>,
  activeFolderIndex: Ref<number | null>,
  localFolderContents: Ref<{ files: CollectionItem[] }>
) {
  const selectedItemIds = ref<number[]>([])
  const lastSelectedIndex = ref<number | null>(null)

  function handleHeaderClick(item: CollectionItem, event: MouseEvent) {
    const visibleItems = activeFolderIndex.value !== null
      ? localFolderContents.value.files
      : currentGalleryFiles.value

    const index = visibleItems.findIndex(i => i.id === item.id)
    if (index === -1) return

    if (event.shiftKey && lastSelectedIndex.value !== null) {
      const start = Math.min(lastSelectedIndex.value, index)
      const end = Math.max(lastSelectedIndex.value, index)
      for (let i = start; i <= end; i++) {
        const it = visibleItems[i]
        if (it && !selectedItemIds.value.includes(it.id)) {
          selectedItemIds.value.push(it.id)
        }
      }
    } else {
      const idx = selectedItemIds.value.indexOf(item.id)
      if (idx > -1) {
        selectedItemIds.value.splice(idx, 1)
      } else {
        selectedItemIds.value.push(item.id)
      }
      lastSelectedIndex.value = index
    }
  }

  function clearSelectionIfBlank(event: MouseEvent) {
    const target = event.target as HTMLElement
    if (
      !target.closest('.result-card') &&
      !target.closest('.spaces-sidebar') &&
      !target.closest('.category-tabs') &&
      !target.closest('.el-dialog') &&
      !target.closest('.el-dropdown') &&
      !target.closest('.el-popper') &&
      !target.closest('.el-overlay') &&
      !target.closest('.el-message') &&
      !target.closest('.el-message-box') &&
      !target.closest('.floating-search-panel')
    ) {
      selectedItemIds.value = []
      lastSelectedIndex.value = null
    }
  }

  return {
    selectedItemIds,
    lastSelectedIndex,
    handleHeaderClick,
    clearSelectionIfBlank
  }
}
