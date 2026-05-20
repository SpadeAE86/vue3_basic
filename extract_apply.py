import re

def main():
    with open('src/views/VideoMatchView.vue', 'r', encoding='utf-8') as f:
        text = f.read()

    with open('cp_out.vue', 'r', encoding='utf-8') as f: cp = f.read()
    with open('dd_out.vue', 'r', encoding='utf-8') as f: dd = f.read()
    with open('td_out.vue', 'r', encoding='utf-8') as f: td = f.read()

    # Create Control Panel Component
    cp_script = """<script setup lang="ts">
import { ref, computed } from 'vue'
import { Headset, Microphone, RefreshRight, Setting, VideoPlay } from '@element-plus/icons-vue'
import { ZHIJI_CAR_MODEL_OPTIONS, VIDEO_FRAME_SIZE_OPTIONS, VIDEO_FRAME_ORIENTATION_OPTIONS, videoFrameSizeOptionsForOrientation, normalizeZhijiCarSelectValue } from '@/constants/zhijiCarModels'
import SearchStrategySelect from '@/components/video_analysis/SearchStrategySelect.vue'

const props = defineProps<{
  form: any,
  workspaceOptions: any,
  videoMatchFrameSizeOptions: any,
  parsing: boolean,
  matching: boolean,
  composing: boolean,
  hasShots: boolean,
  canMatch: boolean,
  canMixCompose: boolean,
  mixComposeDisabledHint: string,
  historyJobs: any,
  historyJobId: any,
  historyJobLabel: any,
  strategies: any,
  selectedStrategy: any,
  pipelineStatusZh: string
}>()

const emit = defineEmits(['parse', 'match', 'mix-compose', 'update:historyJobId', 'update:selectedStrategy', 'history-change', 'strategy-delete', 'open-strategy-create', 'open-strategy-edit'])

function onHistoryJobChange(v) { emit('history-change', v) }
function dismissMixComposeAlert() { emit('update:historyJobId', null) }
function onStrategyDelete(name) { emit('strategy-delete', name) }
</script>"""

    with open('src/components/video_match/VideoMatchControlPanel.vue', 'w', encoding='utf-8') as f:
        f.write('<template>\n' + cp + '\n</template>\n\n' + cp_script)

    # Replace CP in view
    text = text.replace(cp, '''<VideoMatchControlPanel
      :form="form"
      :workspaceOptions="workspaceOptions"
      :videoMatchFrameSizeOptions="videoMatchFrameSizeOptions"
      :parsing="parsing"
      :matching="matching"
      :composing="pollerComposing"
      :hasShots="hasShots"
      :canMatch="canMatch"
      :canMixCompose="canMixCompose"
      :mixComposeDisabledHint="mixComposeDisabledHint"
      :historyJobs="historyJobs"
      :historyJobId="historyJobId"
      :historyJobLabel="historyJobLabel"
      :strategies="strategies"
      :selectedStrategy="selectedStrategy"
      :pipelineStatusZh="pipelineStatusZh"
      @update:historyJobId="historyJobId = $event"
      @update:selectedStrategy="selectedStrategy = $event"
      @parse="onParse"
      @match="onMatch"
      @mix-compose="onMixCompose"
      @history-change="onHistoryJobChange"
      @strategy-delete="onStrategyDelete"
      @open-strategy-create="openVmStrategyCreateDialog"
      @open-strategy-edit="openVmStrategyEditDialog"
    />''')

    # Create Detail Dialog Component
    dd_script = """<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  modelValue: boolean,
  loading: boolean,
  payload: any,
  row: any,
  hitRows: any,
  formatMatchDetailJson: (v: any) => string
}>()
const emit = defineEmits(['update:modelValue'])
</script>"""
    
    # We must patch v-model in dd to be modelValue because Vue 3.4 defineModel or standard v-model
    dd_patched = dd.replace('v-model="matchDetailVisible"', ':model-value="modelValue" @update:model-value="emit(\'update:modelValue\', $event)"')
    with open('src/components/video_match/VideoMatchDetailDialog.vue', 'w', encoding='utf-8') as f:
        f.write('<template>\n' + dd_patched + '\n</template>\n\n' + dd_script)

    # Replace DD in view
    text = text.replace(dd, '''<VideoMatchDetailDialog
      v-model="matchDetailVisible"
      :loading="matchDetailLoading"
      :payload="matchDetailPayload"
      :row="matchDetailRow"
      :hit-rows="matchDetailHitRows"
      :formatMatchDetailJson="formatMatchDetailJson"
    />''')

    # Create Transcribe Dialog Component
    td_script = """<script setup lang="ts">
import TokenChipsReadonly from '@/components/video_match/TokenChipsReadonly.vue'
const props = defineProps<{
  modelValue: boolean,
  row: any,
  tokens: any[]
}>()
const emit = defineEmits(['update:modelValue'])
</script>"""
    td_patched = td.replace('v-model="shotTranscribeVisible"', ':model-value="modelValue" @update:model-value="emit(\'update:modelValue\', $event)"')
    td_patched = td_patched.replace(':tokens="shotTranscribeTokens"', ':tokens="tokens"')
    with open('src/components/video_match/VideoMatchTranscribeDialog.vue', 'w', encoding='utf-8') as f:
        f.write('<template>\n' + td_patched + '\n</template>\n\n' + td_script)

    # Replace TD in view
    text = text.replace(td, '''<VideoMatchTranscribeDialog
      v-model="shotTranscribeVisible"
      :row="shotTranscribeRow"
      :tokens="shotTranscribeTokens"
    />''')

    with open('src/views/VideoMatchView.vue', 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    main()
