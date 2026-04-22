import { defineStore } from 'pinia'
import {
    createConversationRecord,
    createEmptyTokenCount,
    loadChatStateFromIndexedDB,
    migrateLegacyChatState,
    saveChatStateToIndexedDB,
} from '../utils/chatStorage'

const createConversationId = () => {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useChatStore = defineStore('chat', {
    state: () => ({
        conversations: [],
        currentConversationId: null,
        messages: [],
        isLoading: false,
        isInitialized: false,
        tokenCount: createEmptyTokenCount(),
    }),

    actions: {
        async initConversations() {
            if (this.isInitialized) return

            const migratedState = await migrateLegacyChatState()
            const storedState = migratedState || await loadChatStateFromIndexedDB()

            this.conversations = Array.isArray(storedState.conversations)
                ? storedState.conversations
                : []

            if (this.conversations.length === 0) {
                const id = this.createConversationId()
                this.conversations = [
                    createConversationRecord({
                        id,
                        title: '新对话',
                    }),
                ]
                this.currentConversationId = id
                this.messages = []
                this.tokenCount = createEmptyTokenCount()
                this.isInitialized = true
                await this.persistChatState()
                return
            }

            const hasCurrentConversation = this.conversations.some(
                (item) => item.id === storedState.currentConversationId
            )

            this.currentConversationId = hasCurrentConversation
                ? storedState.currentConversationId
                : this.conversations[0].id

            this.applyCurrentConversation()
            this.isInitialized = true
            await this.persistChatState()
        },

        createConversationId() {
            return createConversationId()
        },

        getCurrentConversation() {
            return this.conversations.find((item) => item.id === this.currentConversationId)
        },

        applyCurrentConversation() {
            const activeConversation = this.getCurrentConversation()
            this.messages = activeConversation?.messages || []
            this.tokenCount = activeConversation?.tokenCount || createEmptyTokenCount()
        },

        generateConversationTitle(messages = []) {
            const firstUserMessage = messages.find((message) => message.role === 'user')
            let content = firstUserMessage?.content || ''

            if (typeof content === 'object') {
                content = content.text || '图片对话'
            }

            const title = String(content).replace(/\s+/g, ' ').trim()
            return title ? title.slice(0, 24) : '新对话'
        },

        async persistChatState() {
            await saveChatStateToIndexedDB({
                conversations: this.conversations,
                currentConversationId: this.currentConversationId,
            })
        },

        syncCurrentConversation() {
            const current = this.getCurrentConversation()
            if (!current) return

            current.messages = this.messages
            current.tokenCount = { ...this.tokenCount }
            current.title = this.generateConversationTitle(this.messages)
            current.updatedAt = new Date().toISOString()

            void this.persistChatState()
        },

        createConversation() {
            this.syncCurrentConversation()

            const id = this.createConversationId()
            const conversation = createConversationRecord({
                id,
                title: '新对话',
            })

            this.conversations.unshift(conversation)
            this.currentConversationId = id
            this.messages = conversation.messages
            this.tokenCount = { ...conversation.tokenCount }
            void this.persistChatState()
        },

        switchConversation(id) {
            if (this.currentConversationId === id) return

            this.syncCurrentConversation()
            const target = this.conversations.find((item) => item.id === id)
            if (!target) return

            this.currentConversationId = id
            this.applyCurrentConversation()
            void this.persistChatState()
        },

        deleteConversation(id) {
            this.conversations = this.conversations.filter((item) => item.id !== id)

            if (this.conversations.length === 0) {
                this.currentConversationId = null
                this.messages = []
                this.tokenCount = createEmptyTokenCount()
                this.createConversation()
                return
            }

            if (this.currentConversationId === id) {
                this.currentConversationId = this.conversations[0].id
                this.applyCurrentConversation()
            }

            void this.persistChatState()
        },

        addMessage(message) {
            this.messages.push({
                ...message,
                id: this.createConversationId(),
                timestamp: new Date().toISOString(),
            })
            this.syncCurrentConversation()
        },

        updateLastMessage(content) {
            if (this.messages.length === 0) return

            const lastMessage = this.messages[this.messages.length - 1]
            lastMessage.content = content
            this.syncCurrentConversation()
        },

        updateLastMessageRagInfo(ragInfo) {
            if (this.messages.length === 0) return

            const lastMessage = this.messages[this.messages.length - 1]
            lastMessage.ragInfo = ragInfo || null
            this.syncCurrentConversation()
        },

        updateTokenCount(usage) {
            this.tokenCount.prompt += usage.prompt_tokens
            this.tokenCount.completion += usage.completion_tokens
            this.tokenCount.total += usage.total_tokens
            this.syncCurrentConversation()
        },

        clearMessages() {
            this.messages = []
            this.tokenCount = createEmptyTokenCount()
            this.syncCurrentConversation()
        },
    },
})
