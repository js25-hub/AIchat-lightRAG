<template>
  <div
    class="message-container"
    :class="[
      message.role === 'assistant' ? 'message-assistant' : 'message-user',
      { loading },
    ]"
  >
    <div class="message-avatar">
      <el-avatar
        :icon="message.role === 'assistant' ? 'ChatRound' : 'User'"
        :class="message.role"
      />
    </div>

    <div class="message-content">
      <div v-if="!loading && !isEditing" class="message-text">
        <div v-if="isVLMMessage" class="vlm-message">
          <div v-if="messageImages.length > 0" class="message-images">
            <img
              v-for="(imageUrl, index) in messageImages"
              :key="index"
              :src="imageUrl"
              class="message-image"
              @click="previewImage(imageUrl)"
            />
          </div>
          <div
            v-if="messageText"
            ref="markdownBody"
            class="markdown-body"
            v-html="renderedContent"
            @click="handleCodeBlockClick"
          />
        </div>
        <div
          v-else
          ref="markdownBody"
          class="markdown-body"
          v-html="renderedContent"
          @click="handleCodeBlockClick"
        />
      </div>

      <div v-if="showRagStatus" class="rag-status" :class="{ hit: message.ragInfo?.hit, miss: !message.ragInfo?.hit }">
        {{ ragStatusText }}
      </div>

      <div v-if="isEditing" class="message-edit">
        <el-input
          ref="editInputRef"
          v-model="editContent"
          type="textarea"
          :rows="2"
          :autosize="{ minRows: 2, maxRows: 6 }"
          @keydown.enter.exact.prevent="handleEditKeydown"
          @keydown.esc="cancelEdit"
        />
        <div class="edit-actions">
          <el-button size="small" @click="cancelEdit">取消</el-button>
          <el-button type="primary" size="small" @click="saveEdit">保存</el-button>
        </div>
      </div>

      <div v-if="loading" class="message-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        正在思考...
      </div>

      <div class="message-footer">
        <span class="message-time">{{ formatTime(message.timestamp) }}</span>

        <div v-if="!loading && message.role === 'user' && !isEditing" class="message-actions">
          <el-button-group>
            <el-button type="text" size="small" @click="startEdit">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button type="text" size="small" @click="handleDelete">
              <el-icon><Delete /></el-icon>
            </el-button>
          </el-button-group>
        </div>

        <div v-if="!loading && message.role === 'assistant'" class="message-actions">
          <el-button-group>
            <el-button
              type="text"
              size="small"
              :disabled="isLoading"
              title="重新生成"
              @click="handleRegenerate"
            >
              <el-icon><RefreshRight /></el-icon>
            </el-button>
            <el-button
              type="text"
              size="small"
              title="复制全部"
              @click="handleCopyAll"
            >
              <el-icon><CopyDocument /></el-icon>
            </el-button>
          </el-button-group>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, Delete, RefreshRight, CopyDocument } from '@element-plus/icons-vue'
import { renderMarkdown } from '../utils/markdown'
import { useChatStore } from '../stores/chat'

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update', 'delete', 'regenerate'])

const markdownBody = ref(null)
const isEditing = ref(false)
const editContent = ref('')
const editInputRef = ref(null)

const chatStore = useChatStore()
const isLoading = computed(() => chatStore.isLoading)

const showRagStatus = computed(() => {
  return props.message.role === 'assistant' && props.message.ragInfo
})

const ragStatusText = computed(() => {
  const ragInfo = props.message.ragInfo
  if (!ragInfo) return ''

  if (!ragInfo.hit) {
    return '本次未命中知识库'
  }

  const count = Number(ragInfo.referenceCount || 0)
  const modeText = ragInfo.mode === 'multimodal' ? ' · 多模态 RAG' : ''
  return `本次已命中知识库 · 命中 ${count} 条参考${modeText}`
})

const isVLMMessage = computed(() => {
  return typeof props.message.content === 'object' && props.message.content?.images
})

const messageImages = computed(() => {
  if (isVLMMessage.value) {
    return props.message.content.images || []
  }
  return []
})

