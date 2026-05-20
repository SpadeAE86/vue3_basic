import re
with open('src/views/TaskBoardView.vue', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('if (idx !== -1) Object.assign(imageRows.value[idx], newItem)', 'if (idx !== -1 && imageRows.value[idx]) Object.assign(imageRows.value[idx]!, newItem)')
text = text.replace('if (idx !== -1) Object.assign(videoRows.value[idx], newItem)', 'if (idx !== -1 && videoRows.value[idx]) Object.assign(videoRows.value[idx]!, newItem)')
text = text.replace('if (idx !== -1) Object.assign(materialMatchRows.value[idx], newItem)', 'if (idx !== -1 && materialMatchRows.value[idx]) Object.assign(materialMatchRows.value[idx]!, newItem)')
text = text.replace('if (idx !== -1) Object.assign(vmJobRows.value[idx], newItem)', 'if (idx !== -1 && vmJobRows.value[idx]) Object.assign(vmJobRows.value[idx]!, newItem)')

with open('src/views/TaskBoardView.vue', 'w', encoding='utf-8') as f:
    f.write(text)
