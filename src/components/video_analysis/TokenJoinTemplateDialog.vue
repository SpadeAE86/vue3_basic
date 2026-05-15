<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listTokenJoinTemplatesApi,
  createTokenJoinTemplateApi,
  updateTokenJoinTemplateApi,
  deleteTokenJoinTemplateApi,
  setDefaultTokenJoinTemplateApi,
  getTokenJoinAllowedFieldsApi,
  type TokenJoinTemplate,
} from '@/api/video_analysis'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    workspace: string
  }>(),
  { workspace: 'v2' },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const visible = ref(false)
watch(
  () => props.modelValue,
  (v) => {
    visible.value = v
    if (v) loadAll()
  },
  { immediate: true },
)

watch(visible, (v) => {
  emit('update:modelValue', v)
})

watch(
  () => props.workspace,
  () => {
    if (visible.value) loadAll()
  },
)

const allowedFields = ref<string[]>([])
const templates = ref<TokenJoinTemplate[]>([])
const loading = ref(false)

const editVisible = ref(false)
const editMode = ref<'create' | 'edit'>('create')
const editingId = ref<number | null>(null)
const formName = ref('')
const formFields = ref<string[]>([])
const formIsDefault = ref(false)

async function loadAll() {
  loading.value = true
  try {
    const [a, t] = await Promise.all([
      getTokenJoinAllowedFieldsApi(),
      listTokenJoinTemplatesApi(props.workspace),
    ])
    if (a.success && a.fields) allowedFields.value = a.fields
    if (t.success && t.templates) templates.value = t.templates
  } catch {
    ElMessage.error('加载模板失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editMode.value = 'create'
  editingId.value = null
  formName.value = ''
  formFields.value = []
  formIsDefault.value = false
  editVisible.value = true
}

function openEdit(row: TokenJoinTemplate) {
  editMode.value = 'edit'
  editingId.value = row.id ?? null
  formName.value = row.name
  formFields.value = [...(row.and_segment_fields || [])]
  formIsDefault.value = !!row.is_default
  editVisible.value = true
}

async function saveForm() {
  const name = formName.value.trim()
  if (!name) {
    ElMessage.warning('请填写模板名称')
    return
  }
  if (editMode.value === 'create') {
    const res = await createTokenJoinTemplateApi({
      name,
      workspace: props.workspace,
      and_segment_fields: formFields.value,
      is_default: formIsDefault.value,
    })
    if (res.success) {
      ElMessage.success('已创建')
      editVisible.value = false
      await loadAll()
    } else ElMessage.error((res as { error?: string }).error || '创建失败')
  } else if (editingId.value != null) {
    const res = await updateTokenJoinTemplateApi(editingId.value, {
      name,
      and_segment_fields: formFields.value,
      is_default: formIsDefault.value,
    })
    if (res.success) {
      ElMessage.success('已保存')
      editVisible.value = false
      await loadAll()
    } else ElMessage.error((res as { error?: string }).error || '保存失败')
  }
}

async function onSetDefault(row: TokenJoinTemplate) {
  if (row.id == null) return
  const res = await setDefaultTokenJoinTemplateApi(row.id)
  if (res.success) {
    ElMessage.success('已设为默认')
    await loadAll()
  } else ElMessage.error('操作失败')
}

async function onDelete(row: TokenJoinTemplate) {
  if (row.id == null) return
  try {
    await ElMessageBox.confirm(`删除模板「${row.name}」？`, '确认', { type: 'warning' })
  } catch {
    return
  }
  const res = await deleteTokenJoinTemplateApi(row.id)
  if (res.success) {
    ElMessage.success('已删除')
    await loadAll()
  } else ElMessage.error('删除失败')
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="AND 命中模板（转写 MUST 字段 / 检索 term filter）"
    width="min(720px, 94vw)"
    destroy-on-close
    class="admin-dialog"
  >
    <p class="hint muted">
      勾选字段在「智能提取」时标为蓝色 AND，且在 v2 模糊/精准检索中作为 OpenSearch term filter。默认模板按当前
      workspace（{{ workspace }}）加载。
    </p>
    <div class="toolbar">
      <el-button type="primary" size="small" :loading="loading" @click="loadAll">刷新</el-button>
      <el-button type="success" size="small" @click="openCreate">新建模板</el-button>
    </div>
    <el-table v-loading="loading" :data="templates" size="small" border stripe class="tpl-table">
      <el-table-column prop="name" label="名称" min-width="120" />
      <el-table-column label="默认" width="72" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.is_default" type="success" size="small">默认</el-tag>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="AND 字段" min-width="260">
        <template #default="{ row }">
          <div v-if="(row.and_segment_fields || []).length" class="field-chips">
            <el-tag
              v-for="f in row.and_segment_fields"
              :key="f"
              size="small"
              type="info"
              effect="plain"
              class="field-chip"
            >
              {{ f }}
            </el-tag>
          </div>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right" align="center">
        <template #default="{ row }">
          <el-button type="primary" link size="small" @click="openEdit(row)">编辑</el-button>
          <el-button
            v-if="!row.is_default"
            type="primary"
            link
            size="small"
            @click="onSetDefault(row)"
          >
            设默认
          </el-button>
          <el-button type="danger" link size="small" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="editVisible"
      :title="editMode === 'create' ? '新建模板' : '编辑模板'"
      width="480px"
      append-to-body
      destroy-on-close
    >
      <el-form label-position="top" size="small">
        <el-form-item label="名称">
          <el-input v-model="formName" placeholder="模板名称" />
        </el-form-item>
        <el-form-item label="设为默认">
          <el-switch v-model="formIsDefault" />
        </el-form-item>
        <el-form-item label="必须命中字段（AND）">
          <el-select v-model="formFields" multiple filterable placeholder="选择字段" style="width: 100%">
            <el-option v-for="f in allowedFields" :key="f" :label="f" :value="f" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<style scoped>
.hint {
  font-size: 13px;
  margin: 0 0 12px;
  line-height: 1.5;
}
.toolbar {
  margin-bottom: 10px;
  display: flex;
  gap: 8px;
}
.tpl-table {
  width: 100%;
}
.field-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  line-height: 1.4;
}
.field-chip {
  font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  margin: 0;
  white-space: nowrap;
}
.muted {
  color: var(--el-text-color-secondary);
}
</style>
