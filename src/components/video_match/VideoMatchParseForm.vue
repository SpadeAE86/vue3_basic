<script setup lang="ts">
import { Setting } from '@element-plus/icons-vue'

const props = defineProps<{
  modelValue: {
    script: string
    topic: string
    title: string
    car_model: string
    frame_size: string
    frame_orientation: string
    workspace: string
  }
  parsing: boolean
  zhijiCarModelOptions: { label: string; value: string }[]
  frameSizeOptions: { label: string; value: string }[]
  frameOrientationOptions: { label: string; value: string }[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: typeof props.modelValue): void
  (e: 'parse'): void
  (e: 'open-template-dialog'): void
}>()
</script>

<template>
  <el-form class="parse-form" label-width="72px" @submit.prevent="emit('parse')">
    <el-form-item label="口播脚本" required>
      <el-input
        :model-value="modelValue.script"
        @update:model-value="v => emit('update:modelValue', { ...modelValue, script: v })"
        type="textarea"
        :rows="3"
        placeholder="例如：智己LS6，城市道路，展示一键泊车功能..."
      />
    </el-form-item>
    <div class="vm-extra-fields">
      <div class="form-row-inline">
        <el-form-item label="主题">
          <el-input
            :model-value="modelValue.topic"
            @update:model-value="v => emit('update:modelValue', { ...modelValue, topic: v })"
            placeholder="选填"
          />
        </el-form-item>
        <el-form-item label="标题">
          <el-input
            :model-value="modelValue.title"
            @update:model-value="v => emit('update:modelValue', { ...modelValue, title: v })"
            placeholder="选填"
          />
        </el-form-item>
        <el-form-item label="车型">
          <el-select
            :model-value="modelValue.car_model"
            @update:model-value="v => emit('update:modelValue', { ...modelValue, car_model: v })"
            placeholder="请选择车型"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="opt in zhijiCarModelOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
      </div>
      <div class="form-row-inline vm-frame-constraints-row">
        <el-form-item label="画面比例">
          <el-select
            :model-value="modelValue.frame_size"
            @update:model-value="v => emit('update:modelValue', { ...modelValue, frame_size: v })"
            placeholder="选填：与索引 frame_size 一致"
            clearable
            class="frame-size-select"
          >
            <el-option
              v-for="opt in frameSizeOptions"
              :key="`fs_${opt.value || 'any'}`"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="横竖屏">
          <el-select
            :model-value="modelValue.frame_orientation"
            @update:model-value="v => emit('update:modelValue', { ...modelValue, frame_orientation: v })"
            placeholder="选填：仅定横竖屏"
            clearable
            class="frame-orientation-select"
          >
            <el-option
              v-for="opt in frameOrientationOptions"
              :key="`fo_${opt.value || 'any'}`"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
      </div>
    </div>
    <el-form-item>
      <div class="parse-actions-row">
        <el-button type="primary" :loading="parsing" @click="emit('parse')">
          {{ parsing ? '转写中...' : '解析 / 转写' }}
        </el-button>
        <el-tooltip content="AND 命中模板" placement="bottom">
          <el-button
            circle
            size="default"
            class="template-gear-btn"
            title="AND 命中模板"
            @click="emit('open-template-dialog')"
          >
            <el-icon><Setting /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </el-form-item>
  </el-form>
</template>
