import re
with open('src/views/TaskBoardView.vue', 'r', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'import\s+\{([^}]+)\}\s+from\s+\'@/api/taskBoard\'', text)
if m:
    block = m.group(1)
    items = [x.strip() for x in block.split(',')]
    items = list(dict.fromkeys(filter(None, items)))
    new_block = 'import {\n  ' + ',\n  '.join(items) + '\n} from \'@/api/taskBoard\''
    text = text.replace(m.group(0), new_block)

with open('src/views/TaskBoardView.vue', 'w', encoding='utf-8') as f:
    f.write(text)