const messageText = computed(() => {
  if (isVLMMessage.value) {
    return props.message.content.text || ''
  }
  return props.message.content
})

const renderedContent = computed(() => {
  const textContent = isVLMMessage.value ? messageText.value : props.message.content
  return renderMarkdown(textContent || '')
})

const getMessagePlainText = () => {
  if (typeof props.message.content === 'string') {
    return props.message.content
  }

  if (props.message.content?.text) {
    return props.message.content.text
  }

  return ''
}

const startEdit = async () => {
  editContent.value = isVLMMessage.value ? messageText.value : props.message.content
  isEditing.value = true
  await nextTick()
  editInputRef.value?.input?.focus()
}

const cancelEdit = () => {
  isEditing.value = false
  editContent.value = ''
}

const saveEdit = () => {
  if (!editContent.value.trim()) {
    ElMessage.warning('消息内容不能为空')
    return
  }

  let updatedContent
  if (isVLMMessage.value) {
    updatedContent = {
      ...props.message.content,
      text: editContent.value.trim(),
    }
  } else {
    updatedContent = editContent.value.trim()
  }

  emit('update', {
    ...props.message,
    content: updatedContent,
  })
  isEditing.value = false
}

const handleDelete = async () => {
  try {
    await ElMessageBox.confirm('确定要删除这条消息吗？', '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    emit('delete', props.message)
  } catch {
    // 用户取消
  }
}

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString()
}

const previewImage = (imageUrl) => {
  const newWindow = window.open('', '_blank')
  newWindow.document.write(`
    <html>
      <head><title>图片预览</title></head>
      <body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#000;">
        <img src="${imageUrl}" style="max-width:100%;max-height:100%;object-fit:contain;" />
      </body>
    </html>
  `)
}

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('内容已复制到剪贴板')
  } catch (error) {
    console.error('复制失败:', error)
    ElMessage.error('复制失败')
  }
}

const handleCodeBlockClick = (event) => {
  const preElement = event.target.closest('pre')
  if (!preElement) return

  const codeElement = preElement.querySelector('code')
  if (codeElement) {
    copyToClipboard(codeElement.textContent)
  }
}

const handleEditKeydown = (event) => {
  if (event.shiftKey) return
  saveEdit()
}

const handleRegenerate = () => {
  emit('regenerate', props.message)
}

const handleCopyAll = async () => {
  await copyToClipboard(getMessagePlainText())
}
</script>

<style lang="scss" scoped>
.message-container {
  display: flex;
  width: 100%;
  margin: 0;
  padding: 16px 0;
  gap: 12px;

  &.message-user {
    flex-direction: row-reverse;

    .message-content {
      align-items: flex-end;
    }

    .message-text {
      background: #f4f4f4;
      border-radius: 18px;
      max-width: 760px;
    }
  }

  &.message-assistant .message-text {
    background: transparent;
    padding-left: 0;
    padding-right: 0;
  }

  .markdown-body {
    :deep() {
      h1, h2, h3, h4, h5, h6 {
        margin: 0.3rem 0;
        font-weight: 600;
        line-height: 1.25;
      }

      p {
        margin: 0.15rem 0;
      }

      code {
        font-family: var(--code-font-family);
        padding: 0.2em 0.4em;
        margin: 0;
        font-size: 85%;
        background-color: var(--code-bg);
        border-radius: 3px;
        color: var(--code-text);
      }

      pre {
        position: relative;
        padding: 2rem 1rem 1rem;
        overflow: auto;
        font-size: 85%;
        line-height: 1.45;
        background-color: var(--code-block-bg);
        border-radius: var(--border-radius);
        margin: 0.3rem 0;
        border: 1px solid var(--border-color);

        .code-header {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          padding: 0.3rem 1rem;
          background-color: var(--code-header-bg);
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-family: var(--code-font-family);

          .code-lang {
            font-size: 0.8rem;
            color: var(--text-color-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
        }

        &::after {
          content: '点击复制';
          position: absolute;
          top: 0.3rem;
          right: 1rem;
          padding: 0.2rem 0.5rem;
          font-size: 0.75rem;
          color: var(--text-color-secondary);
          opacity: 0;
          transition: opacity 0.3s;
          font-family: system-ui, -apple-system, sans-serif;
        }

        &:hover::after {
          opacity: 0.8;
        }

        code {
          padding: 0;
          background-color: transparent;
          color: inherit;
          display: block;
          font-family: var(--code-font-family);
        }
      }

      blockquote {
        margin: 0.15rem 0;
        padding: 0 0.75rem;
        color: var(--text-color-secondary);
        border-left: 0.25rem solid var(--border-color);
      }

      ul, ol {
        margin: 0.15rem 0;
        padding-left: 1.5rem;
      }

      table {
        border-collapse: collapse;
        width: 100%;
        margin: 0.15rem 0;

        th, td {
          padding: 0.5rem;
          border: 1px solid var(--border-color);
        }

        th {
          background-color: var(--bg-color-secondary);
        }
      }

      img {
        max-width: 100%;
        max-height: 300px;
        object-fit: contain;
        margin: 0.3rem 0;
        border-radius: var(--border-radius);
        cursor: pointer;

        &:hover {
          opacity: 0.9;
        }
      }

      a {
        color: var(--primary-color);
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }
      }

      > *:last-child {
        margin-bottom: 0;
      }
    }
  }
}

.message-avatar {
  flex-shrink: 0;

  .el-avatar {
    width: 32px;
    height: 32px;
    background-color: #ececf1;
    color: #343541;

    &.assistant {
      background-color: #111827;
      color: #ffffff;
    }
  }
}

.message-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: min(78%, 820px);
  min-width: 0;
}

