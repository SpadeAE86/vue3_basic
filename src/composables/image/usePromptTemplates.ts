import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { beautifyPromptApi, loadTemplatesApi, getTemplateContentApi, saveTemplateApi, deleteTemplateApi } from '@/api/generate'

export interface TemplateInfo {
  name: string
  has_content: boolean
}

// 全局共享状态，确保单体模式和 VS 模式共享同一份模板数据
const templates = ref<TemplateInfo[]>([])
const selectedTemplate = ref<string>('')
const templateDialogVisible = ref(false)
const templateDialogLoading = ref(false)
const editingTemplate = reactive({
  name: '',
  content: '',
  isNew: false,
})
const beautifying = ref(false)
const localTemplates = new Map<string, string>()

export function usePromptTemplates() {
  function sanitizeMdFileName(name: string) {
    const cleaned = String(name)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/[. ]+$/g, '')
      .trim()
    return cleaned || 'untitled'
  }

  async function loadTemplates(force = false) {
    if (templates.value.length === 0 || force) {
      const defaultName = '默认模板'
      const defaultContent =
        '你是一个提示词工程师。请将用户的图片生成提示词重写为更清晰、可控、富有画面感的版本；保留原意但补充必要细节（主体/风格/构图/光照/镜头/质感/色彩）。仅输出最终提示词，不要解释。'
      
      try {
        const res = await loadTemplatesApi()
        if (Array.isArray(res) && res.length > 0) {
          templates.value = res
          if (!selectedTemplate.value || !res.some((t) => t.name === selectedTemplate.value)) {
            selectedTemplate.value = res[0].name
          }
          return
        }
      } catch (e) {
        console.warn('Failed to load templates from server, using default.', e)
      }

      // Fallback to default
      templates.value = [{ name: defaultName, has_content: true }]
      localTemplates.set(defaultName, defaultContent)
      selectedTemplate.value = defaultName
    }
  }

  async function getTemplateContent(name: string, useCache = true) {
    if (useCache && localTemplates.has(name) && localTemplates.get(name)) {
      return localTemplates.get(name)
    }
    try {
      const res = await getTemplateContentApi(name)
      if (res && res.content) {
        localTemplates.set(name, res.content)
        return res.content
      }
    } catch (e) {
      console.warn(`Failed to fetch template content for ${name}`, e)
    }
    return localTemplates.get(name) || ''
  }

  function openNewTemplate() {
    editingTemplate.name = ''
    editingTemplate.content = ''
    editingTemplate.isNew = true
    templateDialogVisible.value = true
  }

  async function openEditTemplate() {
    if (!selectedTemplate.value) return
    editingTemplate.name = selectedTemplate.value
    editingTemplate.content = ''
    editingTemplate.isNew = false
    templateDialogVisible.value = true

    templateDialogLoading.value = true
    try {
      editingTemplate.content = (await getTemplateContent(selectedTemplate.value)) || ''
    } finally {
      templateDialogLoading.value = false
    }
  }

  async function saveTemplate() {
    if (!editingTemplate.name.trim() || !editingTemplate.content.trim()) {
      ElMessage.warning('模板名称和内容不能为空')
      return
    }

    const name = editingTemplate.name.trim()
    const exists = templates.value.some((t) => t.name === name)
    if (editingTemplate.isNew && exists) {
      ElMessage.warning('模板名称已存在，请换一个名称')
      return
    }

    localTemplates.set(name, editingTemplate.content)
    if (!exists) {
      templates.value = [...templates.value, { name, has_content: true }]
    }

    ElMessage.success('模板保存成功')
    templateDialogVisible.value = false
    selectedTemplate.value = name
    
    try {
      await saveTemplateApi(name, editingTemplate.content)
    } catch (e) {
      console.error('Failed to sync template to server', e)
    }
  }

  async function deleteTemplate() {
    if (!selectedTemplate.value) return

    try {
      await ElMessageBox.confirm('确定要删除这个模板吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })

      const nameToDelete = selectedTemplate.value
      ElMessage.success('模板删除成功')
      localTemplates.delete(nameToDelete)
      templates.value = templates.value.filter((t) => t.name !== nameToDelete)
      selectedTemplate.value = templates.value[0]?.name || ''
      
      try {
        await deleteTemplateApi(nameToDelete)
      } catch (e) {
        console.error('Failed to delete template from server', e)
      }
    } catch (e) {
      if (e !== 'cancel') {
        ElMessage.error('删除模板时出错')
      }
    }
  }

  async function downloadSelectedTemplate() {
    if (!selectedTemplate.value) return
    const content = await getTemplateContent(selectedTemplate.value)
    const blob = new Blob([content || ''], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sanitizeMdFileName(selectedTemplate.value)}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function deleteTemplateByName(name: string) {
    if (!name) return
    if (name === selectedTemplate.value) {
      deleteTemplate()
      return
    }
    localTemplates.delete(name)
    templates.value = templates.value.filter((t) => t.name !== name)
    ElMessage.success('模板已删除')
    
    try {
      await deleteTemplateApi(name)
    } catch (e) {
      console.error('Failed to delete template from server', e)
    }
  }

  async function beautifyPrompt(
    prompt: string,
    onUpdate: (newPrompt: string) => void,
    opts?: { videoDuration?: number }
  ) {
    if (!prompt.trim()) {
      ElMessage.warning('请输入提示词')
      return
    }

    if (!selectedTemplate.value) {
      ElMessage.warning('请选择一个系统提示词模板')
      return
    }

    beautifying.value = true

    try {
      const systemPrompt = await getTemplateContent(selectedTemplate.value)
      const data = await beautifyPromptApi(prompt, systemPrompt, opts?.videoDuration)

      // 处理后端可能返回的 JSON 字符串或对象
      let textResult = ''
      if (data.success && data.text) {
        try {
          // 尝试解析 JSON，如果成功且包含 prompt 字段，则使用 prompt 字段
          const parsed = JSON.parse(data.text)
          if (parsed && parsed.prompt) {
            textResult = parsed.prompt
          } else {
            textResult = data.text
          }
        } catch (e) {
          // 不是 JSON，直接使用原文本
          textResult = data.text
        }
        
        onUpdate(textResult)
        ElMessage.success('提示词美化成功')
      } else {
        ElMessage.error(data.error || '美化失败')
      }
    } catch {
      ElMessage.error('美化提示词时出错')
    } finally {
      beautifying.value = false
    }
  }

  return {
    templates,
    selectedTemplate,
    templateDialogVisible,
    templateDialogLoading,
    editingTemplate,
    beautifying,
    loadTemplates,
    openNewTemplate,
    openEditTemplate,
    saveTemplate,
    deleteTemplate,
    downloadSelectedTemplate,
    deleteTemplateByName,
    beautifyPrompt,
    getTemplateContent
  }
}
