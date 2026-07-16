<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
  dirPath?: string | null
  folderId?: string | null
  folderTitle?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'start-train'): void
}>()

const loading = ref(false)
const loraModels = ref<{ name: string; path: string }[]>([])
const selectedModelPath = ref('')
const customModelPath = ref('')

const loraConfig = ref({
  model_type: 'sd1.5',
  pretrained_model_name_or_path: '',
  resolution: '512,512',
  train_batch_size: 1,
  max_train_epochs: 10,
  repeats: 10,
  save_every_n_epochs: 2,
  network_dim: 32,
  network_alpha: 16,
  unet_lr: 0.0001,
  text_encoder_lr: 0.00001,
  optimizer_type: 'AdamW8bit',
  lr_scheduler: 'cosine_with_restarts',
  clip_skip: 2,
  output_name: 'my_lora'
})

const optimizers = ['AdamW8bit', 'AdamW', 'Prodigy', 'DAdaptation', 'AdaFactor', 'Lion8bit', 'Lion']
const schedulers = ['cosine_with_restarts', 'cosine', 'linear', 'polynomial', 'constant', 'constant_with_warmup']

watch([selectedModelPath, customModelPath], ([sel, cust]) => {
  const modelPath = sel || cust
  if (modelPath) {
    const pathLower = modelPath.toLowerCase()
    if (pathLower.includes('sdxl') || pathLower.includes('xl_') || pathLower.includes('dream tech xl') || pathLower.includes('animexl')) {
      loraConfig.value.model_type = 'sdxl'
      if (loraConfig.value.resolution === '512,512') {
        loraConfig.value.resolution = '1024,1024'
      }
    } else if (pathLower.includes('flux')) {
      loraConfig.value.model_type = 'flux'
    } else if (pathLower.includes('sd2.0') || pathLower.includes('sd20') || pathLower.includes('sd2-')) {
      loraConfig.value.model_type = 'sd2.0'
    } else {
      loraConfig.value.model_type = 'sd1.5'
      if (loraConfig.value.resolution === '1024,1024') {
        loraConfig.value.resolution = '512,512'
      }
    }
  }
})

async function loadLoraModels() {
  try {
    const response = await fetch('/api/lora-train/models')
    const data = await response.json()
    if (data.success) {
      loraModels.value = data.models || []
      if (!loraConfig.value.pretrained_model_name_or_path && loraModels.value.length > 0) {
        selectedModelPath.value = loraModels.value[0].path
        loraConfig.value.pretrained_model_name_or_path = loraModels.value[0].path
      }
    }
  } catch (e) {
    console.error('Failed to load lora models:', e)
  }
}

async function loadDefaultConfig() {
  const cachedConfig = localStorage.getItem('tomo-lora-config')
  const cachedSel = localStorage.getItem('tomo-selected-model-path')
  const cachedCust = localStorage.getItem('tomo-custom-model-path')
  
  if (cachedConfig) {
    try {
      loraConfig.value = JSON.parse(cachedConfig)
      if (cachedSel !== null) selectedModelPath.value = cachedSel
      if (cachedCust !== null) customModelPath.value = cachedCust
      return
    } catch (e) {
      console.error('Failed to parse cached lora config:', e)
    }
  }

  try {
    const response = await fetch('/api/lora-train/config/default')
    const data = await response.json()
    if (data.success) {
      loraConfig.value = { ...loraConfig.value, ...data.config }
      if (loraConfig.value.pretrained_model_name_or_path) {
        selectedModelPath.value = loraConfig.value.pretrained_model_name_or_path
      }
    }
  } catch (e) {
    console.error('Failed to load default config:', e)
  }
}

// When dialog becomes visible, refresh models and default configs
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    loadLoraModels()
    loadDefaultConfig()
  }
})

