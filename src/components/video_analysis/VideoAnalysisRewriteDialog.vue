<script setup lang="ts">
const props = defineProps<{
  dialogVisible: boolean
  form: any
  isRewriting: boolean
  ZHIJI_CAR_MODEL_OPTIONS: any[]
  rewriteFrameSizeOptions: any[]
  VIDEO_FRAME_ORIENTATION_OPTIONS: any[]
}>()

const emit = defineEmits<{
  (e: 'update:dialogVisible', value: boolean): void
  (e: 'submitRewrite'): void
}>()
</script>

<template>
<el-dialog
      :model-value="props.dialogVisible" @update:modelValue="emit('update:dialogVisible', $event)"
      title="智能提取搜索条件"
      width="500px"
    >
      <el-form :model="rewriteTaskState.form" label-width="80px">
        <el-form-item label="口播脚本">
          <el-input
            v-model="props.form.script"
            type="textarea"
            :rows="4"
            placeholder="例如：智己LS6，城市道路，展示一键泊车功能..."
          />
        </el-form-item>
        <el-form-item label="主题">
          <el-input v-model="props.form.topic" placeholder="选填" />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="props.form.title" placeholder="选填" />
        </el-form-item>
        <el-form-item label="车型">
          <el-select
            v-model="props.form.car_model"
            placeholder="请选择车型（影响卖点词表与拆条）"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="opt in ZHIJI_CAR_MODEL_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="画面比例">
          <el-select
            v-model="props.form.frame_size"
            placeholder="选填：与素材库 frame_size 一致；是否在提取中标为 AND 由 AND 模板配置"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="opt in rewriteFrameSizeOptions"
              :key="`va_fs_${opt.value || 'any'}`"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="横竖屏">
          <el-select
            v-model="props.form.frame_orientation"
            placeholder="选填：仅横竖屏 keyword（frame_orientation），不定比例"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="opt in VIDEO_FRAME_ORIENTATION_OPTIONS"
              :key="`va_fo_${opt.value || 'any'}`"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="emit('update:dialogVisible', false)">取消</el-button>
          <el-button type="primary" @click="emit('submitRewrite')" :loading="props.isRewriting">
            提取
          </el-button>
        </span>
      </template>
    </el-dialog>
</template>
