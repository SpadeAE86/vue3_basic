/**
 * Dynamic group color assignment for force-directed graphs.
 *
 * Provides a curated palette of 20 vibrant colors.
 * Known group aliases are pre-mapped; unknown groups get deterministic
 * assignments from the palette so the same group always gets the same color
 * within a session (stable by insertion order across the palette).
 */

/** Curated 20-color palette – no two adjacent colors are similar */
const PALETTE = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ec4899', // pink
  '#14b8a6', // teal
  '#8b5cf6', // violet
  '#f97316', // orange
  '#3b82f6', // blue
  '#ef4444', // red
  '#84cc16', // lime
  '#06b6d4', // cyan
  '#a855f7', // purple
  '#eab308', // yellow
  '#22c55e', // green
  '#e11d48', // rose
  '#0ea5e9', // sky
  '#d946ef', // fuchsia
  '#64748b', // slate
  '#7c3aed', // violet-dark
  '#059669', // emerald-dark
]

/** Known English group names → fixed color */
const KNOWN_GROUPS: Record<string, string> = {
  framework: '#6366f1',
  tooling: '#f59e0b',
  platform: '#8b5cf6',
  ui: '#ec4899',
  visualization: '#14b8a6',
  default: '#94a3b8',
  backend: '#3b82f6',
  frontend: '#10b981',
  database: '#f97316',
  security: '#ef4444',
  network: '#06b6d4',
  storage: '#eab308',
  service: '#22c55e',
  compute: '#a855f7',
  devops: '#84cc16',
}

/** Runtime cache: group name → color (persists for lifetime of module) */
const _dynamicCache: Record<string, string> = {}
let _paletteIdx = 0

/**
 * Returns a stable, vibrant color for a given group name.
 * Falls back to the dynamic palette for unknown groups.
 */
export function groupColor(group: string | undefined | null): string {
  const key = (group ?? 'default').trim()
  if (!key || key === 'default') return KNOWN_GROUPS['default'] ?? '#94a3b8'

  // 1. Exact match in known groups
  if (KNOWN_GROUPS[key]) return KNOWN_GROUPS[key]

  // 2. Case-insensitive match in known groups
  const lower = key.toLowerCase()
  const knownMatch = Object.keys(KNOWN_GROUPS).find(k => k.toLowerCase() === lower)
  if (knownMatch) return KNOWN_GROUPS[knownMatch] ?? '#94a3b8'

  // 3. Chinese keyword matching
  if (/vpc|虚拟私有云/i.test(key)) return '#6366f1'
  if (/网络|subnet|子网/i.test(key)) return '#06b6d4'
  if (/安全|security|防火墙|acl/i.test(key)) return '#ef4444'
  if (/负载|load.?balance|网关|gateway/i.test(key)) return '#f97316'
  if (/计算|compute|服务器|ec2|instance/i.test(key)) return '#8b5cf6'
  if (/存储|storage|s3|数据库|db|rds/i.test(key)) return '#eab308'
  if (/监控|monitor|日志|log/i.test(key)) return '#10b981'
  if (/前端|frontend|ui|界面/i.test(key)) return '#ec4899'
  if (/后端|backend|api|服务/i.test(key)) return '#3b82f6'
  if (/基础设施|infra|平台|platform/i.test(key)) return '#14b8a6'
  if (/工具|tool|devops|ci|cd/i.test(key)) return '#84cc16'

  // 4. Dynamic assignment from palette
  if (_dynamicCache[key]) return _dynamicCache[key]
  const color = PALETTE[_paletteIdx % PALETTE.length] ?? '#94a3b8'
  _dynamicCache[key] = color
  _paletteIdx++
  return color
}

/**
 * Build a color map for all groups present in a node list.
 * Useful for rendering a legend.
 */
export function buildGroupColorMap(nodes: Array<{ data?: { group?: string } }>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const node of nodes) {
    const g = node.data?.group || 'default'
    if (!map[g]) {
      map[g] = groupColor(g) ?? '#94a3b8'
    }
  }
  return map
}
