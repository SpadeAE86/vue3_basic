import re

with open('src/views/VideoMatchView.vue', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'function shotStatusTagType.*?\}', '''function shotStatusTagType(st: string): 'success' | 'danger' | 'warning' | 'info' {
  if (st === 'success') return 'success'
  if (st === 'failed') return 'danger'
  if (st === 'running') return 'warning'
  if (st === 'pending') return 'info'
  return 'info'
}''', text, flags=re.DOTALL)

text = re.sub(r"\\'", "'", text)

with open('src/views/VideoMatchView.vue', 'w', encoding='utf-8') as f:
    f.write(text)
