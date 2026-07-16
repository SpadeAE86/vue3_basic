<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useLanguage } from '../../views/composables/useLanguage'
import { ElMessage, ElMessageBox } from 'element-plus'
import SpaceTaggerLoraConfigDialog from './SpaceTaggerLoraConfigDialog.vue'
import SpaceTaggerLoraMonitor from './SpaceTaggerLoraMonitor.vue'
import SpaceTaggerFreqPanel from './SpaceTaggerFreqPanel.vue'
import SpaceTaggerEditPanel from './SpaceTaggerEditPanel.vue'
import SpaceTaggerTaxonomyDialog from './SpaceTaggerTaxonomyDialog.vue'

const props = defineProps<{
  visible: boolean
  dirPath?: string | null
  folderId?: string | null
  folderTitle?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
}>()

const loading = ref(false)
const progress = ref(0)
const tagsFrequency = ref<{ tag: string; count: number }[]>([])
const files = ref<{ name: string; path: string; cover_url: string; tags: string[] }[]>([])
const resolvedDirPath = ref('')

// === Taxonomy / Tag Category States ===
const selectedCategory = ref('')
const taxonomyVisible = ref(false)
const taxonomy = ref<Record<string, any>>({})
const taxonomyHistory = ref<Record<string, any>>({})
const fastMap = ref<Record<string, string>>({})
const categories = ref<string[]>([])

// === LoRA Training Integration State ===
const isTrainingActive = ref(false)
const loraConfigVisible = ref(false)
const loraLogs = ref('')

const interrogateMode = ref<'append' | 'overwrite'>('append')
const singleRollbacks = ref<Record<string, string[]>>({})
const interrogateConfirmVisible = ref(false)

const activeTasks = ref<any[]>([])
const trainingTask = ref<any | null>(null)
const taggerTask = ref<any | null>(null)
let pollTimer: any = null
let currentInterval = 1500

const localServiceReady = ref(true)

async function checkLocalServiceHealth() {
  try {
    const response = await fetch('/api/tagger/health-check')
    const data = await response.json()
    localServiceReady.value = !!(data.success && data.ready)
  } catch (err) {
    localServiceReady.value = false
  }
}

const isStartingService = ref(false)

async function handleStartLocalService(): Promise<boolean> {
  if (isStartingService.value) {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (localServiceReady.value) {
          clearInterval(checkInterval)
          resolve(true)
        } else if (!isStartingService.value) {
          clearInterval(checkInterval)
          resolve(localServiceReady.value)
        }
      }, 1000)
    })
  }

  isStartingService.value = true
  try {
    const response = await fetch('/api/tagger/start-local-service', {
      method: 'POST'
    })
    const data = await response.json()
    if (data.success) {
      ElMessage.success('正在本地拉起 AI 守护进程，请稍候...')
      return new Promise((resolve) => {
        let attempts = 0
        const interval = setInterval(async () => {
          await checkLocalServiceHealth()
          attempts++
          if (localServiceReady.value || attempts >= 15) {
            clearInterval(interval)
            isStartingService.value = false
            if (localServiceReady.value) {
              ElMessage.success('本地 AI 服务已成功连接！')
              loadTags()
              resolve(true)
            } else {
              ElMessage.error('本地 AI 服务启动超时，请双击 TomoLocalAIService/start_local_service.bat 手动查看命令行窗口。')
              resolve(false)
            }
          }
        }, 1000)
      })
    } else {
      ElMessage.error(data.message || '启动服务失败')
      isStartingService.value = false
      return false
    }
  } catch (err) {
    ElMessage.error('无法连接主后端启动服务')
    isStartingService.value = false
    return false
  }
}

async function ensureServiceAndExecute(callback: () => void | Promise<void>) {
  if (localServiceReady.value) {
    await callback()
    return
  }

  ElMessage.info('本地 AI 服务未连接，正在尝试自动拉起，请稍候...')
  const started = await handleStartLocalService()
  if (started && localServiceReady.value) {
    await callback()
  } else {
    console.log("Could not auto-start local AI service.")
  }
}

