<template>
<el-dialog
      :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)"
      title="分镜 · 转写与标签"
      width="560px"
      top="8vh"
      class="admin-dialog"
      align-center
      destroy-on-close
    >
      <template v-if="row">
        <div class="field-label">口播</div>
        <div class="text-panel">{{ row.segment_text || '—' }}</div>
        <div class="field-label">画面描述</div>
        <div class="text-panel">{{ row.description || '—' }}</div>
        <div class="field-label">结构化标签</div>
        <TokenChipsReadonly :tokens="tokens || []" />
      </template>
    </el-dialog>
</template>

<script setup lang="ts">
import TokenChipsReadonly from '@/components/video_match/TokenChipsReadonly.vue'
const props = defineProps<{
  modelValue: boolean,
  row: any,
  tokens: any[]
}>()
const emit = defineEmits(['update:modelValue'])
</script>