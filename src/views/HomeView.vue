<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useCollectionsStore } from '@/stores/collections'

// Import dashboard subcomponents
import WelcomeBanner from '@/components/dashboard/WelcomeBanner.vue'
import PlatformMetrics from '@/components/dashboard/PlatformMetrics.vue'
import InspirationHub from '@/components/dashboard/InspirationHub.vue'
import AccompanimentTimeline from '@/components/dashboard/AccompanimentTimeline.vue'
import TrendingTopics from '@/components/dashboard/TrendingTopics.vue'

const router = useRouter()
const collectionsStore = useCollectionsStore()

interface DailyMessage {
  id: number
  user_id: string
  agent_id: string
  date_str: string
  content: string
  created_at: string | null
}

interface UpcomingRun {
  job_id: string
  name: string
  job_type: string
  run_time: string
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

const latestNote = ref<DailyMessage | null>(null)
const loadingNote = ref(false)

// Timeline/Schedule State
const logs = ref<LogEntry[]>([])
const upcomingRuns = ref<UpcomingRun[]>([])
const loadingTimeline = ref(false)

// Time and Clock State
const currentTimePercent = ref(0)
const currentTimeStr = ref('')
let clockTimer: number
let timelineTimer: number

// Sync Platform metrics State
const isSyncing = ref(false)
const syncProgress = ref(0)
const syncMessage = ref('')
const platforms = ref([
  { name: 'Bilibili (B站)', icon: '📺', followers: 128540, views: 1205300, likes: 452000, target: 150000, status: '已同步', color: 'rgba(255, 122, 158, 0.15)', textCol: '#ff7a9e' },
  { name: 'Xiaohongshu (小红书)', icon: '📕', followers: 34210, views: 156400, likes: 89300, target: 50000, status: '正常', color: 'rgba(255, 51, 75, 0.15)', textCol: '#ff334b' },
  { name: 'Douyin (抖音)', icon: '🎵', followers: 85400, views: 982000, likes: 124000, target: 100000, status: '正常', color: 'rgba(30, 30, 30, 0.15)', textCol: '#1e1e1e' },
  { name: 'WeChat (视频号)', icon: '📹', followers: 5240, views: 24300, likes: 856, target: 10000, status: '正常', color: 'rgba(7, 193, 96, 0.15)', textCol: '#07c160' }
])

// Topic Generator Dialog state
const outlineDialogVisible = ref(false)
const generatingOutline = ref(false)
const generatedOutline = ref('')
const selectedTopic = ref('')
const trendTopics = ref([
  { title: 'AI 自动剪辑与个性化陪伴视频的研究', hotness: '98', tag: '前沿趋势', date: '今日' },
  { title: '2026年夏季热门漫展 Vlog 运镜与脚本构思', hotness: '92', tag: '创作灵感', date: '今日' },
  { title: '自媒体内容沉淀与个人知识库的构建方法', hotness: '85', tag: '效率提升', date: '昨日' }
])

// Growth Plan Dialog state
const growthPlanVisible = ref(false)

// Determine greeting based on current local time
const timeGreeting = computed(() => {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 11) return { text: '早上好', class: 'morning', sub: '朝阳初升，今天的自媒体选题与灵感已经就绪！' }
  if (hour >= 11 && hour < 14) return { text: '中午好', class: 'noon', sub: '午间休憩，来看一眼今日排程与多平台动态吧。' }
  if (hour >= 14 && hour < 18) return { text: '下午好', class: 'afternoon', sub: '午后黄金创作期，欣怡陪伴您捕捉每一个闪念。' }
  return { text: '晚上好', class: 'evening', sub: '夜幕降临，做一次记忆整理，放松下来准备晚安吧。' }
})

