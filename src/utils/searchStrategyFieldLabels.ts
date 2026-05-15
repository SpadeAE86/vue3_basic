/**
 * 搜索策略 / 索引字段的简短中文名（配置权重、模板选字段时更易读）
 * 未列出的字段仍显示原始英文名或下滑线转空格
 */
const LABEL_ZH: Record<string, string> = {
  frame_orientation: '横竖屏',
  frame_size: '画面比例',
  resolution: '分辨率',
  car_model: '车型',
  footage_type: '素材类型',
  shot_style: '拍摄风格',
  shot_type: '景别',
  car_color: '车色',
  product_status_scene: '产品状态场景',
  movement: '核心动作',
  camera_movement: '运镜',
  topic: '主题',
  weather: '天气',
  time: '时间',
  has_presenter: '出镜人',
  person_detail: '人物细分',
  key_words: '画面关键字',
  text: '画面文字',
  video_usage: '素材用途',
  generic_hq_road_run: '高质量路跑',
  description: '画面描述',
  subject: '主体',
  object: '客体/部件',
  scene_location: '场景地点',
  design_selling_points: '设计卖点',
  function_selling_points: '功能卖点',
  design_adjectives: '设计形容词',
  function_adjectives: '功能形容词',
  scenario_a: '场景A',
  scenario_b: '场景B',
  marketing_phrases: '营销短语',
  appealing_audience: '目标受众',
  search_tags: '搜索标签',
  marketing_tags: '营销标签',
  adjective: '形容词',
  clarity_score: '清晰度分',
  composition_score: '构图分',
  description_vector: '描述向量',
  function_selling_points_vector: '功能卖点向量',
  design_selling_points_vector: '设计卖点向量',
  scenario_vector: '场景向量',
  marketing_phrases_vector: '营销向量',
  design_adjectives_vector: '设计形容词向量',
  function_adjectives_vector: '功能形容词向量',
}

export function searchStrategyFieldLabelZh(field: string): string {
  const k = (field || '').trim()
  if (!k) return ''
  return LABEL_ZH[k] || k.replace(/_/g, ' ')
}
