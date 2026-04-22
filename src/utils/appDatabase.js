export const DB_NAME = 'ai-chat-db'
export const DB_VERSION = 2

export const STORE_NAMES = {
    conversations: 'conversations',
    meta: 'meta',
    knowledgeBases: 'knowledgeBases',
    documents: 'documents',
    chunks: 'chunks',
}

export const META_KEYS = {
    currentConversationId: 'currentConversationId',
    currentKnowledgeBaseId: 'currentKnowledgeBaseId',
}

export const requestToPromise = (request) => {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

export const waitForTransaction = (transaction) => {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
    })
}

export const openAppDatabase = () => {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION)

        request.onupgradeneeded = () => {
            const database = request.result

            if (!database.objectStoreNames.contains(STORE_NAMES.conversations)) {
                database.createObjectStore(STORE_NAMES.conversations, { keyPath: 'id' })
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.meta)) {
                database.createObjectStore(STORE_NAMES.meta, { keyPath: 'key' })
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.knowledgeBases)) {
                database.createObjectStore(STORE_NAMES.knowledgeBases, { keyPath: 'id' })
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.documents)) {
                const documentsStore = database.createObjectStore(STORE_NAMES.documents, { keyPath: 'id' })
                documentsStore.createIndex('knowledgeBaseId', 'knowledgeBaseId', { unique: false })
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.chunks)) {
                const chunksStore = database.createObjectStore(STORE_NAMES.chunks, { keyPath: 'id' })
                chunksStore.createIndex('knowledgeBaseId', 'knowledgeBaseId', { unique: false })
                chunksStore.createIndex('documentId', 'documentId', { unique: false })
            }
        }

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}
