import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString()

export const DOCUMENT_EXTENSIONS = [
    '.txt', '.md', '.markdown', '.json', '.csv', '.tsv', '.log',
    '.js', '.jsx', '.ts', '.tsx', '.vue',
    '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.go', '.rs', '.php', '.rb', '.sh',
    '.sql', '.xml', '.html', '.htm', '.css', '.scss', '.less',
    '.yaml', '.yml', '.toml', '.ini', '.conf', '.env',
    '.pdf', '.docx',
]

export const SUPPORTED_DOCUMENT_EXTENSIONS = new Set(
    DOCUMENT_EXTENSIONS.map((item) => item.toLowerCase())
)

export const MAX_DOCUMENT_SIZE_MB = 10

export const getFileExtension = (fileName = '') => {
    const lastDotIndex = fileName.lastIndexOf('.')
    return lastDotIndex === -1 ? '' : fileName.slice(lastDotIndex).toLowerCase()
}

export const isSupportedDocument = (file) => {
    const extension = getFileExtension(file?.name || '')
    return SUPPORTED_DOCUMENT_EXTENSIONS.has(extension)
}

export const checkDocumentSize = (file, maxSizeMB = MAX_DOCUMENT_SIZE_MB) => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024
    return file.size <= maxSizeBytes
}

export const readTextFile = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (event) => resolve(String(event.target?.result || ''))
        reader.onerror = reject
        reader.readAsText(file)
    })
}

const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (event) => resolve(event.target?.result)
        reader.onerror = reject
        reader.readAsArrayBuffer(file)
    })
}

const readPdfAsText = async (file) => {
    const arrayBuffer = await readFileAsArrayBuffer(file)
    const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
    })
    const pdfDocument = await loadingTask.promise
    const pageTexts = []

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        const page = await pdfDocument.getPage(pageNumber)
        const textContent = await page.getTextContent()
        const pageText = textContent.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()

        if (pageText) {
            pageTexts.push(`[第 ${pageNumber} 页]\n${pageText}`)
        }
    }

    return pageTexts.join('\n\n').trim()
}

const readDocxAsText = async (file) => {
    const arrayBuffer = await readFileAsArrayBuffer(file)
    const mammothModule = await import('mammoth')
    const mammoth = mammothModule.default || mammothModule
    const result = await mammoth.extractRawText({ arrayBuffer })
    return String(result.value || '').replace(/\n{3,}/g, '\n\n').trim()
}

export const readDocumentAsText = async (file) => {
    const extension = getFileExtension(file.name)

    if (extension === '.pdf') {
        return readPdfAsText(file)
    }

    if (extension === '.docx') {
        return readDocxAsText(file)
    }

    return readTextFile(file)
}

export const formatDocumentContentForPrompt = (fileName, contentText) => {
    const extension = getFileExtension(fileName).replace('.', '') || 'text'
    return `文件：${fileName}\n\`\`\`${extension}\n${contentText}\n\`\`\``
}
