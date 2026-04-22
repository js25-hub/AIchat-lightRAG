const HAN_SEGMENT_PATTERN = /[\u4e00-\u9fff]+/g
const WORD_PATTERN = /[a-z0-9_]{2,}/gi
const VISUAL_QUERY_PATTERN = /(图片|照片|图像|截图|界面|海报|表格|流程图|logo|图标|视觉|页面|画面)/i

const unique = (items) => Array.from(new Set(items))

const clamp = (value, min, max) => {
    return Math.min(Math.max(value, min), max)
}

const normalizeText = (text = '') => {
    return String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
}

const buildSearchText = (chunk = {}) => {
    return [
        chunk.documentName,
        chunk.text,
        chunk.metadataText,
    ].filter(Boolean).join('\n')
}

const countMatches = (haystack = '', needles = []) => {
    return needles.reduce((score, token) => {
        if (!token) return score
        return haystack.includes(token) ? score + 1 : score
    }, 0)
}

const buildFrequencyMap = (tokens = []) => {
    return tokens.reduce((map, token) => {
        map[token] = (map[token] || 0) + 1
        return map
    }, {})
}

const vectorLength = (vector = {}) => {
    return Math.sqrt(
        Object.values(vector).reduce((sum, value) => sum + value * value, 0)
    )
}

const cosineSimilarity = (leftVector = {}, rightVector = {}) => {
    const leftKeys = Object.keys(leftVector)
    const rightKeys = Object.keys(rightVector)
    if (!leftKeys.length || !rightKeys.length) return 0

    const [shorterKeys, targetVector, otherVector] = leftKeys.length <= rightKeys.length
        ? [leftKeys, leftVector, rightVector]
        : [rightKeys, rightVector, leftVector]

    const dotProduct = shorterKeys.reduce((sum, key) => {
        return sum + (targetVector[key] || 0) * (otherVector[key] || 0)
    }, 0)

    const leftLength = vectorLength(leftVector)
    const rightLength = vectorLength(rightVector)
    if (!leftLength || !rightLength) return 0

    return dotProduct / (leftLength * rightLength)
}

export const tokenizeText = (text = '') => {
    const normalizedText = normalizeText(text)
    const tokens = []

    const words = normalizedText.match(WORD_PATTERN) || []
    tokens.push(...words)

    const hanSegments = normalizedText.match(HAN_SEGMENT_PATTERN) || []
    hanSegments.forEach((segment) => {
        if (segment.length <= 2) {
            tokens.push(segment)
            return
        }

        for (let index = 0; index < segment.length - 1; index += 1) {
            tokens.push(segment.slice(index, index + 2))
        }
    })

    return unique(tokens)
}

const buildSparseVector = (text = '') => {
    const tokens = tokenizeText(text)
    const frequencyMap = buildFrequencyMap(tokens)

    return Object.entries(frequencyMap).reduce((vector, [token, frequency]) => {
        vector[token] = 1 + Math.log1p(frequency)
        return vector
    }, {})
}

export const scoreKeywordMatch = (query, chunk) => {
    const queryText = normalizeText(query)
    const chunkText = normalizeText(buildSearchText(chunk))
    if (!queryText || !chunkText) return 0

    const queryTokens = tokenizeText(queryText)
    const chunkTokens = tokenizeText(chunkText)
    const chunkTokenSet = new Set(chunkTokens)

    let overlapScore = 0
    queryTokens.forEach((token) => {
        if (chunkTokenSet.has(token)) {
            overlapScore += token.length >= 4 ? 2.5 : 1.2
        }
    })

    const phraseBonus = chunkText.includes(queryText) ? 10 : 0
    const looseMatchBonus = countMatches(chunkText, queryTokens.slice(0, 10))
    const titleText = normalizeText(chunk?.documentName || '')
    const titleBonus = titleText
        ? countMatches(titleText, queryTokens) * 1.8 + (titleText.includes(queryText) ? 4 : 0)
        : 0

    return overlapScore + phraseBonus + looseMatchBonus + titleBonus
}

export const scoreVectorSimilarity = (query, chunk) => {
    const queryVector = buildSparseVector(query)
    const chunkVector = buildSparseVector(buildSearchText(chunk))
    return cosineSimilarity(queryVector, chunkVector)
}

const hasVisualIntent = (query = '') => {
    return VISUAL_QUERY_PATTERN.test(String(query || ''))
}

const rerankChunk = (query, chunk) => {
    const keywordScore = Number(chunk.keywordScore || 0)
    const vectorScore = Number(chunk.vectorScore || 0)
    const queryTokens = tokenizeText(query)
    const searchText = normalizeText(buildSearchText(chunk))
    const matchedTokenCount = queryTokens.filter((token) => searchText.includes(token)).length
    const coverageRatio = queryTokens.length ? matchedTokenCount / queryTokens.length : 0
    const coverageBonus = coverageRatio * 6
    const exactBonus = searchText.includes(normalizeText(query)) ? 4 : 0
    const titleBonus = normalizeText(chunk.documentName || '').includes(normalizeText(query)) ? 3 : 0
    const imageIntentBonus = chunk.sourceType === 'image' && hasVisualIntent(query) ? 2.5 : 0

    return keywordScore * 0.55 + vectorScore * 18 + coverageBonus + exactBonus + titleBonus + imageIntentBonus
}