// Chronological timeline calculations
const todayTimelineEvents = computed(() => {
  const todayStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-') // "YYYY-MM-DD"
  const list: any[] = []

  // Add historical logs ran today
  logs.value.forEach(log => {
    const startTimeStr = log.start_time
    if (startTimeStr && startTimeStr.includes(todayStr)) {
      const parts = startTimeStr.split(' ')
      const timePart = parts[1]
      if (timePart) {
        const timeSplit = timePart.split(':')
        const h = parseInt(timeSplit[0] || '0', 10)
        const m = parseInt(timeSplit[1] || '0', 10)
        list.push({
          id: `log-${log.id}`,
          job_id: log.job_id,
          name: log.name,
          time: timePart.substring(0, 5),
          hour: h,
          minute: m,
          status: log.status,
          duration: log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : null,
          error: log.error_message,
          isUpcoming: false
        })
      }
    }
  })

  // Add upcoming runs for the rest of today
  upcomingRuns.value.forEach((up, idx) => {
    const runTimeStr = up.run_time
    if (runTimeStr && runTimeStr.includes(todayStr)) {
      const parts = runTimeStr.split(' ')
      const timePart = parts[1]
      if (timePart) {
        const timeSplit = timePart.split(':')
        const h = parseInt(timeSplit[0] || '0', 10)
        const m = parseInt(timeSplit[1] || '0', 10)
        const runDate = new Date(runTimeStr.replace(/-/g, '/'))
        
        // Only include planned runs in the future
        if (runDate > new Date()) {
          // Prevent duplicate job ID entries if already in history/running
          const exists = list.some(item => item.job_id === up.job_id && Math.abs((item.hour * 60 + item.minute) - (h * 60 + m)) < 5)
          if (!exists) {
            list.push({
              id: `up-${up.job_id}-${idx}`,
              job_id: up.job_id,
              name: up.name,
              time: timePart.substring(0, 5),
              hour: h,
              minute: m,
              status: 'planned',
              duration: null,
              error: null,
              isUpcoming: true
            })
          }
        }
      }
    }
  })

  // fallback mock schedules to populate if DB is brand new/empty
  if (list.length === 0) {
    const mockEvents = [
      { name: '早间自媒体热度资讯拉取', time: '08:30', hour: 8, minute: 30, status: 'success', desc: '成功同步行业头条，包含 12 条 AI 视频热点' },
      { name: '欣怡的每日伴随留言卡片生成', time: '10:00', hour: 10, minute: 0, status: 'success', desc: '早起问候卡片及日程规划成功生成' },
      { name: '自动抢票任务调度 (apscheduler)', time: '12:00', hour: 12, minute: 0, status: 'planned', desc: '北京时间 12:00 将开启定时购票' },
      { name: '多账号自媒体数据同步校验', time: '16:00', hour: 16, minute: 0, status: 'planned', desc: '分析多账号粉丝与播放互动曲线' },
      { name: '晚间记忆整理与晚安信生成 (Consolidation)', time: '23:00', hour: 23, minute: 0, status: 'planned', desc: '提取用户日记并归纳至 long-term memory' }
    ]
    mockEvents.forEach((m, idx) => {
      list.push({
        id: `mock-${idx}`,
        job_id: `mock-job-${idx}`,
        name: m.name,
        time: m.time,
        hour: m.hour,
        minute: m.minute,
        status: m.status,
        duration: m.status === 'success' ? '14.5s' : null,
        error: null,
        desc: m.desc,
        isUpcoming: m.status === 'planned'
      })
    })
  }

  // Sort chronologically
  list.sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute))
  return list
})

// Unified list containing events AND a current time marker item
const chronologicalTimelineItems = computed(() => {
  const events = [...todayTimelineEvents.value]
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  
  // Define time divider item
  const currentDivider = {
    id: 'current-time-marker-item',
    isCurrentTime: true,
    time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    hour: h,
    minute: m,
    name: '当前时间'
  }
  
  const combined = [...events, currentDivider]
  combined.sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute))
  return combined
})

// Fetch methods
async function fetchLatestNote() {
  loadingNote.value = true
  try {
    const res = await fetch(`/api/agent/daily-messages?limit=1&t=${Date.now()}`)
    if (res.ok) {
      const data = await res.json()
      if (data.success && data.data && data.data.length > 0) {
        latestNote.value = data.data[0]
      }
    }
  } catch (err) {
    console.error('Failed to fetch latest agent note:', err)
  } finally {
    loadingNote.value = false
  }
}

