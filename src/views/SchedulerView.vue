<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

// API models & state
interface Job {
  id: number
  job_id: string
  name: string
  job_type: string
  trigger_type: string
  schedule_expr: string
  args_json: string
  is_enabled: boolean
  next_run_time: string | null
  is_active: boolean
}

interface LogEntry {
  id: number
  job_id: string
  name: string
  job_type: string
  scheduled_run_time: string | null
  start_time: string
  end_time: string | null
  status: 'running' | 'success' | 'failed'
  duration_ms: number | null
  error_message: string | null
}

interface JobTypeInfo {
  name: string
  description: string
  default_args: string
}

const activeTab = ref('jobs')
const jobs = ref<Job[]>([])
const logs = ref<LogEntry[]>([])
const jobTypes = ref<Record<string, JobTypeInfo>>({})
const loadingJobs = ref(false)
const loadingLogs = ref(false)

// Timeline/Schedule State
interface UpcomingRun {
  job_id: string
  name: string
  job_type: string
  run_time: string // format: "2026-06-20 12:00:00"
}
const upcomingRuns = ref<UpcomingRun[]>([])
const loadingUpcoming = ref(false)

// Daily Message Board State
interface DailyMessage {
  id: number
  user_id: string
  agent_id: string
  date_str: string
  content: string
  created_at: string | null
}
const dailyMessages = ref<DailyMessage[]>([])
const loadingMessages = ref(false)

// Pagination
const logPage = ref(1)
const logLimit = ref(15)
const logTotal = ref(0)

// Executor filter
const executorFilter = ref('all')

// Refresh Timer
const autoRefresh = ref(true)
let refreshTimer: number | null = null

// Form Dialog state
const dialogVisible = ref(false)
const isEdit = ref(false)
const dialogLoading = ref(false)
const formRef = ref<any>(null)

const form = ref({
  job_id: '',
  name: '',
  job_type: '',
  trigger_type: 'cron',
  schedule_expr: '',
  args_json: '[]',
  is_enabled: true
})

const rules = {
  job_id: [
    { required: true, message: '请输入唯一标识 ID', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_\-]+$/, message: '只能包含英文、数字、下划线和连字符', trigger: 'blur' }
  ],
  name: [{ required: true, message: '请输入任务名称', trigger: 'blur' }],
  job_type: [{ required: true, message: '请选择任务类型', trigger: 'change' }],
  trigger_type: [{ required: true, message: '请选择触发方式', trigger: 'change' }],
  schedule_expr: [{ required: true, message: '请输入调度表达式', trigger: 'blur' }]
}

// Stats computed
const totalJobsCount = computed(() => jobs.value.length)
const activeJobsCount = computed(() => jobs.value.filter(j => j.is_enabled).length)
const successRate = computed(() => {
  if (logs.value.length === 0) return 100
  const completed = logs.value.filter(l => l.status !== 'running')
  if (completed.length === 0) return 100
  const succeeded = completed.filter(l => l.status === 'success')
  return Math.round((succeeded.length / completed.length) * 100)
})
const recentStatus = computed(() => {
  const completed = logs.value.filter(l => l.status !== 'running')
  const firstCompleted = completed[0]
  return firstCompleted ? firstCompleted.status : 'no_runs'
})

