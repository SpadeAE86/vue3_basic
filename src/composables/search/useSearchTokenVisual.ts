import type { SearchToken } from '@/components/video_analysis/TagSearchBar.vue'

export function tagType(t: SearchToken): 'primary' | 'success' | 'danger' | 'info' {
  if (t.not) return 'danger'
  if (t.type === 'text') return 'info'
  if ((t.join ?? 'AND') === 'OR') return 'success'
  return 'primary'
}

export function tagEffect(t: SearchToken): 'plain' | 'light' {
  return t.type === 'text' ? 'plain' : 'light'
}

/** 与 TagSearchBar 一致的 token 配色（keyword 实心 / text 描边） */
export function getTagStyle(t: SearchToken, radius = '999px') {
  let baseColor = '#409eff'
  let lightBorder = '#d9ecff'
  let lightBg = '#318ff1'

  if (t.not) {
    baseColor = '#f56c6c'
    lightBorder = '#fde2e2'
    lightBg = '#fef0f0'
  } else if ((t.join ?? 'AND') === 'OR') {
    baseColor = '#67c23a'
    lightBorder = '#e1f3d8'
    lightBg = '#f0f9eb'
  }

  if (t.type !== 'text') {
    return {
      borderRadius: radius,
      backgroundColor: baseColor,
      borderColor: baseColor,
      color: '#fff',
      borderStyle: 'solid',
      borderWidth: '1px',
    }
  }

  return {
    borderRadius: radius,
    backgroundColor: '#fff',
    borderColor: baseColor,
    color: baseColor,
    borderStyle: 'solid',
    borderWidth: '1px',
  }
}
