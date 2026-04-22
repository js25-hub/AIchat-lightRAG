import {
    META_KEYS,
    STORE_NAMES,
    openAppDatabase,
    requestToPromise,
    waitForTransaction,
} from './appDatabase'

const createId = (prefix) => {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const normalizeKnowledgeBase = (knowledgeBase = {}) => {
    return {
        id: knowledgeBase.id || createId('kb'),
        name: knowledgeBase.name || '默认知识库',
        documentCount: Number(knowledgeBase.documentCount || 0),
        chunkCount: Number(knowledgeBase.chunkCount || 0),
        createdAt: knowledgeBase.createdAt || new Date().toISOString(),
        updatedAt: knowledgeBase.updatedAt || new Date().toISOString(),
    }
}

const normalizeDocument = (document = {}) => {
    return {
        id: document.id || createId('doc'),
        knowledgeBaseId: document.knowledgeBaseId,
        fileName: document.fileName || '未命名资料',
        fileType: document.fileType || 'text/plain',
        fileSize: Number(document.fileSize || 0),
        contentText: String(document.contentText || ''),
        chunkCount: Number(document.chunkCount || 0),
        sourceType: document.sourceType || 'text',
        previewUrl: String(document.previewUrl || ''),
        metadataText: String(document.metadataText || ''),
        createdAt: document.createdAt || new Date().toISOString(),
        updatedAt: document.updatedAt || new Date().toISOString(),
    }
}

const normalizeChunk = (chunk = {}) => {
    return {
        id: chunk.id || createId('chunk'),
        knowledgeBaseId: chunk.knowledgeBaseId,
        documentId: chunk.documentId,
        documentName: chunk.documentName || '未命名资料',
        index: Number(chunk.index || 0),
        text: String(chunk.text || ''),
        sourceType: chunk.sourceType || 'text',
        fileType: chunk.fileType || 'text/plain',
        previewUrl: String(chunk.previewUrl || ''),
        metadataText: String(chunk.metadataText || ''),
        createdAt: chunk.createdAt || new Date().toISOString(),
    }
}

export const loadKnowledgeStateFromIndexedDB = async () => {
    const database = await openAppDatabase()
    const transaction = database.transaction(
        [STORE_NAMES.knowledgeBases, STORE_NAMES.meta],
        'readonly'
    )
    const knowledgeBaseStore = transaction.objectStore(STORE_NAMES.knowledgeBases)
    const metaStore = transaction.objectStore(STORE_NAMES.meta)

    const [knowledgeBases, currentRecord] = await Promise.all([
        requestToPromise(knowledgeBaseStore.getAll()),
        requestToPromise(metaStore.get(META_KEYS.currentKnowledgeBaseId)),
    ])

    await waitForTransaction(transaction)
    database.close()

    const normalizedKnowledgeBases = Array.isArray(knowledgeBases)
        ? knowledgeBases.map(normalizeKnowledgeBase).sort((left, right) => {
            return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        })
        : []

    return {
        knowledgeBases: normalizedKnowledgeBases,
        currentKnowledgeBaseId: currentRecord?.value || normalizedKnowledgeBases[0]?.id || null,
    }
}

export const saveKnowledgeStateToIndexedDB = async ({ knowledgeBases = [], currentKnowledgeBaseId = null }) => {
    const database = await openAppDatabase()
    const transaction = database.transaction(
        [STORE_NAMES.knowledgeBases, STORE_NAMES.meta],
        'readwrite'
    )
    const knowledgeBaseStore = transaction.objectStore(STORE_NAMES.knowledgeBases)
    const metaStore = transaction.objectStore(STORE_NAMES.meta)

    knowledgeBaseStore.clear()
    knowledgeBases.forEach((knowledgeBase) => {
        knowledgeBaseStore.put(normalizeKnowledgeBase(knowledgeBase))
    })

    metaStore.put({
        key: META_KEYS.currentKnowledgeBaseId,
        value: currentKnowledgeBaseId,
    })

    await waitForTransaction(transaction)
    database.close()
}

export const createKnowledgeBaseRecord = ({ id, name = '默认知识库' } = {}) => {
    return normalizeKnowledgeBase({
        id,
        name,
        documentCount: 0,
        chunkCount: 0,
    })
}

export const loadDocumentsByKnowledgeBase = async (knowledgeBaseId) => {
    if (!knowledgeBaseId) return []

    const database = await openAppDatabase()
    const transaction = database.transaction([STORE_NAMES.documents], 'readonly')
    const documentStore = transaction.objectStore(STORE_NAMES.documents)
    const request = documentStore.index('knowledgeBaseId').getAll(knowledgeBaseId)
    const documents = await requestToPromise(request)

    await waitForTransaction(transaction)
    database.close()

    return Array.isArray(documents)
        ? documents.map(normalizeDocument).sort((left, right) => {
            return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        })
        : []
}

export const loadChunksByKnowledgeBase = async (knowledgeBaseId) => {
    if (!knowledgeBaseId) return []

    const database = await openAppDatabase()
    const transaction = database.transaction([STORE_NAMES.chunks], 'readonly')
    const chunkStore = transaction.objectStore(STORE_NAMES.chunks)
    const request = chunkStore.index('knowledgeBaseId').getAll(knowledgeBaseId)
    const chunks = await requestToPromise(request)

    await waitForTransaction(transaction)
    database.close()

    return Array.isArray(chunks)
        ? chunks.map(normalizeChunk).sort((left, right) => left.index - right.index)
        : []
}

export const addDocumentWithChunks = async ({
    knowledgeBase,
    file,
    contentText,
    chunks,
    sourceType = 'text',
    previewUrl = '',
    metadataText = '',
}) => {
    const normalizedKnowledgeBase = normalizeKnowledgeBase(knowledgeBase)
    const createdAt = new Date().toISOString()
    const documentId = createId('doc')
    const normalizedDocument = normalizeDocument({
        id: documentId,
        knowledgeBaseId: normalizedKnowledgeBase.id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        contentText,
        chunkCount: chunks.length,
        sourceType,
        previewUrl,
        metadataText,
        createdAt,
        updatedAt: createdAt,
    })

    const normalizedChunks = chunks.map((chunk, index) => normalizeChunk({
        id: createId('chunk'),
        knowledgeBaseId: normalizedKnowledgeBase.id,
        documentId,
        documentName: file.name,
        index,
        text: chunk.text,
        sourceType,
        fileType: file.type,
        previewUrl,
        metadataText,
        createdAt,
    }))

    const nextKnowledgeBase = normalizeKnowledgeBase({
        ...normalizedKnowledgeBase,
        documentCount: normalizedKnowledgeBase.documentCount + 1,
        chunkCount: normalizedKnowledgeBase.chunkCount + normalizedChunks.length,
        updatedAt: createdAt,
    })

    const database = await openAppDatabase()
    const transaction = database.transaction(
        [STORE_NAMES.knowledgeBases, STORE_NAMES.documents, STORE_NAMES.chunks],
        'readwrite'
    )

    transaction.objectStore(STORE_NAMES.knowledgeBases).put(nextKnowledgeBase)
    transaction.objectStore(STORE_NAMES.documents).put(normalizedDocument)
    const chunkStore = transaction.objectStore(STORE_NAMES.chunks)
    normalizedChunks.forEach((chunk) => {
        chunkStore.put(chunk)
    })

    await waitForTransaction(transaction)
    database.close()

    return {
        knowledgeBase: nextKnowledgeBase,
        document: normalizedDocument,
        chunks: normalizedChunks,
    }
}

export const deleteDocumentFromKnowledgeBase = async ({ knowledgeBase, documentId }) => {
    const database = await openAppDatabase()
    const transaction = database.transaction(
        [STORE_NAMES.knowledgeBases, STORE_NAMES.documents, STORE_NAMES.chunks],
        'readwrite'
    )
    const documentStore = transaction.objectStore(STORE_NAMES.documents)
    const chunkStore = transaction.objectStore(STORE_NAMES.chunks)

    const documentRecord = await requestToPromise(documentStore.get(documentId))
    const relatedChunks = await requestToPromise(chunkStore.index('documentId').getAll(documentId))

    if (documentRecord) {
        documentStore.delete(documentId)
    }

    relatedChunks.forEach((chunk) => {
        chunkStore.delete(chunk.id)
    })

    if (knowledgeBase) {
        transaction.objectStore(STORE_NAMES.knowledgeBases).put(normalizeKnowledgeBase({
            ...knowledgeBase,
            documentCount: Math.max(0, knowledgeBase.documentCount - (documentRecord ? 1 : 0)),
            chunkCount: Math.max(0, knowledgeBase.chunkCount - relatedChunks.length),
            updatedAt: new Date().toISOString(),
        }))
    }

    await waitForTransaction(transaction)
    database.close()
}

export const clearKnowledgeBaseContents = async (knowledgeBase) => {
    if (!knowledgeBase?.id) return normalizeKnowledgeBase(knowledgeBase)

    const database = await openAppDatabase()
    const transaction = database.transaction(
        [STORE_NAMES.knowledgeBases, STORE_NAMES.documents, STORE_NAMES.chunks],
        'readwrite'
    )
    const documentStore = transaction.objectStore(STORE_NAMES.documents)
    const chunkStore = transaction.objectStore(STORE_NAMES.chunks)
    const documents = await requestToPromise(documentStore.index('knowledgeBaseId').getAll(knowledgeBase.id))
    const chunks = await requestToPromise(chunkStore.index('knowledgeBaseId').getAll(knowledgeBase.id))

    documents.forEach((document) => {
        documentStore.delete(document.id)
    })

    chunks.forEach((chunk) => {
        chunkStore.delete(chunk.id)
    })

    const nextKnowledgeBase = normalizeKnowledgeBase({
        ...knowledgeBase,
        documentCount: 0,
        chunkCount: 0,
        updatedAt: new Date().toISOString(),
    })

    transaction.objectStore(STORE_NAMES.knowledgeBases).put(nextKnowledgeBase)

    await waitForTransaction(transaction)
    database.close()

    return nextKnowledgeBase
}

export const deleteKnowledgeBaseCascade = async (knowledgeBaseId) => {
    if (!knowledgeBaseId) return

    const database = await openAppDatabase()
    const transaction = database.transaction(
        [STORE_NAMES.knowledgeBases, STORE_NAMES.documents, STORE_NAMES.chunks, STORE_NAMES.meta],
        'readwrite'
    )
    const knowledgeBaseStore = transaction.objectStore(STORE_NAMES.knowledgeBases)
    const documentStore = transaction.objectStore(STORE_NAMES.documents)
    const chunkStore = transaction.objectStore(STORE_NAMES.chunks)
    const metaStore = transaction.objectStore(STORE_NAMES.meta)

    const documents = await requestToPromise(documentStore.index('knowledgeBaseId').getAll(knowledgeBaseId))
    const chunks = await requestToPromise(chunkStore.index('knowledgeBaseId').getAll(knowledgeBaseId))

    documents.forEach((document) => {
        documentStore.delete(document.id)
    })

    chunks.forEach((chunk) => {
        chunkStore.delete(chunk.id)
    })

    knowledgeBaseStore.delete(knowledgeBaseId)

    const currentRecord = await requestToPromise(metaStore.get(META_KEYS.currentKnowledgeBaseId))
    if (currentRecord?.value === knowledgeBaseId) {
        metaStore.put({
            key: META_KEYS.currentKnowledgeBaseId,
            value: null,
        })
    }

    await waitForTransaction(transaction)
    database.close()
}