async function checkTasks() {
  await checkLocalServiceHealth()

  if (!localServiceReady.value) {
    activeTasks.value = []
    progress.value = 0
    trainingTask.value = null
    isTrainingActive.value = false
    return
  }

  try {
    const response = await fetch('/api/tagger/tasks')
    const data = await response.json()
    if (data.success) {
      activeTasks.value = data.tasks || []

      // Find running tagger task
      const runningTagger = activeTasks.value.find((t: any) => t.task_type === 'tagger' && (t.status === 'running' || t.status === 'pending'))
      if (runningTagger) {
        taggerTask.value = runningTagger
        progress.value = runningTagger.progress
      } else {
        if (taggerTask.value) {
          const completedTagger = activeTasks.value.find((t: any) => t.id === taggerTask.value.id)
          if (completedTagger) {
            if (completedTagger.status === 'completed') {
              ElMessage.success('反推打标任务已完成！')
              loadTags()
            } else if (completedTagger.status === 'failed') {
              ElMessage.error(`反推打标任务失败: ${completedTagger.message}`)
            }
          }
          taggerTask.value = null
          progress.value = 0
        }
      }

      // Find running training task
      const runningTrain = activeTasks.value.find((t: any) => t.task_type === 'train' && (t.status === 'running' || t.status === 'pending'))
      if (runningTrain) {
        trainingTask.value = runningTrain
        isTrainingActive.value = true
        loadTrainingLogs(runningTrain.id)
      } else {
        if (trainingTask.value) {
          const completedTrain = activeTasks.value.find((t: any) => t.id === trainingTask.value.id)
          if (completedTrain) {
            if (completedTrain.status === 'completed') {
              ElMessage.success('LoRA 训练成功完成！')
              loadTags()
            } else if (completedTrain.status === 'failed') {
              ElMessage.error(`LoRA 训练失败: ${completedTrain.message}`)
            }
            loadTrainingLogs(trainingTask.value.id)
          }
          trainingTask.value = null
          isTrainingActive.value = false
        }
      }

      // Dynamic adjust polling interval
      const hasActiveJob = activeTasks.value.some((t: any) =>
        (t.task_type === 'train' || t.task_type === 'tagger') &&
        (t.status === 'running' || t.status === 'pending')
      )
      const nextInterval = hasActiveJob ? 2500 : 6000
      if (nextInterval !== currentInterval) {
        currentInterval = nextInterval
        stopPolling()
        if (props.visible) {
          pollTimer = setInterval(checkTasks, currentInterval)
        }
      }
    }
  } catch (err) {
    console.error('Failed to check tasks:', err)
  }
}

function startPolling() {
  if (pollTimer) return
  currentInterval = 1500
  checkTasks()
  pollTimer = setInterval(checkTasks, currentInterval)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function stopLoraTrain() {
  if (!trainingTask.value) return
  try {
    const response = await fetch(`/api/lora-train/stop/${trainingTask.value.id}`, {
      method: 'POST'
    })
    const data = await response.json()
    if (data.success) {
      ElMessage.warning('训练已强行终止！')
      isTrainingActive.value = false
      trainingTask.value = null
      checkTasks()
    } else {
      ElMessage.error(data.message || '终止进程失败')
    }
  } catch (e) {
    ElMessage.error('终止请求失败')
  }
}

async function loadTrainingLogs(taskId: string) {
  try {
    const response = await fetch(`/api/lora-train/logs/${taskId}`)
    const data = await response.json()
    if (data.success) {
      loraLogs.value = data.logs || ''
    }
  } catch (e) {
    console.error('Failed to load training logs:', e)
  }
}

onUnmounted(() => {
  stopPolling()
})

watch(() => props.visible, (newVal) => {
  if (newVal) {
    loadTags()
    loadTaxonomy()
    startPolling()
  } else {
    stopPolling()
  }
}, { immediate: true })

async function loadTags() {
  loading.value = true
  try {
    const response = await fetch('/api/tagger/space-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dir_path: props.dirPath,
        folder_id: props.folderId,
        folder_title: props.folderTitle
      })
    })
    const data = await response.json()
    if (data.success) {
      tagsFrequency.value = data.tags_frequency || []
      files.value = data.files || []
      resolvedDirPath.value = data.dir_path || ''
    } else {
      ElMessage.warning(data.message || '加载标签失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('无法连接服务器')
  } finally {
    loading.value = false
  }
}

