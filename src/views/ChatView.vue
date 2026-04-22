<template>
  <div class="chat-shell">
    <aside class="conversation-sidebar">
      <div class="sidebar-header">
        <div class="brand-mark">AI</div>
        <div>
          <div class="brand-title">AI Chat</div>
          <div class="brand-subtitle">Workspace</div>
        </div>
      </div>

      <el-button class="new-chat-button" :icon="Plus" @click="handleNewConversation">
        新对话
      </el-button>

      <div class="conversation-section-title">聊天记录</div>
      <div class="conversation-list">
        <div
          v-for="conversation in conversations"
          :key="conversation.id"
          class="conversation-item"
          :class="{ active: conversation.id === currentConversationId }"
          @click="handleSwitchConversation(conversation.id)"
        >
          <span class="conversation-title">{{ conversation.title || '新对话' }}</span>
          <span class="conversation-meta">{{ formatConversationTime(conversation.updatedAt) }}</span>
          <el-button
            class="conversation-delete"
            text
            :icon="Delete"
            @click.stop="handleDeleteConversation(conversation.id)"
          />
        </div>
      </div>
    </aside>

    <main class="chat-container">
      <div class="chat-header">
        <div>
          <h1>{{ activeConversationTitle }}</h1>
          <p>{{ headerDescription }}</p>
        </div>
        <div class="header-actions">
          <el-button :icon="Collection" @click="showKnowledgeBasePanel = true">
            知识库
          </el-button>
          <el-button circle :icon="Setting" @click="showSettings = true" />
        </div>
      </div>

      <div
        ref="messagesContainer"
        class="messages-container"
        @scroll="handleMessagesScroll"
      >
        <template v-if="isChatReady && messages.length">
          <div class="messages-list">
            <chat-message
              v-for="message in messages"
              :key="message.id"
              :message="message"
              :loading="message.loading"
              @update="handleMessageUpdate"
              @delete="handleMessageDelete"
              @regenerate="handleRegenerate"
            />
            <div ref="bottomAnchor" class="messages-bottom-anchor" />
          </div>
        </template>

        <div v-else-if="isChatReady" class="empty-state">
          <div class="empty-card">
            <h2>今天想聊点什么？</h2>
            <p>可以直接提问，也可以先切换知识库后再开始对话。</p>
          </div>
        </div>

        <div v-else class="empty-state">
          <div class="empty-card">
            <h2>正在加载聊天记录...</h2>
            <p>聊天记录和知识库正在从 IndexedDB 读取。</p>
          </div>
        </div>
      </div>

      <chat-input
        :loading="isLoading"
        @send="handleSend"
        @clear="handleClear"
        @stop="handleStopGenerating"
      />
    </main>

    <settings-panel v-model="showSettings" />
    <knowledge-base-panel v-model="showKnowledgeBasePanel" />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Collection, Delete, Plus, Setting } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useChatStore } from '../stores/chat'
import { useKnowledgeStore } from '../stores/knowledge'
import { isVLMModelValue, useSettingsStore } from '../stores/settings'
import { chatApi } from '../utils/api'
import { messageHandler } from '../utils/messageHandler'
import {
  buildMultimodalRagUserMessage,
  buildRagSystemPrompt,
  shouldUseMultimodalRag,
} from '../utils/retriever'
import ChatMessage from '../components/ChatMessage.vue'
import ChatInput from '../components/ChatInput.vue'
import KnowledgeBasePanel from '../components/KnowledgeBasePanel.vue'
import SettingsPanel from '../components/SettingsPanel.vue'

const chatStore = useChatStore()
const knowledgeStore = useKnowledgeStore()
const settingsStore = useSettingsStore()

const messages = computed(() => chatStore.messages)
const isLoading = computed(() => chatStore.isLoading)
const isChatReady = computed(() => chatStore.isInitialized && knowledgeStore.isInitialized)
const conversations = computed(() => chatStore.conversations)
const currentConversationId = computed(() => chatStore.currentConversationId)
const activeKnowledgeBase = computed(() => knowledgeStore.activeKnowledgeBase)
const activeConversationTitle = computed(() => {
  const current = conversations.value.find((item) => item.id === currentConversationId.value)
  return current?.title || '新对话'
})

const headerDescription = computed(() => {
  if (!isChatReady.value) return '正在加载本地数据'

  const messageSummary = messages.value.length
    ? `${messages.value.length} 条消息`
    : '开始一段新的对话'

  const knowledgeSummary = activeKnowledgeBase.value
    ? `知识库：${activeKnowledgeBase.value.name}`
    : '未启用知识库'

  return `${messageSummary} · ${knowledgeSummary}`
})

