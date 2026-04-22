import { defineStore } from 'pinia'
import { useSettingsStore, isVLMModelValue } from './settings'
import {
    addDocumentWithChunks,
    clearKnowledgeBaseContents,
    createKnowledgeBaseRecord,
    deleteDocumentFromKnowledgeBase,
    deleteKnowledgeBaseCascade,
    loadChunksByKnowledgeBase,
    loadDocumentsByKnowledgeBase,
    loadKnowledgeStateFromIndexedDB,
    saveKnowledgeStateToIndexedDB,
} from '../utils/ragStorage'
import { chunkText } from '../utils/textChunker'
import { checkDocumentSize, isSupportedDocument, readDocumentAsText } from '../utils/documentUtils'
import {
    checkImageSize,
    describeImageForKnowledge,
    isImageFile,
    isValidImageFormat,
    readImageAsDataUrl,
} from '../utils/imageUtils'
import { retrieveTopChunks } from '../utils/retriever'

const buildTextChunks = (contentText) => {
    return chunkText(contentText, {
        maxLength: 500,
        overlap: 80,
    })
}

const buildImageChunks = (contentText) => {
    return chunkText(contentText, {
        maxLength: 320,
        overlap: 40,
    })
}

export const useKnowledgeStore = defineStore('knowledge', {
    state: () => ({
        knowledgeBases: [],
        currentKnowledgeBaseId: null,
        documents: [],
        chunks: [],
        isInitialized: false,
    }),

    getters: {
        activeKnowledgeBase(state) {
            return state.knowledgeBases.find((item) => item.id === state.currentKnowledgeBaseId) || null
        },
        hasKnowledgeChunks(state) {
            return state.chunks.length > 0
        },
    },

    actions: {
        async initKnowledgeBases() {
            if (this.isInitialized) return

            const storedState = await loadKnowledgeStateFromIndexedDB()
            this.knowledgeBases = storedState.knowledgeBases || []

            if (this.knowledgeBases.length === 0) {
                const defaultKnowledgeBase = createKnowledgeBaseRecord({
                    name: '默认知识库',
                })
                this.knowledgeBases = [defaultKnowledgeBase]
                this.currentKnowledgeBaseId = defaultKnowledgeBase.id
                this.documents = []
                this.chunks = []
                this.isInitialized = true
                await this.persistKnowledgeState()
                return
            }

            const hasCurrentKnowledgeBase = this.knowledgeBases.some(
                (item) => item.id === storedState.currentKnowledgeBaseId
            )

            this.currentKnowledgeBaseId = hasCurrentKnowledgeBase
                ? storedState.currentKnowledgeBaseId
                : this.knowledgeBases[0].id

            await this.loadActiveKnowledgeBaseData()
            this.isInitialized = true
            await this.persistKnowledgeState()
        },

        async persistKnowledgeState() {
            await saveKnowledgeStateToIndexedDB({
                knowledgeBases: this.knowledgeBases,
                currentKnowledgeBaseId: this.currentKnowledgeBaseId,
            })
        },

        async loadActiveKnowledgeBaseData() {
            if (!this.currentKnowledgeBaseId) {
                this.documents = []
                this.chunks = []
                return
            }

            const [documents, chunks] = await Promise.all([
                loadDocumentsByKnowledgeBase(this.currentKnowledgeBaseId),
                loadChunksByKnowledgeBase(this.currentKnowledgeBaseId),
            ])

            this.documents = documents
            this.chunks = chunks
        },

        async createKnowledgeBase(name) {
            const knowledgeBase = createKnowledgeBaseRecord({
                name: String(name || '').trim() || '新知识库',
            })

            this.knowledgeBases.unshift(knowledgeBase)
            this.currentKnowledgeBaseId = knowledgeBase.id
            this.documents = []
            this.chunks = []
            await this.persistKnowledgeState()
        },

        async switchKnowledgeBase(id) {
            if (this.currentKnowledgeBaseId === id) return

            this.currentKnowledgeBaseId = id
            await this.loadActiveKnowledgeBaseData()
            await this.persistKnowledgeState()
        },

        async deleteKnowledgeBase(id) {
            await deleteKnowledgeBaseCascade(id)
            this.knowledgeBases = this.knowledgeBases.filter((item) => item.id !== id)

            if (this.knowledgeBases.length === 0) {
                const defaultKnowledgeBase = createKnowledgeBaseRecord({
                    name: '默认知识库',
                })
                this.knowledgeBases = [defaultKnowledgeBase]
                this.currentKnowledgeBaseId = defaultKnowledgeBase.id
            } else if (this.currentKnowledgeBaseId === id) {
                this.currentKnowledgeBaseId = this.knowledgeBases[0].id
            }

            await this.loadActiveKnowledgeBaseData()
            await this.persistKnowledgeState()
        },

        async rebuildKnowledgeBase() {
            const knowledgeBase = this.activeKnowledgeBase
            if (!knowledgeBase) return

            const nextKnowledgeBase = await clearKnowledgeBaseContents(knowledgeBase)
            const knowledgeBaseIndex = this.knowledgeBases.findIndex(
                (item) => item.id === nextKnowledgeBase.id
            )

            if (knowledgeBaseIndex !== -1) {
                this.knowledgeBases.splice(knowledgeBaseIndex, 1, nextKnowledgeBase)
            }

            this.documents = []
            this.chunks = []
            await this.persistKnowledgeState()
        },

        async importDocuments(files = []) {
            const knowledgeBase = this.activeKnowledgeBase
            if (!knowledgeBase) {
                throw new Error('请先创建或选择一个知识库')
            }

            const settingsStore = useSettingsStore()
            const canAnalyzeImage =
                Boolean(settingsStore.apiKey) &&
                isVLMModelValue(settingsStore.model)
            const importedDocuments = []

            for (const file of files) {
                const imageFile = isImageFile(file)

                if (imageFile) {
                    if (!isValidImageFormat(file)) {
                        throw new Error(`暂不支持该图片格式：${file.name}`)
                    }

                    if (!checkImageSize(file)) {
                        throw new Error(`图片过大，请选择小于 10MB 的文件：${file.name}`)
                    }

                    const previewUrl = await readImageAsDataUrl(file)
                    const contentText = await describeImageForKnowledge(file, {
                        enableVisionAnalysis: canAnalyzeImage,
                        detail: 'low',
                    })
                    const chunks = buildImageChunks(contentText)

                    const result = await addDocumentWithChunks({
                        knowledgeBase: this.activeKnowledgeBase,
                        file,
                        contentText,
                        chunks,
                        sourceType: 'image',
                        previewUrl,
                        metadataText: contentText,
                    })

                    const knowledgeBaseIndex = this.knowledgeBases.findIndex(
                        (item) => item.id === result.knowledgeBase.id
                    )
                    if (knowledgeBaseIndex !== -1) {
                        this.knowledgeBases.splice(knowledgeBaseIndex, 1, result.knowledgeBase)
                    }

                    importedDocuments.push(result.document)
                    continue
                }

                if (!isSupportedDocument(file)) {
                    throw new Error(`暂不支持该文档格式：${file.name}`)
                }

                if (!checkDocumentSize(file)) {
                    throw new Error(`文档过大，请选择小于 10MB 的文件：${file.name}`)
                }

                const contentText = await readDocumentAsText(file)
                const chunks = buildTextChunks(contentText)

                if (!chunks.length) {
                    throw new Error(`文档内容为空或无法切片：${file.name}`)
                }

                const result = await addDocumentWithChunks({
                    knowledgeBase: this.activeKnowledgeBase,
                    file,
                    contentText,
                    chunks,
                    sourceType: 'text',
                    metadataText: contentText,
                })

                const knowledgeBaseIndex = this.knowledgeBases.findIndex(
                    (item) => item.id === result.knowledgeBase.id
                )
                if (knowledgeBaseIndex !== -1) {
                    this.knowledgeBases.splice(knowledgeBaseIndex, 1, result.knowledgeBase)
                }

                importedDocuments.push(result.document)
            }

            await this.loadActiveKnowledgeBaseData()
            await this.persistKnowledgeState()

            return importedDocuments
        },

        async deleteDocument(documentId) {
            const knowledgeBase = this.activeKnowledgeBase
            if (!knowledgeBase) return

            await deleteDocumentFromKnowledgeBase({
                knowledgeBase,
                documentId,
            })

            const currentKnowledgeBase = this.knowledgeBases.find(
                (item) => item.id === knowledgeBase.id
            )
            if (currentKnowledgeBase) {
                currentKnowledgeBase.documentCount = Math.max(0, currentKnowledgeBase.documentCount - 1)
                const targetDocument = this.documents.find((item) => item.id === documentId)
                currentKnowledgeBase.chunkCount = Math.max(
                    0,
                    currentKnowledgeBase.chunkCount - Number(targetDocument?.chunkCount || 0)
                )
                currentKnowledgeBase.updatedAt = new Date().toISOString()
            }

            await this.loadActiveKnowledgeBaseData()
            await this.persistKnowledgeState()
        },

        retrieveRelevantChunks(query, options = {}) {
            return retrieveTopChunks({
                query,
                chunks: this.chunks,
                topK: options.topK || 6,
                candidateK: options.candidateK || 14,
                minKeywordScore: options.minKeywordScore || 2,
                minVectorScore: options.minVectorScore || 0.12,
            })
        },
    },
})