async function loadTaxonomy() {
  try {
    const response = await fetch('/api/tagger/taxonomy')
    const data = await response.json()
    if (data.success) {
      taxonomy.value = data.taxonomy || {}
      taxonomyHistory.value = data.history || {}

      const fMap: Record<string, string> = {}
      const cats: string[] = []

      Object.entries(data.history || {}).forEach(([cat, list]: [string, any]) => {
        cats.push(cat)
        list.forEach((item: any) => {
          fMap[item.tag.toLowerCase().trim()] = cat
        })
      })

      fastMap.value = fMap

      const order = ["motion", "face", "outfit", "hair", "item", "scene", "character", "style", "quality", "body", "camera", "detail", "concept"]
      categories.value = cats.sort((a, b) => {
        const idxA = order.indexOf(a)
        const idxB = order.indexOf(b)
        if (idxA > -1 && idxB > -1) return idxA - idxB
        if (idxA > -1) return -1
        if (idxB > -1) return 1
        return a.localeCompare(b)
      })
    }
  } catch (err) {
    console.error('Failed to load taxonomy:', err)
  }
}

async function handleReassign({ tag, targetCategory }: { tag: string; targetCategory: string }) {
  try {
    const response = await fetch('/api/tagger/taxonomy/reassign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag,
        target_category_path: targetCategory
      })
    })
    const data = await response.json()
    if (data.success) {
      ElMessage.success(`重新分类成功！"${tag}" ➜ "${targetCategory}"`)
      await loadTaxonomy()
      await loadTags()
    } else {
      ElMessage.error(data.message || '修改类别失败')
    }
  } catch (e) {
    ElMessage.error('网络请求失败，无法调整分类')
  }
}

async function triggerBulkInterrogate(mode: 'append' | 'overwrite') {
  interrogateConfirmVisible.value = false
  interrogateMode.value = mode
  await executeBulkInterrogate()
}

async function executeBulkInterrogate() {
  loading.value = true
  progress.value = 10
  try {
    const response = await fetch('/api/tagger/interrogate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dir_path: props.dirPath,
        folder_id: props.folderId,
        folder_title: props.folderTitle,
        append_only: interrogateMode.value === 'append'
      })
    })
    progress.value = 70
    const data = await response.json()
    if (data.success) {
      ElMessage.success(`反推完成！成功处理 ${data.files_processed} 张图片`)
      progress.value = 100
      setTimeout(() => {
        progress.value = 0
        loadTags()
      }, 500)
    } else {
      ElMessage.error(data.message || '反推失败')
      progress.value = 0
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('反推任务失败')
    progress.value = 0
  } finally {
    loading.value = false
  }
}

async function handleBulkAdd(tag: string, category?: string) {
  loading.value = true
  try {
    const response = await fetch('/api/tagger/space-tags/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dir_path: props.dirPath,
        folder_id: props.folderId,
        folder_title: props.folderTitle,
        action: 'add',
        tag,
        category: category || undefined
      })
    })
    const data = await response.json()
    if (data.success) {
      ElMessage.success(`批量新增成功，修改了 ${data.files_modified} 个标注文件`)
      bulkAddedTagsSet.value.add(tag.toLowerCase().trim())
      await loadTags()
    } else {
      ElMessage.error(data.message || '批量新增失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('网络请求失败')
  } finally {
    loading.value = false
  }
}

