<script setup lang="ts">
import { ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'

const props = defineProps<{
  userSettings: string
  identityContent: string
  soulContent: string
  saveLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:userSettings', val: string): void
  (e: 'update:identityContent', val: string): void
  (e: 'update:soulContent', val: string): void
  (e: 'save-file', filename: string, content: string): void
}>()

const activeTab = ref('settings')

// 初始化 Markdown 解析器
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
})

const isEditingSettings = ref(false)
const isEditingIdentity = ref(false)
const isEditingSoul = ref(false)

// 监控内容变化，若是空值则默认进入编辑模式
watch(() => props.userSettings, (newVal) => {
  if (!newVal) {
    isEditingSettings.value = true
  }
}, { immediate: true })
</script>

<template>
  <div class="role-body-card">
    <el-tabs v-model="activeTab" class="role-tabs">
      
      <!-- 角色人设 Tab -->
      <el-tab-pane label="角色人设" name="settings">
        <div class="tab-content">
          <div class="tab-header-row">
            <p class="tab-tip">
              💡 这部分由你（用户）来手写定义，用来定制你的 AI 伙伴扮演什么角色、有什么性格或偏好。
            </p>
            <el-button 
              size="small" 
              type="primary" 
              plain 
              @click="isEditingSettings = !isEditingSettings"
              class="toggle-edit-btn"
            >
              <el-icon style="margin-right: 4px">
                <i-ep-edit v-if="!isEditingSettings" />
                <i-ep-view v-else />
              </el-icon>
              {{ isEditingSettings ? '预览效果' : '编辑内容' }}
            </el-button>
          </div>
          
          <!-- 编辑模式 -->
          <template v-if="isEditingSettings">
            <el-input
              :model-value="props.userSettings"
              @input="emit('update:userSettings', $event)"
              type="textarea"
              :rows="15"
              placeholder="请输入你想定义的人设内容 (支持 Markdown 格式)..."
            />
            <div class="save-actions">
              <el-button type="primary" :loading="props.saveLoading" @click="emit('save-file', 'USER_SETTINGS.md', props.userSettings)">保存人设</el-button>
            </div>
          </template>
          
          <!-- 预览模式 -->
          <template v-else>
            <div v-if="props.userSettings" v-html="md.render(props.userSettings)" class="markdown-preview"></div>
            <div v-else class="markdown-empty">
              <span>暂无人设内容，点击右上角“编辑内容”进行填写。</span>
            </div>
          </template>
        </div>
      </el-tab-pane>

      <!-- 角色身份 Tab -->
      <el-tab-pane label="角色身份" name="identity">
        <div class="tab-content">
          <div class="tab-header-row">
            <p class="tab-tip">
              🤖 这是 AI 在跟你聊天的过程中，自己维护并持续补充的身份特征。你也可以手动进行修改。
            </p>
            <el-button 
              size="small" 
              type="primary" 
              plain 
              @click="isEditingIdentity = !isEditingIdentity"
              class="toggle-edit-btn"
            >
              <el-icon style="margin-right: 4px">
                <i-ep-edit v-if="!isEditingIdentity" />
                <i-ep-view v-else />
              </el-icon>
              {{ isEditingIdentity ? '预览效果' : '编辑内容' }}
            </el-button>
          </div>
          
          <!-- 编辑模式 -->
          <template v-if="isEditingIdentity">
            <el-input
              :model-value="props.identityContent"
              @input="emit('update:identityContent', $event)"
              type="textarea"
              :rows="15"
              placeholder="请输入角色身份特征内容 (支持 Markdown 格式)..."
            />
            <div class="save-actions">
              <el-button type="primary" :loading="props.saveLoading" @click="emit('save-file', 'IDENTITY.md', props.identityContent)">保存身份</el-button>
            </div>
          </template>
          
          <!-- 预览模式 -->
          <template v-else>
            <div v-if="props.identityContent" v-html="md.render(props.identityContent)" class="markdown-preview"></div>
            <div v-else class="markdown-empty">
              <span>暂无身份特征信息，点击右上角“编辑内容”进行填写。</span>
            </div>
          </template>
        </div>
      </el-tab-pane>

      <!-- 行为准则 Tab -->
      <el-tab-pane label="行为准则" name="soul">
        <div class="tab-content">
          <div class="tab-header-row">
            <p class="tab-tip">
              🧠 这是 AI 伙伴的核心运转灵魂约束与安全规范要求。你也可以手动进行修改。
            </p>
            <el-button 
              size="small" 
              type="primary" 
              plain 
              @click="isEditingSoul = !isEditingSoul"
              class="toggle-edit-btn"
            >
              <el-icon style="margin-right: 4px">
                <i-ep-edit v-if="!isEditingSoul" />
                <i-ep-view v-else />
              </el-icon>
              {{ isEditingSoul ? '预览效果' : '编辑内容' }}
            </el-button>
          </div>
          
          <!-- 编辑模式 -->
          <template v-if="isEditingSoul">
            <el-input
              :model-value="props.soulContent"
              @input="emit('update:soulContent', $event)"
              type="textarea"
              :rows="15"
              placeholder="请输入行为准则与灵魂规范内容 (支持 Markdown 格式)..."
            />
            <div class="save-actions">
              <el-button type="primary" :loading="props.saveLoading" @click="emit('save-file', 'SOUL.md', props.soulContent)">保存准则</el-button>
            </div>
          </template>
          
          <!-- 预览模式 -->
          <template v-else>
            <div v-if="props.soulContent" v-html="md.render(props.soulContent)" class="markdown-preview"></div>
            <div v-else class="markdown-empty">
              <span>暂无行为准则规范，点击右上角“编辑内容”进行填写。</span>
            </div>
          </template>
        </div>
      </el-tab-pane>

    </el-tabs>
  </div>
