<script setup lang="ts">
import { ref, onUnmounted, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  options: Array<{ label: string; action: string; icon?: string }>
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'action', action: string): void
}>()

const menuRef = ref<HTMLElement | null>(null)

function closeMenu() {
  emit('update:visible', false)
}

function handleAction(action: string) {
  emit('action', action)
  closeMenu()
}

function handleClickOutside(event: MouseEvent) {
  if (props.visible && menuRef.value && !menuRef.value.contains(event.target as Node)) {
    closeMenu()
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    // Add event listener to close when clicking outside
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('contextmenu', handleClickOutside)
    }, 0)
  } else {
    document.removeEventListener('click', handleClickOutside)
    document.removeEventListener('contextmenu', handleClickOutside)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('contextmenu', handleClickOutside)
})
</script>

<template>
  <Transition name="fade">
    <div
      v-if="visible"
      ref="menuRef"
      class="custom-context-menu"
      :style="{
        left: x + 'px',
        top: y + 'px'
      }"
      @click.stop
      @contextmenu.prevent
    >
      <div
        v-for="opt in options"
        :key="opt.action"
        class="context-menu-item"
        @click="handleAction(opt.action)"
      >
        <el-icon v-if="opt.icon" class="menu-item-icon">
          <component :is="opt.icon" />
        </el-icon>
        <span class="menu-item-label">{{ opt.label }}</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.custom-context-menu {
  position: fixed;
  z-index: 9999;
  background: rgba(30, 30, 38, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  min-width: 130px;
  padding: 4px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.context-menu-item:hover {
  background: rgba(167, 139, 250, 0.15);
  color: #a78bfa;
}

.menu-item-icon {
  font-size: 14px;
}

.menu-item-label {
  font-weight: 500;
}

/* Animations */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
