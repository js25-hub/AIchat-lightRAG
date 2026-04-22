export const chunkText = (text = '', options = {}) => {
    const normalizedText = String(text || '').replace(/\r\n/g, '\n').trim()
    if (!normalizedText) return []

    const maxLength = options.maxLength || 500
    const overlap = options.overlap || 80
    const chunks = []
    let start = 0
    let index = 0

    while (start < normalizedText.length) {
        let end = Math.min(start + maxLength, normalizedText.length)

        if (end < normalizedText.length) {
            const lastBreak = Math.max(
                normalizedText.lastIndexOf('\n', end),
                normalizedText.lastIndexOf('。', end),
                normalizedText.lastIndexOf('！', end),
                normalizedText.lastIndexOf('？', end),
                normalizedText.lastIndexOf('.', end),
                normalizedText.lastIndexOf('!', end),
                normalizedText.lastIndexOf('?', end),
            )

            if (lastBreak > start + Math.floor(maxLength * 0.5)) {
                end = lastBreak + 1
            }
        }

        const chunk = normalizedText.slice(start, end).trim()
        if (chunk) {
            chunks.push({
                index,
                text: chunk,
            })
            index += 1
        }

        if (end >= normalizedText.length) break
        start = Math.max(end - overlap, start + 1)
    }

    return chunks
}
