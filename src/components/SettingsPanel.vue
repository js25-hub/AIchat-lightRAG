<template>
  <el-drawer
    v-model="visible"
    title="设置"
    direction="rtl"
    size="400px"
    style="background-color: var(--bg-color);"
  >
    <div class="settings-container">
      <el-form :model="settings" label-width="120px">
        <el-form-item label="主题模式">
          <el-select v-model="settings.themeMode" @change="handleThemeModeChange" class="w-full">
            <el-option label="跟随系统" value="system" />
            <el-option label="浅色模式" value="light" />
            <el-option label="深色模式" value="dark" />
          </el-select>
          <div class="form-item-tip">跟随系统时，会自动应用浏览器或系统当前的主题设置。</div>
        </el-form-item>

        <el-form-item label="服务商">
          <el-select v-model="settings.provider" @change="handleProviderChange" class="w-full">
            <el-option
              v-for="provider in providerOptions"
              :key="provider.value"
              :label="provider.label"
              :value="provider.value"
            />
          </el-select>
          <div class="form-item-tip">切换后会自动带出对应的默认模型和兼容接口地址。</div>
        </el-form-item>

        <el-form-item label="模型">
          <el-select v-model="settings.model" class="w-full">
            <el-option
              v-for="model in filteredModelOptions"
              :key="model.value"
              :label="model.label"
              :value="model.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="Base URL">
          <el-input
            v-model="settings.apiBaseUrl"
            placeholder="留空时使用当前服务商默认地址"
          />
          <div class="form-item-tip">
            当前默认值：{{ currentProviderConfig.defaultBaseUrl }}
          </div>
        </el-form-item>

        <el-form-item label="Temperature">
          <el-slider
            v-model="settings.temperature"
            :min="0"
            :max="1"
            :step="0.1"
            show-input
          />
        </el-form-item>

        <el-form-item label="最大 Token">
          <el-input-number
            v-model="settings.maxTokens"
            :min="1"
            :max="4096"
            :step="1"
          />
        </el-form-item>

        <el-form-item label="API Key">
          <el-input
            v-model="settings.apiKey"
            type="password"
            show-password
            :placeholder="currentProviderConfig.apiKeyPlaceholder"
          />
        </el-form-item>

        <el-form-item label="流式响应">
          <el-switch v-model="settings.streamResponse" />
          <div class="form-item-tip">开启后会实时显示模型输出。</div>
        </el-form-item>

        <el-form-item label="Top P">
          <el-slider
            v-model="settings.topP"
            :min="0"
            :max="1"
            :step="0.1"
            show-input
          />
        </el-form-item>

        <el-form-item
          v-if="settings.provider === 'siliconflow'"
          label="Top K"
        >
          <el-input-number
            v-model="settings.topK"
            :min="1"
            :max="100"
            :step="1"
          />
          <div class="form-item-tip">`Top K` 目前只对硅基流动请求生效。</div>
        </el-form-item>

        <el-form-item v-if="isVLMModel" label="图片细节">
          <el-select v-model="settings.imageDetail" class="w-full">
            <el-option label="高分辨率 (high)" value="high" />
            <el-option label="低分辨率 (low)" value="low" />
            <el-option label="自动 (auto)" value="auto" />
          </el-select>
          <div class="form-item-tip">控制图像预处理方式，细节越高，通常消耗的 Token 越多。</div>
        </el-form-item>
      </el-form>

      <div class="settings-footer">
        <el-button type="primary" @click="handleSave">保存设置</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, reactive } from 'vue'
import {
  useSettingsStore,
  providerOptions,
  providerConfig,
  getModelsByProvider,
  inferProviderFromModel,
  isVLMModelValue,
  normalizeModelForProvider,
  resolveProviderBaseUrl,
} from '../stores/settings'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: Boolean,
})

const emit = defineEmits(['update:modelValue'])

const settingsStore = useSettingsStore()
const initialProvider = settingsStore.provider || inferProviderFromModel(settingsStore.model)

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const settings = reactive({
  themeMode: settingsStore.themeMode,
  isDarkMode: settingsStore.isDarkMode,
  provider: initialProvider,
  model: normalizeModelForProvider(settingsStore.model, initialProvider),
  temperature: settingsStore.temperature,
  maxTokens: settingsStore.maxTokens,
  apiKey: settingsStore.apiKey,
  apiBaseUrl: settingsStore.apiBaseUrl || resolveProviderBaseUrl(initialProvider),
  streamResponse: settingsStore.streamResponse,
  topP: settingsStore.topP,
  topK: settingsStore.topK,
  imageDetail: settingsStore.imageDetail,
})

const filteredModelOptions = computed(() => getModelsByProvider(settings.provider))

const currentProviderConfig = computed(() => {
  return providerConfig[settings.provider] || providerConfig.siliconflow
})

const isVLMModel = computed(() => isVLMModelValue(settings.model))

const handleThemeModeChange = (value) => {
  settingsStore.setThemeMode(value)
  settings.isDarkMode = settingsStore.isDarkMode
}

const handleProviderChange = (provider) => {
  const nextProviderConfig = providerConfig[provider] || providerConfig.siliconflow
  const nextModelOptions = getModelsByProvider(provider)

  settings.model = nextModelOptions[0]?.value || nextProviderConfig.defaultModel
  settings.apiBaseUrl = nextProviderConfig.defaultBaseUrl
}

const handleSave = () => {
  settingsStore.updateSettings(settings)
  settings.apiBaseUrl = settingsStore.apiBaseUrl
  ElMessage.success('设置已保存')
  visible.value = false
}
</script>

<style lang="scss" scoped>
.settings-container {
  padding: 1rem;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.settings-footer {
  margin-top: auto;
  padding-top: 1rem;
  text-align: right;
}

.w-full {
  width: 100%;
}

.form-item-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
