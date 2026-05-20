import sys

with open('src/views/VideoMatchView.vue', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("if (st === 'running') return '匹配?", "if (st === 'running') return '匹配中'")
text = text.replace("if (st === 'pending') return '待匹?", "if (st === 'pending') return '待匹配'")
text = text.replace("if (!u) return '?", "if (!u) return '无'")

with open('src/views/VideoMatchView.vue', 'w', encoding='utf-8') as f:
    f.write(text)