const showSettings = ref(false)
const showKnowledgeBasePanel = ref(false)
const abortController = ref(null)
const stopRequested = ref(false)
const messagesContainer = ref(null)
const bottomAnchor = ref(null)
const autoScrollEnabled = ref(true)

const isNearBottom = () => {
  const container = messagesContainer.value
  if (!container) return true

  return container.scrollHeight - container.scrollTop - container.clientHeight <= 80
}

const scrollToBottom = (behavior = 'auto') => {
  if (!bottomAnchor.value) return

  bottomAnchor.value.scrollIntoView({
    block: 'end',
    behavior,
  })
}

const handleMessagesScroll = () => {
  autoScrollEnabled.value = isNearBottom()
}

const handleContentResize = () => {
  if (!autoScrollEnabled.value) return

  nextTick(() => {
    scrollToBottom()
  })
}

const handleNewConversation = () => {
  if (isLoading.value || !isChatReady.value) return

  chatStore.createConversation()
  autoScrollEnabled.value = true

  nextTick(() => {
    scrollToBottom()
  })
}

const handleSwitchConversation = (id) => {
  if (isLoading.value || !isChatReady.value) return

  chatStore.switchConversation(id)
  autoScrollEnabled.value = true

  nextTick(() => {
    scrollToBottom()
  })
}

const handleDeleteConversation = async (id) => {
  if (isLoading.value || !isChatReady.value) return

  try {
    await ElMessageBox.confirm('确定删除这条聊天记录吗？', '删除对话', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })

    chatStore.deleteConversation(id)
    autoScrollEnabled.value = true

    nextTick(() => {
      scrollToBottom()
    })
  } catch {
    // 用户取消
  }
}

const handleStopGenerating = () => {
  if (!abortController.value) return

  stopRequested.value = true
  abortController.value.abort()
}

const formatConversationTime = (timestamp) => {
  if (!timestamp) return ''

  const date = new Date(timestamp)
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()

  return isToday
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: '2-digit', day: '2-digit' })
}

const extractUserText = (content) => {
  if (typeof content === 'string') return content

  if (content && typeof content === 'object') {
    if (content.text) return content.text

    if (Array.isArray(content.content)) {
      return content.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('\n')
    }
  }

  return ''
}

const buildHistoryMessages = (content) => {
  const messagesToSend = []

  for (let index = 0; index < messages.value.length - 1; index += 1) {
    const message = messages.value[index]

    if (
      message.role === 'user' &&
      typeof message.content === 'object' &&
      message.content.text !== undefined
    ) {
      const apiMessage = {
        role: 'user',
        content: [],
      }

      if (message.content.images?.length) {
        message.content.images.forEach((imageUrl) => {
          apiMessage.content.push({
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: settingsStore.imageDetail,
            },
          })
        })
      }

      if (message.content.text) {
        apiMessage.content.push({
          type: 'text',
          text: message.content.text,
        })
      }

      messagesToSend.push(apiMessage)
      continue
    }

    messagesToSend.push({
      role: message.role,
      content: message.content,
    })
  }

  if (typeof content === 'object' && content.role === 'user') {
    messagesToSend.push(content)
  } else {
    messagesToSend.push({
      role: 'user',
      content,
    })
  }

  return messagesToSend
}

const normalizeLastUserMessage = (message) => {
  if (!message || message.role !== 'user') return message

  if (typeof message.content === 'string') {
    return {
      role: 'user',
      content: [
        {
          type: 'text',
          text: message.content,
        },
      ],
    }
  }

  return message
}

