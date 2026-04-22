import { defineStore } from 'pinia'

export const providerOptions = [
    { label: '硅基流动', value: 'siliconflow' },
    { label: 'OpenAI', value: 'openai' },
    { label: '阿里云百炼', value: 'bailian' },
]

export const providerConfig = {
    siliconflow: {
        label: '硅基流动',
        defaultBaseUrl: 'https://api.siliconflow.cn/v1',
        defaultModel: 'THUDM/glm-4-9b-chat',
        apiKeyPlaceholder: '请输入硅基流动 API Key',
    },
    openai: {
        label: 'OpenAI',
        defaultBaseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-3.5-turbo',
        apiKeyPlaceholder: '请输入 OpenAI API Key',
    },
    bailian: {
        label: '阿里云百炼',
        defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        defaultModel: 'qwen2.5-vl-72b-instruct',
        apiKeyPlaceholder: '请输入阿里云百炼 API Key',
    },
}

export const modelOptions = [
    { label: 'GLM-4-9B', value: 'THUDM/glm-4-9b-chat', provider: 'siliconflow' },
    { label: 'Qwen2.5-7B', value: 'Qwen/Qwen2.5-7B-Instruct', provider: 'siliconflow' },
    { label: 'Qwen2.5-Coder-7B', value: 'Qwen/Qwen2.5-Coder-7B-Instruct', provider: 'siliconflow' },
    { label: 'Meta-Llama-3.1-8B', value: 'meta-llama/Meta-Llama-3.1-8B-Instruct', provider: 'siliconflow' },
    { label: 'Hunyuan-MT-7B', value: 'tencent/Hunyuan-MT-7B', provider: 'siliconflow' },
    { label: 'DeepSeek-V2.5', value: 'deepseek-ai/DeepSeek-V2.5', provider: 'siliconflow' },
    { label: 'Qwen2.5-VL-7B (图像理解)', value: 'Pro/Qwen/Qwen2.5-VL-7B-Instruct', provider: 'siliconflow', isVLM: true },
    { label: 'gpt-3.5-turbo', value: 'gpt-3.5-turbo', provider: 'openai' },
    { label: 'qwen2.5-vl-72b-instruct (VLM)', value: 'qwen2.5-vl-72b-instruct', provider: 'bailian', isVLM: true },
    { label: 'qwen2.5-vl-32b-instruct (VLM)', value: 'qwen2.5-vl-32b-instruct', provider: 'bailian', isVLM: true },
    { label: 'qwen-vl-max', value: 'qwen-vl-max', provider: 'bailian', isVLM: true },
    { label: 'qwen-vl-plus', value: 'qwen-vl-plus', provider: 'bailian', isVLM: true },
]

export const inferProviderFromModel = (model = '') => {
    const normalizedModel = String(model).toLowerCase()

    if (
        normalizedModel.startsWith('gpt-') ||
        normalizedModel.startsWith('o1') ||
        normalizedModel.startsWith('o3') ||
        normalizedModel.startsWith('text-embedding') ||
        normalizedModel.startsWith('openai/')
    ) {
        return 'openai'
    }

    if (
        normalizedModel.startsWith('qwen-vl') ||
        normalizedModel.startsWith('qvq-') ||
        normalizedModel.startsWith('qwen3-vl') ||
        normalizedModel.includes('qwen2.5-vl-')
    ) {
        return 'bailian'
    }

    return 'siliconflow'
}

export const normalizeModelForProvider = (model, provider) => {
    const nextProvider = providerConfig[provider] ? provider : 'siliconflow'
    const normalizedModel = String(model || '').trim()

    if (!normalizedModel) {
        return providerConfig[nextProvider].defaultModel
    }

    if (nextProvider === 'openai' && normalizedModel.toLowerCase().startsWith('openai/')) {
        return normalizedModel.replace(/^openai\//i, '')
    }

    return normalizedModel
}

export const getModelsByProvider = (provider) => {
    return modelOptions.filter(option => option.provider === provider)
}

export const isVLMModelValue = (model = '') => {
    const normalizedModel = String(model).toLowerCase()
    return normalizedModel.includes('vl') || normalizedModel.includes('vision')
}

export const resolveProviderBaseUrl = (provider, apiBaseUrl = '') => {
    const trimmedUrl = String(apiBaseUrl || '').trim()
    if (trimmedUrl) {
        return trimmedUrl.replace(/\/+$/, '')
    }

    return providerConfig[provider]?.defaultBaseUrl || providerConfig.siliconflow.defaultBaseUrl
}

export const useSettingsStore = defineStore('settings', {
    state: () => ({
        themeMode: 'system',
        isDarkMode: false,
        temperature: 0.7,
        maxTokens: 1000,
        provider: 'siliconflow',
        model: 'THUDM/glm-4-9b-chat',
        apiKey: '',
        apiBaseUrl: '',
        streamResponse: true,
        topP: 0.7,
        topK: 50,
        imageDetail: 'high',
    }),

    actions: {
        detectSystemTheme() {
            if (typeof window !== 'undefined') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches
            }
            return false
        },

        applyTheme(isDark) {
            this.isDarkMode = isDark
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
        },

        setThemeMode(mode) {
            this.themeMode = mode

            if (mode === 'system') {
                this.applyTheme(this.detectSystemTheme())
                return
            }

            this.applyTheme(mode === 'dark')
        },

        toggleDarkMode() {
            if (this.themeMode === 'system') {
                this.setThemeMode(this.isDarkMode ? 'light' : 'dark')
                return
            }

            this.setThemeMode(this.isDarkMode ? 'light' : 'dark')
        },

        initTheme() {
            if (this.themeMode === 'system') {
                this.applyTheme(this.detectSystemTheme())
            } else {
                this.applyTheme(this.themeMode === 'dark')
            }

            if (typeof window !== 'undefined') {
                const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
                const handleChange = (event) => {
                    if (this.themeMode === 'system') {
                        this.applyTheme(event.matches)
                    }
                }

                if (mediaQuery.addEventListener) {
                    mediaQuery.addEventListener('change', handleChange)
                } else {
                    mediaQuery.addListener(handleChange)
                }
            }
        },

        updateSettings(settings) {
            const nextProvider = settings.provider || this.provider || inferProviderFromModel(settings.model || this.model)
            const availableModels = getModelsByProvider(nextProvider)
            const normalizedModel = normalizeModelForProvider(settings.model ?? this.model, nextProvider)
            const resolvedModel = availableModels.some(option => option.value === normalizedModel)
                ? normalizedModel
                : providerConfig[nextProvider].defaultModel

            const nextBaseUrl = resolveProviderBaseUrl(
                nextProvider,
                settings.apiBaseUrl ?? this.apiBaseUrl
            )

            Object.assign(this.$state, settings, {
                provider: nextProvider,
                model: resolvedModel,
                apiBaseUrl: nextBaseUrl,
            })
        },
    },

    persist: {
        enabled: true,
        strategies: [
            {
                key: 'ai-chat-settings',
                storage: localStorage,
            },
        ],
    },
})
