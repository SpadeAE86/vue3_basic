<script setup lang="ts">
import { ref, nextTick } from 'vue'

const isAnalyzing = ref(false)
const selectedFile = ref<File | null>(null)
const selectedHistory = ref('')

// 模拟历史记录列表
const historyOptions = [
  { value: 'history-1', label: '2026-04-20 10:30 汽车内饰展示' },
  { value: 'history-2', label: '2026-04-19 15:45 风景航拍' },
  { value: 'history-3', label: '2026-04-18 09:12 人物访谈' }
]

// 模拟后端返回的数据结构
const mockData = {
  description: "视频片段展示汽车内部场景，以白色皮质座椅为核心，呈现前排驾驶座、可调节的副驾驶座（靠背从直立逐步倾斜）及后排座椅，车顶配天窗，内饰含杯架、车门饰板等细节，光线明亮柔和，整体设计简约豪华。",
  subject: "汽车座椅（汽车内饰）",
  object: ["座椅", "天窗", "杯架", "车门", "中控台"],
  movement: "副驾驶座椅靠背调节（从直立向倾斜调整）",
  adjective: ["豪华", "舒适", "明亮", "简约", "高档", "整洁", "现代", "精致"],
  search_tags: ["汽车内饰", "白色皮质座椅", "座椅调节", "豪华汽车", "车载天窗", "舒适驾乘", "汽车内部设计", "中高端汽车"],
  marketing_tags: ["产品展示", "使用场景"],
  appealing_audience: ["汽车爱好者", "购车人群", "中高端消费者", "追求舒适出行者", "有车族"],
  visual_quality: [8, 7, 8, 7]
}

const analysisResults = ref<any[]>([])

const handleFileChange = (file: any) => {
  selectedFile.value = file.raw
}

const handleHistoryChange = (val: string) => {
  if (val) {
    // 模拟加载历史数据
    isAnalyzing.value = true
    setTimeout(() => {
      isAnalyzing.value = false
      generateMockCards(5) // 加载历史数据也模拟 5 张卡片
    }, 800)
  }
}

const generateMockCards = (count: number) => {
  const newResults = []
  for (let i = 1; i <= count; i++) {
    newResults.push({
      ...mockData,
      id: i,
      time: `00:${(i-1)*5 < 10 ? '0'+(i-1)*5 : (i-1)*5} - 00:${i*5 < 10 ? '0'+i*5 : i*5}`,
      thumbnail: `https://via.placeholder.com/640x360?text=Shot+${i}`
    })
  }
  analysisResults.value = newResults
}

const handleUpload = () => {
  if (selectedFile.value) {
    isAnalyzing.value = true
    setTimeout(() => {
      isAnalyzing.value = false
      // 模拟生成 5 个分镜以测试横向滚动
      generateMockCards(5)
    }, 1500)
  }
}

const getQualityColor = (score: number) => {
  if (score >= 8) return '#67c23a'
  if (score >= 6) return '#e6a23c'
  return '#f56c6c'
}

const qualityLabels = ['光影', '构图', '清晰', '色彩']

// 处理卡片 hover 滚动逻辑
const handleCardHover = (e: MouseEvent) => {
  const card = (e.currentTarget as HTMLElement)
  const container = document.querySelector('.storyboard-scroll-container') as HTMLElement
  
  if (!card || !container) return

  const cardRect = card.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()

  // 检查卡片右侧是否超出容器右边界
  if (cardRect.right > containerRect.right) {
    const scrollAmount = cardRect.right - containerRect.right + 20 // 20px padding
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' })
  }
  // 检查卡片左侧是否超出容器左边界
  else if (cardRect.left < containerRect.left) {
    const scrollAmount = containerRect.left - cardRect.left + 20 // 20px padding
    container.scrollBy({ left: -scrollAmount, behavior: 'smooth' })
  }
}
</script>