// Fetch methods
async function fetchJobs() {
  loadingJobs.value = true
  try {
    const res = await fetch(`/api/scheduler/jobs?t=${Date.now()}`)
    if (res.ok) {
      const data = await res.json()
      if (data.success) {
        jobs.value = data.data
      }
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('获取定时任务配置失败')
  } finally {
    loadingJobs.value = false
  }
}

async function fetchLogs() {
  loadingLogs.value = true
  try {
    const res = await fetch(`/api/scheduler/logs?page=${logPage.value}&limit=${logLimit.value}&t=${Date.now()}`)
    if (res.ok) {
      const data = await res.json()
      if (data.success) {
        logs.value = data.data.logs
        logTotal.value = data.data.total
      }
    }
  } catch (err) {
    console.error(err)
  } finally {
    loadingLogs.value = false
  }
}

async function fetchJobTypes() {
  try {
    const res = await fetch(`/api/scheduler/job-types?t=${Date.now()}`)
    if (res.ok) {
      const data = await res.json()
      if (data.success) {
        jobTypes.value = data.data
      }
    }
  } catch (err) {
    console.error(err)
  }
}

async function fetchUpcoming() {
  loadingUpcoming.value = true
  try {
    const res = await fetch(`/api/scheduler/upcoming?t=${Date.now()}`)
    if (res.ok) {
      const data = await res.json()
      if (data.success) {
        upcomingRuns.value = data.data
      }
    }
  } catch (err) {
    console.error(err)
  } finally {
    loadingUpcoming.value = false
  }
}

async function fetchDailyMessages() {
  loadingMessages.value = true
  try {
    const res = await fetch(`/api/agent/daily-messages?t=${Date.now()}`)
    if (res.ok) {
      const data = await res.json()
      if (data.success) {
        dailyMessages.value = data.data
      }
    }
  } catch (err) {
    console.error(err)
  } finally {
    loadingMessages.value = false
  }
}

function getAgentAvatar(agentId: string) {
  if (agentId === 'neuro') return '🌸'
  if (agentId === 'agent') return '🤖'
  if (agentId === 'default' || agentId === 'cc') return '⚡'
  return '👤'
}

function getAgentName(agentId: string) {
  if (agentId === 'neuro') return '欣怡'
  if (agentId === 'agent') return '智能体'
  if (agentId === 'default' || agentId === 'cc') return 'CC'
  return agentId
}

function getEventCreator(evt: TimelineEvent) {
  const job = jobs.value.find(j => j.job_id === evt.job_id)
  return job ? job.creator || 'system' : 'system'
}

function getEventCreatorClass(evt: TimelineEvent) {
  const job = jobs.value.find(j => j.job_id === evt.job_id)
  const role = job ? job.executor || job.creator || 'system' : 'system'
  if (role === 'default' || role === 'cc') {
    return 'agent'
  }
  return role
}

function getEventCreatorDisplayName(evt: TimelineEvent) {
  const job = jobs.value.find(j => j.job_id === evt.job_id)
  const creator = job ? job.creator || 'system' : 'system'
  return creator === 'system' ? '系统' : (creator === 'user' ? '用户' : getAgentName(creator))
}

function getEventExecutorDisplayName(evt: TimelineEvent) {
  const job = jobs.value.find(j => j.job_id === evt.job_id)
  const executor = job ? job.executor || 'system' : 'system'
  const executorName = executor === 'system' ? '系统自动' : (executor === 'user' ? '用户自己' : getAgentName(executor))
  
  let statusText = ""
  if (job && (job.accept_status === 'pending' || job.job_id.startsWith('suggest_'))) {
    statusText = job.accept_status === 'pending' ? ' (规划建议 - 待采纳)' : ' (规划建议 - 已采纳)'
  }
  return executorName + statusText
}

function getEventCreatorName(evt: TimelineEvent) {
  const job = jobs.value.find(j => j.job_id === evt.job_id)
  const creator = job ? job.creator || 'system' : 'system'
  const executor = job ? job.executor || 'system' : 'system'
  const creatorName = creator === 'system' ? '系统' : (creator === 'user' ? '用户' : getAgentName(creator))
  const executorName = executor === 'system' ? '系统自动' : (executor === 'user' ? '用户自己' : getAgentName(executor))
  
  let statusText = ""
  if (job && (job.accept_status === 'pending' || job.job_id.startsWith('suggest_'))) {
    statusText = job.accept_status === 'pending' ? ' (规划建议 - 待采纳)' : ' (规划建议 - 已采纳)'
  }
  
  return `安排人: ${creatorName} | 执行者: ${executorName}${statusText}`
}

function getJobAcceptStatus(jobId: string) {
  const job = jobs.value.find(j => j.job_id === jobId)
  return job ? job.accept_status || 'accepted' : 'accepted'
}

function shouldShowAcceptLabel(jobId: string) {
  const job = jobs.value.find(j => j.job_id === jobId)
  if (!job) return false
  return job.executor === 'user'
}

function getEventDisplayName(evt: TimelineEvent) {
  if (evt.job_type === 'agent_wakeup') {
    if (evt.job_id === 'heartbeat_ancestor') {
      return '原初心跳唤醒'
    }
    if (evt.job_id.startsWith('heartbeat_')) {
      return '心跳接力'
    }
    return '智能体唤醒'
  }
  
  let name = evt.name || ''
  if (name.startsWith('[')) {
    const idx = name.indexOf(']')
    if (idx !== -1) {
      name = name.substring(idx + 1).trim()
    }
  }
  return name
}

function getEventDescription(evt: TimelineEvent) {
  const name = evt.name || ''
  if (name.includes('心跳:')) {
    return name.split('心跳:')[1].trim()
  }
  if (name.includes('心跳：')) {
    return name.split('心跳：')[1].trim()
  }
  return ''
}

function getEventPrompt(evt: TimelineEvent) {
  const job = jobs.value.find(j => j.job_id === evt.job_id)
  if (job && job.args_json) {
    try {
      const args = JSON.parse(job.args_json)
      if (Array.isArray(args) && args.length > 1) {
        return args[1]
      }
    } catch(e) {}
  }
  return ''
}

function isSuggestedJob(jobId: string) {
  return jobId.startsWith('suggest_')
}

async function acceptTimelineJob(jobId: string) {
  try {
    const res = await fetch(`/api/scheduler/jobs/${jobId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept_status: 'accepted', is_enabled: true })
    })
    const data = await res.json()
    if (data.success) {
      ElMessage.success('已采纳该时间线规划并启用自动调度')
      const job = jobs.value.find(j => j.job_id === jobId)
      if (job) {
        job.accept_status = 'accepted'
        job.is_enabled = true
      }
      void fetchJobs()
      void fetchUpcoming()
    } else {
      ElMessage.error(data.detail || '采纳失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('网络请求失败')
  }
}



function getAgentDesc(agentId: string) {
  if (agentId === 'neuro') return '古灵精怪的 AI 伴侣，内在体贴温暖'
  if (agentId === 'default' || agentId === 'cc') return '延续 Claude Code 风格的高效结构化 Agent'
  return '系统定时任务触发 Agent'
}

function getAgentTagName(agentId: string) {
  if (agentId === 'neuro') return '陪伴型人设'
  if (agentId === 'default' || agentId === 'cc') return '效率助手'
  return '系统触发'
}

function formatMessageContent(content: string) {
  if (!content) return ''
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>')
}

// Timeline Logic
const timelineDays = computed(() => {
  const days = []
  const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const date = String(d.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${date}` // YYYY-MM-DD
    const label = `${month}-${date}`
    const weekday = weekdayNames[d.getDay()]
    days.push({
      dateStr,
      label,
      weekday,
      isToday: i === 0
    })
  }
  return days
})

// Current time line tracking
const currentTimePosition = ref(0)
const isCurrentTimeLineVisible = ref(false)
let timeInterval: number | null = null

function updateCurrentTime() {
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  currentTimePosition.value = hours * 60 + minutes
  isCurrentTimeLineVisible.value = true
}

// Hover tracker line
const timelineBodyRef = ref<HTMLElement | null>(null)
const hoverLineVisible = ref(false)
const hoverLineTop = ref(0)
const hoverTimeLabel = ref('')

function handleTimelineMouseMove(e: MouseEvent) {
  if (!timelineBodyRef.value) return
  const rect = timelineBodyRef.value.getBoundingClientRect()
  const scrollTop = timelineBodyRef.value.scrollTop
  let y = e.clientY - rect.top + scrollTop
  
  if (y < 0) y = 0
  if (y > 1440) y = 1440
  
  hoverLineTop.value = y
  hoverLineVisible.value = true
  
  const totalMinutes = Math.round(y)
  const hour = Math.floor(totalMinutes / 60)
  const min = Math.floor(totalMinutes % 60)
  hoverTimeLabel.value = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function handleTimelineMouseLeave() {
  hoverLineVisible.value = false
}

function formatHourLabel(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`
}

function parseDateTimeString(dtStr: string) {
  const normalized = dtStr.replace('T', ' ')
  const parts = normalized.split(' ')
  const datePart = parts[0] // "YYYY-MM-DD"
  const timePart = parts[1] || "00:00:00"
  const timeSubparts = timePart.split(':')
  const hour = parseInt(timeSubparts[0] || '0', 10)
  const minute = parseInt(timeSubparts[1] || '0', 10)
  return { datePart, hour, minute }
}

interface TimelineEvent {
  id: string | number
  job_id: string
  name: string
  job_type: string
  time: string
  type: 'upcoming' | 'past'
  status?: 'success' | 'failed' | 'running'
  duration_ms?: number | null
  error_message?: string | null
  dayIndex: number
  top: number
  height: number
  executor?: string
}

const timelineEvents = computed<TimelineEvent[]>(() => {
  const eventsList: TimelineEvent[] = []
  const days = timelineDays.value
  
  // 1. Process upcoming scheduled events
  upcomingRuns.value.forEach((run, index) => {
    const { datePart, hour, minute } = parseDateTimeString(run.run_time)
    const dayIdx = days.findIndex(d => d.dateStr === datePart)
    if (dayIdx !== -1) {
      const top = hour * 60 + minute
      const height = 45 // default 45 mins height
      const job = jobs.value.find(j => j.job_id === run.job_id)
      const executor = job ? job.executor || 'system' : 'system'
      eventsList.push({
        id: `upcoming-${index}-${run.job_id}`,
        job_id: run.job_id,
        name: run.name,
        job_type: run.job_type,
        time: run.run_time,
        type: 'upcoming',
        dayIndex: dayIdx,
        top,
        height,
        executor
      })
    }
  })

  // 1.5 Process pending suggested jobs from database (since they are disabled, they won't appear in upcomingRuns)
  jobs.value.forEach((job) => {
    if (job.accept_status === 'pending') {
      let runTimeStr = ''
      if (job.trigger_type === 'date') {
        runTimeStr = job.schedule_expr
      }
      
      if (runTimeStr) {
        try {
          const { datePart, hour, minute } = parseDateTimeString(runTimeStr)
          const dayIdx = days.findIndex(d => d.dateStr === datePart)
          if (dayIdx !== -1) {
            // Avoid duplicates
            if (!eventsList.some(e => e.job_id === job.job_id)) {
              const top = hour * 60 + minute
              const height = 45
              const executor = job.executor || 'user'
              eventsList.push({
                id: `suggested-${job.job_id}`,
                job_id: job.job_id,
                name: job.name,
                job_type: job.job_type,
                time: runTimeStr,
                type: 'upcoming',
                dayIndex: dayIdx,
                top,
                height,
                executor
              })
            }
          }
        } catch (e) {
          console.error('Failed to parse suggested job run time:', e)
        }
      }
    }
  })
  
  // 2. Process log history events
  logs.value.forEach((log) => {
    const { datePart, hour, minute } = parseDateTimeString(log.start_time)
    const dayIdx = days.findIndex(d => d.dateStr === datePart)
    if (dayIdx !== -1) {
      const top = hour * 60 + minute
      let height = 45
      if (log.status !== 'running' && log.duration_ms !== null && log.duration_ms !== undefined) {
        const durationMin = log.duration_ms / 60000
        height = Math.max(35, durationMin) // min 35px height
      }
      
      const job = jobs.value.find(j => j.job_id === log.job_id)
      const executor = job ? job.executor || 'system' : 'system'
      eventsList.push({
        id: `log-${log.id}`,
        job_id: log.job_id,
        name: log.name,
        job_type: log.job_type,
        time: log.start_time,
        type: 'past',
        status: log.status,
        duration_ms: log.duration_ms,
        error_message: log.error_message,
        dayIndex: dayIdx,
        top,
        height,
        executor
      })
    }
  })
  
  // Filter by executorFilter
  if (!executorFilter.value || executorFilter.value === 'all') {
    return eventsList
  }
  
  return eventsList.filter(evt => {
    const exec = evt.executor || 'system'
    if (executorFilter.value === 'system') {
      return exec === 'system'
    }
    if (executorFilter.value === 'user') {
      return exec === 'user'
    }
    if (executorFilter.value === 'all_agents') {
      return exec !== 'system' && exec !== 'user'
    }
    // Specific agent
    return exec === executorFilter.value
  })
})

function getEventsForDay(dayIdx: number) {
  return timelineEvents.value.filter(e => e.dayIndex === dayIdx)
}

function formatEventTimeRange(evt: TimelineEvent) {
  const { hour, minute } = parseDateTimeString(evt.time)
  const startStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  
  let durationMin = 0
  if (evt.type === 'past' && evt.duration_ms !== null && evt.duration_ms !== undefined) {
    durationMin = Math.round(evt.duration_ms / 60000)
  } else {
    durationMin = 45
  }
  
  const totalMin = hour * 60 + minute + durationMin
  const endHour = Math.floor(totalMin / 60) % 24
  const endMin = Math.floor(totalMin % 60)
  const endStr = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`
  
  return `${startStr} - ${endStr}`
}

function handleSyncTrigger() {
  void fetchJobs()
  void fetchLogs()
  void fetchUpcoming()
  void fetchDailyMessages()
}

// Lifecycle
onMounted(() => {
  fetchJobs()
  fetchLogs()
  fetchJobTypes()
  fetchUpcoming()
  fetchDailyMessages()
  
  updateCurrentTime()
  timeInterval = window.setInterval(updateCurrentTime, 60000)
  
  // Listen for agent-triggered sync events
  window.addEventListener('scheduler:sync', handleSyncTrigger)
  
  // Set up auto refresh
  refreshTimer = window.setInterval(() => {
    if (autoRefresh.value) {
      handleSyncTrigger()
    }
  }, 300000)
})

onUnmounted(() => {
  window.removeEventListener('scheduler:sync', handleSyncTrigger)
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
  if (timeInterval) {
    clearInterval(timeInterval)
  }
})

// Handlers
function openCreateDialog() {
  isEdit.value = false
  form.value = {
    job_id: '',
    name: '',
    job_type: '',
    trigger_type: 'cron',
    schedule_expr: '',
    args_json: '[]',
    is_enabled: true
  }
  dialogVisible.value = true
}

function openEditDialog(row: Job) {
  isEdit.value = true
  form.value = {
    job_id: row.job_id,
    name: row.name,
    job_type: row.job_type,
    trigger_type: row.trigger_type,
    schedule_expr: row.schedule_expr,
    args_json: row.args_json,
    is_enabled: row.is_enabled
  }
  dialogVisible.value = true
}

function handleJobTypeChange(val: string) {
  if (jobTypes.value[val]) {
    form.value.name = jobTypes.value[val].name
    form.value.args_json = jobTypes.value[val].default_args
  }
}

async function saveJob() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    
    dialogLoading.value = true
    try {
      const url = isEdit.value ? `/api/scheduler/jobs/${form.value.job_id}` : '/api/scheduler/jobs'
      const method = isEdit.value ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form.value)
      })
      const data = await res.json()
      if (data.success) {
        ElMessage.success(isEdit.value ? '修改任务成功' : '创建任务成功')
        dialogVisible.value = false
        void fetchJobs()
        void fetchLogs()
        void fetchUpcoming()
      } else {
        ElMessage.error(data.detail || '保存任务配置失败')
      }
    } catch (err) {
      console.error(err)
      ElMessage.error('网络请求失败')
    } finally {
      dialogLoading.value = false
    }
  })
}

