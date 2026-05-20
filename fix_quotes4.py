import sys
with open('src/views/VideoMatchView.vue', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('\\nfunction top1UrlDisplay', '\nfunction top1UrlDisplay')
text = text.replace("return ''", "return '无'")

with open('src/views/VideoMatchView.vue', 'w', encoding='utf-8') as f:
    f.write(text)