<template>
  <div class="video-analysis-container">
    <!-- 顶部控制区：精简高度 -->
    <el-card class="control-panel" shadow="never" :body-style="{ padding: '12px 20px' }">
      <div class="header-controls">
        <div class="left-controls">
          <h3 class="section-title">视频分析</h3>
          <el-select 
            v-model="selectedHistory" 
            placeholder="选择历史分析记录" 
            clearable 
            class="history-select"
            @change="handleHistoryChange"
          >
            <el-option
              v-for="item in historyOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </div>

        <div class="right-controls">
          <el-upload
            class="compact-uploader"
            action="#"
            :auto-upload="false"
            :show-file-list="false"
            @change="handleFileChange"
            accept="video/*"
          >
            <el-button type="default">
              <el-icon class="el-icon--left"><i-ep-video-camera /></el-icon>
              选择视频
            </el-button>
          </el-upload>
          
          <span v-if="selectedFile" class="compact-file-info">
            {{ selectedFile.name }}
          </span>

          <el-button 
            type="primary" 
            @click="handleUpload" 
            :loading="isAnalyzing"
            :disabled="!selectedFile"
          >
            {{ isAnalyzing ? '分析中...' : '开始分析' }}
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 分析结果展示区：横向滚动 -->
    <div class="results-area" v-if="analysisResults.length > 0">
      <div class="storyboard-scroll-container">
        <div class="storyboard-track">
          <el-card 
            v-for="shot in analysisResults" 
            :key="shot.id" 
            class="storyboard-card" 
            :body-style="{ padding: '0px' }"
            @mouseenter="handleCardHover"
          >
            <!-- 视觉层 -->
            <div class="media-layer">
              <el-image :src="shot.thumbnail" fit="cover" class="thumbnail" />
              <div class="time-badge">{{ shot.time }}</div>
            </div>
            
            <div class="card-content">
              <!-- 核心信息层 -->
              <div class="core-info">
                <h4 class="subject-title">{{ shot.subject }}</h4>
                <el-alert 
                  :title="shot.movement" 
                  type="info" 
                  :closable="false" 
                  class="movement-alert"
                >
                  <template #icon><el-icon><i-ep-video-camera /></el-icon></template>
                </el-alert>
                <p class="description">{{ shot.description }}</p>
              </div>

              <el-divider border-style="dashed" class="divider" />

              <!-- 标签分类层 -->
              <div class="tags-section">
                <div class="tag-group">
                  <span class="group-label">实体:</span>
                  <el-tag v-for="obj in shot.object" :key="obj" size="small" type="info" round class="mr-1 mb-1">{{ obj }}</el-tag>
                </div>
                <div class="tag-group">
                  <span class="group-label">特征:</span>
                  <el-tag v-for="adj in shot.adjective" :key="adj" size="small" type="success" effect="plain" class="mr-1 mb-1">{{ adj }}</el-tag>
                </div>
                <div class="tag-group">
                  <span class="group-label">受众:</span>
                  <el-tag v-for="aud in shot.appealing_audience" :key="aud" size="small" type="warning" class="mr-1 mb-1">{{ aud }}</el-tag>
                </div>
              </div>

              <!-- 质量评分层 -->
              <div class="quality-section">
                <div class="quality-item" v-for="(score, index) in shot.visual_quality" :key="index">
                  <span class="q-label">{{ qualityLabels[index] }}</span>
                  <el-progress 
                    :percentage="score * 10" 
                    :color="getQualityColor(score)" 
                    :show-text="false" 
                    :stroke-width="6"
                  />
                  <span class="q-score">{{ score }}</span>
                </div>
              </div>
            </div>
          </el-card>
        </div>
      </div>
    </div>
    
    <!-- 空状态 -->
    <el-empty v-else-if="!isAnalyzing" description="暂无分析数据，请选择历史记录或上传视频" class="empty-state" />
  </div>
</template>

<style scoped>
.video-analysis-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow: hidden; /* 防止整个页面滚动 */
}

/* 精简版控制面板 */
.control-panel {
  border-radius: 8px;
  border: 1px solid #ebeef5;
  flex-shrink: 0;
}

.header-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.left-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0;
  padding-left: 8px;
  border-left: 4px solid #409eff;
}

.history-select {
  width: 240px;
}

.right-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.compact-uploader {
  display: inline-block;
}

.compact-file-info {
  font-size: 13px;
  color: #606266;
  max-width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #f4f4f5;
  padding: 4px 8px;
  border-radius: 4px;
}

/* 结果区：横向滚动容器 */
.results-area {
  flex: 1;
  min-height: 0; /* 允许内部元素滚动 */
  position: relative;
}

.storyboard-scroll-container {
  width: 100%;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 16px; /* 为滚动条留出空间 */
  /* 隐藏滚动条但保留功能 (可选) */
  /* scrollbar-width: none; */
}

/* 自定义滚动条样式 */
.storyboard-scroll-container::-webkit-scrollbar {
  height: 8px;
}
.storyboard-scroll-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}
.storyboard-scroll-container::-webkit-scrollbar-thumb {
  background: #c0c4cc;
  border-radius: 4px;
}
.storyboard-scroll-container::-webkit-scrollbar-thumb:hover {
  background: #909399;
}

.storyboard-track {
  display: inline-flex;
  gap: 20px;
  padding: 4px;
  height: 100%;
}

/* 卡片样式 */
.storyboard-card {
  width: 360px; /* 固定宽度 */
  flex-shrink: 0; /* 防止被挤压 */
  border-radius: 12px;
  overflow: hidden;
  transition: transform 0.3s, box-shadow 0.3s;
  height: max-content; /* 适应内容高度 */
}

.storyboard-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0,0,0,0.1);
}

.media-layer {
  position: relative;
  height: 200px;
  background-color: #f5f7fa;
}

.thumbnail {
  width: 100%;
  height: 100%;
}

.time-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  font-family: monospace;
}

.card-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.core-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.subject-title {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.movement-alert {
  padding: 6px 12px;
  margin: 4px 0;
}

:deep(.el-alert__title) {
  font-size: 13px;
}

.description {
  margin: 0;
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.divider {
  margin: 8px 0;
}

.tags-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.group-label {
  font-size: 12px;
  color: #909399;
  margin-right: 8px;
  margin-bottom: 4px;
  width: 32px;
}

.mr-1 { margin-right: 4px; }
.mb-1 { margin-bottom: 4px; }

.quality-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  background: #fafafa;
  padding: 12px;
  border-radius: 8px;
  margin-top: 4px;
}

.quality-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.q-label {
  font-size: 12px;
  color: #606266;
  width: 24px;
}

.q-score {
  font-size: 12px;
  color: #303133;
  font-weight: bold;
  width: 14px;
  text-align: right;
}

.empty-state {
  margin-top: 60px;
}
</style>
