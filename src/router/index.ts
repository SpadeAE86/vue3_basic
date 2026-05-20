import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { title: '首页' },
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutView.vue'),
      meta: { title: '关于' },
    },
    {
      path: '/graph',
      name: 'graph',
      component: () => import('../views/GraphView.vue'),
      meta: { title: '力导图' },
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('../views/ChatDebugView.vue'),
      meta: { title: 'Agent 调试' },
    },
    {
      path: '/image',
      name: 'image',
      component: () => import('../views/PromptLabView.vue'),
      meta: { title: '提示词对比' },
    },
    {
      path: '/task-board',
      redirect: { name: 'task-board-image' },
    },
    {
      path: '/task-board/image',
      name: 'task-board-image',
      component: () => import('../views/TaskBoardView.vue'),
      meta: { title: '图像生成任务', boardSection: 'image' },
    },
    {
      path: '/task-board/video-analysis',
      name: 'task-board-video-analysis',
      component: () => import('../views/TaskBoardView.vue'),
      meta: { title: '视频分析任务', boardSection: 'video' },
    },
    {
      path: '/task-board/script-transcription',
      redirect: { name: 'task-board-video-match-transcribe' },
    },
    {
      path: '/task-board/video-match-tag',
      name: 'task-board-video-match-tag',
      component: () => import('../views/TaskBoardView.vue'),
      meta: { title: '抽标签任务', boardSection: 'video_match_tag' },
    },
    {
      path: '/task-board/video-match-transcribe',
      name: 'task-board-video-match-transcribe',
      component: () => import('../views/TaskBoardView.vue'),
      meta: { title: '脚本转写任务', boardSection: 'video_match_transcribe' },
    },
    {
      path: '/task-board/video-match-search',
      name: 'task-board-video-match-search',
      component: () => import('../views/TaskBoardView.vue'),
      meta: { title: '素材匹配任务', boardSection: 'video_match_search' },
    },
    {
      path: '/task-board/video-match',
      name: 'task-board-video-match',
      redirect: { name: 'task-board-video-match-transcribe' },
    },
    {
      path: '/video-analysis',
      name: 'video-analysis',
      component: () => import('../views/VideoAnalysisView.vue'),
      meta: { title: '视频分析' },
    },
    {
      path: '/video-match',
      name: 'video-match',
      component: () => import('../views/VideoMatchView.vue'),
      meta: { title: '视频匹配' },
    },
  ],
})

export default router
