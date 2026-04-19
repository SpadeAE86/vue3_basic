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
  ],
})

export default router
