import re

# Fix useVideoMatchJob.ts
path = 'src/composables/video_match/useVideoMatchJob.ts'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()
text = text.replace('j.job_id.slice(-6)', '(j.job_id || j.id || "").slice(-6)')
with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

# Fix VideoAnalysisView.vue stubs
path = 'src/views/VideoAnalysisView.vue'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Make sure MagicStick is imported
if 'MagicStick' not in text:
    text = text.replace("import { Search } from '@element-plus/icons-vue'", "import { Search, MagicStick } from '@element-plus/icons-vue'")
    if 'MagicStick' not in text:
        text = text.replace("import { ref, computed", "import { MagicStick } from '@element-plus/icons-vue'\nimport { ref, computed")

stubs = '''
const openCarModelDialog = () => {}
const isSubmittingBatch = ref(false)
const historyOptions = ref([])
const workspaceOptions = ref([])
'''
text = text.replace('const tokenJoinDialogVisible = ref(false)', 'const tokenJoinDialogVisible = ref(false)\n' + stubs)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)


# Fix VideoMatchView.vue stubs
path = 'src/views/VideoMatchView.vue'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

vm_stubs = '''
const matchDetailTokens = ref([])
const matchDetailLocalOnly = ref(false)
const matchDetailRow = ref(null)
const segment_text = ref('')
const description = ref('')
const workspace = ref('')
'''
text = text.replace('const detailVisible = ref(false)', 'const detailVisible = ref(false)\n' + vm_stubs)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Fixed frontend issues!')
