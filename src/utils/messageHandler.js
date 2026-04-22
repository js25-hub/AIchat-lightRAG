export const messageHandler = {
    formatMessage(role, content, options = {}) {
        let hasImage = false
        let displayContent = content

        if (typeof content === 'object' && content.content) {
            hasImage = content.content.some((item) => item.type === 'image_url')

            const textItems = content.content.filter((item) => item.type === 'text')
            displayContent = textItems.map((item) => item.text).join('\n')

            const imageItems = content.content.filter((item) => item.type === 'image_url')
            if (imageItems.length > 0) {
                displayContent = {
                    text: displayContent,
                    images: imageItems.map((item) => item.image_url.url),
                }
            }
        } else if (typeof content === 'string') {
            hasImage = content.includes('![') && content.includes('](data:image/')
            displayContent = content
        }

        return {
            id: Date.now(),
            role,
            content: displayContent,
            hasImage,
            loading: false,
            ragInfo: options.ragInfo || null,
        }
    },

    async processStreamResponse(response, { updateMessage, updateTokenCount }) {
        try {
            let fullResponse = ''
            const reader = response.body.getReader()
            const decoder = new TextDecoder()

            while (true) {
                const { done, value } = await reader.read()
                if (done) {
                    break
                }

                const chunk = decoder.decode(value)
                const lines = chunk.split('\n').filter((line) => line.trim() !== '')

                for (const line of lines) {
                    if (!line.includes('data: ')) continue

                    const jsonStr = line.replace('data: ', '')
                    if (jsonStr === '[DONE]') {
                        continue
                    }

                    try {
                        const jsData = JSON.parse(jsonStr)
                        if (jsData.choices?.[0]?.delta?.content) {
                            fullResponse += jsData.choices[0].delta.content
                            updateMessage(fullResponse)
                        }

                        if (jsData.usage) {
                            updateTokenCount(jsData.usage)
                        }
                    } catch (error) {
                        console.error('解析流式 JSON 失败:', error)
                    }
                }
            }
        } catch (error) {
            console.error('流式响应处理失败:', error)
            throw error
        }
    },

    async processSyncResponse(response, onUpdate) {
        try {
            if (!response || !response.choices) {
                throw new Error('无效的响应格式')
            }

            const content = response.choices[0]?.message?.content || ''
            onUpdate(content)

            return {
                content,
                usage: response.usage || null,
            }
        } catch (error) {
            console.error('同步响应处理失败:', error)
            throw error
        }
    },
}