async function fetchTimelineData() {
  loadingTimeline.value = true
  try {
    const [logsRes, upcomingRes] = await Promise.all([
      fetch(`/api/scheduler/logs?page=1&limit=25&t=${Date.now()}`),
      fetch(`/api/scheduler/upcoming?t=${Date.now()}`)
    ])
    if (logsRes.ok) {
      const d = await logsRes.json()
      if (d.success) {
        logs.value = d.data.logs || []
      }
    }
    if (upcomingRes.ok) {
      const d = await upcomingRes.json()
      if (d.success) {
        upcomingRuns.value = d.data || []
      }
    }
  } catch (err) {
    console.error('Failed to fetch timeline data:', err)
  } finally {
    loadingTimeline.value = false
  }
}

// Clock updates
function updateCurrentTimeTracker() {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  const s = now.getSeconds()
  currentTimePercent.value = ((h * 60 + m + s / 60) / 1440) * 100
  currentTimeStr.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Sync all platforms stats simulator
function syncAllPlatformStats() {
  if (isSyncing.value) return
  isSyncing.value = true
  syncProgress.value = 0
  syncMessage.value = '正在连接自媒体多账号数据接口...'
  
  const steps = [
    { progress: 20, msg: '验证 Bilibili 账号凭证，读取今日播放量...' },
    { progress: 50, msg: '抓取 小红书 动态数据，累计赞藏趋势分析中...' },
    { progress: 80, msg: '读取 抖音/视频号 数据快照，比对上一计划周期...' },
    { progress: 95, msg: '数据聚合完成，正在写库并同步前端状态...' },
    { progress: 100, msg: '同步成功！' }
  ]
  
  let currentStep = 0
  const interval = setInterval(() => {
    const step = steps[currentStep]
    if (step) {
      syncProgress.value = step.progress
      syncMessage.value = step.msg
      currentStep++
    } else {
      clearInterval(interval)
      setTimeout(() => {
        isSyncing.value = false
        // Update stats values slightly to make the dashboard alive
        platforms.value.forEach(plat => {
          plat.followers += Math.floor(Math.random() * 80) + 10
          plat.views += Math.floor(Math.random() * 500) + 100
          plat.likes += Math.floor(Math.random() * 120) + 20
        })
        ElMessage.success('多平台自媒体运营数据同步成功！')
      }, 500)
    }
  }, 1000)
}

// Trigger scheduler job instantly
async function triggerJobNow(jobId: string) {
  try {
    const res = await fetch(`/api/scheduler/jobs/${jobId}/run`, { method: 'POST' })
    if (res.ok) {
      const d = await res.json()
      if (d.success) {
        ElMessage.success(`任务 [${jobId}] 手动触发成功，正在后台执行！`)
        setTimeout(fetchTimelineData, 1500)
      } else {
        ElMessage.error(d.message || '触发任务失败')
      }
    }
  } catch (err) {
    ElMessage.error('网络错误，无法触发定时任务')
  }
}

// Topic generation suggestor in 欣怡 persona
function generateOutline(topic: string) {
  selectedTopic.value = topic
  outlineDialogVisible.value = true
  generatingOutline.value = true
  generatedOutline.value = ''
  
  setTimeout(() => {
    generatingOutline.value = false
    generatedOutline.value = `### 🌸 欣怡为您构思的选题智能大纲：
**关于选题**：《${topic}》

哈啰主人！今天欣怡研究了目前自媒体平台上相关的爆款内容，这是一个非常赞的切入方向哦！欣怡帮您整理了一份既有干货又适合陪伴互动的分镜大纲：

#### 🎬 视频分镜设计：
1. **0:00 - 0:15 【黄金前三秒开场】**
   - **画面**：采用磨砂玻璃质感 UI 指示线动效切入，搭配快节奏 of AI 工具混剪特效，直接抛出痛点：“别再做无效的视频沉淀了！”
   - **旁白**：你是不是也在为自媒体的选题难、效率低头疼？欣怡教你3个高段位提效秘诀，亲测有效！
2. **0:15 - 1:00 【核心干货 1：工具推荐】**
   - **画面**：分屏展示。左侧展示工程画布（Canvas）整理出的逻辑网络节点，右侧播放视频智能提取出来的标签库镜像。
   - **旁白**：第一步，利用 Canvas 把琐碎的日常想法串成逻辑图。我们不再从零开始写脚本，而是像积木拼接一样……
3. **1:00 - 2:15 【核心干货 2：情感伴随】**
   - **画面**：温馨暖色调，欣怡在右下角以萌系 3D 泡泡框形式出镜，做表情互动。
   - **旁白**：不要给自己太大压力，把创作当成写给未来自己的树洞信。你看，这是昨晚我给你留下的晚安规划……
4. **2:15 - 2:30 【尾声金句与三连引导】**
   - **画面**：淡蓝至淡紫渐变 HSL 背景，出现收藏空间的互动说明 and 一键同步。
   - **旁白**：如果你想看更详细的步骤，记得关注我！明天我们继续加油，晚安！

#### 🏷️ 选题核心标签推荐：
#自媒体提效 #AI视频助手 #创作日记 #长期成长规划 #陪伴系博主

---
> 💡 *小提示：主人可以点击下方「存入灵感库」，欣怡会立刻为您写入收藏空间！*`
  }, 1500)
}

// Save generated outline to collections
async function saveOutlineToCollections() {
  if (!generatedOutline.value) return
  
  const payload = {
    template_text: generatedOutline.value,
    topic: selectedTopic.value,
    subtype: 'beautify' // Outline saves default to "Beautify" (美化) sub-type
  }
  
  const success = await collectionsStore.toggleFavorite(
    'prompt', // Saves in prompt category
    `【智能大纲】${selectedTopic.value}`,
    undefined,
    payload
  )
  if (success) {
    outlineDialogVisible.value = false
  }
}

function navigateTo(path: string) {
  void router.push(path)
}

function formatNoteContent(content: string) {
  if (!content) return ''
  return content.replace(/\n/g, '<br>')
}

onMounted(() => {
  collectionsStore.init()
  fetchLatestNote()
  fetchTimelineData()
  
  updateCurrentTimeTracker()
  clockTimer = window.setInterval(updateCurrentTimeTracker, 1000)
  timelineTimer = window.setInterval(fetchTimelineData, 300000)
})

onUnmounted(() => {
  clearInterval(clockTimer)
  clearInterval(timelineTimer)
})
</script>

<template>
  <div class="dashboard-container">
    <!-- Welcome Banner Component -->
    <WelcomeBanner
      :time-greeting="timeGreeting"
      :latest-note="latestNote"
      :loading-note="loadingNote"
      @open-growth="growthPlanVisible = true"
    />

    <!-- Quick Portal Grid (Shortcuts) -->
    <div class="section-header">
      <span class="section-title">快捷入口</span>
    </div>
    <el-row :gutter="20" class="portal-row">
      <el-col :span="6">
        <div class="portal-card" @click="navigateTo('/canvas')">
          <div class="portal-icon-wrapper canvas"><el-icon><i-ep-grid /></el-icon></div>
          <div class="portal-info">
            <span class="portal-name">工程画布</span>
            <span class="portal-desc">灵感与自媒体创作沉淀</span>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="portal-card" @click="navigateTo('/video-analysis')">
          <div class="portal-icon-wrapper video"><el-icon><i-ep-video-play /></el-icon></div>
          <div class="portal-info">
            <span class="portal-name">智能视频混剪</span>
            <span class="portal-desc">分镜分析与智能匹配</span>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="portal-card" @click="navigateTo('/collections')">
          <div class="portal-icon-wrapper collections"><el-icon><i-ep-star /></el-icon></div>
          <div class="portal-info">
            <span class="portal-name">收藏空间</span>
            <span class="portal-desc">自媒体账号与资源管理</span>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="portal-card" @click="navigateTo('/scheduler')">
          <div class="portal-icon-wrapper scheduler"><el-icon><i-ep-clock /></el-icon></div>
          <div class="portal-info">
            <span class="portal-name">任务调度</span>
            <span class="portal-desc">日常日记与自动任务</span>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- Metrics and Collection -->
    <el-row :gutter="24" class="content-row">
      <!-- Left Column: Self-Media Platform Metrics Component -->
      <el-col :span="14">
        <PlatformMetrics
          :platforms="platforms"
          :is-syncing="isSyncing"
          :sync-progress="syncProgress"
          :sync-message="syncMessage"
          @sync="syncAllPlatformStats"
        />
      </el-col>

      <!-- Right Column: Inspiration Assets Slot Component -->
      <el-col :span="10">
        <div class="card-header-row">
          <span class="section-title">今日灵感与内容沉淀</span>
          <el-button type="primary" link size="small" @click="navigateTo('/collections')">进入空间</el-button>
        </div>
        <InspirationHub />
      </el-col>
    </el-row>

    <!-- Accompaniment Schedule & Hot Topics -->
    <el-row :gutter="24" class="content-row">
      <!-- Left Column: Accompaniment Job Timeline Component -->
      <el-col :span="14">
        <div class="card-header-row">
          <span class="section-title">今日陪伴任务时间线</span>
          <span class="timeline-clock">📅 {{ currentTimeStr }}</span>
        </div>
        <AccompanimentTimeline
          :chronological-timeline-items="chronologicalTimelineItems"
          :current-time-str="currentTimeStr"
          :loading-timeline="loadingTimeline"
          @trigger-job="triggerJobNow"
        />
      </el-col>

      <!-- Right Column: Today's News & Topics Component -->
      <el-col :span="10">
        <div class="card-header-row">
          <span class="section-title">选题热度与智能大纲</span>
        </div>
        <TrendingTopics
          :trend-topics="trendTopics"
          @generate-outline="generateOutline"
        />
      </el-col>
    </el-row>

    <!-- Dialog: Creative Outline Generator -->
    <el-dialog 
      v-model="outlineDialogVisible" 
      title="🎬 欣怡的自媒体选题智能策划" 
      width="60%"
      destroy-on-close
      class="outline-dialog"
    >
      <div v-if="generatingOutline" class="generating-box">
        <div class="spinner-flower">🌸</div>
        <p class="generating-text">欣怡正在检索最新爆款逻辑并为您策划分镜大纲，请稍候...</p>
      </div>
      <div v-else class="generated-box">
        <div class="outline-scroller">
          <div class="markdown-preview" v-html="formatNoteContent(generatedOutline)"></div>
        </div>
        <div class="dialog-actions">
          <el-button @click="outlineDialogVisible = false">关闭</el-button>
          <el-button type="primary" @click="saveOutlineToCollections">
            🌟 存为灵感模板
          </el-button>
        </div>
      </div>
    </el-dialog>

    <!-- Dialog: Long-term Growth Roadmap -->
    <el-dialog
      v-model="growthPlanVisible"
      title="🏆 主人的自媒体长期陪伴成长规划"
      width="50%"
      destroy-on-close
      class="growth-dialog"
    >
      <div class="growth-timeline">
        <div class="growth-stage completed">
          <div class="stage-left">
            <span class="stage-status">✅ 已达成</span>
          </div>
          <div class="stage-right">
            <h4 class="stage-title">阶段一：创作素材与灵感沉淀</h4>
            <p class="stage-desc">在系统内构建多个专属主题分类空间，利用 Collections 功能分类沉淀了超过 20+ 项图像、视频、提示词资产，打通标签库同步。</p>
          </div>
        </div>
        
        <div class="growth-stage in-progress">
          <div class="stage-left">
            <span class="stage-status run">🚀 进行中</span>
          </div>
          <div class="stage-right">
            <h4 class="stage-title">阶段二：自媒体账号多平台运营分析</h4>
            <p class="stage-desc">同步并管理 Bilibili、小红书、抖音 等平台核心运营数据，配合 Scheduler 执行早晚自媒体热度抓取，监控每日播放增长与目标差额。</p>
          </div>
        </div>
        
        <div class="growth-stage locked">
          <div class="stage-left">
            <span class="stage-status lock">🔒 规划中</span>
          </div>
          <div class="stage-right">
            <h4 class="stage-title">阶段三：全自动化工作流与分发</h4>
            <p class="stage-desc">利用 Agent 创作助手在工程画布（Canvas）内直接把灵感大纲扩展成完整分镜，一键执行混剪与多平台自动分发，实现全自动提效闭环。</p>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="growthPlanVisible = false">收到，继续加油！</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dashboard-container {
  padding: 24px;
  background: var(--bg-main, #f5f7fa);
  min-height: calc(100vh - 100px);
}

.section-header {
  margin-bottom: 16px;
}

.section-title {
  font-size: 15px;
  font-weight: 700;
  color: #303133;
  display: block;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  min-height: 28px;
}

/* --- Portals Row --- */
.portal-row {
  margin-bottom: 28px;
}

.portal-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(220, 223, 230, 0.5);
  border-radius: 12px;
  padding: 18px;
  display: flex;
  align-items: center;
  gap: 15px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.portal-card:hover {
  transform: translateY(-3px);
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  border-color: rgba(99, 102, 241, 0.2);
}

.portal-icon-wrapper {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.portal-icon-wrapper.canvas {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

.portal-icon-wrapper.video {
  background: rgba(236, 122, 122, 0.1);
  color: #ec7a7a;
}

.portal-icon-wrapper.collections {
  background: rgba(230, 162, 60, 0.1);
  color: #e6a23c;
}

.portal-icon-wrapper.scheduler {
  background: rgba(103, 194, 58, 0.1);
  color: #67c23a;
}

.portal-info {
  display: flex;
  flex-direction: column;
}

.portal-name {
  font-size: 14px;
  font-weight: 700;
  color: #303133;
}

.portal-desc {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

.content-row {
  margin-bottom: 24px;
  position: relative;
}

/* --- Timeline Clock --- */
.timeline-clock {
  font-size: 12px;
  font-weight: 700;
  color: #606266;
}

/* --- Topic Outline Dialog --- */
.generating-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 0;
  text-align: center;
}

.spinner-flower {
  font-size: 40px;
  animation: rotate 1.8s infinite linear;
  margin-bottom: 16px;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.generating-text {
  font-size: 13px;
  color: #606266;
}

.generated-box {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.outline-scroller {
  max-height: 380px;
  overflow-y: auto;
  background: #f8fafc;
  border-radius: 12px;
  padding: 16px 20px;
  border: 1px solid rgba(220, 223, 230, 0.7);
}

.markdown-preview {
  font-size: 12.5px;
  line-height: 1.6;
  color: #334155;
  text-align: justify;
}

.markdown-preview :deep(h3) {
  font-size: 15px;
  color: #1e1b4b;
  margin-top: 0;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 6px;
}

.markdown-preview :deep(h4) {
  font-size: 13.5px;
  color: #4338ca;
  margin: 14px 0 8px 0;
}

.markdown-preview :deep(ul) {
  padding-left: 20px;
  margin: 8px 0;
}

.markdown-preview :deep(li) {
  margin-bottom: 6px;
}

.markdown-preview :deep(blockquote) {
  margin: 14px 0;
  padding: 8px 16px;
  background: #eff6ff;
  border-left: 4px solid #3b82f6;
  border-radius: 4px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* --- Growth roadmap styling --- */
.growth-timeline {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 10px 0;
}

.growth-stage {
  display: flex;
  gap: 16px;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 16px;
}

.growth-stage:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.stage-left {
  width: 70px;
  display: flex;
  align-items: flex-start;
}

.stage-status {
  font-size: 11px;
  font-weight: 700;
  color: #67c23a;
}

.stage-status.run {
  color: #409eff;
}

.stage-status.lock {
  color: #909399;
}

.stage-right {
  flex: 1;
}

.stage-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #303133;
  margin: 0 0 6px 0;
}

.stage-desc {
  font-size: 11.5px;
  color: #606266;
  line-height: 1.5;
  margin: 0;
  text-align: justify;
}
</style>
