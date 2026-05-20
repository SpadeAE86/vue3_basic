import sys
with open('src/views/TaskBoardView.vue', 'r', encoding='utf-8') as f:
    text = f.read()

refresh_func = '''
async function refresh() {
  const s = boardSection.value
  if (s === 'image') await loadImage()
  else if (s === 'video') await loadVideo()
  else if (s === 'video_match_transcribe') await loadVmJobs()
  else if (s === 'video_match_search') await loadMaterialMatches()
}
'''
if 'async function refresh' not in text:
    text = text.replace('const dateRange = ref<[Date, Date] | null>(null)', refresh_func + '\nconst dateRange = ref<[Date, Date] | null>(null)')

with open('src/views/TaskBoardView.vue', 'w', encoding='utf-8') as f:
    f.write(text)