</template>

<style scoped>
.role-body-card {
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid #ebeef5;
  box-shadow: 0 4px 16px rgba(148, 163, 184, 0.05);
  padding: 24px;
}

.role-tabs :deep(.el-tabs__item) {
  font-size: 14px;
  font-weight: 600;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 10px;
}

.tab-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.tab-tip {
  flex: 1;
  font-size: 12px;
  color: #475569;
  background: #f8fafc;
  padding: 10px 16px;
  border-radius: 8px;
  margin: 0;
  border-left: 4px solid #6366f1;
}

.toggle-edit-btn {
  flex-shrink: 0;
  height: 32px;
}

.save-actions {
  display: flex;
  justify-content: flex-end;
}

/* Markdown 预览排版渲染 */
.markdown-preview {
  padding: 8px 4px;
  overflow-y: auto;
}

.markdown-preview :deep(h1),
.markdown-preview :deep(h2),
.markdown-preview :deep(h3) {
  margin-top: 16px;
  margin-bottom: 10px;
  font-weight: 600;
  color: #0f172a;
}

.markdown-preview :deep(h1) {
  font-size: 17px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 6px;
}

.markdown-preview :deep(h2) {
  font-size: 15px;
}

.markdown-preview :deep(h3) {
  font-size: 14px;
}

.markdown-preview :deep(p) {
  margin-top: 0;
  margin-bottom: 10px;
  line-height: 1.6;
  color: #334155;
  font-size: 13.5px;
}

.markdown-preview :deep(ul),
.markdown-preview :deep(ol) {
  margin-top: 0;
  margin-bottom: 10px;
  padding-left: 20px;
}

.markdown-preview :deep(li) {
  margin-bottom: 6px;
  line-height: 1.5;
  color: #334155;
  font-size: 13.5px;
}

.markdown-preview :deep(code) {
  background: #f1f5f9;
  padding: 2px 5px;
  border-radius: 4px;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 12px;
  color: #ea580c;
}

.markdown-preview :deep(pre) {
  background: #f8fafc;
  padding: 14px;
  border-radius: 8px;
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  margin-bottom: 12px;
}

.markdown-preview :deep(pre code) {
  background: none;
  padding: 0;
  color: #334155;
}

.markdown-preview :deep(blockquote) {
  border-left: 4px solid #cbd5e1;
  padding-left: 14px;
  color: #64748b;
  margin: 0 0 12px 0;
  font-style: italic;
  background: #f8fafc;
  padding-top: 6px;
  padding-bottom: 6px;
}

.markdown-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: #94a3b8;
  font-size: 13px;
  border: 1px dashed #e2e8f0;
  border-radius: 8px;
  background: #fafbfe;
}
</style>
