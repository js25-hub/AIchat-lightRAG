<template>
  <div class="chat-input-container">
    <div class="input-wrapper">
      <div v-if="showUpload" class="upload-area">
        <div class="upload-tip">
          <el-alert
            :title="isVLMModel ? '照片与文件上传提示' : '文件上传提示'"
            type="info"
            show-icon
            :closable="false"
          >
            <template #default>
              <p v-if="isVLMModel">当前模型支持图片理解，可以将图片和文档一起发送。</p>
              <p>图片格式：JPEG、PNG、GIF、WebP，建议单张小于 10MB。</p>
              <p>文档格式：txt、md、json、代码文件、PDF、DOCX 等。</p>
              <p v-if="isVLMModel">
                细节模式：
                {{
                  settingsStore.imageDetail === 'high'
                    ? '高分辨率（消耗更多 Token）'
                    : settingsStore.imageDetail === 'low'
                      ? '低分辨率（消耗更少 Token）'
                      : '自动选择'
                }}
              </p>
            </template>
          </el-alert>
        </div>

        <el-upload
          class="upload-component"
          :action="null"
          :auto-upload="false"
          :on-change="handleFileChange"
          :show-file-list="false"
          :accept="acceptedFileTypes"
          multiple
        >
          <template #trigger>
            <el-button type="primary" :icon="Plus">
              添加照片或文件
            </el-button>
          </template>
        </el-upload>

        <div v-if="selectedFiles.length" class="preview-list">
          <div v-for="(file, index) in selectedFiles" :key="`${file.name}-${index}`" class="preview-item">
            <img v-if="isImage(file)" :src="getPreviewUrl(index)" class="preview-image" />
            <div v-else class="file-preview">
              <el-icon><Document /></el-icon>
              <span>{{ file.name }}</span>
            </div>

            <el-button
              class="delete-btn"
              type="danger"
              :icon="Delete"
              circle
              @click="removeFile(index)"
            />
          </div>
        </div>
      </div>

      <el-input
        ref="inputRef"
        v-model="messageText"
        type="textarea"
        :rows="2"
        :autosize="{ minRows: 2, maxRows: 5 }"
        :placeholder="placeholder"
        resize="none"
        @keydown.enter.exact.prevent="handleSend"
        @keydown.enter.shift.exact="newline"
        @input="adjustHeight"
      />

      <div class="button-group">
        <el-tooltip content="上传照片或文件" placement="top">
          <el-button circle :icon="Upload" @click="toggleUpload" />
        </el-tooltip>

        <el-tooltip content="清空对话" placement="top">
          <el-button circle type="danger" :icon="Delete" @click="handleClear" />
        </el-tooltip>

        <el-button
          v-if="loading"
          class="stop-button"
          type="primary"
          @click="handleStop"
        >
          <template #icon>
            <el-icon><Close /></el-icon>
          </template>
          停止
        </el-button>

        <el-button v-else type="primary" @click="handleSend">
          <template #icon>
            <el-icon><Position /></el-icon>
          </template>
          发送
        </el-button>
      </div>
    </div>

    <div class="token-counter">
      已使用 Token: {{ tokenCount.total }} (提示: {{ tokenCount.prompt }}, 回复: {{ tokenCount.completion }})
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Close, Delete, Document, Plus, Position, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatStore } from '../stores/chat'
import { useSettingsStore, isVLMModelValue } from '../stores/settings'
import {
  checkDocumentSize,
  DOCUMENT_EXTENSIONS,
  formatDocumentContentForPrompt,
  isSupportedDocument,
  readDocumentAsText,
} from '../utils/documentUtils'
import {
  buildVLMMessage,
  checkImageSize,
  getImagePreviewUrl,
  isValidImageFormat,
  revokeImagePreviewUrl,
} from '../utils/imageUtils'

const props = defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['send', 'clear', 'stop'])

const chatStore = useChatStore()
const settingsStore = useSettingsStore()

const messageText = ref('')
const showUpload = ref(false)
const selectedFiles = ref([])
const previewUrls = ref([])
const inputRef = ref(null)

const placeholder = '输入消息，按 Enter 发送，Shift + Enter 换行'
const tokenCount = computed(() => chatStore.tokenCount)
const isVLMModel = computed(() => isVLMModelValue(settingsStore.model))
const acceptedFileTypes = computed(() => ['image/*', ...DOCUMENT_EXTENSIONS].join(','))

const toggleUpload = () => {
  showUpload.value = !showUpload.value
}

const handleStop = () => {
  emit('stop')
}

const isImage = (file) => {
  return file.type.startsWith('image/')
}

const getPreviewUrl = (index) => {
  return previewUrls.value[index] || getImagePreviewUrl(selectedFiles.value[index])
}

const handleFileChange = (file) => {
  const rawFile = file.raw
  if (!rawFile) return

  if (selectedFiles.value.some((item) => item.name === rawFile.name && item.size === rawFile.size)) {
    ElMessage.warning('这个文件已经添加过了')
    return
  }

  if (isImage(rawFile)) {
    if (!isValidImageFormat(rawFile)) {
      ElMessage.error('当前只支持 JPEG、PNG、GIF、WebP 图片')
      return
    }

    if (!checkImageSize(rawFile)) {
      ElMessage.error('图片文件过大，请选择小于 10MB 的图片')
      return
    }
  } else {
    if (!isSupportedDocument(rawFile)) {
      ElMessage.error('当前暂不支持该文档格式')
      return
    }

    if (!checkDocumentSize(rawFile)) {
      ElMessage.error('文档文件过大，请选择小于 10MB 的文件')
      return
    }
  }

  selectedFiles.value.push(rawFile)
  previewUrls.value.push(isImage(rawFile) ? getImagePreviewUrl(rawFile) : null)
}