async function handleBulkRemove(tag: string) {
  loading.value = true
  try {
    const response = await fetch('/api/tagger/space-tags/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dir_path: props.dirPath,
        folder_id: props.folderId,
        folder_title: props.folderTitle,
        action: 'remove',
        tag
      })
    })
    const data = await response.json()
    if (data.success) {
      ElMessage.success(`批量剔除成功，修改了 ${data.files_modified} 个标注文件`)
      bulkAddedTagsSet.value.delete(tag.toLowerCase().trim())
      await loadTags()
    } else {
      ElMessage.error(data.message || '批量剔除失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('网络请求失败')
  } finally {
    loading.value = false
  }
}

async function saveSingleImageTags(fileItem: any, category?: string) {
  loading.value = true
  let item_id = null
  const parts = fileItem.name.split('_')
  if (parts.length >= 2) {
    const possible_id = parts[1].split('.')[0]
    if (possible_id.length === 36) {
      item_id = possible_id
    }
  }

  try {
    const response = await fetch('/api/tagger/image-tags/single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_path: fileItem.path,
        item_id: item_id,
        tags: fileItem.tags,
        category: category || undefined
      })
    })
    const data = await response.json()
    if (data.success) {
      ElMessage.success(`图片 "${fileItem.name}" 标签已更新`)
      if (category) {
        fileItem.tags.forEach((tag: string) => {
          const normalized = tag.toLowerCase().trim().replace(/\s+/g, '_')
          fastMap.value[normalized] = category
        })
      }
      await loadTags()
      await loadTaxonomy()
    } else {
      ElMessage.error(data.message || '更新标签失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('网络请求失败')
  } finally {
    loading.value = false
  }
}

const editingCards = ref<Record<string, boolean>>({})
const bulkAddedTagsSet = ref(new Set<string>())

function toggleEditCard(fileItem: any) {
  const path = fileItem.path
  if (editingCards.value[path]) {
    saveSingleImageTags(fileItem, selectedCategory.value)
    editingCards.value[path] = false
  } else {
    editingCards.value[path] = true
  }
}

async function handleSaveOverlayTag(fileItem: any, rawInput: string, category?: string) {
  if (rawInput) {
    const parts = rawInput.split(/[,，;；\n\r]+/).map(s => s.trim()).filter(Boolean)
    let changed = false
    const addedTags: string[] = []
    const existingTags: string[] = []

    for (const p of parts) {
      // 统一转为下划线标准化存储与比对
      const cleaned = p.toLowerCase().replace(/\s+/g, '_')
      const alreadyHas = fileItem.tags.some((t: string) => t.toLowerCase().replace(/\s+/g, '_') === cleaned)

      if (alreadyHas) {
        existingTags.push(cleaned)
        // 如果标签已在图片中，但用户在特定过滤分类视图下再次添加，则将它重新划归到该分类
        if (category && category !== 'General') {
          const currentCat = fastMap.value[cleaned] || 'General'
          if (currentCat !== category) {
            try {
              await fetch('/api/tagger/taxonomy/reassign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag: cleaned, target_category: category })
              })
              fastMap.value[cleaned] = category
              changed = true
            } catch (e) {
              console.error('Failed to reassign category:', e)
            }
          }
        }
      } else {
        fileItem.tags.push(cleaned)
        changed = true
        addedTags.push(cleaned)
      }
    }

    if (existingTags.length > 0 && addedTags.length === 0) {
      if (changed) {
        ElMessage.success(`标签已存在，但已将其归类到 "${category}" 类别`)
        await loadTags()
        await loadTaxonomy()
      } else {
        ElMessage.warning(`标签 "${existingTags.join(', ')}" 已存在`)
      }
    } else if (changed) {
      await saveSingleImageTags(fileItem, category)
      ElMessage.success(`标签 "${addedTags.join(', ')}" 添加成功`)
    }
  }
}

async function handleRemoveOverlayTag(fileItem: any, tag: string) {
  fileItem.tags = fileItem.tags.filter((t: string) => t !== tag)
  await saveSingleImageTags(fileItem)
}