export const retrieveTopChunks = ({
    query,
    chunks = [],
    topK = 6,
    candidateK = 14,
    minKeywordScore = 2,
    minVectorScore = 0.12,
}) => {
    const queryText = String(query || '').trim()
    if (!queryText) return []

    const scoredChunks = chunks.map((chunk) => {
        const keywordScore = scoreKeywordMatch(queryText, chunk)
        const vectorScore = scoreVectorSimilarity(queryText, chunk)

        return {
            ...chunk,
            keywordScore,
            vectorScore,
        }
    })

    const keywordCandidates = scoredChunks
        .filter((chunk) => chunk.keywordScore >= minKeywordScore)
        .sort((left, right) => right.keywordScore - left.keywordScore)
        .slice(0, candidateK)

    const vectorCandidates = scoredChunks
        .filter((chunk) => chunk.vectorScore >= minVectorScore)
        .sort((left, right) => right.vectorScore - left.vectorScore)
        .slice(0, candidateK)

    const mergedMap = new Map()
    ;[...keywordCandidates, ...vectorCandidates].forEach((chunk) => {
        const previous = mergedMap.get(chunk.id)
        if (!previous || (chunk.keywordScore + chunk.vectorScore) > (previous.keywordScore + previous.vectorScore)) {
            mergedMap.set(chunk.id, chunk)
        }
    })

    return Array.from(mergedMap.values())
        .map((chunk) => {
            const rerankScore = rerankChunk(queryText, chunk)

            return {
                ...chunk,
                score: rerankScore,
                keywordScore: Number(chunk.keywordScore.toFixed(4)),
                vectorScore: Number(chunk.vectorScore.toFixed(4)),
                rerankScore: Number(rerankScore.toFixed(4)),
            }
        })
        .filter((chunk) => chunk.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, topK)
}

export const collectRetrievedImages = (retrievedChunks = [], options = {}) => {
    const limit = options.limit || 2
    const dedupedImages = []
    const seenDocumentIds = new Set()

    retrievedChunks.forEach((chunk) => {
        if (dedupedImages.length >= limit) return
        if (chunk.sourceType !== 'image' || !chunk.previewUrl) return
        if (seenDocumentIds.has(chunk.documentId)) return

        seenDocumentIds.add(chunk.documentId)
        dedupedImages.push({
            documentId: chunk.documentId,
            documentName: chunk.documentName,
            previewUrl: chunk.previewUrl,
            text: chunk.text,
            rerankScore: chunk.rerankScore || chunk.score || 0,
        })
    })

    return dedupedImages
}

export const buildRagPromptContext = (retrievedChunks = []) => {
    if (!retrievedChunks.length) return ''

    const references = retrievedChunks.map((chunk, index) => {
        const title = chunk.documentName || '未命名资料'
        const modality = chunk.sourceType === 'image' ? '图片资料' : '文本资料'
        return [
            `[参考${index + 1}] ${modality}：${title}`,
            `关键词召回分：${chunk.keywordScore}，向量召回分：${chunk.vectorScore}，重排分：${chunk.rerankScore}`,
            chunk.text,
        ].join('\n')
    })

    return [
        '以下内容来自本地知识库的混合检索结果，已经过关键词召回、向量召回和重排。',
        '请优先依据这些参考信息回答；如果参考内容不足，请明确说明。',
        ...references,
    ].join('\n\n')
}

export const buildRagSystemPrompt = (retrievedChunks = []) => {
    const ragContext = buildRagPromptContext(retrievedChunks)
    if (!ragContext) return ''

    return [
        ragContext,
        '回答要求：',
        '1. 优先基于知识库参考内容作答。',
        '2. 不要编造知识库中不存在的事实。',
        '3. 如果用户问题与参考内容部分相关，可以结合常识补充，但要区分参考依据与常识推断。',
    ].join('\n\n')
}

export const buildMultimodalRagUserMessage = (userMessage, retrievedChunks = [], options = {}) => {
    const detail = options.detail || 'low'
    const retrievedImages = collectRetrievedImages(retrievedChunks, {
        limit: options.imageLimit || 2,
    })

    if (!retrievedImages.length) {
        return userMessage
    }

    const originalContent = Array.isArray(userMessage?.content) ? userMessage.content : []
    const existingImages = originalContent.filter((item) => item.type === 'image_url')
    const existingTexts = originalContent.filter((item) => item.type === 'text')
    const originalText = existingTexts.map((item) => item.text).join('\n').trim()
    const ragContext = buildRagPromptContext(retrievedChunks)

    const knowledgeImageItems = retrievedImages.map((image) => ({
        type: 'image_url',
        image_url: {
            url: image.previewUrl,
            detail,
        },
    }))

    const mergedText = [
        originalText,
        '[知识库补充说明]',
        '下面附加了从本地知识库检索到的文本参考和图片参考，请结合这些内容回答。',
        ragContext,
    ].filter(Boolean).join('\n\n')

    return {
        role: 'user',
        content: [
            ...existingImages,
            ...knowledgeImageItems,
            {
                type: 'text',
                text: mergedText,
            },
        ],
    }
}

export const shouldUseMultimodalRag = (retrievedChunks = []) => {
    return collectRetrievedImages(retrievedChunks, { limit: 1 }).length > 0
}

export const summarizeRagResult = (retrievedChunks = []) => {
    if (!retrievedChunks.length) return '未命中知识库参考'

    const imageCount = retrievedChunks.filter((chunk) => chunk.sourceType === 'image').length
    const textCount = retrievedChunks.length - imageCount

    return `命中 ${retrievedChunks.length} 条参考（文本 ${textCount}，图片 ${imageCount}）`
}

export const normalizeRetrievalConfidence = (retrievedChunks = []) => {
    if (!retrievedChunks.length) return 0

    const topScore = Number(retrievedChunks[0]?.rerankScore || retrievedChunks[0]?.score || 0)
    return clamp(topScore / 20, 0, 1)
}