async function toggleJobStatus(row: Job) {
  try {
    const res = await fetch(`/api/scheduler/jobs/${row.job_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: row.is_enabled })
    })
    const data = await res.json()
    if (data.success) {
      ElMessage.success(row.is_enabled ? '已启用任务调度' : '已暂停任务调度')
      void fetchJobs()
      void fetchUpcoming()
    } else {
      ElMessage.error(data.detail || '切换状态失败')
      row.is_enabled = !row.is_enabled
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('网络请求错误')
    row.is_enabled = !row.is_enabled
  }
}

async function runJobOnce(row: Job) {
  try {
    const res = await fetch(`/api/scheduler/jobs/${row.job_id}/run`, {
      method: 'POST'
    })
    const data = await res.json()
    if (data.success) {
      ElMessage.success('已触发立即执行任务（一次性）')
      void fetchLogs()
    } else {
      ElMessage.error(data.detail || '触发失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('网络请求失败')
  }
}

async function deleteJob(row: Job) {
  ElMessageBox.confirm(`确认删除定时任务配置 "${row.name}" (${row.job_id}) 吗？`, '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      const res = await fetch(`/api/scheduler/jobs/${row.job_id}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        ElMessage.success('删除成功')
        void fetchJobs()
        void fetchLogs()
      } else {
        ElMessage.error(data.detail || '删除失败')
      }
    } catch (err) {
      console.error(err)
      ElMessage.error('网络请求错误')
    }
  }).catch(() => {})
}

