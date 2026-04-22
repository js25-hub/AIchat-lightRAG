<template>
  <el-drawer
    v-model="visible"
    title="知识库"
    direction="rtl"
    size="420px"
    style="background-color: var(--bg-color);"
  >
    <div class="knowledge-container">
      <div class="knowledge-toolbar">
        <el-select
          v-model="currentKnowledgeBaseId"
          class="knowledge-select"
          placeholder="选择知识库"
        >
          <el-option
            v-for="knowledgeBase in knowledgeBases"
            :key="knowledgeBase.id"
            :label="knowledgeBase.name"
            :value="knowledgeBase.id"
          />
        </el-select>
        <el-button :icon="Plus" @click="handleCreateKnowledgeBase">新建</el-button>
      </div>

      <div v-if="activeKnowledgeBase" class="knowledge-actions">
        <el-button
          plain
          :icon="RefreshRight"
          :disabled="!documents.length"
          @click="handleRebuildKnowledgeBase"
        >
          重建知识库
        </el-button>
        <el-button
          type="danger"
          plain
          :disabled="knowledgeBases.length <= 1"
          :icon="Delete"
          @click="handleDeleteKnowledgeBase"
        >
          删除知识库
        </el-button>
      </div>

      <div v-if="activeKnowledgeBase" class="knowledge-summary">
        <div class="summary-card">
          <div class="summary-value">{{ activeKnowledgeBase.documentCount }}</div>
          <div class="summary-label">素材数</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">{{ activeKnowledgeBase.chunkCount }}</div>
          <div class="summary-label">切片数</div>
        </div>
      </div>

      <el-upload
        class="knowledge-upload"
        :action="null"
        :auto-upload="false"
        :show-file-list="false"
        :accept="acceptedKnowledgeAssetTypes"
        multiple
        :on-change="handleDocumentChange"
      >
        <template #trigger>
          <el-button type="primary" :icon="Upload">上传资料到知识库</el-button>
        </template>
      </el-upload>

      <div class="knowledge-tip">
        支持 `txt / md / json / 代码文件 / PDF / DOCX / 图片` 等资料格式。文本资料会切片后进入混合检索，
        图片资料会保存为多模态参考素材，并在启用 VLM 时参与多模态 RAG。
      </div>

      <div v-if="documents.length" class="document-list">
        <div
          v-for="document in documents"
          :key="document.id"
          class="document-item"
        >
          <div class="document-main">
            <div class="document-title-row">
              <el-tag size="small" :type="document.sourceType === 'image' ? 'success' : 'info'">
                {{ document.sourceType === 'image' ? '图片' : '文档' }}
              </el-tag>
              <div class="document-name">{{ document.fileName }}</div>
            </div>
            <div class="document-meta">
              {{ formatFileSize(document.fileSize) }} · {{ document.chunkCount }} 个切片
            </div>
          </div>

          <img
            v-if="document.sourceType === 'image' && document.previewUrl"
            :src="document.previewUrl"
            class="document-thumb"
          />

          <el-button
            text
            type="danger"
            :icon="Delete"
            @click="handleDeleteDocument(document)"
          />
        </div>
      </div>

      <el-empty v-else description="当前知识库还没有资料" />
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { Delete, Plus, RefreshRight, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useKnowledgeStore } from '../stores/knowledge'
import { DOCUMENT_EXTENSIONS } from '../utils/documentUtils'

const props = defineProps({
  modelValue: Boolean,
})

const emit = defineEmits(['update:modelValue'])

const knowledgeStore = useKnowledgeStore()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const knowledgeBases = computed(() => knowledgeStore.knowledgeBases)
const activeKnowledgeBase = computed(() => knowledgeStore.activeKnowledgeBase)
const documents = computed(() => knowledgeStore.documents)
const acceptedKnowledgeAssetTypes = ['image/*', ...DOCUMENT_EXTENSIONS].join(',')

const currentKnowledgeBaseId = computed({
  get: () => knowledgeStore.currentKnowledgeBaseId,
  set: (value) => {
    void handleKnowledgeBaseChange(value)
  },
})

onMounted(() => {
  knowledgeStore.initKnowledgeBases()
})

const handleKnowledgeBaseChange = async (knowledgeBaseId) => {
  await knowledgeStore.switchKnowledgeBase(knowledgeBaseId)
}

const handleCreateKnowledgeBase = async () => {
  try {
    const { value } = await ElMessageBox.prompt('请输入知识库名称', '新建知识库', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：产品手册',
    })

    await knowledgeStore.createKnowledgeBase(value)
    ElMessage.success('知识库创建成功')
  } catch {
    // 用户取消
  }
}

const handleDeleteKnowledgeBase = async () => {
  if (!activeKnowledgeBase.value) return

  try {
    await ElMessageBox.confirm(
      `确定删除知识库「${activeKnowledgeBase.value.name}」吗？其下资料会一并删除。`,
      '删除知识库',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    await knowledgeStore.deleteKnowledgeBase(activeKnowledgeBase.value.id)
    ElMessage.success('知识库已删除')
  } catch {
    // 用户取消
  }
}

const handleRebuildKnowledgeBase = async () => {
  if (!activeKnowledgeBase.value) return

  try {
    await ElMessageBox.confirm(
      `确定重建知识库「${activeKnowledgeBase.value.name}」吗？当前资料与切片会被清空。`,
      '重建知识库',
      {
        confirmButtonText: '重建',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    await knowledgeStore.rebuildKnowledgeBase()
    ElMessage.success('知识库已重建，可以重新上传资料')
  } catch {
    // 用户取消
  }
}

const handleDocumentChange = async (uploadFile) => {
  const rawFile = uploadFile.raw
  if (!rawFile) return

  try {
    await knowledgeStore.importDocuments([rawFile])
    ElMessage.success(`资料已入库：${rawFile.name}`)
  } catch (error) {
    ElMessage.error(error.message || '资料入库失败')
  }
}

const handleDeleteDocument = async (document) => {
  try {
    await ElMessageBox.confirm(
      `确定从知识库中删除资料「${document.fileName}」吗？`,
      '删除资料',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    await knowledgeStore.deleteDocument(document.id)
    ElMessage.success('资料已删除')
  } catch {
    // 用户取消
  }
}

const formatFileSize = (fileSize = 0) => {
  if (fileSize < 1024) return `${fileSize} B`
  if (fileSize < 1024 * 1024) return `${(fileSize / 1024).toFixed(1)} KB`
  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<style lang="scss" scoped>
.knowledge-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.knowledge-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.knowledge-actions {
  display: flex;
  gap: 8px;
}

.knowledge-select {
  width: 100%;
}

.knowledge-summary {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.summary-card {
  padding: 14px;
  border-radius: 12px;
  background: #f5f7fa;
  text-align: center;
}

.summary-value {
  font-size: 22px;
  font-weight: 700;
  color: #202123;
}

.summary-label {
  margin-top: 4px;
  color: #8a8a8a;
  font-size: 12px;
}

.knowledge-tip {
  font-size: 12px;
  color: #8a8a8a;
  line-height: 1.6;
}

.document-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
}

.document-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: #f7f7f8;
}

.document-main {
  min-width: 0;
}

.document-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.document-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #202123;
  font-weight: 600;
}

.document-meta {
  margin-top: 4px;
  color: #8a8a8a;
  font-size: 12px;
}

.document-thumb {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 10px;
}

[data-theme='dark'] {
  .summary-card,
  .document-item {
    background: #2a2a2a;
  }

  .summary-value,
  .document-name {
    color: #ececec;
  }
}
</style>
