<el-dialog
      v-model="shotTranscribeVisible"
      title="分镜 · 转写与标签"
      width="560px"
      top="8vh"
      class="admin-dialog"
      align-center
      destroy-on-close
    >
      <template v-if="shotTranscribeRow">
        <div class="field-label">口播</div>
        <div class="text-panel">{{ shotTranscribeRow.segment_text || '—' }}</div>
        <div class="field-label">画面描述</div>
        <div class="text-panel">{{ shotTranscribeRow.description || '—' }}</div>
        <div class="field-label">结构化标签</div>
        <TokenChipsReadonly :tokens="shotTranscribeTokens" />
      </template>
    </el-dialog>