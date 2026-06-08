import { generateImage, saveNode } from '@/api/node.api'
import { computeSizePx } from '@/composables/image/useGenerateForm'
import { ElMessage } from 'element-plus'

export async function generateFromNode(
  workspaceId: string,
  nodeId: string,
  form: { 
    prompt: string; 
    model: string; 
    ratio: string; 
    sizeLevel: string;
    mode?: 'image' | 'video';
    videoResolution?: string;
    videoDuration?: number;
  },
  nodes: any[],
  edges: any[],
  loadGraph: () => Promise<any>,
  pushHistory: () => void
) {
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return
  
  node.data.status = 'generating'
  node.data.prompt = form.prompt
  node.data.model = form.model
  node.data.ratio = form.ratio
  node.data.sizeLevel = form.sizeLevel
  node.data.mode = form.mode || 'image'
  node.data.videoResolution = form.videoResolution
  node.data.videoDuration = form.videoDuration
  node.data.error_message = ''
  
  try {
    await saveNode(workspaceId, {
      id: nodeId,
      type: 'gen_node',
      x: node.position.x,
      y: node.position.y,
      data: node.data
    })
    
    // 逆向回溯查找父节点参考图
    const parentImageUrls: string[] = []
    edges.forEach(edge => {
      if (edge.target === nodeId) {
        const parentNode = nodes.find(n => n.id === edge.source)
        if (parentNode && parentNode.data?.image_url) {
          parentImageUrls.push(parentNode.data.image_url)
        }
      }
    })
    
    if (form.mode === 'video') {
      const { generateVideoApi, getVideoStatusApi } = await import('@/api/generate')
      
      const respData = await generateVideoApi({
        prompt: form.prompt,
        model: form.model,
        resolution: form.videoResolution || '720p',
        ratio: form.ratio,
        duration: form.videoDuration || 5,
        generate_audio: true,
        reference_image_list: parentImageUrls.length > 0 ? parentImageUrls : undefined
      })
      
      if (respData.success && respData.task_id) {
        const taskId = respData.task_id
        let finished = false
        let attempts = 0
        const maxAttempts = 60 // 10分钟超时
        while (!finished && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 10000))
          attempts++
          const statusResp = await getVideoStatusApi(taskId)
          if (statusResp.success && statusResp.data) {
            const status = statusResp.data.status
            if (status === 'succeed' || status === 'succeeded') {
              node.data.status = 'success'
              node.data.image_url = statusResp.data.video_url
              finished = true
            } else if (status === 'failed') {
              node.data.status = 'failed'
              node.data.error_message = statusResp.data.error || '视频生成失败'
              finished = true
            }
          } else {
            node.data.status = 'failed'
            node.data.error_message = statusResp.error || '查询视频状态失败'
            finished = true
          }
        }
        if (!finished) {
          node.data.status = 'failed'
          node.data.error_message = '视频生成超时'
        }
      } else {
        node.data.status = 'failed'
        node.data.error_message = respData.error || '视频生成接口调用失败'
      }
    } else {
      const sizeStr = computeSizePx(form.model, form.sizeLevel as any, form.ratio as any)
      const respData = await generateImage({
        prompt: form.prompt,
        model: form.model,
        size: sizeStr,
        ratio: form.ratio,
        reference_image_list: parentImageUrls.length > 0 ? parentImageUrls : undefined,
        async_mode: false
      })
      
      if (respData.success && respData.image_url) {
        node.data.status = 'success'
        node.data.image_url = respData.image_url
      } else {
        node.data.status = 'failed'
        node.data.error_message = respData.error || '生图接口未返回图像'
      }
    }
  } catch (e: any) {
    node.data.status = 'failed'
    node.data.error_message = e.message || e
  } finally {
    try {
      await saveNode(workspaceId, {
        id: nodeId,
        type: 'gen_node',
        x: node.position.x,
        y: node.position.y,
        data: node.data
      })
      await loadGraph()
      pushHistory()
    } catch (err) {
      console.error('保存生图结果到数据库失败:', err)
    }
  }
}

