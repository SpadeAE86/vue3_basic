import re
import os

with open('src/views/TaskBoardView.vue', 'r', encoding='utf-8') as f:
    text = f.read()

template_start = text.find('<template>')
script_part = text[:template_start]
template_part = text[template_start:]

# Find the 4 tables inside TaskBoardView.vue
tables = re.findall(r'(<el-table\s+v-(?:if|else-if)="boardSection === \'(.*?)\'".*?</el-table>)', template_part, flags=re.DOTALL)

components = {
    'image': 'ImageBoardPanel',
    'video': 'VideoAnalysisBoardPanel',
    'video_match_transcribe': 'VideoMatchTranscribeBoardPanel',
    'video_match_search': 'VideoMatchSearchBoardPanel'
}

emits = {
    'image': ['detail', 'retry'],
    'video': ['detail', 'retry'],
    'video_match_transcribe': ['detail', 'retry', 'storyboard'],
    'video_match_search': ['detail', 'retry', 'view-material', 'navigate-analysis']
}

for table_html, section in tables:
    if section not in components: continue
    comp_name = components[section]
    
    # Process table HTML to replace v-if and pagedRows
    new_html = re.sub(r'\s+v-(?:if|else-if)="boardSection === \'.*?\'"', '', table_html)
    new_html = new_html.replace(':data="pagedRows"', ':data="rows"')
    
    # Replace handleOpenDetail(row) -> emit('detail', row)
    new_html = new_html.replace('handleOpenDetail(scope.row)', "emit('detail', scope.row)")
    # handleRetry(scope.row)
    new_html = new_html.replace('handleRetry(scope.row)', "emit('retry', scope.row)")
    # openStoryboard(scope.row)
    new_html = new_html.replace('openStoryboard(scope.row)', "emit('storyboard', scope.row)")
    # handleViewMaterialBoard(scope.row)
    new_html = new_html.replace('handleViewMaterialBoard(scope.row)', "emit('view-material', scope.row)")
    # handleNavigateToVideoAnalysis(scope.row, workspaceFilter)
    new_html = new_html.replace('handleNavigateToVideoAnalysis(scope.row, workspaceFilter)', "emit('navigate-analysis', scope.row)")
    
    emits_arr = ', '.join([f"'{e}'" for e in emits[section]])
    
    script_setup = f"""<script setup lang="ts">
import {{ computed }} from 'vue'
import {{
  rowCreatedAt,
  rowDurationLabel,
  rowStatusNorm,
  vmParseColStatus,
  vmRowNeedsLiveDurationTick,
}} from '@/views/task_board/taskBoardRowUtils'

const props = defineProps<{{
  rows: Record<string, unknown>[]
  loading: boolean
}}>()

const emit = defineEmits([{emits_arr}])
</script>"""

    comp_content = f"{script_setup}\n\n<template>\n  {new_html}\n</template>"
    
    comp_path = f'src/components/task_board/{comp_name}.vue'
    os.makedirs(os.path.dirname(comp_path), exist_ok=True)
    with open(comp_path, 'w', encoding='utf-8') as f:
        f.write(comp_content)
        
    # Replace the table in the main template with the component tag
    tag_attrs = ['loading="loading"', ':rows="pagedRows"', '@detail="handleOpenDetail"', '@retry="handleRetry"']
    if section == 'video_match_transcribe': tag_attrs.append('@storyboard="openStoryboard"')
    if section == 'video_match_search':
        tag_attrs.append('@view-material="handleViewMaterialBoard"')
        tag_attrs.append('@navigate-analysis="(r) => handleNavigateToVideoAnalysis(r, workspaceFilter)"')
        
    v_if = f'v-if="boardSection === \'{section}\'"' if section == 'image' else f'v-else-if="boardSection === \'{section}\'"'
        
    comp_tag = f'<{comp_name}\n        {v_if}\n        {" ".join(tag_attrs)}\n      />'
    template_part = template_part.replace(table_html, comp_tag)

# Now add imports for the 4 components to the script part
import_block = """
import ImageBoardPanel from '@/components/task_board/ImageBoardPanel.vue'
import VideoAnalysisBoardPanel from '@/components/task_board/VideoAnalysisBoardPanel.vue'
import VideoMatchTranscribeBoardPanel from '@/components/task_board/VideoMatchTranscribeBoardPanel.vue'
import VideoMatchSearchBoardPanel from '@/components/task_board/VideoMatchSearchBoardPanel.vue'
"""

# Find a good place to inject the imports
last_import_pos = script_part.rfind('import ')
next_line_pos = script_part.find('\n', last_import_pos)
script_part = script_part[:next_line_pos] + import_block + script_part[next_line_pos:]

with open('src/views/TaskBoardView.vue', 'w', encoding='utf-8') as f:
    f.write(script_part + template_part)

print('TaskBoardView split successfully!')
