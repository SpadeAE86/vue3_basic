import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { mapSSEtoChatEvent } from '@/types/chat'

export interface CollectionItem {
  id: string
  space_id?: string
  item_type: 'media' | 'template' | 'prompt'
  title: string
  cover_url?: string
  data: Record<string, any>
  tags?: string[]
  created_at: string
}

export interface ThemeSpace {
  id: string
  name: string
  category: 'media' | 'template' | 'prompt'
  description?: string
  space_tags?: string[]
  created_at: string
}

export const useCollectionsStore = defineStore('collections', () => {
  const items = ref<CollectionItem[]>([])
  const themeSpaces = ref<ThemeSpace[]>([])
  const loading = ref(false)
  const taggingTasks = ref<Record<string, { status: string; error?: string }>>({})
  const draggedItemIds = ref<string[]>([])
  const showUnclassifiedOnly = ref(false)
  const activeEvaluationSessions = ref<Record<string, { events: any[], active: boolean, roleId?: string, title?: string }>>({})

  // 加载所有收藏记录
  async function loadCollections() {
    try {
      const resp = await fetch('/api/collections')
      const res = await resp.json()
      if (res.success) {
        items.value = res.items || []
      }
    } catch (e) {
      console.error('加载收藏列表失败:', e)
    }
  }

  // 加载所有主题空间
  async function loadThemeSpaces() {
    try {
      const resp = await fetch('/api/collections/theme-spaces')
      const res = await resp.json()
      if (res.success) {
        themeSpaces.value = res.theme_spaces || []
      }
    } catch (e) {
      console.error('加载主题分类失败:', e)
    }
  }

  // 初始化加载所有数据
  async function init() {
    loading.value = true
    await Promise.all([loadCollections(), loadThemeSpaces()])
    loading.value = false
  }

  // 判断是否收藏
  function isFavorited(itemType: string, uniqueKey: string): boolean {
    if (!uniqueKey) return false
    return items.value.some((item) => {
      if (item.item_type !== itemType) return false
      
      const d = item.data || {}
      if (itemType === 'media') {
        const url = d.url || d.image_url || ''
        return url === uniqueKey
      } else if (itemType === 'template') {
        const text = d.template_text || d.content || ''
        return text === uniqueKey || item.title === uniqueKey
      } else if (itemType === 'prompt') {
        const promptText = d.prompt || ''
        return promptText === uniqueKey
      }
      return false
    })
  }

  // 触发点亮或取消收藏 (Toggle)
  async function toggleFavorite(
    itemType: 'media' | 'template' | 'prompt',
    title: string,
    coverUrl: string | undefined,
    dataPayload: Record<string, any>,
    spaceId?: string
  ) {
    try {
      const resp = await fetch('/api/collections/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: itemType,
          title,
          cover_url: coverUrl,
          data: dataPayload,
          space_id: spaceId
        })
      })
      const res = await resp.json()
      if (res.success) {
        await loadCollections()
        if (res.favorited) {
          if (itemType === 'prompt' || itemType === 'template') {
            ElMessage.success('收藏成功')
          } else {
            ElMessage.success(`"${title}" 已收藏`)
          }
        } else {
          ElMessage.info(`已取消收藏 "${title}"`)
        }
        return res.favorited as boolean
      } else {
        ElMessage.error(res.message || '操作失败')
      }
    } catch (e) {
      console.error('收藏切换操作失败:', e)
      ElMessage.error('网络或服务器异常，操作失败')
    }
    return false
  }

  // 创建主题分类空间
  async function createThemeSpace(
    name: string,
    category: 'media' | 'template' | 'prompt',
    description?: string,
    spaceTags?: string[]
  ) {
    try {
      const resp = await fetch('/api/collections/theme-spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category,
          description,
          space_tags: spaceTags || []
        })
      })
      const res = await resp.json()
      if (res.success) {
        await loadThemeSpaces()
        ElMessage.success(`主题空间 "${name}" 创建成功`)
        return res.theme_space.id as string
      }
    } catch (e) {
      console.error('创建主题空间失败:', e)
      ElMessage.error('创建主题空间失败')
    }
    return null
  }

  // 删除主题分类空间
  async function deleteThemeSpace(spaceId: string) {
    try {
      const resp = await fetch(`/api/collections/theme-spaces/${encodeURIComponent(spaceId)}`, {
        method: 'DELETE'
      })
      const res = await resp.json()
      if (res.success) {
        await init()
        ElMessage.success('已删除主题空间，其下收藏项已释放')
        return true
      }
    } catch (e) {
      console.error('删除主题空间失败:', e)
      ElMessage.error('删除主题空间失败')
    }
    return false
  }

  // 移入/移出主题空间
  async function moveToSpace(itemId: string, spaceId: string | null) {
    try {
      const resp = await fetch(`/api/collections/${encodeURIComponent(itemId)}/space`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ space_id: spaceId })
      })
      const res = await resp.json()
      if (res.success) {
        await loadCollections()
        ElMessage.success(spaceId ? '成功分类归属' : '已移出该空间')
        return true
      }
    } catch (e) {
      console.error('操作归属关系失败:', e)
      ElMessage.error('分类操作失败')
    }
    return false
  }

  // 更新主题分类空间
  async function updateThemeSpace(
    spaceId: string,
    name: string,
    description?: string,
    spaceTags?: string[]
  ) {
    try {
      const resp = await fetch(`/api/collections/theme-spaces/${encodeURIComponent(spaceId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, space_tags: spaceTags || [] })
      })
      const res = await resp.json()
      if (res.success) {
        await loadThemeSpaces()
        ElMessage.success(`主题空间已更新为 "${name}"`)
        return true
      }
    } catch (e) {
      console.error('更新主题空间失败:', e)
      ElMessage.error('更新主题空间失败')
    }
    return false
  }

  // 批量移入/移出主题空间
  async function batchMoveToSpace(itemIds: string[], spaceId: string | null) {
    try {
      const resp = await fetch('/api/collections/batch/space', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: itemIds, space_id: spaceId })
      })
      const res = await resp.json()
      if (res.success) {
        await loadCollections()
        return true
      }
    } catch (e) {
      console.error('批量操作分类失败:', e)
      ElMessage.error('批量分类归类失败')
    }
    return false
  }

  // 更新自定义标签
  async function updateItemTags(itemId: string, tags: string[]) {
    try {
      const resp = await fetch(`/api/collections/${encodeURIComponent(itemId)}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags })
      })
      const res = await resp.json()
      if (res.success) {
        await loadCollections()
        return true
      }
    } catch (e) {
      console.error('更新标签失败:', e)
      ElMessage.error('标签更新失败')
    }
    return false
  }

  async function checkAutoTagStatus(itemId: string) {
    try {
      const resp = await fetch(`/api/collections/${encodeURIComponent(itemId)}/auto-tag/status`)
      const res = await resp.json()
      if (res.success) {
        taggingTasks.value[itemId] = { status: res.status, error: res.error }
        if (res.status === 'SUCCESS') {
          await loadCollections()
        }
        return res.status
      }
    } catch (e) {
      console.error('获取打标状态失败:', e)
    }
    return 'FAILED'
  }

  function pollTask(itemId: string) {
    const interval = setInterval(async () => {
      const status = await checkAutoTagStatus(itemId)
      if (status === 'SUCCESS' || status === 'FAILED' || status === 'IDLE') {
        clearInterval(interval)
      }
    }, 1500)
  }

  // 智能自动打标 (异步后台任务模式)
  async function autoTagItem(itemId: string, useRecall = true) {
    try {
      taggingTasks.value[itemId] = { status: 'PENDING' }
      const resp = await fetch(`/api/collections/${encodeURIComponent(itemId)}/auto-tag?use_recall=${useRecall}`, {
        method: 'POST'
      })
      const res = await resp.json()
      if (res.success) {
        pollTask(itemId)
        return true
      } else {
        taggingTasks.value[itemId] = { status: 'FAILED', error: res.detail || '启动打标失败' }
        ElMessage.error(res.detail || '启动打标失败')
      }
    } catch (e) {
      console.error('自动打标失败:', e)
      taggingTasks.value[itemId] = { status: 'FAILED', error: '自动打标请求失败' }
      ElMessage.error('自动打标请求失败')
    }
    return false
  }

  async function runBackgroundBrainstorm(newSid: string, recentRoleId: string, jotTitle: string, spaceId: string) {
    const targetMsg = `我刚想到【${jotTitle}】这个好点子，怎么样，有什么想法和可以补充的吗？`
    const customSystemPrompt = `由于这是后台自动生成的灵感评估会话，请跳过任何新手引导（Onboarding Guideline）和自我介绍，不要询问用户的姓名、时区或任何个人信息。请直接专注于客观且深度地评估这个灵感点子本身。
请在你的回复结尾处，用 <summary>...</summary> 标签包裹你对这个点子的定位及最核心的 2-3 个要点总结（字数控制在 150-400 字左右，且该 summary 中不要包含任何 markdown 标签、换行 and 多余空行，方便我直接放进展示卡片中）。
例：
<summary>该项目旨在开发一个能操控 Live2D 模型的智能 Agent 系统。核心要点在于：设计支持表情和动作指令的 XML 协议；通过独立进程监听该协议并动态调整模型的待机动画、动作幅度和呼吸频率；最终实现大语言模型输出与角色视觉表现的分层隔离与联动，让虚拟角色具备自然、灵动的演出生命力。</summary>`

    activeEvaluationSessions.value[newSid] = {
      events: [
        {
          id: 'msg_user',
          type: 'user',
          content: targetMsg,
          timestamp: Date.now()
        }
      ],
      active: true,
      roleId: recentRoleId,
      title: jotTitle
    }
    
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: targetMsg,
          session_id: newSid,
          role_id: recentRoleId,
          session_title: `【灵感】${jotTitle.substring(0, 10)}`,
          user_id: 'default_user',
          max_iterations: 10,
          disable_tts: true,
          use_voice_tags: true,
          custom_system_prompt: customSystemPrompt
        })
      })
      
      if (!resp.ok) throw new Error('SSE call failed')
      
      const reader = resp.body?.getReader()
      if (!reader) throw new Error('No reader available')
      
      const decoder = new TextDecoder()
      let buffer = ''
      let aiReplyText = ''
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue
          const dataStr = trimmed.slice(5).trim()
          if (dataStr === '[DONE]') {
            finishBgStreaming(newSid)
            break
          }
          
          try {
            const payload = JSON.parse(dataStr)
            if (payload.event_type === 'session_id') {
              // ignore session_id event
            } else if (payload.event_type === 'update_conversation_name') {
              if (activeEvaluationSessions.value[newSid]) {
                activeEvaluationSessions.value[newSid].title = payload.title
              }
              loadThemeSpaces()
            } else if (payload.event_type === 'text_chunk' && payload.content) {
              aiReplyText += payload.content
              appendBgEvent(newSid, 'assistant', payload.content)
            } else if (payload.event_type === 'agent_thought' && payload.content) {
              appendBgEvent(newSid, 'thinking', payload.content)
            } else if (payload.event_type === 'voice_chunk') {
              // ignore voice chunks
            } else {
              finishBgStreaming(newSid)
              pushBgEvent(newSid, payload)
            }
          } catch {
            // ignore parse errors
          }
        }
      }
      
      // Save the AI reply as the first prompt card in this theme space!
      if (aiReplyText.trim()) {
        const alreadySaved = items.value.some(i => i.space_id === spaceId && i.title.startsWith('💡 灵感脑暴规划'))
        if (!alreadySaved) {
          const cleanTitle = activeEvaluationSessions.value[newSid]?.title || jotTitle
          await toggleFavorite(
            'prompt',
            `💡 灵感脑暴规划 - ${cleanTitle}`,
            undefined,
            {
              prompt: aiReplyText,
              chat_session_id: newSid,
              role_id: recentRoleId,
              subtype: 'inspiration'
            },
            spaceId
          )
        }
      }
      
      // Mark session as complete
      if (activeEvaluationSessions.value[newSid]) {
        activeEvaluationSessions.value[newSid].active = false
      }
    } catch (err) {
      console.error('Background brain storming failed:', err)
      if (activeEvaluationSessions.value[newSid]) {
        activeEvaluationSessions.value[newSid].active = false
      }
    }
  }

  function appendBgEvent(sid: string, type: 'assistant' | 'thinking', delta: string) {
    const session = activeEvaluationSessions.value[sid]
    if (!session) return
    const evts = session.events
    const last = evts[evts.length - 1]
    const mappedType = type === 'assistant' ? 'assistant' : 'thinking'
    if (last && last.type === mappedType && last.streaming) {
      last.content += delta
    } else {
      if (last && last.streaming) last.streaming = false
      evts.push({
        id: 'bg_' + Math.random().toString(36).substring(2, 9),
        type: mappedType,
        content: delta,
        streaming: true,
        timestamp: Date.now()
      })
    }
  }

  function pushBgEvent(sid: string, raw: any) {
    const session = activeEvaluationSessions.value[sid]
    if (!session) return
    const ev = mapSSEtoChatEvent(raw)
    if (ev) {
      session.events.push(ev)
    }
  }

  function finishBgStreaming(sid: string) {
    const session = activeEvaluationSessions.value[sid]
    if (!session) return
    const evts = session.events
    const last = evts[evts.length - 1]
    if (last) last.streaming = false
  }

  return {
    items,
    themeSpaces,
    loading,
    taggingTasks,
    draggedItemIds,
    showUnclassifiedOnly,
    activeEvaluationSessions,
    init,
    loadCollections,
    loadThemeSpaces,
    isFavorited,
    toggleFavorite,
    createThemeSpace,
    updateThemeSpace,
    deleteThemeSpace,
    moveToSpace,
    batchMoveToSpace,
    updateItemTags,
    autoTagItem,
    runBackgroundBrainstorm
  }
})
