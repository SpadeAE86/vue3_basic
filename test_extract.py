import re
with open('src/views/VideoMatchView.vue', 'r', encoding='utf-8') as f:
    text = f.read()

print("cp:", "vm-header-panel" in text)
print("dd:", "matchDetailVisible" in text)
print("td:", "shotTranscribeVisible" in text)
