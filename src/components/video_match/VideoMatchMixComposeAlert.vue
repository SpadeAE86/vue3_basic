<script setup lang="ts">
import { ElMessage } from 'element-plus'

const props = defineProps<{
  lastMixCompose: {
    status: string
    compose_id: string
    biz_id: string
    result_obs_url?: string | null
    result_srt_text?: string | null
    prefer_srt?: boolean
    error_message?: string | null
  } | null
}>()

const emit = defineEmits<{
  (e: 'dismiss'): void
}>()

function isAbsoluteHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test((s || '').trim())
}

function mixComposeResultHref(raw: string | null | undefined): string | null {
  const u = (raw || '').trim()
  if (!u) return null
  return isAbsoluteHttpUrl(u) ? u : null
}

async function copyMixOutputPath(text: string) {
  const t = (text || '').trim()
  if (!t) return
  try {
    await navigator.clipboard.writeText(t)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败，请手动复制下方文本')
  }
}

function downloadMixSrtFile(text: string, composeId: string) {
  const t = (text || '').trim()
  if (!t) {
    ElMessage.warning('暂无 SRT 内容')
    return
  }
  const safeId = (composeId || 'mix').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 36)
  const blob = new Blob([t.endsWith('\n') ? t : `${t}\n`], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeId || 'mix'}.srt`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('已开始下载 .srt')
}
</script>

<template>
  <el-alert
    v-if="lastMixCompose"
    class="mix-compose-status"
    :type="
      lastMixCompose.status === 'failed'
        ? 'error'
        : lastMixCompose.status === 'done'
          ? 'success'
          : 'info'
    "
    :closable="true"
    show-icon
    @close="emit('dismiss')"
  >
    <template #title>混剪：{{ lastMixCompose.status }}</template>
    <div class="mix-compose-status-body">
      <div class="mono">
        <span class="lbl">compose</span> {{ lastMixCompose.compose_id }}
      </div>
      <div class="mono">
        <span class="lbl">biz</span> {{ lastMixCompose.biz_id }}
      </div>
      <div v-if="lastMixCompose.result_obs_url" class="result-link">
        <template v-if="mixComposeResultHref(lastMixCompose.result_obs_url)">
          <a
            :href="mixComposeResultHref(lastMixCompose.result_obs_url)!"
            target="_blank"
            rel="noopener noreferrer"
            >成品 URL</a
          >
        </template>
        <template v-else>
          <div class="mix-result-path">
            <div class="muted small">以下为 OBS 对象键（不是浏览器直链）；用于 Worker/CDN 拼接</div>
            <div class="mono path-text">{{ lastMixCompose.result_obs_url }}</div>
            <el-button
              size="small"
              link
              type="primary"
              @click="copyMixOutputPath(lastMixCompose.result_obs_url!)"
            >
              复制路径
            </el-button>
          </div>
        </template>
      </div>
      <div v-if="lastMixCompose.prefer_srt" class="mix-srt-block">
        <template v-if="(lastMixCompose.result_srt_text || '').trim()">
          <div class="muted small">外挂字幕（与口播时间轴对齐）</div>
          <el-button
            size="small"
            link
            type="primary"
            @click="copyMixOutputPath(lastMixCompose.result_srt_text!)"
          >
            复制 SRT
          </el-button>
          <el-button
            size="small"
            link
            type="primary"
            @click="downloadMixSrtFile(lastMixCompose.result_srt_text!, lastMixCompose.compose_id)"
          >
            下载 .srt
          </el-button>
        </template>
        <div v-else-if="lastMixCompose.status === 'done'" class="muted small">
          未返回 SRT 文本（可查看服务端日志）
        </div>
      </div>
      <div v-if="lastMixCompose.error_message" class="mix-err">{{ lastMixCompose.error_message }}</div>
    </div>
  </el-alert>
</template>