const buildRagMessages = (messagesToSend, content) => {
  const userText = extractUserText(content)
  const knowledgeBaseName = activeKnowledgeBase.value?.name || ''

  if (!userText.trim() || !knowledgeStore.hasKnowledgeChunks) {
    return {
      messages: messagesToSend,
      ragInfo: {
        hit: false,
        referenceCount: 0,
        knowledgeBaseName,
        mode: '',
      },
    }
  }

  const retrievedChunks = knowledgeStore.retrieveRelevantChunks(userText, {
    topK: 6,
    candidateK: 14,
    minKeywordScore: 2,
    minVectorScore: 0.12,
  })

  if (!retrievedChunks.length) {
    return {
      messages: messagesToSend,
      ragInfo: {
        hit: false,
        referenceCount: 0,
        knowledgeBaseName,
        mode: '',
      },
    }
  }

  const nextMessages = [...messagesToSend]
  const canUseMultimodalRag =
    isVLMModelValue(settingsStore.model) &&
    shouldUseMultimodalRag(retrievedChunks) &&
    nextMessages[nextMessages.length - 1]?.role === 'user'

  if (canUseMultimodalRag) {
    const normalizedUserMessage = normalizeLastUserMessage(
      nextMessages[nextMessages.length - 1]
    )

    nextMessages[nextMessages.length - 1] = buildMultimodalRagUserMessage(
      normalizedUserMessage,
      retrievedChunks,
      {
        detail: settingsStore.imageDetail,
        imageLimit: 2,
      }
    )

    return {
      messages: [
        {
          role: 'system',
          content: [
            '你正在基于本地知识库进行多模态 RAG 回答。',
            '用户消息中可能附带知识库召回的文本参考与图片参考，请联合理解。',
            '如果参考不足，请明确说明，不要编造知识库中不存在的事实。',
          ].join('\n'),
        },
        ...nextMessages,
      ],
      ragInfo: {
        hit: true,
        referenceCount: retrievedChunks.length,
        knowledgeBaseName,
        mode: 'multimodal',
      },
    }
  }

  return {
    messages: [
      {
        role: 'system',
        content: buildRagSystemPrompt(retrievedChunks),
      },
      ...nextMessages,
    ],
    ragInfo: {
      hit: true,
      referenceCount: retrievedChunks.length,
      knowledgeBaseName,
      mode: 'text',
    },
  }
}

watch(
  messages,
  () => {
    nextTick(() => {
      if (messages.value.length > 0 && autoScrollEnabled.value) {
        scrollToBottom()
      }
    })
  },
  { deep: true }
)

const handleResize = () => {
  if (messages.value.length > 0 && autoScrollEnabled.value) {
    scrollToBottom()
  }
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  messagesContainer.value?.addEventListener('load', handleContentResize, true)

  Promise.all([
    chatStore.initConversations(),
    knowledgeStore.initKnowledgeBases(),
  ]).finally(() => {
    nextTick(() => {
      autoScrollEnabled.value = true
      scrollToBottom()
    })
  })
})

onUnmounted(() => {
  abortController.value?.abort()
  messagesContainer.value?.removeEventListener('load', handleContentResize, true)
  window.removeEventListener('resize', handleResize)
})

const handleSend = async (content) => {
  if (isLoading.value || !isChatReady.value) return

  stopRequested.value = false
  abortController.value = new AbortController()

  const baseMessages = buildHistoryMessages(content)
  const { messages: messagesToSend, ragInfo } = buildRagMessages(baseMessages, content)

  chatStore.addMessage(messageHandler.formatMessage('user', content))
  chatStore.addMessage(messageHandler.formatMessage('assistant', '', { ragInfo }))
  chatStore.isLoading = true
  autoScrollEnabled.value = true

  try {
    const response = await chatApi.sendMessage(
      messagesToSend,
      settingsStore.streamResponse,
      { signal: abortController.value.signal }
    )

    if (settingsStore.streamResponse) {
      await messageHandler.processStreamResponse(response, {
        updateMessage: (nextContent) => chatStore.updateLastMessage(nextContent),
        updateTokenCount: (usage) => chatStore.updateTokenCount(usage),
      })
    } else {
      const result = await messageHandler.processSyncResponse(response, (nextContent) => {
        chatStore.updateLastMessage(nextContent)
      })

      if (result.usage) {
        chatStore.updateTokenCount(result.usage)
      }
    }
  } catch (error) {
    const isAbortError = error?.name === 'AbortError' || stopRequested.value

    if (isAbortError) {
      const lastMessage = chatStore.messages[chatStore.messages.length - 1]
      const currentContent = lastMessage?.content || ''

      if (lastMessage?.role === 'assistant' && !String(currentContent).trim()) {
        chatStore.updateLastMessage('已停止生成。')
      }
      return
    }

    chatStore.updateLastMessage('抱歉，发生了错误，请稍后重试。')
  } finally {
    chatStore.isLoading = false
    abortController.value = null
    stopRequested.value = false
  }
}

const handleClear = () => {
  chatStore.clearMessages()
  autoScrollEnabled.value = true

  nextTick(() => {
    scrollToBottom()
  })
}

const handleMessageUpdate = async (updatedMessage) => {
  const index = chatStore.messages.findIndex((message) => message.id === updatedMessage.id)
  if (index === -1) return

  chatStore.messages.splice(index, 2)
  chatStore.syncCurrentConversation()
  await handleSend(updatedMessage.content)
}

