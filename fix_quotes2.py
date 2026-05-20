import sys

with open('src/views/VideoMatchView.vue', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("if (st === 'running') return '匹配\xef\xbf\xbd?", "if (st === 'running') return '匹配中'")
text = text.replace("if (st === 'pending') return '待匹\xef\xbf\xbd?", "if (st === 'pending') return '待匹配'")
text = text.replace("if (!u) return '\xef\xbf\xbd?", "if (!u) return '无'")
text = text.replace("if (st === 'unknown') return 'Unknown'", "if (st === 'unknown') return '未知'")

with open('src/views/VideoMatchView.vue', 'w', encoding='utf-8') as f:
    f.write(text)