.message-text {
  color: #202123;
  padding: 10px 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.rag-status {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 24px;
  background: #f3f4f6;
  color: #4b5563;

  &.hit {
    background: #ecfdf3;
    color: #067647;
  }

  &.miss {
    background: #f8fafc;
    color: #64748b;
  }
}

.vlm-message {
  .message-images {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 12px;

    .message-image {
      max-width: 200px;
      max-height: 200px;
      object-fit: cover;
      border-radius: 10px;
      cursor: pointer;
      transition: transform 0.2s ease;

      &:hover {
        transform: scale(1.05);
      }
    }
  }
}

.message-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6f6f6f;
  padding: 10px 0;

  .el-icon {
    font-size: 18px;
  }
}

.message-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 22px;
  padding: 0 4px;
  font-size: 12px;
  color: #9b9b9b;
  opacity: 0;
  transition: opacity 0.16s ease;
}

.message-container:hover .message-footer {
  opacity: 1;
}

.message-time {
  margin-right: 0.5rem;
}

.message-actions {
  display: flex;
  gap: 4px;

  .el-button {
    padding: 2px 5px;
    height: 22px;
    color: #8a8a8a;
    transition: all 0.2s ease;

    .el-icon {
      font-size: 14px;
    }

    &:hover {
      color: #202123;
      background-color: #f4f4f4;
    }
  }
}

.message-edit {
  background-color: var(--bg-color);
  padding: 0.75rem;
  border-radius: var(--border-radius);
  box-shadow: var(--box-shadow);

  .el-input {
    margin-bottom: 0.5rem;

    :deep(.el-textarea__inner) {
      background-color: var(--bg-color-secondary);
      border-color: var(--border-color);
      resize: none;

      &:focus {
        border-color: var(--primary-color);
      }
    }
  }

  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
}

[data-theme='dark'] {
  .message-container.message-user .message-text {
    background: #2f2f2f;
    color: #ececec;
  }

  .message-container.message-assistant .message-text,
  .message-text {
    color: #ececec;
  }

  .message-avatar .el-avatar {
    background-color: #2f2f2f;
    color: #ececec;

    &.assistant {
      background-color: #ececec;
      color: #111827;
    }
  }

  .rag-status {
    background: #2f2f2f;
    color: #d1d5db;

    &.hit {
      background: rgba(6, 120, 72, 0.25);
      color: #7ee0b0;
    }

    &.miss {
      background: #262f3a;
      color: #b6c2cf;
    }
  }

  .message-actions .el-button:hover {
    color: #ececec;
    background-color: #2f2f2f;
  }
}
</style>
