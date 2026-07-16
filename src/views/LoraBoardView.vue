<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import SpaceTaggerDialog from '@/components/collections/SpaceTaggerDialog.vue'

const activeTab = ref('tagger')
const loading = ref(false)
const tasks = ref<any[]>([])

const taggerVisible = ref(false)
const taggerDirPath = ref<string | null>(null)
const taggerFolderId = ref<string | null>(null)
const taggerFolderTitle = ref<string | null>(null)

let pollTimer: any = null

async function loadTasks(silent = false) {
  if (!silent) loading.value = true
  try {
    const res = await fetch('/api/tagger/tasks')
    const data = await res.json()
    if (data.success) {
      tasks.value = data.tasks || []
    }
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

const dummyTrainTasks = ref([
  {
    id: 'train-1',
    model_name: 'TOMO_LoRA_v1_SwinV2',
    base_model: 'SD1.5 - sd-v1-5-pruned-emaonly.safetensors',
    status: 'completed',
    progress: 100,
    message: 'Epoch 10/10: Training completed. LoRA weight saved.',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 1.5).toISOString()
  },
  {
    id: 'train-2',
    model_name: 'TOMO_LoRA_v2_ConvNeXt',
    base_model: 'SD1.5 - sd-v1-5-pruned-emaonly.safetensors',
    status: 'running',
    progress: 45,
    message: 'Epoch 5/10: Loss = 0.084. Step 2250/5000',
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    updated_at: new Date().toISOString()
  }
])

function openWorkspace(task: any) {
  taggerDirPath.value = task.dir_path
  taggerFolderId.value = task.folder_id
  taggerFolderTitle.value = task.folder_title
  taggerVisible.value = true
}

function getStatusType(status: string) {
  if (status === 'completed') return 'success'
  if (status === 'running') return 'warning'
  if (status === 'failed') return 'danger'
  return 'info'
}

function getStatusLabel(status: string) {
  if (status === 'completed') return '已完成'
  if (status === 'running') return '进行中'
  if (status === 'failed') return '失败'
  return '排队中'
}

function formatDate(isoStr: string) {
  if (!isoStr) return '-'
  const d = new Date(isoStr)
  return d.toLocaleString()
}

onMounted(() => {
  loadTasks()
  pollTimer = setInterval(() => {
    loadTasks(true)
  }, 3000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="lora-board-page">
    
    <header class="board-header">
      <div class="header-left">
        <h1 class="page-title">⚙️ LoRA 标定与训练任务看板</h1>
        <p class="page-subtitle">监控您的模型反推打标集生成进度以及后续的 LoRA 模型训练任务。</p>
      </div>
      <el-button type="primary" @click="loadTasks" :loading="loading">
        <el-icon><i-ep-refresh /></el-icon> 刷新看板
      </el-button>
    </header>

    <el-tabs v-model="activeTab" class="board-tabs-wrapper">
      
      <el-tab-pane label="🏷️ 反推打标任务 (WD14)" name="tagger">
        <div class="table-container" v-loading="loading">
          <el-table :data="tasks" style="width: 100%" class="board-table">
            <el-table-column label="任务目录 / 空间" min-width="180">
              <template #default="{ row }">
                <div class="task-name-cell">
                  <span class="folder-title">{{ row.folder_title }}</span>
                  <span class="dir-path" :title="row.dir_path">{{ row.dir_path || '云端打标包' }}</span>
                </div>
              </template>
            </el-table-column>
            
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)" effect="dark">
                  {{ getStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>

            <el-table-column label="进度" min-width="160">
              <template #default="{ row }">
                <div class="progress-cell">
                  <el-progress 
                    :percentage="row.progress" 
                    :status="row.status === 'failed' ? 'exception' : (row.status === 'completed' ? 'success' : undefined)"
                    striped 
                    :duration="10"
                  />
                  <span class="progress-message">{{ row.message }}</span>
                </div>
              </template>
            </el-table-column>

            <el-table-column label="开始时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.created_at) }}
              </template>
            </el-table-column>

            <el-table-column label="更新时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.updated_at) }}
              </template>
            </el-table-column>

            <el-table-column label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <el-button 
                  v-if="row.status === 'completed'"
                  type="success" 
                  size="small" 
                  plain
                  @click="openWorkspace(row)"
                >
                  管理打标
                </el-button>
                <span v-else class="action-placeholder">-</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="🚀 LoRA模型训练 (训练看板)" name="train">
        <div class="table-container">
          <el-table :data="dummyTrainTasks" style="width: 100%" class="board-table">
            <el-table-column label="模型名称 / 基础底模" min-width="220">
              <template #default="{ row }">
                <div class="task-name-cell">
                  <span class="folder-title">{{ row.model_name }}</span>
                  <span class="dir-path">{{ row.base_model }}</span>
                </div>
              </template>
            </el-table-column>
            
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)" effect="dark">
                  {{ getStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>

            <el-table-column label="进度" min-width="180">
              <template #default="{ row }">
                <div class="progress-cell">
                  <el-progress 
                    :percentage="row.progress" 
                    :status="row.status === 'completed' ? 'success' : undefined"
                    striped
                  />
                  <span class="progress-message">{{ row.message }}</span>
                </div>
              </template>
            </el-table-column>

            <el-table-column label="开始时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.created_at) }}
              </template>
            </el-table-column>

            <el-table-column label="结束时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.updated_at) }}
              </template>
            </el-table-column>

            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button 
                  type="primary" 
                  size="small" 
                  plain 
                  :disabled="row.status === 'running'"
                >
                  下载模型
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

    </el-tabs>

    <SpaceTaggerDialog
      v-model:visible="taggerVisible"
      :dir-path="taggerDirPath"
      :folder-id="taggerFolderId"
      :folder-title="taggerFolderTitle"
    />

  </div>
</template>

<style scoped>
.lora-board-page {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.board-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  background: linear-gradient(135deg, #1e293b, #0f172a);
  color: #ffffff;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.page-title {
  margin: 0 0 8px 0;
  font-size: 22px;
  font-weight: 700;
}

.page-subtitle {
  margin: 0;
  font-size: 14px;
  color: #94a3b8;
}

.board-tabs-wrapper {
  background: #ffffff;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

.table-container {
  margin-top: 10px;
}

.board-table {
  border-radius: 8px;
  overflow: hidden;
}

.task-name-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.folder-title {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.dir-path {
  font-size: 12px;
  color: #64748b;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.progress-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-message {
  font-size: 11px;
  color: #64748b;
}

.action-placeholder {
  color: #cbd5e1;
}
</style>
