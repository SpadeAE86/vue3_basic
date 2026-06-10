import { type Ref } from 'vue'
import { uploadToObs } from '@/utils/obs'
import { saveNode } from '@/api/node.api'
import { ElMessage } from 'element-plus'

export function useCanvasImport(
  workspaceId: Ref<string>,
  containerRef: Ref<HTMLElement | null>,
  project: (position: { x: number; y: number }) => { x: number; y: number },
  loadGraph: () => Promise<any>
) {
  async function handleUploadAndCreateNode(file: File) {
    ElMessage.info('正在上传文件到 OBS...')
    try {
      const isVideoFile = file.type.startsWith('video/')
      const prefix = isVideoFile ? 'ai_picture/reference_video' : 'ai_picture/reference_image'
      const url = await uploadToObs(file, prefix)
      
      const rect = containerRef.value?.getBoundingClientRect()
      const x = rect ? rect.width / 2 : 200
      const y = rect ? rect.height / 2 : 200
      const pos = project({ x, y })
      
      const nodeId = `node_${Math.random().toString(36).substring(2, 8)}`
      const payload = {
        id: nodeId,
        type: 'image_card',
        x: pos.x,
        y: pos.y,
        data: {
          image_url: url,
          prompt: '',
          media_type: isVideoFile ? 'video' : 'image',
          status: 'success'
        }
      }
      
      await saveNode(workspaceId.value, payload)
      ElMessage.success('上传成功，已生成图片节点')
      await loadGraph()
    } catch (err: any) {
      console.error('上传失败:', err)
      ElMessage.error(`上传失败: ${err.message || err}`)
    }
  }

  async function handleCreateCardNodeFromCopied(parsed: any) {
    const rect = containerRef.value?.getBoundingClientRect()
    const x = rect ? rect.width / 2 : 200
    const y = rect ? rect.height / 2 : 200
    const pos = project({ x, y })
    
    const nodeId = `node_${Math.random().toString(36).substring(2, 8)}`
    const payload = {
      id: nodeId,
      type: 'image_card',
      x: pos.x,
      y: pos.y,
      data: {
        image_url: parsed.image_url,
        prompt: parsed.prompt,
        model: parsed.model,
        media_type: parsed.media_type,
        status: 'success'
      }
    }
    
    try {
      await saveNode(workspaceId.value, payload)
      ElMessage.success('粘贴卡片成功')
      await loadGraph()
    } catch (err) {
      console.error('粘贴节点失败:', err)
    }
  }

  async function handleCreateTemplateNodeFromCopied(parsed: any) {
    const rect = containerRef.value?.getBoundingClientRect()
    const x = rect ? rect.width / 2 : 200
    const y = rect ? rect.height / 2 : 200
    const pos = project({ x, y })
    
    const nodeId = `node_${Math.random().toString(36).substring(2, 8)}`
    const payload = {
      id: nodeId,
      type: 'prompt_template',
      x: pos.x,
      y: pos.y,
      data: {
        name: parsed.name || '未命名模板',
        template_text: parsed.template_text || parsed.prompt || ''
      }
    }
    
    try {
      await saveNode(workspaceId.value, payload)
      ElMessage.success('粘贴模板节点成功')
      await loadGraph()
    } catch (err) {
      console.error('粘贴模板节点失败:', err)
    }
  }

  async function handleCreateNodesFromClip(copiedNodes: any[]) {
    try {
      for (const node of copiedNodes) {
        const nodeId = `node_${Math.random().toString(36).substring(2, 8)}`
        const newX = (node.x ?? 100) + 40
        const newY = (node.y ?? 100) + 40
        
        const dataCopy = JSON.parse(JSON.stringify(node.data || {}))
        delete dataCopy.display_id

        const payload = {
          id: nodeId,
          type: node.type,
          x: newX,
          y: newY,
          data: dataCopy
        }
        await saveNode(workspaceId.value, payload)
      }
      ElMessage.success(`成功粘贴了 ${copiedNodes.length} 个节点`)
      await loadGraph()
    } catch (err) {
      console.error('粘贴节点失败:', err)
    }
  }

  async function handlePaste(e: ClipboardEvent) {
    if (!workspaceId.value) return
    
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      const file = files[0]
      if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
        e.preventDefault()
        await handleUploadAndCreateNode(file)
      }
      return
    }
    
    const text = e.clipboardData?.getData('text')
    if (text) {
      try {
        const parsed = JSON.parse(text)
        if (parsed) {
          if (parsed.type === 'jottings-canvas-nodes-clip') {
            e.preventDefault()
            await handleCreateNodesFromClip(parsed.nodes)
            return
          }
          if (parsed.type === 'jottings-canvas-node') {
            e.preventDefault()
            if (parsed.node_type === 'prompt_template') {
              await handleCreateTemplateNodeFromCopied(parsed)
            } else {
              await handleCreateCardNodeFromCopied(parsed)
            }
            return
          }
        }
      } catch {
        const target = e.target as HTMLElement
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return
        }
        
        e.preventDefault()
        const nodeId = `node_${Math.random().toString(36).substring(2, 8)}`
        const rect = containerRef.value?.getBoundingClientRect()
        const x = rect ? rect.width / 2 : 200
        const y = rect ? rect.height / 2 : 200
        const pos = project({ x, y })
        
        const payload = {
          id: nodeId,
          type: 'prompt_template',
          x: pos.x,
          y: pos.y,
          data: {
            name: text.length > 15 ? text.substring(0, 15) + '...' : text,
            template_text: text
          }
        }
        try {
          await saveNode(workspaceId.value, payload)
          ElMessage.success('已自动将剪贴板文本导入为提示词模板节点')
          await loadGraph()
        } catch (err) {
          console.error('粘贴文本节点失败:', err)
        }
      }
    }
  }

  async function handleDrop(e: DragEvent) {
    if (!workspaceId.value) return
    e.preventDefault()
    
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    
    const file = files[0]
    if (!file) return
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      ElMessage.warning('仅支持拖入图片或视频文件')
      return
    }
    
    ElMessage.info('正在上传文件到 OBS...')
    try {
      const isVideoFile = file.type.startsWith('video/')
      const prefix = isVideoFile ? 'ai_picture/reference_video' : 'ai_picture/reference_image'
      const url = await uploadToObs(file, prefix)
      
      const rect = containerRef.value?.getBoundingClientRect()
      const x = rect ? e.clientX - rect.left : 200
      const y = rect ? e.clientY - rect.top : 200
      const pos = project({ x, y })
      
      const nodeId = `node_${Math.random().toString(36).substring(2, 8)}`
      const payload = {
        id: nodeId,
        type: 'image_card',
        x: pos.x,
        y: pos.y,
        data: {
          image_url: url,
          prompt: '',
          media_type: isVideoFile ? 'video' : 'image',
          status: 'success'
        }
      }
      
      await saveNode(workspaceId.value, payload)
      ElMessage.success('拖入文件成功，已生成图片节点')
      await loadGraph()
    } catch (err: any) {
      console.error('拖拽上传失败:', err)
      ElMessage.error(`上传失败: ${err.message || err}`)
    }
  }

  return {
    handlePaste,
    handleDrop
  }
}