async function startLoraTrain() {
  const modelPath = selectedModelPath.value || customModelPath.value
  if (!modelPath) {
    ElMessage.warning('请选择或输入基础模型路径！')
    return
  }
  loraConfig.value.pretrained_model_name_or_path = modelPath

  loading.value = true
  try {
    const response = await fetch('/api/lora-train/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dir_path: props.dirPath,
        folder_id: props.folderId,
        folder_title: props.folderTitle,
        repeats: loraConfig.value.repeats,
        train_config: loraConfig.value
      })
    })
    const data = await response.json()
    if (data.success) {
      ElMessage.success('LoRA 训练已在后台拉起，开始监控进程！')
      
      // 保存本次成功的训练配置到本地缓存，下次自动预填
      localStorage.setItem('tomo-lora-config', JSON.stringify(loraConfig.value))
      localStorage.setItem('tomo-selected-model-path', selectedModelPath.value)
      localStorage.setItem('tomo-custom-model-path', customModelPath.value)

      emit('start-train')
      emit('update:modelValue', false)
    } else {
      ElMessage.error(data.detail || data.message || '启动训练失败')
    }
  } catch (err: any) {
    ElMessage.error('无法连接服务器启动训练')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    title="⚙️ LoRA 训练配置"
    width="550px"
    append-to-body
    destroy-on-close
  >
    <el-form :model="loraConfig" label-width="120px" size="small" style="padding: 10px 20px;" v-loading="loading">
      <el-form-item label="基础模型">
        <el-select v-model="selectedModelPath" placeholder="选择扫描到的 checkpoints" style="width: 100%;">
          <el-option
            v-for="item in loraModels"
            :key="item.path"
            :label="item.name"
            :value="item.path"
          />
        </el-select>
        <div style="margin-top: 8px; width: 100%;">
          <el-input v-model="customModelPath" placeholder="或在此输入自定义基础模型绝对路径 (.safetensors)" />
        </div>
      </el-form-item>
      
      <el-form-item label="模型类型">
        <el-radio-group v-model="loraConfig.model_type">
          <el-radio-button value="sd1.5">SD 1.5</el-radio-button>
          <el-radio-button value="sdxl">SDXL</el-radio-button>
          <el-radio-button value="sd2.0">SD 2.0</el-radio-button>
          <el-radio-button value="flux">Flux</el-radio-button>
        </el-radio-group>
        <div style="margin-top: 4px; font-size: 11px; color: #909399; width: 100%;">
          ℹ️ 系统检测到模型路径变化时会自动智能推断并为您选择，您也可在此手动进行校正。
        </div>
      </el-form-item>
      
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="分辨率 (w,h)">
            <el-select v-model="loraConfig.resolution" placeholder="请选择分辨率" style="width: 100%;">
              <el-option label="512x512 (SD1.5 默认)" value="512,512" />
              <el-option label="512x768 (SD1.5 竖图)" value="512,768" />
              <el-option label="768x512 (SD1.5 横图)" value="768,512" />
              <el-option label="768x768" value="768,768" />
              <el-option label="768x1024 (SDXL 竖图)" value="768,1024" />
              <el-option label="1024x768 (SDXL 横图)" value="1024,768" />
              <el-option label="1024x1024 (SDXL 默认)" value="1024,1024" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="Batch Size">
            <el-input-number v-model="loraConfig.train_batch_size" :min="1" :max="64" style="width: 100%;" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="最大 Epoch">
            <el-input-number v-model="loraConfig.max_train_epochs" :min="1" :max="1000" style="width: 100%;" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="单图重复次数">
            <el-input-number v-model="loraConfig.repeats" :min="1" :max="1000" style="width: 100%;" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="模型保存间隔">
            <el-input-number v-model="loraConfig.save_every_n_epochs" :min="1" :max="100" style="width: 100%;" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="Clip Skip">
            <el-input-number v-model="loraConfig.clip_skip" :min="1" :max="4" style="width: 100%;" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="Network Dim">
            <el-input-number v-model="loraConfig.network_dim" :min="1" :max="256" style="width: 100%;" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="Network Alpha">
            <el-input-number v-model="loraConfig.network_alpha" :min="1" :max="256" style="width: 100%;" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="UNet 学习率">
            <el-input v-model="loraConfig.unet_lr" placeholder="例如: 1e-4" style="width: 100%;" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="TE 学习率">
            <el-input v-model="loraConfig.text_encoder_lr" placeholder="例如: 1e-5" style="width: 100%;" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="优化器">
            <el-select v-model="loraConfig.optimizer_type" style="width: 100%;">
              <el-option v-for="o in optimizers" :key="o" :label="o" :value="o" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="LR 调度器">
            <el-select v-model="loraConfig.lr_scheduler" style="width: 100%;">
              <el-option v-for="s in schedulers" :key="s" :label="s" :value="s" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="输出模型名称">
        <el-input v-model="loraConfig.output_name" placeholder="保存的 LoRA 模型文件名" />
      </el-form-item>
      
      <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px; padding: 10px; margin-top: 10px; font-size: 11px; color: #10b981; line-height: 1.5;">
        ℹ️ <b>自动长宽比分箱说明</b>：<br/>
        系统在开始训练时会自动整理出规范 of Kohya 数据集目录，并配置好自动分辨率分箱（Aspect Ratio Bucketing）。图片无需提前手动裁剪或缩放。
      </div>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button type="primary" @click="startLoraTrain">开始训练</el-button>
      </span>
    </template>
  </el-dialog>
</template>
