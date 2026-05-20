function dismissMixComposeAlert() {
  lastMixCompose.value = null
}

function rowClassName() {
  return 'video-match-table-row'
}

function shotStatusTagType(st: string): 'success' | 'danger' | 'warning' | 'info' {
  if (st === 'success') return 'success'
  if (st === 'failed') return 'danger'
  if (st === 'running') return 'warning'
  if (st === 'pending') return 'info'
  return 'info'
}

function shotSearchStatusNorm(row: VideoMatchShotDto): string {
  const s = (row.search_status || '').toLowerCase()
  if (s === 'failed') return 'failed'
  if (s === 'done') {
    if (!shotRankedVideoUrls(row).length) return 'failed'
    return 'success'
  }
  if (s === 'running') return 'running'
  if (s === 'pending') {
    const j = (jobSearchStatus.value || '').toLowerCase()
    if (j === 'running') return 'running'
    return 'pending'
  }
  return s || 'unknown'
}

function shotStatusLabel(st: string) {
  if (st === 'success') return '鎴愬姛'
  if (st === 'failed') return '澶辫触'
  if (st === 'running') return '鍖归厤涓?
  if (st === 'pending') return '寰呭尮閰?
  if (st === 'unknown') return '鏈煡'
  return st
}

function shotTop1VideoUrl(row: VideoMatchShotDto): string {
  const urls = shotRankedVideoUrls(row)
  return urls.length ? urls[0]! : ''
}

function top1UrlDisplay(url: string): string {
  const u = (url || '').trim()
  if (!u) return '鈥?
  try {
    const parsed = new URL(u)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const last = parts.length ? parts[parts.length - 1] : ''
    if (last) return decodeURIComponent(last)
  } catch {
    /* ignore */
  }
  return u.length > 52 ? `${u.slice(0, 52)}鈥 : u
}

function shotMatchFailedVm(row: VideoMatchShotDto): boolean {
  return (row.search_status || '').toLowerCase() === 'failed'
}

function canJumpVideoAnalysisFromVmShot(row: VideoMatchShotDto): boolean {
  // 鏃犺鎴愬姛/澶辫触锛屽彧瑕佹湁鏍囩灏卞厑璁歌烦杞埌瑙嗛鍒嗘瀽鎼滅储妗嗗鐜?  return !!row.tags_json && Object.keys(row.tags_json as object).length > 0
}

async function onStrategyDelete(name: string) {
  const s = strategies.value.find((x) => x.name === name)
  if (s?.id == null) return
  try {
    await deleteSearchStrategyApi(s.id)
    if (selectedStrategy.value === name) {
      selectedStrategy.value = ''
    }
    await loadStrategies()
    ElMessage.success('宸插垹闄ょ瓥鐣?)
  } catch {
    ElMessage.error('鍒犻櫎澶辫触')
  }
}