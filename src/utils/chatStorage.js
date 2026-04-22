import {
    META_KEYS,
    STORE_NAMES,
    openAppDatabase,
    requestToPromise,
    waitForTransaction,
} from './appDatabase'

const LEGACY_STORAGE_KEY = 'ai-chat-history'

const normalizeTokenCount = (tokenCount = {}) => {
    return {
        total: Number(tokenCount.total || 0),
        prompt: Number(tokenCount.prompt || 0),
        completion: Number(tokenCount.completion || 0),
    }
}

const normalizeRagInfo = (ragInfo = null) => {
    if (!ragInfo || typeof ragInfo !== 'object') return null

    return {
        hit: Boolean(ragInfo.hit),
        referenceCount: Number(ragInfo.referenceCount || 0),
        knowledgeBaseName: String(ragInfo.knowledgeBaseName || ''),
        mode: String(ragInfo.mode || ''),
    }
}

const normalizeMessage = (message = {}) => {
    return {
        id: message.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: message.role || 'assistant',
        content: message.content ?? '',
        hasImage: Boolean(message.hasImage),
        loading: Boolean(message.loading),
        ragInfo: normalizeRagInfo(message.ragInfo),
        timestamp: message.timestamp || new Date().toISOString(),
    }
}

const normalizeConversation = (conversation = {}) => {
    return {
        id: conversation.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: conversation.title || '新对话',
        messages: Array.isArray(conversation.messages)
            ? conversation.messages.map(normalizeMessage)
            : [],
        tokenCount: normalizeTokenCount(conversation.tokenCount),
        createdAt: conversation.createdAt || new Date().toISOString(),
        updatedAt: conversation.updatedAt || new Date().toISOString(),
    }
}

export const loadChatStateFromIndexedDB = async () => {
    const database = await openAppDatabase()
    const transaction = database.transaction([STORE_NAMES.conversations, STORE_NAMES.meta], 'readonly')
    const conversationsStore = transaction.objectStore(STORE_NAMES.conversations)
    const metaStore = transaction.objectStore(STORE_NAMES.meta)

    const [conversations, currentConversationRecord] = await Promise.all([
        requestToPromise(conversationsStore.getAll()),
        requestToPromise(metaStore.get(META_KEYS.currentConversationId)),
    ])

    await waitForTransaction(transaction)
    database.close()

    const normalizedConversations = Array.isArray(conversations)
        ? conversations.map(normalizeConversation).sort((left, right) => {
            return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        })
        : []

    return {
        conversations: normalizedConversations,
        currentConversationId: currentConversationRecord?.value || normalizedConversations[0]?.id || null,
    }
}

export const saveChatStateToIndexedDB = async ({ conversations = [], currentConversationId = null }) => {
    const database = await openAppDatabase()
    const transaction = database.transaction([STORE_NAMES.conversations, STORE_NAMES.meta], 'readwrite')
    const conversationsStore = transaction.objectStore(STORE_NAMES.conversations)
    const metaStore = transaction.objectStore(STORE_NAMES.meta)

    conversationsStore.clear()

    conversations.forEach((conversation) => {
        conversationsStore.put(normalizeConversation(conversation))
    })

    metaStore.put({
        key: META_KEYS.currentConversationId,
        value: currentConversationId,
    })

    await waitForTransaction(transaction)
    database.close()
}

export const migrateLegacyChatState = async () => {
    const rawValue = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!rawValue) return null

    try {
        const legacyState = JSON.parse(rawValue)
        const conversations = Array.isArray(legacyState?.conversations)
            ? legacyState.conversations.map(normalizeConversation)
            : []

        const migratedState = {
            conversations,
            currentConversationId: legacyState?.currentConversationId || conversations[0]?.id || null,
        }

        await saveChatStateToIndexedDB(migratedState)
        window.localStorage.removeItem(LEGACY_STORAGE_KEY)

        return migratedState
    } catch (error) {
        console.error('迁移旧聊天记录失败:', error)
        return null
    }
}

export const createEmptyTokenCount = () => {
    return {
        total: 0,
        prompt: 0,
        completion: 0,
    }
}

export const createConversationRecord = ({ id, title = '新对话', messages = [], tokenCount, createdAt, updatedAt }) => {
    return normalizeConversation({
        id,
        title,
        messages,
        tokenCount: tokenCount || createEmptyTokenCount(),
        createdAt: createdAt || new Date().toISOString(),
        updatedAt: updatedAt || new Date().toISOString(),
    })
}
