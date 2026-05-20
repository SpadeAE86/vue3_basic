import re

def main():
    with open('src/views/VideoMatchView.vue', 'r', encoding='utf-8') as f:
        text = f.read()

    # Extract Control Panel
    # Starts from <div class="vm-header-panel"> to its closing </div>
    # Let's find boundaries
    cp_match = re.search(r'(<div class="vm-header-panel">.*?</el-form>\s*</div>\s*</div>)', text, re.DOTALL)
    cp_html = cp_match.group(1) if cp_match else ""

    # Extract Detail Dialog
    dd_match = re.search(r'(<el-dialog\s+v-model="matchDetailVisible".*?</el-dialog>)', text, re.DOTALL)
    dd_html = dd_match.group(1) if dd_match else ""

    # Extract Transcribe Dialog
    td_match = re.search(r'(<el-dialog\s+v-model="shotTranscribeVisible".*?</el-dialog>)', text, re.DOTALL)
    td_html = td_match.group(1) if td_match else ""

    if not (cp_html and dd_html and td_html):
        print("Failed to find one or more components")
        return

    # Replace in VideoMatchView.vue
    text = text.replace(cp_html, '<VideoMatchControlPanel v-bind="controlPanelProps" @parse="onParse" @match="onMatch" @mix-compose="onMixCompose" />')
    text = text.replace(dd_html, '<VideoMatchDetailDialog v-model="matchDetailVisible" :loading="matchDetailLoading" :payload="matchDetailPayload" :row="matchDetailRow" :hit-rows="matchDetailHitRows" />')
    text = text.replace(td_html, '<VideoMatchTranscribeDialog v-model="shotTranscribeVisible" :row="shotTranscribeRow" />')

    with open('src/views/VideoMatchView.vue', 'w', encoding='utf-8') as f:
        f.write(text)
    
    print("Replaced in VideoMatchView.vue")

    with open('src/components/video_match/VideoMatchControlPanel.vue', 'w', encoding='utf-8') as f:
        f.write('<template>\n' + cp_html + '\n</template>\n<script setup lang="ts">\n// TODO: props/emits\n</script>')
        
    with open('src/components/video_match/VideoMatchDetailDialog.vue', 'w', encoding='utf-8') as f:
        f.write('<template>\n' + dd_html + '\n</template>\n<script setup lang="ts">\n// TODO: props\n</script>')
        
    with open('src/components/video_match/VideoMatchTranscribeDialog.vue', 'w', encoding='utf-8') as f:
        f.write('<template>\n' + td_html + '\n</template>\n<script setup lang="ts">\n// TODO: props\n</script>')

if __name__ == "__main__":
    main()