async function handleSingleInterrogate(fileItem: any, mode: 'append' | 'overwrite') {
  await ensureServiceAndExecute(async () => {
    try {
      // 缓存反推前的旧标签状态用于快速回滚
      singleRollbacks.value[fileItem.path] = [...fileItem.tags]

      const response = await fetch('/api/tagger/interrogate/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_path: fileItem.path,
          append_only: mode === 'append'
        })
      })
      const data = await response.json()
      if (data.success && data.tags) {
        fileItem.tags = data.tags
        ElMessage.success('该图片反推打标已完成！如果效果不理想，可点击图片卡片中的“回滚”撤销')
        // 触发分类刷新
        loadTaxonomy()
      } else {
        ElMessage.error(data.message || '单个反推失败')
        // 失败了就删除回滚缓存
        delete singleRollbacks.value[fileItem.path]
      }
    } catch (err) {
      console.error(err)
      ElMessage.error('网络请求失败')
      delete singleRollbacks.value[fileItem.path]
    }
  })
}

async function handleSingleRollback(fileItem: any) {
  const previous = singleRollbacks.value[fileItem.path]
  if (!previous) {
    ElMessage.warning('没有找到该图片的上一次标签记录！')
    return
  }

  try {
    fileItem.tags = [...previous]
    const res = await saveSingleImageTags(fileItem)
    if (res.success) {
      ElMessage.success('成功回滚该图片的标签状态！')
      delete singleRollbacks.value[fileItem.path]
      loadTaxonomy()
    } else {
      ElMessage.error(res.message || '回滚失败')
    }
  } catch (err) {
    ElMessage.error('回滚操作失败')
  }
}

const selectedTagFromFreq = ref('')

function handleSelectTag(tag: string) {
  selectedTagFromFreq.value = tag
  nextTick(() => {
    selectedTagFromFreq.value = ''
  })
}

function handleStartTrain() {
  isTrainingActive.value = true
  checkTasks()
  startPolling()
}