// Helpers
function formatDuration(ms: number | null) {
  if (ms === null || ms === undefined) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function getJobTypeName(typeStr: string) {
  return jobTypes.value[typeStr]?.name || typeStr
}

const apiBaseHost = window.location.protocol === 'file:' ? 'http://127.0.0.1:8004' : ''
</script>

<template>
  <div class="scheduler-dashboard">
    <!-- 头部指标卡片 -->
    <el-row :gutter="20" class="stat-row">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-header">
            <span>总计已配置任务</span>
            <el-icon class="stat-icon"><i-ep-document /></el-icon>
          </div>
          <div class="stat-value">{{ totalJobsCount }}</div>
          <div class="stat-desc">在库的定时任务总数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-header">
            <span>当前活跃任务</span>
            <el-icon class="stat-icon is-active"><i-ep-circle-check /></el-icon>
          </div>
          <div class="stat-value text-success">{{ activeJobsCount }}</div>
          <div class="stat-desc">处于启用并参与调度的任务</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-header">
            <span>执行成功率</span>
            <el-icon class="stat-icon"><i-ep-pie-chart /></el-icon>
          </div>
          <div class="stat-value text-warning">{{ successRate }}%</div>
          <div class="stat-desc">近期正常结束的任务比率</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-header">
            <span>最近运行状态</span>
            <el-icon class="stat-icon"><i-ep-notification /></el-icon>
          </div>
          <div class="stat-value">
            <el-tag v-if="recentStatus === 'success'" type="success" size="large" effect="dark">成功</el-tag>
            <el-tag v-else-if="recentStatus === 'failed'" type="danger" size="large" effect="dark">失败</el-tag>
            <el-tag v-else-if="recentStatus === 'running'" type="primary" size="large" effect="dark">运行中</el-tag>
            <span v-else class="text-secondary">-</span>
          </div>
          <div class="stat-desc">最近一次结束的任务执行状态</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 功能区域与标签页 -->
    <el-card shadow="never" class="main-card">
      <div class="tab-header">
        <el-radio-group v-model="activeTab" class="tab-selectors">
          <el-radio-button value="jobs">
            <el-icon><i-ep-calendar /></el-icon> 任务调度规划
          </el-radio-button>
          <el-radio-button value="logs">
            <el-icon><i-ep-operation /></el-icon> 近期执行历史
          </el-radio-button>
          <el-radio-button value="timeline">
            <el-icon><i-ep-clock /></el-icon> 周历时间线
          </el-radio-button>
          <el-radio-button value="messages">
            <el-icon><i-ep-chat-line-round /></el-icon> 晚间留言板
          </el-radio-button>
        </el-radio-group>

        <div class="action-buttons">
          <!-- Executor Filter (Only visible when activeTab === 'timeline') -->
          <el-select
            v-if="activeTab === 'timeline'"
            v-model="executorFilter"
            placeholder="筛选执行人"
            style="width: 160px; margin-right: 12px;"
          >
            <template #prefix>
              <el-icon><i-ep-user /></el-icon>
            </template>
            <el-option label="全部执行人" value="all" />
            <el-option label="仅系统" value="system" />
            <el-option label="全体智能体" value="all_agents" />
            <el-option label="仅用户" value="user" />
            <el-option label="智能体: 欣怡" value="neuro" />
            <el-option label="智能体: CC" value="default" />
          </el-select>

          <el-checkbox v-model="autoRefresh" class="auto-refresh-check">每 5s 自动刷新</el-checkbox>
          <el-button type="primary" @click="openCreateDialog">
            <el-icon><i-ep-plus /></el-icon> 新建定时任务
          </el-button>
        </div>
      </div>

      <!-- 标签页 1：任务规划 -->
      <div v-show="activeTab === 'jobs'" class="tab-pane">
        <el-table :data="jobs" v-loading="loadingJobs" border stripe class="custom-table">
          <el-table-column prop="job_id" label="任务ID" width="180" show-overflow-tooltip />
          <el-table-column prop="name" label="任务名称" width="220" />
          <el-table-column prop="job_type" label="任务类型" width="180">
            <template #default="{ row }">
              <el-tag effect="plain" type="info">{{ getJobTypeName(row.job_type) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="executor" label="执行者" width="110" align="center">
            <template #default="{ row }">
              <div class="creator-avatar-container">
                <el-tooltip :content="row.executor === 'system' ? '执行者: 系统自动' : (row.executor === 'user' ? '执行者: 用户自己' : (row.executor === 'agent' ? '执行者: 智能体(通用)' : `执行者: 智能体 (${getAgentName(row.executor)})`))" placement="top">
                  <div class="creator-avatar-circle" :class="row.executor">
                    <img v-if="row.executor === 'neuro'" :src="apiBaseHost + '/api/chat/roles/neuro/avatar'" class="creator-avatar-img" />
                    <svg v-else-if="row.executor === 'system'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="creator-flat-svg">
                      <circle cx="12" cy="12" r="3"></circle>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    <svg v-else-if="row.executor === 'agent'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="creator-flat-svg">
                      <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                      <circle cx="12" cy="5" r="2"></circle>
                      <path d="M12 7v4"></path>
                      <line x1="8" y1="16" x2="8" y2="16.01"></line>
                      <line x1="16" y1="16" x2="16" y2="16.01"></line>
                    </svg>
                    <svg v-else-if="row.executor === 'user'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="creator-flat-svg">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="creator-flat-svg">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </div>
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="trigger_type" label="触发方式" width="110">
            <template #default="{ row }">
              <el-tag v-if="row.trigger_type === 'cron'" type="success">Cron表达式</el-tag>
              <el-tag v-else-if="row.trigger_type === 'date'" type="warning">特定日期</el-tag>
              <el-tag v-else type="primary">间隔时间</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="schedule_expr" label="调度规则" width="180" show-overflow-tooltip />
          <el-table-column prop="is_enabled" label="启用状态" width="100" align="center">
            <template #default="{ row }">
              <el-switch v-model="row.is_enabled" @change="toggleJobStatus(row)" />
            </template>
          </el-table-column>
          <el-table-column prop="next_run_time" label="下一次运行时间" width="180">
            <template #default="{ row }">
              <span v-if="row.next_run_time" class="time-text">{{ row.next_run_time }}</span>
              <span v-else class="text-secondary">-</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="220" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" size="small" link @click="runJobOnce(row)">
                <el-icon><i-ep-video-play /></el-icon> 立即执行
              </el-button>
              <el-button type="warning" size="small" link @click="openEditDialog(row)">
                <el-icon><i-ep-edit /></el-icon> 修改
              </el-button>
              <el-button type="danger" size="small" link @click="deleteJob(row)">
                <el-icon><i-ep-delete /></el-icon> 删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 标签页 2：历史运行日志 -->
      <div v-show="activeTab === 'logs'" class="tab-pane">
        <el-table :data="logs" v-loading="loadingLogs" border stripe class="custom-table">
          <el-table-column prop="name" label="任务名称" width="200" show-overflow-tooltip />
          <el-table-column prop="job_type" label="任务类型" width="160">
            <template #default="{ row }">
              <span>{{ getJobTypeName(row.job_type) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="start_time" label="开始时间" width="180">
            <template #default="{ row }">
              <span class="time-text">{{ row.start_time ? row.start_time.replace('T', ' ').substring(0, 19) : '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="end_time" label="结束时间" width="180">
            <template #default="{ row }">
              <span v-if="row.end_time" class="time-text">{{ row.end_time.replace('T', ' ').substring(0, 19) }}</span>
              <span v-else class="text-secondary">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="duration_ms" label="执行时长" width="110" align="right">
            <template #default="{ row }">
              <span>{{ formatDuration(row.duration_ms) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="执行结果" width="110" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.status === 'success'" type="success" effect="dark">成功</el-tag>
              <el-tag v-else-if="row.status === 'failed'" type="danger" effect="dark">失败</el-tag>
              <el-tag v-else type="primary" effect="dark">运行中</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="error_message" label="异常/错误信息" min-width="250" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.error_message" class="text-danger error-desc">{{ row.error_message }}</span>
              <span v-else class="text-secondary">-</span>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 -->
        <div class="pagination-row">
          <el-pagination
            v-model:current-page="logPage"
            v-model:page-size="logLimit"
            :total="logTotal"
            :page-sizes="[15, 30, 50]"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="fetchLogs"
            @current-change="fetchLogs"
          />
        </div>
      </div>

      <!-- 标签页 3：周历时间线 -->
      <div v-show="activeTab === 'timeline'" class="tab-pane timeline-pane" v-loading="loadingUpcoming">
        <div class="timeline-container">
          <!-- Timeline Header -->
          <div class="timeline-header">
            <div class="time-axis-header">时间</div>
            <div 
              v-for="(day, idx) in timelineDays" 
              :key="idx" 
              class="day-header"
              :class="{ 'is-today': day.isToday }"
            >
              <span class="day-name">{{ day.weekday }}</span>
              <span class="day-date">{{ day.label }}</span>
            </div>
          </div>

          <!-- Timeline Grid Body -->
          <div 
            ref="timelineBodyRef"
            class="timeline-body"
            @mousemove="handleTimelineMouseMove"
            @mouseleave="handleTimelineMouseLeave"
          >
            <!-- Background Grid Hour Rows -->
            <div class="grid-background">
              <div 
                v-for="h in 24" 
                :key="h - 1" 
                class="hour-row"
                :style="{ top: (h - 1) * 60 + 'px' }"
              >
                <div class="hour-label">{{ formatHourLabel(h - 1) }}</div>
                <div class="hour-line"></div>
              </div>
            </div>

            <!-- Columns Container -->
            <div class="columns-overlay">
              <div 
                v-for="(day, idx) in timelineDays" 
                :key="idx" 
                class="timeline-column"
                :class="{ 'is-today': day.isToday }"
              >
                <!-- Current Time Red Line (Today only) -->
                <div 
                  v-if="day.isToday && isCurrentTimeLineVisible"
                  class="current-time-line"
                  :style="{ top: currentTimePosition + 'px' }"
                >
                  <div class="current-time-dot"></div>
                </div>

                <!-- Event Blocks in this Column -->
                <div 
                  v-for="evt in getEventsForDay(idx)" 
                  :key="evt.id" 
                  class="event-block"
                  :class="[evt.type, evt.status, evt.job_type]"
                  :style="{ top: evt.top + 'px', height: evt.height + 'px' }"
                >
                  <el-popover
                    placement="right"
                    :width="280"
                    trigger="hover"
                    popper-style="box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12); border-radius: 8px; padding: 12px;"
                  >
                    <template #reference>
                      <div class="event-block-content">
                        <div class="event-block-left">
                          <div class="event-time">{{ formatEventTimeRange(evt) }}</div>
                          <div class="event-name">{{ getEventDisplayName(evt) }}</div>
                        </div>
                        <div class="event-block-creator">
                          <!-- Accept status label for timeline suggested jobs -->
                          <div 
                            v-if="getJobAcceptStatus(evt.job_id) === 'pending' && shouldShowAcceptLabel(evt.job_id)"
                            class="timeline-accept-label pending"
                            @click.stop="acceptTimelineJob(evt.job_id)"
                            title="点击采纳该时间线规划"
                          >
                            待采纳
                          </div>
                          <div 
                            v-else-if="getJobAcceptStatus(evt.job_id) === 'accepted' && isSuggestedJob(evt.job_id) && shouldShowAcceptLabel(evt.job_id)"
                            class="timeline-accept-label accepted"
                          >
                            已采纳
                          </div>

                          <el-tooltip :content="getEventCreatorName(evt)" placement="top">
                            <div class="event-creator-circle" :class="getEventCreatorClass(evt)">
                              <img v-if="getEventCreatorClass(evt) === 'neuro'" :src="apiBaseHost + '/api/chat/roles/neuro/avatar'" class="creator-avatar-img" />
                              <svg v-else-if="getEventCreatorClass(evt) === 'system'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="creator-flat-svg">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                              </svg>
                              <svg v-else-if="getEventCreatorClass(evt) === 'user'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="creator-flat-svg">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                              </svg>
                              <svg v-else-if="getEventCreatorClass(evt) === 'agent'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="creator-flat-svg">
                                <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                                <circle cx="12" cy="5" r="2"></circle>
                                <path d="M12 7v4"></path>
                                <line x1="8" y1="16" x2="8" y2="16.01"></line>
                                <line x1="16" y1="16" x2="16" y2="16.01"></line>
                              </svg>
                              <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="creator-flat-svg">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                              </svg>
                            </div>
                          </el-tooltip>
                        </div>
                      </div>
                    </template>
                    
                    <div class="event-detail-popover">
                      <div class="popover-title">
                        <strong>{{ getEventDisplayName(evt) }}</strong>
                      </div>
                      <div class="popover-divider"></div>
                      <div class="popover-item">
                        <span class="label">具体内容:</span>
                        <span class="value">{{ evt.name }}</span>
                      </div>
                      <div v-if="getEventDescription(evt)" class="popover-item desc-item">
                        <span class="label">任务描述:</span>
                        <span class="value desc-text">{{ getEventDescription(evt) }}</span>
                      </div>
                      <div v-if="getEventPrompt(evt)" class="popover-item prompt-item">
                        <span class="label">执行指令:</span>
                        <span class="value prompt-text">{{ getEventPrompt(evt) }}</span>
                      </div>
                      <div class="popover-item">
                        <span class="label">任务 ID:</span>
                        <span class="value">{{ evt.job_id }}</span>
                      </div>
                      <div class="popover-item">
                        <span class="label">安排人:</span>
                        <span class="value">{{ getEventCreatorDisplayName(evt) }}</span>
                      </div>
                      <div class="popover-item">
                        <span class="label">执行者:</span>
                        <span class="value">{{ getEventExecutorDisplayName(evt) }}</span>
                      </div>
                      <div class="popover-item">
                        <span class="label">任务类型:</span>
                        <span class="value">{{ getJobTypeName(evt.job_type) }}</span>
                      </div>
                      <div class="popover-item">
                        <span class="label">执行性质:</span>
                        <span class="value">
                          <el-tag v-if="evt.type === 'upcoming'" type="info" size="small" effect="plain">将来规划</el-tag>
                          <el-tag v-else type="success" size="small" effect="plain">历史执行</el-tag>
                        </span>
                      </div>
                      <div v-if="evt.type === 'past'" class="popover-item">
                        <span class="label">执行结果:</span>
                        <span class="value">
                          <el-tag v-if="evt.status === 'success'" type="success" size="small" effect="dark">成功</el-tag>
                          <el-tag v-else-if="evt.status === 'failed'" type="danger" size="small" effect="dark">失败</el-tag>
                          <el-tag v-else type="primary" size="small" effect="dark">运行中</el-tag>
                        </span>
                      </div>
                      <div class="popover-item">
                        <span class="label">触发时间:</span>
                        <span class="value time-text">{{ evt.time.replace('T', ' ').substring(0, 19) }}</span>
                      </div>
                      <div v-if="evt.type === 'past' && evt.duration_ms !== null && evt.duration_ms !== undefined" class="popover-item">
                        <span class="label">执行时长:</span>
                        <span class="value">{{ formatDuration(evt.duration_ms) }}</span>
                      </div>
                      <div v-if="evt.error_message" class="popover-error">
                        <span class="error-label">错误日志:</span>
                        <pre class="error-text">{{ evt.error_message }}</pre>
                      </div>
                    </div>
                  </el-popover>
                </div>
              </div>
            </div>

            <!-- Cursor Hover Tracker Dashed Line -->
            <div 
              v-show="hoverLineVisible" 
              class="hover-tracker-line"
              :style="{ top: hoverLineTop + 'px' }"
            >
              <div class="hover-time-badge">{{ hoverTimeLabel }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 标签页 4：晚间留言板 -->
      <div v-show="activeTab === 'messages'" class="tab-pane messages-pane" v-loading="loadingMessages">
        <div v-if="dailyMessages.length === 0" class="empty-messages">
          <el-empty description="暂无晚间留言，当定时任务运行或深夜整理完毕时，Agent 们会把温情卡片投递到这里哦。" />
        </div>
        <div v-else class="messages-grid">
          <div 
            v-for="msg in dailyMessages" 
            :key="msg.id" 
            class="message-card"
          >
            <div class="message-card-header">
              <div class="agent-avatar-area">
                <div class="agent-avatar">{{ getAgentAvatar(msg.agent_id) }}</div>
                <div class="agent-info">
                  <span class="agent-name">{{ getAgentName(msg.agent_id) }}</span>
                  <span class="agent-desc">{{ getAgentDesc(msg.agent_id) }}</span>
                </div>
              </div>
              <div class="message-date-badge">{{ msg.date_str }}</div>
            </div>
            <div class="message-card-body">
              <div class="message-content" v-html="formatMessageContent(msg.content)"></div>
            </div>
            <div class="message-card-footer">
              <span class="created-time">投递于 {{ msg.created_at || msg.date_str }}</span>
              <el-tag size="small" type="info" effect="plain">{{ getAgentTagName(msg.agent_id) }}</el-tag>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 配置表单对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '修改定时任务配置' : '新建定时任务'"
      width="600px"
      destroy-on-close
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="120px"
        v-loading="dialogLoading"
        class="dialog-form"
      >
        <el-form-item label="任务ID" prop="job_id">
          <el-input 
            v-model="form.job_id" 
            placeholder="英文字符唯一标识，例如: cleanup_weekly" 
            :disabled="isEdit"
          />
        </el-form-item>
        
        <el-form-item label="任务类型" prop="job_type">
          <el-select 
            v-model="form.job_type" 
            placeholder="选择待调度的后台任务" 
            style="width: 100%"
            @change="handleJobTypeChange"
          >
            <el-option
              v-for="(info, key) in jobTypes"
              :key="key"
              :label="info.name"
              :value="key"
            >
              <div class="select-option-row">
                <span>{{ info.name }}</span>
                <span class="select-option-sub">{{ info.description }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="任务名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入任务的可读别名，例如：清理系统缓存" />
        </el-form-item>

        <el-form-item label="触发方式" prop="trigger_type">
          <el-radio-group v-model="form.trigger_type">
            <el-radio-button value="cron">Cron</el-radio-button>
            <el-radio-button value="date">特定日期</el-radio-button>
            <el-radio-button value="interval">时间间隔</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="调度规则表达式" prop="schedule_expr">
          <el-input v-model="form.schedule_expr" placeholder="请输入规则值" />
          <div class="expr-hint">
            <span v-if="form.trigger_type === 'cron'">
              例 1: <code>0 12 * * *</code> 表示每日中午 12 点。<br/>
              例 2: <code>12:30</code> 快捷格式表示每日 12 点 30 分。
            </span>
            <span v-else-if="form.trigger_type === 'date'">
              格式：ISO日期。例如 <code>2026-06-20 12:00:00</code> (单次触发)
            </span>
            <span v-else>
              格式：整数秒。例如输入 <code>60</code> 表示每隔 60 秒运行一次。
            </span>
          </div>
        </el-form-item>

        <el-form-item label="参数 payload (JSON)" prop="args_json">
          <el-input 
            v-model="form.args_json" 
            type="textarea" 
            :rows="3" 
            placeholder="必须是合法的 JSON 数组，例如：[1002142] 或 []" 
          />
        </el-form-item>

        <el-form-item label="是否启用">
          <el-switch v-model="form.is_enabled" />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveJob" :loading="dialogLoading">保存配置</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.scheduler-dashboard {
  padding: 20px;
  background: var(--bg-main, #f5f7fa);
  min-height: calc(100vh - 120px);
}

.stat-row {
  margin-bottom: 20px;
}

.stat-card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(220, 223, 230, 0.5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

.stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: #606266;
  margin-bottom: 8px;
}

.stat-icon {
  font-size: 18px;
  color: #909399;
}

.stat-icon.is-active {
  color: #67c23a;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #303133;
  margin-bottom: 8px;
}

.stat-desc {
  font-size: 12px;
  color: #909399;
}

.main-card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(220, 223, 230, 0.6);
  padding: 10px;
}

.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(235, 238, 245, 0.8);
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 15px;
}

.auto-refresh-check {
  margin-right: 0;
}

.custom-table {
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.time-text {
  font-family: Consolas, Monaco, monospace;
  font-size: 13px;
  color: #409eff;
}

.pagination-row {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.error-desc {
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
}

.select-option-row {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
  padding: 4px 0;
}

.select-option-sub {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.expr-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
  line-height: 1.5;
  background: #f4f4f5;
  padding: 6px 10px;
  border-radius: 4px;
  width: 100%;
}

.expr-hint code {
  color: #f56c6c;
  background: #fef0f0;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: monospace;
}

.dialog-form {
  padding-right: 20px;
}

.text-success {
  color: #67c23a !important;
}

.text-warning {
  color: #e6a23c !important;
}

.text-danger {
  color: #f56c6c !important;
}

.text-secondary {
  color: #909399;
}

.timeline-pane {
  padding: 10px 0;
}

.timeline-container {
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(220, 223, 230, 0.6);
}

.timeline-header {
  display: flex;
  background: #f8f9fa;
  border-bottom: 1px solid rgba(220, 223, 230, 0.8);
  user-select: none;
}

.time-axis-header {
  width: 60px;
  text-align: center;
  font-size: 12px;
  color: #909399;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid rgba(220, 223, 230, 0.5);
}

.day-header {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-right: 1px solid rgba(220, 223, 230, 0.5);
}

.day-header:last-child {
  border-right: none;
}

.day-header.is-today {
  background: rgba(64, 158, 255, 0.08);
}

.day-header.is-today .day-name {
  color: #409eff;
  font-weight: 700;
}

.day-name {
  font-size: 13px;
  color: #303133;
  font-weight: 600;
}

.day-date {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

.timeline-body {
  position: relative;
  height: 650px;
  overflow-y: auto;
  background: #ffffff;
}

.grid-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1440px;
  pointer-events: none;
}

.hour-row {
  position: absolute;
  left: 0;
  right: 0;
  height: 60px;
  display: flex;
}

.hour-label {
  width: 60px;
  text-align: center;
  font-size: 11px;
  color: #909399;
  font-family: Consolas, Monaco, monospace;
  margin-top: -8px;
  line-height: 16px;
  background: #ffffff;
  z-index: 1;
}

.hour-line {
  flex: 1;
  border-top: 1px solid rgba(220, 223, 230, 0.4);
}

.columns-overlay {
  position: absolute;
  top: 0;
  left: 60px;
  right: 0;
  height: 1440px;
  display: flex;
}

.timeline-column {
  flex: 1;
  height: 100%;
  position: relative;
  border-right: 1px solid rgba(220, 223, 230, 0.4);
}

.timeline-column:last-child {
  border-right: none;
}

.timeline-column.is-today {
  background: rgba(64, 158, 255, 0.02);
}

.current-time-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: #f56c6c;
  z-index: 10;
  pointer-events: none;
}

.current-time-dot {
  position: absolute;
  left: -4px;
  top: -4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f56c6c;
  box-shadow: 0 0 6px rgba(245, 108, 108, 0.8);
}

.hover-tracker-line {
  position: absolute;
  left: 60px;
  right: 0;
  height: 0;
  border-top: 1.5px dashed #409eff;
  z-index: 9;
  pointer-events: none;
}

.hover-time-badge {
  position: absolute;
  left: -55px;
  top: -10px;
  background: #409eff;
  color: #ffffff;
  font-size: 10px;
  font-family: Consolas, Monaco, monospace;
  padding: 2px 5px;
  border-radius: 4px;
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.4);
}

.event-block {
  position: absolute;
  left: 6px;
  right: 6px;
  border-radius: 6px;
  padding: 5px 8px;
  cursor: pointer;
  font-size: 11px;
  overflow: hidden;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  z-index: 2;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.event-block:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
  z-index: 5;
}

/* Event Style Mapping */
.event-block.upcoming {
  border: 1px solid rgba(0,0,0,0.04) !important;
  border-left: 3px solid !important;
}

/* Default Upcoming */
.event-block.upcoming {
  border-left-color: #909399 !important;
  background: rgba(244, 244, 245, 0.65);
  color: #475569;
}

/* Specific Jobs colors */
.event-block.upcoming.buy_ticket {
  border-left-color: #f56c6c !important;
  background: rgba(254, 240, 240, 0.7);
  color: #ef4444;
}

.event-block.upcoming.memory_summary {
  border-left-color: #7d3cff !important;
  background: rgba(243, 237, 255, 0.7);
  color: #7c3aed;
}

.event-block.upcoming.cleanup {
  border-left-color: #e6a23c !important;
  background: rgba(253, 246, 236, 0.7);
  color: #d97706;
}

.event-block.upcoming.get_showcase {
  border-left-color: #409eff !important;
  background: rgba(236, 245, 255, 0.7);
  color: #2563eb;
}

.event-block.upcoming.agent_wakeup {
  border-left-color: #6366f1 !important;
  background: rgba(238, 242, 255, 0.75);
  color: #4f46e5;
}

/* Completed History logs */
.event-block.past {
  border: 1px solid rgba(0,0,0,0.03) !important;
  border-left: 3px solid !important;
}

.event-block.past.success {
  background: rgba(240, 249, 235, 0.75);
  border-left-color: #67c23a !important;
  color: #16a34a;
}

.event-block.past.failed {
  background: rgba(254, 240, 240, 0.75);
  border-left-color: #f56c6c !important;
  color: #dc2626;
}

.event-block.past.running {
  background: rgba(236, 245, 255, 0.75);
  border-left-color: #409eff !important;
  color: #2563eb;
  animation: running-pulse 1.5s infinite alternate;
}

/* Hover popover details extra styles */
.event-detail-popover .popover-item.desc-item,
.event-detail-popover .popover-item.prompt-item {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.event-detail-popover .desc-text,
.event-detail-popover .prompt-text {
  font-size: 11px;
  color: #475569;
  background: #f8fafc;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
  width: 100%;
  box-sizing: border-box;
  white-space: pre-wrap;
  word-break: break-all;
}

@keyframes running-pulse {
  from {
    box-shadow: 0 0 4px rgba(64, 158, 255, 0.2);
    opacity: 0.95;
  }
  to {
    box-shadow: 0 0 10px rgba(64, 158, 255, 0.5);
    opacity: 0.8;
  }
}

.event-block-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 2px;
}

.event-time {
  font-size: 9px;
  font-family: Consolas, Monaco, monospace;
  opacity: 0.8;
  font-weight: 600;
  line-height: 1;
}

.event-name {
  font-weight: 600;
  font-size: 11px;
  margin-top: 2px;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Popover details */
.event-detail-popover {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.popover-title {
  font-size: 14px;
  color: #303133;
}

.popover-divider {
  height: 1px;
  background: #ebeef5;
}

.popover-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  line-height: 1.5;
}

.popover-item .label {
  color: #909399;
}

.popover-item .value {
  color: #303133;
  font-weight: 500;
}

.popover-error {
  margin-top: 4px;
  padding: 8px;
  background: #fef0f0;
  border-radius: 4px;
  border: 1px solid #fde2e2;
}

.error-label {
  font-size: 11px;
  color: #f56c6c;
  font-weight: 600;
  display: block;
  margin-bottom: 4px;
}

.error-text {
  font-family: Consolas, Monaco, monospace;
  font-size: 10px;
  color: #f56c6c;
  margin: 0;
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
}
.messages-pane {
  padding: 20px 0;
}

.empty-messages {
  padding: 80px 0;
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(220, 223, 230, 0.4);
}

.messages-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 20px;
}

.message-card {
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(220, 223, 230, 0.5);
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
}

.message-card:hover {
  transform: translateY(-4px) scale(1.01);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.08);
  border-color: rgba(64, 158, 255, 0.3);
  background: rgba(255, 255, 255, 0.85);
}

.message-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
}

.agent-avatar-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.agent-avatar {
  font-size: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.1), rgba(255, 105, 180, 0.15));
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.02);
}

.agent-info {
  display: flex;
  flex-direction: column;
}

.agent-name {
  font-size: 15px;
  font-weight: 700;
  color: #303133;
}

.agent-desc {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message-date-badge {
  font-size: 11px;
  font-family: Consolas, Monaco, monospace;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 20px;
  background: rgba(64, 158, 255, 0.08);
  color: #409eff;
}

.message-card-body {
  flex: 1;
  margin-bottom: 18px;
}

.message-content {
  font-size: 13.5px;
  line-height: 1.6;
  color: #4a4a4a;
  text-align: justify;
}

.message-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid rgba(235, 238, 245, 0.6);
  padding-top: 12px;
  font-size: 11px;
  color: #909399;
}

.created-time {
  font-family: system-ui, sans-serif;
  opacity: 0.85;
}

/* Creator Avatar Styles */
.creator-avatar-container {
  display: flex;
  justify-content: center;
  align-items: center;
}

.creator-avatar-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  background-color: #f1f5f9;
  border: 1.5px solid #cbd5e1;
}

.creator-avatar-circle.neuro {
  border-color: #10b981;
  background-color: #ecfdf5;
}

.creator-avatar-circle.agent {
  border-color: #8b5cf6;
  background-color: #f5f3ff;
}

.creator-avatar-circle.system {
  border-color: #64748b;
  background-color: #f8fafc;
}

.creator-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Timeline block layout changes to support right-side avatar */
.event-block-content {
  position: relative;
  height: 100%;
  box-sizing: border-box;
}

.event-block-left {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 2px;
  margin-right: 24px;
}

.event-block-creator {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.event-creator-circle {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  overflow: hidden;
  background-color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid #cbd5e1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.event-creator-circle.neuro {
  border-color: #10b981;
  background-color: #ecfdf5;
}

.event-creator-circle.agent {
  border-color: #8b5cf6;
  background-color: #f5f3ff;
}

.event-creator-circle.system {
  border-color: #cbd5e1;
  background-color: #f8fafc;
}

.event-creator-circle.user {
  border-color: #3b82f6;
  background-color: #eff6ff;
}

.creator-flat-svg {
  display: block;
}

/* Timeline Accept Status Label Styles */
.timeline-accept-label {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
  margin-right: 4px;
  line-height: 1.2;
  user-select: none;
}

.timeline-accept-label.pending {
  background-color: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
  cursor: pointer;
  transition: all 0.2s ease;
}

.timeline-accept-label.pending:hover {
  background-color: #e2e8f0;
  transform: scale(1.05);
}

.timeline-accept-label.accepted {
  color: currentColor !important;
  background-color: rgba(255, 255, 255, 0.4) !important;
  border: 1px solid currentColor !important;
  opacity: 0.9;
}
</style>
