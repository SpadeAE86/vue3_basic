import re
with open('src/views/VideoMatchView.vue', 'r', encoding='utf-8') as f:
    text = f.read()

template = re.search(r'^<template>(.*?)^</template>', text, re.DOTALL | re.MULTILINE)
if template:
    lines = template.group(1).splitlines()
    for i, l in enumerate(lines):
        if '<el-dialog' in l or 'vm-header-panel' in l or '<!--' in l:
            print(f'{i+1}: {l.strip()}')
