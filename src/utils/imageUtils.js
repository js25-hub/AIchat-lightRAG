import { chatApi } from './api'

export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]

export const isValidImageFormat = (file) => {
  return SUPPORTED_IMAGE_TYPES.includes(file?.type)
}

export const isImageFile = (file) => {
  return String(file?.type || '').startsWith('image/')
}

export const checkImageSize = (file, maxSizeMB = 10) => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  return file.size <= maxSizeBytes
}

export const convertImageToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      const result = String(event.target?.result || '')
      const base64 = result.split(',')[1]
      resolve(base64)
    }

    reader.onerror = () => {
      reject(new Error('图片读取失败'))
    }

    reader.readAsDataURL(file)
  })
}

export const readImageAsDataUrl = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      resolve(String(event.target?.result || ''))
    }

    reader.onerror = () => {
      reject(new Error('图片读取失败'))
    }

    reader.readAsDataURL(file)
  })
}

export const readImageSize = (file) => {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      URL.revokeObjectURL(imageUrl)
      resolve({ width, height })
    }

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl)
      reject(new Error('图片尺寸读取失败'))
    }

    image.src = imageUrl
  })
}

export const buildVLMMessage = async (textContent, imageFiles = [], detail = 'high') => {
  const content = []

  for (const file of imageFiles) {
    if (!isValidImageFormat(file)) {
      throw new Error(`不支持的图片格式: ${file.type}`)
    }

    if (!checkImageSize(file)) {
      throw new Error(`图片文件过大: ${file.name}`)
    }

    try {
      const base64 = await convertImageToBase64(file)
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${file.type};base64,${base64}`,
          detail,
        },
      })
    } catch (error) {
      throw new Error(`图片处理失败: ${file.name} - ${error.message}`)
    }
  }

  if (textContent && textContent.trim()) {
    content.push({
      type: 'text',
      text: textContent,
    })
  }

  return {
    role: 'user',
    content,
  }
}

export const getImagePreviewUrl = (file) => {
  return URL.createObjectURL(file)
}

export const revokeImagePreviewUrl = (url) => {
  URL.revokeObjectURL(url)
}

const buildImageKnowledgeFallbackText = async (file) => {
  const { width, height } = await readImageSize(file).catch(() => ({ width: 0, height: 0 }))
  const sizeText = width && height ? `${width} x ${height}` : '未知尺寸'

  return [
    `图片名称：${file.name}`,
    `图片类型：${file.type || '未知类型'}`,
    `图片尺寸：${sizeText}`,
    '说明：这是一张存入本地知识库的参考图片，可在回答时作为视觉参考。',
  ].join('\n')
}

export const describeImageForKnowledge = async (file, options = {}) => {
  const {
    enableVisionAnalysis = false,
    detail = 'low',
  } = options

  const fallbackText = await buildImageKnowledgeFallbackText(file)

  if (!enableVisionAnalysis) {
    return fallbackText
  }

  try {
    const message = await buildVLMMessage(
      [
        '请用中文为这张知识库图片生成一段便于检索的描述。',
        '要求：',
        '1. 提取主体、场景、文字、关键对象、布局或图表信息。',
        '2. 适合后续 RAG 检索，控制在 80 到 160 字。',
        '3. 直接输出描述，不要添加前言。',
      ].join('\n'),
      [file],
      detail
    )

    const response = await chatApi.sendMessage([
      {
        role: 'system',
        content: '你是知识库图片整理助手，负责为图片生成适合检索和重排的中文摘要。',
      },
      message,
    ], false)

    const summary = String(response?.choices?.[0]?.message?.content || '').trim()

    if (!summary) {
      return fallbackText
    }

    return `${fallbackText}\n图片摘要：${summary}`
  } catch (error) {
    console.warn('图片知识摘要生成失败，已回退到基础元数据：', error)
    return fallbackText
  }
}