async function handleFaceDetect() {
  if (!resolvedDirPath.value) {
    ElMessage.error('目录未标定，无法提取面部')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定对目录 "${resolvedDirPath.value}" 内的所有图片进行面部提取吗？\n提取后的面部头像将保存至同层级下的 "${props.folderTitle || '本地目录'}_face" 文件夹中，裁剪框将保留 3.0 倍的面部上下文，并自动拷贝对应的 .txt 标签文件用于后续训练。`,
      '面部提取确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'info'
      }
    )

    loading.value = true
    const response = await fetch('/api/tagger/face-detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dir_path: resolvedDirPath.value,
        crop_factor: 1.5
      })
    })
    const data = await response.json()
    if (data.success) {
      ElMessage.success('面部提取任务已提交至后台运行！')
      progress.value = 1
      startPolling()
    } else {
      ElMessage.error(data.message || '提交任务失败')
    }
  } catch (err) {
    if (err !== 'cancel') {
      console.error(err)
      ElMessage.error('网络请求失败')
    }
  } finally {
    loading.value = false
  }
}

const sortMode = ref<'type' | 'frequency'>('type')
const { showChinese, toggleLanguage } = useLanguage()
const searchQuery = ref('')

watch(() => props.visible, (newVal) => {
  if (newVal) {
    loadTags()
    loadTaxonomy()
    editingCards.value = {}
    bulkAddedTagsSet.value.clear()
    selectedCategory.value = ''
    sortMode.value = 'type'
    searchQuery.value = ''
  }
})
</script>

<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="val => emit('update:visible', val)"
    width="90%"
    top="5vh"
    destroy-on-close
    align-center
  >
    <template #header>
      <div class="dialog-title-row" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="dialog-title-text">🏷️ LoRA 训练集反推打标空间</span>

          <!-- Status Indicator Light -->
          <div class="health-indicator" :class="localServiceReady ? 'ready' : 'offline'">
            <span class="indicator-dot"></span>
            <span class="indicator-text">{{ localServiceReady ? '本地 AI 服务已连接' : '本地 AI 服务未连接' }}</span>
          </div>
        </div>

        <div style="display: flex; gap: 8px; align-items: center; margin-right: 24px;">
          <el-button
            type="primary"
            size="small"
            round
            plain
            class="sort-mode-capsule-btn"
            @click="sortMode = sortMode === 'type' ? 'frequency' : 'type'"
          >
            {{ sortMode === 'type' ? '按类型排序' : '按词频显示' }}
          </el-button>
          <el-button
            type="warning"
            size="small"
            round
            plain
            class="lang-mode-capsule-btn"
            @click="toggleLanguage"
          >
            {{ showChinese ? '显示：中文别名' : '显示：英文标签' }}
          </el-button>
        </div>
      </div>
    </template>
    <div class="workspace-wrapper" v-loading="loading">

      <!-- Health Validation Check Warning -->
      <el-alert
        v-if="!localServiceReady"
        title="本地 AI 服务未启动"
        type="warning"
        show-icon
        :closable="false"
        style="margin-bottom: 12px;"
      >
        <template #default>
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 4px;">
            <span>本地打标与训练监测服务未运行，本地 AI 功能不可用。</span>
            <el-button
              type="warning"
              size="small"
              :loading="isStartingService"
              @click="handleStartLocalService"
            >
              启动本地服务
            </el-button>
          </div>
        </template>
      </el-alert>

      <div class="workspace-header-bar">
        <div class="path-info">
          <span class="info-label">本地训练集目录：</span>
          <span class="info-val">{{ resolvedDirPath || '未标定' }}</span>
        </div>
        <div class="header-actions">
          <!-- Danbooru taxonomy panel button -->
          <el-button type="info" @click="taxonomyVisible = true">
            <el-icon><i-ep-folder-opened /></el-icon> Danbooru 标签面板
          </el-button>

          <el-button type="primary" @click="ensureServiceAndExecute(() => { interrogateConfirmVisible = true })" :disabled="loading">
            <el-icon><i-ep-magic-stick /></el-icon> 一键反推打标 (WD14)
          </el-button>
          <el-button type="primary" plain @click="ensureServiceAndExecute(handleFaceDetect)" :disabled="loading || !resolvedDirPath">
            <el-icon><i-ep-scissor /></el-icon> 提取面部
          </el-button>
          <el-button type="warning" @click="loraConfigVisible = true">
            <el-icon><i-ep-setting /></el-icon> ⚙️ 训练配置
          </el-button>
          <el-button type="success" @click="ensureServiceAndExecute(() => { loraConfigVisible = true })" :disabled="isTrainingActive">
            <el-icon><i-ep-video-play /></el-icon> 🚀 开始训练 LoRA
          </el-button>
          <el-button v-if="isTrainingActive" type="danger" @click="stopLoraTrain">
            <el-icon><i-ep-video-pause /></el-icon> ⏹️ 停止训练
          </el-button>
          <el-button @click="loadTags">
            <el-icon><i-ep-refresh /></el-icon> 刷新
          </el-button>
        </div>
      </div>

      <!-- Training Progress Monitor -->
      <SpaceTaggerLoraMonitor
        v-if="trainingTask"
        :task="trainingTask"
        :logs="loraLogs"
        @stop-train="stopLoraTrain"
      />

      <div v-if="progress > 0" class="progress-container">
        <el-progress :percentage="progress" status="success" striped />
      </div>

      <div class="workspace-body">
        <!-- Frequency Statistics Panel (Extracted Component) -->
        <SpaceTaggerFreqPanel
          :tags-frequency="tagsFrequency"
          :files-length="files.length"
          :bulk-added-tags="bulkAddedTagsSet"
          :categories="categories"
          v-model:selected-category="selectedCategory"
          v-model:search-query="searchQuery"
          :fast-map="fastMap"
          @select-tag="handleSelectTag"
        />

        <!-- Image Edit Panel (Extracted Component) -->
        <SpaceTaggerEditPanel
          :files="files"
          :tags-frequency="tagsFrequency"
          :bulk-added-tags="bulkAddedTagsSet"
          :editing-cards="editingCards"
          :selected-tag-from-freq="selectedTagFromFreq"
          :selected-category="selectedCategory"
          :search-query="searchQuery"
          :fast-map="fastMap"
          :sort-mode="sortMode"
          v-model:show-chinese="showChinese"
          :single-rollbacks="singleRollbacks"
          :local-service-ready="localServiceReady"
          @bulk-add="handleBulkAdd"
          @bulk-remove="handleBulkRemove"
          @save-single-tags="saveSingleImageTags"
          @toggle-edit-card="toggleEditCard"
          @remove-tag="handleRemoveOverlayTag"
          @save-overlay-tag="handleSaveOverlayTag"
          @single-interrogate="handleSingleInterrogate"
          @single-rollback="handleSingleRollback"
        />
      </div>

    </div>

    <!-- LoRA Training Configuration Dialog (Extracted Component) -->
    <SpaceTaggerLoraConfigDialog
      v-model="loraConfigVisible"
      :dir-path="dirPath"
      :folder-id="folderId"
      :folder-title="folderTitle"
      @start-train="handleStartTrain"
    />

    <!-- Danbooru Taxonomy Dialog (Extracted Component) -->
    <SpaceTaggerTaxonomyDialog
      v-model="taxonomyVisible"
      :taxonomy="taxonomy"
      :history="taxonomyHistory"
      :tags-frequency="tagsFrequency"
      @reassign="handleReassign"
    />
    <!-- 一键反推二次确认弹窗 -->
    <el-dialog
      v-model="interrogateConfirmVisible"
      title="一键反推打标（WD14）确认"
      width="420px"
      append-to-body
      align-center
    >
      <div style="font-size: 14px; line-height: 1.6; color: #606266;">
        请选择反推打标的执行方式：
        <ul style="margin-top: 10px; padding-left: 20px; color: #475569;">
          <li style="margin-bottom: 8px;">
            <strong>仅新增标签（推荐）：</strong>仅将新识别的标签追加至现有标签末尾，原手打标签不受影响。
          </li>
          <li>
            <strong>覆盖原有标签：</strong>清空每张图片的现有标签，完全使用 AI 的重新识别结果。
          </li>
        </ul>
      </div>
      <template #footer>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <el-button type="primary" @click="triggerBulkInterrogate('append')">仅新增标签</el-button>
          <el-button type="danger" plain @click="triggerBulkInterrogate('overwrite')">覆盖原有</el-button>
        </div>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<style scoped>
.workspace-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 70vh;
}

.workspace-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8fafc;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.path-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.info-label {
  color: #64748b;
  font-weight: 600;
}

.info-val {
  color: #0f172a;
  font-family: monospace;
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  max-width: 480px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.progress-container {
  padding: 0 4px;
}

.workspace-body {
  display: flex;
  gap: 16px;
  flex: 1;
  overflow: hidden;
}

.dialog-title-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.dialog-title-text {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
}

.sort-mode-capsule-btn {
  font-weight: 600;
  letter-spacing: 0.5px;
  transition: all 0.2s ease;
}

.sort-mode-capsule-btn:hover {
  transform: scale(1.05);
}

.lang-mode-capsule-btn {
  font-weight: 600;
  letter-spacing: 0.5px;
  transition: all 0.2s ease;
}

.lang-mode-capsule-btn:hover {
  transform: scale(1.05);
}

.health-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  background: rgba(148, 163, 184, 0.1);
  transition: all 0.3s ease;
  user-select: none;
}
.health-indicator.ready {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}
.health-indicator.offline {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}
.indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: currentColor;
  transition: all 0.3s ease;
}
.health-indicator.ready .indicator-dot {
  animation: pulse-green 2s infinite;
}
.health-indicator.offline .indicator-dot {
  animation: pulse-red 2s infinite;
}
@keyframes pulse-green {
  0% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}
@keyframes pulse-red {
  0% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(239, 68, 68, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}
</style>
