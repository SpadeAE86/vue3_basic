import sys
import re

# Fix VideoMatchView.vue duplicate
with open('src/views/VideoMatchView.vue', 'r', encoding='utf-8') as f: text = f.read()
text = text.replace(', onStrategyDelete\n} = useVideoMatchJobPoller', '\n} = useVideoMatchJobPoller')
text = text.replace(', onStrategyDelete } = useVideoMatchJobPoller', ' } = useVideoMatchJobPoller')
text = text.replace('refreshJob, onStrategyDelete } = useVideoMatchJobPoller', 'refreshJob } = useVideoMatchJobPoller')
with open('src/views/VideoMatchView.vue', 'w', encoding='utf-8') as f: f.write(text)

# Fix Control Panel
with open('src/components/video_match/VideoMatchControlPanel.vue', 'r', encoding='utf-8') as f: text = f.read()
text = text.replace('historyJobLabel: any,', 'historyJobLabel: any,\n  lastMixCompose: any,')
text = text.replace('function onHistoryJobChange(v) {', 'function onHistoryJobChange(v: any) {')
text = text.replace('function onStrategyDelete(name) {', 'function onStrategyDelete(name: any) {')
with open('src/components/video_match/VideoMatchControlPanel.vue', 'w', encoding='utf-8') as f: f.write(text)

# Fix Detail Dialog
with open('src/components/video_match/VideoMatchDetailDialog.vue', 'r', encoding='utf-8') as f: text = f.read()
text = text.replace('matchDetailLoading', 'loading')
text = text.replace('matchDetailTokens', 'tokens')
text = text.replace('matchDetailLocalOnly', 'localOnly')
text = text.replace('r) => !r.video_path', 'r: any) => !r.video_path')
with open('src/components/video_match/VideoMatchDetailDialog.vue', 'w', encoding='utf-8') as f: f.write(text)

# Fix ParseForm
with open('src/components/video_match/VideoMatchParseForm.vue', 'r', encoding='utf-8') as f: text = f.read()
text = text.replace('(v) =>', '(v: any) =>')
text = text.replace('(v) {', '(v: any) {')
with open('src/components/video_match/VideoMatchParseForm.vue', 'w', encoding='utf-8') as f: f.write(text)