const removeFile = (index) => {
  if (previewUrls.value[index]) {
    revokeImagePreviewUrl(previewUrls.value[index])
  }

  selectedFiles.value.splice(index, 1)
  previewUrls.value.splice(index, 1)
}

const cleanupFiles = () => {
  previewUrls.value.forEach((url) => {
    if (url) revokeImagePreviewUrl(url)
  })

  selectedFiles.value = []
  previewUrls.value = []
  showUpload.value = false
}

const convertImageToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      resolve(`![${file.name}](${event.target.result})`)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const buildDocumentPromptBlocks = async (documentFiles) => {
  const contents = await Promise.all(documentFiles.map(async (file) => {
    const contentText = await readDocumentAsText(file)
    return formatDocumentContentForPrompt(file.name, contentText)
  }))

  return contents.filter(Boolean)
}

const handleSend = async () => {
  if ((!messageText.value.trim() && selectedFiles.value.length === 0) || props.loading) return

  try {
    const imageFiles = selectedFiles.value.filter((file) => isImage(file))
    const documentFiles = selectedFiles.value.filter((file) => !isImage(file))
    let messageContent

    let textContent = messageText.value
    if (documentFiles.length > 0) {
      const fileContents = await buildDocumentPromptBlocks(documentFiles)
      textContent = [textContent, ...fileContents].filter(Boolean).join('\n\n')
    }

    if (isVLMModel.value && imageFiles.length > 0) {
      messageContent = await buildVLMMessage(
        textContent,
        imageFiles,
        settingsStore.imageDetail
      )
    } else {
      const inlineImages = await Promise.all(
        imageFiles.map((file) => convertImageToBase64(file))
      )

      messageContent = [textContent, ...inlineImages].filter(Boolean).join('\n\n')
    }

    emit('send', messageContent)
    messageText.value = ''
    cleanupFiles()
  } catch (error) {
    console.error('发送失败', error)
    ElMessage.error(error.message || '发送失败，请重试')
  }
}

const newline = () => {
  messageText.value += '\n'
}

const handleClear = async () => {
  try {
    await ElMessageBox.confirm('确定要清空所有对话记录吗？', '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    emit('clear')
  } catch {
    // 用户取消
  }
}

const adjustHeight = () => {
  if (!inputRef.value) return

  const textarea = inputRef.value.$el.querySelector('textarea')
  if (!textarea) return

  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}
</script>

<style lang="scss" scoped>
.chat-input-container {
  padding: 16px 20px 18px;
  background: var(--bg-color);
}

.input-wrapper {
  max-width: 880px;
  margin: 0 auto 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
  padding: 10px;
  border: 1px solid #d9d9e3;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.06);

  .el-input {
    min-width: 0;

    :deep(.el-textarea__inner) {
      min-height: 44px !important;
      padding: 10px 8px;
      border: 0;
      box-shadow: none;
      background: transparent;
      line-height: 1.5;
      overflow-y: auto;
      color: #202123;

      &:focus {
        box-shadow: none;
      }
    }
  }
}

.button-group {
  display: flex;
  gap: 8px;
  align-items: center;

  .el-button {
    width: 36px;
    height: 36px;
    transition: all 0.16s ease;

    &:hover {
      transform: translateY(-1px);
    }

    &.el-button--primary {
      width: auto;
      min-width: 74px;
      border-radius: 10px;
      background: #111827;
      border-color: #111827;
    }

    &.stop-button {
      background: #dc2626;
      border-color: #dc2626;
    }
  }
}

.token-counter {
  max-width: 880px;
  margin: 0 auto;
  font-size: 12px;
  color: #8a8a8a;
  text-align: right;
}

.upload-area {
  grid-column: 1 / -1;
  padding: 12px;
  border: 1px dashed #d9d9e3;
  border-radius: 12px;
  background: #f7f7f8;

  .upload-tip {
    margin-bottom: 12px;

    :deep(.el-alert__content) {
      p {
        margin: 4px 0;
        font-size: 13px;
      }
    }
  }

  .preview-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 12px;
  }
}

.preview-item {
  position: relative;
  width: 88px;
  height: 88px;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 10px;
}

.file-preview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-color-secondary);
  border-radius: 10px;

  .el-icon {
    font-size: 24px;
    margin-bottom: 6px;
  }

  span {
    font-size: 12px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 90%;
  }
}

.delete-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  transform: scale(0.8);
}

[data-theme="dark"] {
  .chat-input-container {
    background: #212121;
  }

  .input-wrapper {
    background: #2f2f2f;
    border-color: #454545;
    box-shadow: none;

    .el-input :deep(.el-textarea__inner) {
      color: #ececec;
    }
  }

  .upload-area {
    background: #262626;
    border-color: #454545;
  }
}

@media (max-width: 760px) {
  .chat-input-container {
    padding: 12px;
  }

  .input-wrapper {
    grid-template-columns: 1fr;
  }

  .button-group {
    justify-content: flex-end;
  }
}
</style>
