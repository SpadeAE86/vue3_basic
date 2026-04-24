<script setup lang="ts">
import DrawerSection from './DrawerSection.vue'
import TagPills from './TagPills.vue'

type ShotCard = {
  scene_id: number
  start_time: number
  end_time: number
  duration_seconds: number
  thumbnail?: string | null
  frame_urls?: string[]
  description?: string | null
  subject?: string | null
  object?: string[] | null
  movement?: string | null
  adjective?: string[] | null
  search_tags?: string[] | null
  marketing_tags?: string[] | null
  appealing_audience?: string[] | null
  visual_quality?: number[] | null
  error?: string | null
}

type UiShotCard = ShotCard & { id: number | string; time: string }

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    shot: UiShotCard | null
    width?: string
  }>(),
  { width: '420px' },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const qualityLabels = ['光影', '构图', '清晰', '色彩']
function getQualityColor(score: number) {
  if (score >= 8) return '#67c23a'
  if (score >= 6) return '#e6a23c'
  return '#f56c6c'
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :size="width"
    direction="rtl"
    :with-header="false"
  >
    <div v-if="shot" class="drawer">
      <div class="header">
        <div class="title">
          <div class="subject">{{ shot.subject || '未识别主体' }}</div>
          <div class="time">{{ shot.time }}</div>
        </div>
        <el-button text @click="emit('update:modelValue', false)">
          <el-icon><i-ep-close /></el-icon>
        </el-button>
      </div>

      <el-image v-if="shot.thumbnail" :src="shot.thumbnail" fit="cover" class="image" />

      <DrawerSection v-if="shot.movement" title="动作 / 运动">
        <el-alert :title="shot.movement" type="info" :closable="false" />
      </DrawerSection>

      <DrawerSection v-if="shot.description" title="描述">
        <div class="text">{{ shot.description }}</div>
      </DrawerSection>

      <DrawerSection title="搜索标签">
        <TagPills
          :tags="shot.search_tags ?? []"
          type="primary"
          effect="plain"
          :round="true"
          :clickable="true"
          border-radius="999px"
        />
      </DrawerSection>

      <DrawerSection v-if="(shot.marketing_tags ?? []).length" title="营销场景">
        <TagPills
          :tags="shot.marketing_tags ?? []"
          type="danger"
          effect="plain"
          :round="true"
          :clickable="true"
          border-radius="999px"
        />
      </DrawerSection>

      <DrawerSection v-if="(shot.appealing_audience ?? []).length" title="受众">
        <TagPills
          :tags="shot.appealing_audience ?? []"
          type="warning"
          effect="light"
          :round="true"
          :clickable="true"
          border-radius="999px"
        />
      </DrawerSection>

      <DrawerSection v-if="(shot.object ?? []).length" title="实体">
        <TagPills
          :tags="shot.object ?? []"
          type="info"
          effect="light"
          :round="true"
          :clickable="true"
          border-radius="999px"
        />
      </DrawerSection>

      <DrawerSection v-if="(shot.adjective ?? []).length" title="特征">
        <TagPills
          :tags="shot.adjective ?? []"
          type="success"
          effect="plain"
          :round="true"
          :clickable="true"
          border-radius="999px"
        />
      </DrawerSection>

      <DrawerSection title="画面质量">
        <div class="quality">
          <div class="q-item" v-for="(score, index) in (shot.visual_quality ?? [0, 0, 0, 0])" :key="index">
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
      </DrawerSection>
    </div>
  </el-drawer>
</template>

<style scoped>
.drawer {
  padding: 14px 14px 18px 14px;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.title {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.subject {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.time {
  font-size: 12px;
  color: #6b7280;
}

.image {
  width: 100%;
  height: 210px;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 14px;
}

.text {
  font-size: 13px;
  line-height: 1.5;
  color: #374151;
  white-space: pre-wrap;
}

.quality {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.q-item {
  display: grid;
  grid-template-columns: 44px 1fr 26px;
  align-items: center;
  gap: 10px;
}

.q-label {
  font-size: 12px;
  color: #6b7280;
}

.q-score {
  font-size: 12px;
  color: #374151;
  text-align: right;
}
</style>

