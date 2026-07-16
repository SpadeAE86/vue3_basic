// ─── Electron Production Fetch Hook ───
// If running in packaged Electron (file:// protocol), prefix relative api calls with the backend host.
if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
  const originalFetch = window.fetch
  window.fetch = function (input, init) {
    let url = ''
    if (typeof input === 'string') {
      url = input
    } else if (input instanceof URL) {
      url = input.toString()
    } else if (input instanceof Request) {
      url = input.url
    }
    
    // Resolve relative path to absolute backend port 8004 (stripping the '/api' prefix like Vite proxy rewrite)
    if (url.startsWith('/api')) {
      const targetUrl = 'http://127.0.0.1:8004' + url.replace(/^\/api/, '')
      if (typeof input === 'string') {
        input = targetUrl
      } else if (input instanceof URL) {
        input = new URL(targetUrl)
      } else if (input instanceof Request) {
        input = new Request(targetUrl, input)
      }
    }
    
    return originalFetch(input, init)
  }
}

import './assets/main.css'
import 'element-plus/dist/index.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
