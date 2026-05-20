import sys
from bs4 import BeautifulSoup
import re

def main():
    with open('src/views/VideoMatchView.vue', 'r', encoding='utf-8') as f:
        text = f.read()
    
    # We will use string finding based on HTML comments or specific tags to avoid BS4 reformatting Vue directives.
    # Control Panel: <el-card class="control-panel" ...> to its matching </el-card>
    
    def extract_tag(start_str, end_str):
        idx_start = text.find(start_str)
        if idx_start == -1: return ""
        # Find matching end tag by counting tags if needed, or simple regex if unique.
        # But simple regex won't work for nested. Let's do a simple brace counter.
        tag_name = start_str.split()[0].replace('<', '')
        open_tag = f"<{tag_name}"
        close_tag = f"</{tag_name}>"
        
        count = 0
        idx = idx_start
        while idx < len(text):
            if text[idx:].startswith(open_tag):
                count += 1
                idx += len(open_tag)
            elif text[idx:].startswith(close_tag):
                count -= 1
                idx += len(close_tag)
                if count == 0:
                    return text[idx_start:idx]
            else:
                idx += 1
        return ""

    cp = extract_tag('<el-card class="control-panel"', '</el-card>')
    dd = extract_tag('<el-dialog\n      v-model="matchDetailVisible"', '</el-dialog>')
    td = extract_tag('<el-dialog\n      v-model="shotTranscribeVisible"', '</el-dialog>')
    if not dd:
        dd = extract_tag('<el-dialog\n    v-model="matchDetailVisible"', '</el-dialog>')
    if not td:
        td = extract_tag('<el-dialog\n    v-model="shotTranscribeVisible"', '</el-dialog>')
    
    # Try using regex for dialogs because of formatting spaces
    if not dd:
        m = re.search(r'(<el-dialog[^>]+v-model="matchDetailVisible".*?</el-dialog>)', text, re.DOTALL)
        dd = m.group(1) if m else ""
    if not td:
        m = re.search(r'(<el-dialog[^>]+v-model="shotTranscribeVisible".*?</el-dialog>)', text, re.DOTALL)
        td = m.group(1) if m else ""

    print("CP size:", len(cp))
    print("DD size:", len(dd))
    print("TD size:", len(td))
    
    with open('cp_out.vue', 'w', encoding='utf-8') as f: f.write(cp)
    with open('dd_out.vue', 'w', encoding='utf-8') as f: f.write(dd)
    with open('td_out.vue', 'w', encoding='utf-8') as f: f.write(td)

if __name__ == "__main__":
    main()