export async function regenerateNode(
  workspaceId: string,
  nodeId: string,
  nodes: any[],
  edges: any[],
  loadGraph: () => Promise<any>,
  pushHistory: () => void
) {
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return
  
  node.data.status = 'generating'
  node.data.error_message = ''
  
  try {
    await saveNode(workspaceId, {
      id: nodeId,
      type: node.type || 'image_node',
      x: node.position.x,
      y: node.position.y,
      data: node.data
    })
    
    const parentImageUrls: string[] = []
    edges.forEach(edge => {
      if (edge.target === nodeId) {
        const parentNode = nodes.find(n => n.id === edge.source)
        if (parentNode && parentNode.data?.image_url) {
          parentImageUrls.push(parentNode.data.image_url)
        }
      }
    })
    
    if (node.data.mode === 'video') {
      const { generateVideoApi, getVideoStatusApi } = await import('@/api/generate')
      
      const respData = await generateVideoApi({
        prompt: node.data.prompt || '',
        model: node.data.model || 'Seedance 2.0',
        resolution: node.data.videoResolution || '720p',
        ratio: node.data.ratio || 'adaptive',
        duration: node.data.videoDuration || 5,
        generate_audio: true,
        reference_image_list: parentImageUrls.length > 0 ? parentImageUrls : undefined
      })
      
      if (respData.success && respData.task_id) {
        const taskId = respData.task_id
        let finished = false
        let attempts = 0
        const maxAttempts = 60
        while (!finished && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 10000))
          attempts++
          const statusResp = await getVideoStatusApi(taskId)
          if (statusResp.success && statusResp.data) {
            const status = statusResp.data.status
            if (status === 'succeed' || status === 'succeeded') {
              node.data.status = 'success'
              node.data.image_url = statusResp.data.video_url
              finished = true
            } else if (status === 'failed') {
              node.data.status = 'failed'
              node.data.error_message = statusResp.data.error || '视频生成失败'
              finished = true
            }
          } else {
            node.data.status = 'failed'
            node.data.error_message = statusResp.error || '查询视频状态失败'
            finished = true
          }
        }
        if (!finished) {
          node.data.status = 'failed'
          node.data.error_message = '视频生成超时'
        }
      } else {
        node.data.status = 'failed'
        node.data.error_message = respData.error || '视频生成接口调用失败'
      }
    } else {
      const respData = await generateImage({
        prompt: node.data.prompt || 'a beautiful landscape',
        model: node.data.model || 'Seedream 5.0',
        size: computeSizePx(node.data.model || 'Seedream 5.0', (node.data.sizeLevel || '2K') as any, (node.data.ratio || '9:16') as any),
        ratio: node.data.ratio || '9:16',
        reference_image_list: parentImageUrls.length > 0 ? parentImageUrls : undefined,
        async_mode: false
      })
      
      if (respData.success && respData.image_url) {
        node.data.status = 'success'
        node.data.image_url = respData.image_url
      } else {
        node.data.status = 'failed'
        node.data.error_message = respData.error || '生图接口未返回图像'
      }
    }
  } catch (e: any) {
    node.data.status = 'failed'
    node.data.error_message = e.message || e
  } finally {
    try {
      await saveNode(workspaceId, {
        id: nodeId,
        type: node.type || 'image_node',
        x: node.position.x,
        y: node.position.y,
        data: node.data
      })
      await loadGraph()
      pushHistory()
    } catch (err) {
      console.error('同步重构生图结果失败:', err)
    }
  }
}

export async function updateNodePrompt(
  workspaceId: string,
  nodeId: string,
  text: string,
  nodes: any[],
  loadGraph: () => Promise<any>,
  pushHistory: () => void
) {
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return
  
  node.data.prompt = text
  try {
    await saveNode(workspaceId, {
      id: nodeId,
      type: node.type || 'image_node',
      x: node.position.x,
      y: node.position.y,
      data: node.data
    })
    ElMessage.success('提示词已更新')
    await loadGraph()
    pushHistory()
  } catch (e) {
    console.error('更新节点提示词失败:', e)
  }
}

export async function changeImage(
  workspaceId: string,
  nodeId: string,
  url: string,
  nodes: any[],
  loadGraph: () => Promise<any>,
  pushHistory: () => void
) {
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return
  
  node.data.image_url = url
  node.data.media_type = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm') ? 'video' : 'image'
  
  try {
    await saveNode(workspaceId, {
      id: nodeId,
      type: node.type || 'image_card',
      x: node.position.x,
      y: node.position.y,
      data: node.data
    })
    ElMessage.success('图片已更新')
    await loadGraph()
    pushHistory()
  } catch (e) {
    console.error('更新节点图片失败:', e)
  }
}