const handleMessageDelete = (message) => {
  const index = chatStore.messages.findIndex((item) => item.id === message.id)
  if (index === -1) return

  chatStore.messages.splice(index, 2)
  chatStore.syncCurrentConversation()
}

const handleRegenerate = async (message) => {
  const index = chatStore.messages.findIndex(
    (item) => item.id === message.id && item.role === 'assistant'
  )

  if (index === -1 || index <= 0 || isLoading.value) return

  const userMessage = chatStore.messages[index - 1]
  const previousPair = chatStore.messages.slice(index - 1, index + 1)

  chatStore.messages.splice(index - 1, 2)
  chatStore.syncCurrentConversation()

  try {
    await handleSend(userMessage.content)
  } catch (error) {
    console.error('重新生成失败:', error)
    chatStore.messages.splice(index - 1, 0, ...previousPair)
    chatStore.syncCurrentConversation()
  }
}
</script>

<style lang="scss" scoped>
.chat-shell {
  height: 100vh;
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr);
  background: var(--bg-color);
  color: var(--text-color-primary);
  overflow: hidden;
}

.conversation-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px 12px;
  background: #f7f7f8;
  border-right: 1px solid #e5e5e5;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px 16px;
}

.brand-mark {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: #111827;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}

.brand-title {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}

.brand-subtitle {
  margin-top: 2px;
  color: #8a8a8a;
  font-size: 12px;
}

.new-chat-button {
  width: 100%;
  justify-content: flex-start;
  height: 42px;
  border-radius: 8px;
  border-color: #d9d9dc;
  background: #ffffff;
  color: #202123;
  font-weight: 600;
}

.conversation-section-title {
  margin: 22px 8px 8px;
  color: #8a8a8a;
  font-size: 12px;
  font-weight: 600;
}

.conversation-list {
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 2px;
}

.conversation-item {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 8px;
  width: 100%;
  padding: 10px 34px 10px 10px;
  border-radius: 8px;
  color: #343541;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease;

  &:hover,
  &.active {
    background: #ececf1;
  }

  &.active {
    font-weight: 600;
  }
}

.conversation-title {
  grid-column: 1 / -1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  text-align: left;
}

.conversation-meta {
  color: #8a8a8a;
  font-size: 12px;
  text-align: left;
}

.conversation-delete {
  position: absolute;
  top: 7px;
  right: 6px;
  width: 24px;
  height: 24px;
  opacity: 0;
}

.conversation-item:hover .conversation-delete,
.conversation-item.active .conversation-delete {
  opacity: 1;
}

.chat-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #ffffff;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 12px 24px;
  border-bottom: 1px solid #ececec;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);

  h1 {
    margin: 0;
    font-size: 17px;
    color: #202123;
    font-weight: 700;
  }

  p {
    margin: 4px 0 0;
    color: #8a8a8a;
    font-size: 12px;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 28px 20px;
  background: #ffffff;
  overscroll-behavior: contain;
}

.messages-list {
  max-width: 880px;
  margin: 0 auto;
}

.messages-bottom-anchor {
  width: 100%;
  height: 1px;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.empty-card {
  max-width: 520px;
  text-align: center;

  h2 {
    margin: 0 0 10px;
    color: #202123;
    font-size: 28px;
    font-weight: 700;
  }

  p {
    margin: 0;
    color: #6f6f6f;
    font-size: 15px;
  }
}

[data-theme='dark'] {
  .chat-shell {
    background: #212121;
  }

  .conversation-sidebar {
    background: #171717;
    border-right-color: #2f2f2f;
  }

  .new-chat-button,
  .chat-container,
  .messages-container,
  .chat-header {
    background: #212121;
  }

  .new-chat-button {
    border-color: #3f3f3f;
    color: #f5f5f5;
  }

  .conversation-item {
    color: #ececec;

    &:hover,
    &.active {
      background: #2f2f2f;
    }
  }

  .chat-header {
    border-bottom-color: #2f2f2f;

    h1,
    p {
      color: #ececec;
    }
  }

  .empty-card h2 {
    color: #ececec;
  }
}

@media (max-width: 760px) {
  .chat-shell {
    grid-template-columns: 1fr;
  }

  .conversation-sidebar {
    display: none;
  }

  .chat-header {
    padding: 10px 16px;
  }

  .messages-container {
    padding: 20px 12px;
  }
}
</style>
