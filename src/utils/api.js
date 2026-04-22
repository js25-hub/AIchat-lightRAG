import { useSettingsStore } from '../stores/settings'
import {
    inferProviderFromModel,
    normalizeModelForProvider,
    resolveProviderBaseUrl,
} from '../stores/settings'

const resolveRuntimeSettings = () => {
    const settingsStore = useSettingsStore()
    const provider = settingsStore.provider || inferProviderFromModel(settingsStore.model)

    return {
        provider,
        model: normalizeModelForProvider(settingsStore.model, provider),
        baseUrl: resolveProviderBaseUrl(provider, settingsStore.apiBaseUrl),
        apiKey: settingsStore.apiKey,
        temperature: settingsStore.temperature,
        maxTokens: settingsStore.maxTokens,
        streamResponse: settingsStore.streamResponse,
        topP: settingsStore.topP,
        topK: settingsStore.topK,
    }
}

const createHeaders = () => {
    const { apiKey } = resolveRuntimeSettings()

    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
    }
}

const buildPayload = (messages, stream = false) => {
    const runtimeSettings = resolveRuntimeSettings()
    const payload = {
        model: runtimeSettings.model,
        messages,
        temperature: runtimeSettings.temperature,
        max_tokens: runtimeSettings.maxTokens,
        stream,
        top_p: runtimeSettings.topP,
    }

    // `top_k` 不是 OpenAI 通用字段，这里只在硅基流动下发送。
    if (runtimeSettings.provider === 'siliconflow') {
        payload.top_k = runtimeSettings.topK
    }

    return {
        runtimeSettings,
        payload,
    }
}

const parseErrorResponse = async (response) => {
    const errorData = await response.json().catch(() => null)
    return errorData?.error?.message || errorData?.message || `HTTP error! status: ${response.status}`
}

export const chatApi = {
    async sendMessage(messages, stream = false, options = {}) {
        const { runtimeSettings, payload } = buildPayload(messages, stream)

        const response = await fetch(`${runtimeSettings.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                ...createHeaders(),
                ...(stream && { Accept: 'text/event-stream' }),
            },
            signal: options.signal,
            body: JSON.stringify(payload),
        })

        if (!response.ok) {
            throw new Error(await parseErrorResponse(response))
        }

        if (stream) {
            return response
        }

        return await response.json()
    },

    async sendAsyncMessage(messages) {
        const { runtimeSettings, payload } = buildPayload(messages, false)

        const response = await fetch(`${runtimeSettings.baseUrl}/async/chat/completions`, {
            method: 'POST',
            headers: createHeaders(),
            body: JSON.stringify(payload),
        })

        if (!response.ok) {
            throw new Error(await parseErrorResponse(response))
        }

        return await response.json()
    },

    async getAsyncResult(taskId) {
        const { baseUrl } = resolveRuntimeSettings()

        const response = await fetch(`${baseUrl}/async-result/${taskId}`, {
            method: 'GET',
            headers: createHeaders(),
        })

        if (!response.ok) {
            throw new Error(await parseErrorResponse(response))
        }

        return await response.json()
    },
}
