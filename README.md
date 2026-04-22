# AIchat-lightRAG

一个基于 `Vue 3 + Vite` 构建的轻量级 AI 多模型对话平台，支持多供应商模型切换、SSE 流式输出、多会话管理、Markdown 渲染、VLM 图文输入，以及前端本地化的 `Light RAG` 能力。

项目当前已经支持：
- 多模型接入：`硅基流动 / OpenAI / 阿里云百炼`
- 多模态对话：支持图片与文档一起发送
- 本地知识库：支持文档与图片导入、切片、检索、重排
- 多模态 RAG：命中图片知识时可结合 VLM 做图文增强问答
- IndexedDB 持久化：聊天记录、知识库、图片元数据本地保存

## 项目亮点

- 支持 `Fetch + ReadableStream + SSE` 流式响应解析，AI 回复可实时输出，并支持 `AbortController` 停止生成
- 支持 `OpenAI / 硅基流动 / 阿里云百炼` 多供应商切换，并接入 `qwen2.5-vl-72b-instruct` 等 VLM 模型
- 实现前端本地 `Light RAG`：支持知识库创建、删除、重建、切换，支持 `txt / md / json / pdf / docx / 图片` 导入
- 检索链路升级为 `关键词检索 + 本地轻量向量检索 + 重排`，并支持多模态 RAG
- 使用 `IndexedDB` 存储会话、消息、知识库、文档、切片与图片预览数据，刷新后可恢复
- 回答结果可显示本次是否命中知识库、命中参考条数，便于演示与面试说明

## 技术栈

- `Vue 3`
- `Vite`
- `Pinia`
- `Vue Router`
- `Element Plus`
- `Markdown-it`
- `Highlight.js`
- `Fetch API`
- `SSE`
- `IndexedDB`
- `pdfjs-dist`
- `mammoth`

## 核心功能

### 1. AI 对话能力

- 多会话管理
- 流式对话输出
- 停止生成
- 消息编辑、删除、重新生成
- Markdown 渲染与代码高亮

### 2. 多模型与多供应商配置

- 支持硅基流动模型
- 支持 OpenAI 兼容接口
- 支持阿里云百炼兼容接口
- 支持 VLM 模型图片理解
- 支持模型参数配置：`temperature / top_p / top_k / max_tokens`

### 3. 多模态输入

- 支持图片上传
- 支持文档上传
- 支持“添加照片或文件”统一入口
- 图片与文本可组合发送
- 文档会先解析为文本后参与上下文构造

### 4. Light RAG 能力

- 支持多个知识库创建、切换、删除、重建
- 支持文本资料与图片资料导入知识库
- 支持 `pdf / docx` 解析
- 支持文本切片与本地索引
- 支持 `关键词召回 + 本地轻量向量召回` 混合检索
- 支持二次重排
- 支持多模态 RAG

## 知识库支持格式

文本资料支持：
- `txt`
- `md`
- `markdown`
- `json`
- `csv`
- `tsv`
- 常见代码文件
- `pdf`
- `docx`

图片资料支持：
- `jpg / jpeg`
- `png`
- `gif`
- `webp`

## 数据存储设计

项目采用浏览器本地 `IndexedDB` 持久化，而不是依赖后端数据库。

当前主要存储内容包括：
- 会话列表
- 消息记录
- 当前会话 ID
- 知识库列表
- 当前知识库 ID
- 文档记录
- 切片记录
- 图片资料的预览数据与元信息
- 每条 assistant 消息对应的知识库命中状态

这样做的好处是：
- 本地开发和演示方便
- 无需后端即可运行
- 刷新页面后可以恢复聊天和知识库状态

## 快速启动

### 环境要求

- `Node.js >= 16`
- `npm >= 7`

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

### 生产构建

```bash
npm run build
```

## 使用说明

### 1. 配置模型接口

进入右上角设置面板后，填写：
- 服务商
- 模型
- API Key
- Base URL

已支持：
- 硅基流动
- OpenAI
- 阿里云百炼

### 2. 使用 VLM 模型

如果选择的是视觉模型，例如：
- `qwen2.5-vl-72b-instruct`
- `qwen2.5-vl-32b-instruct`
- `qwen-vl-max`

即可上传图片并发起图文问答。

### 3. 使用知识库

打开“知识库”面板后可以：
- 新建知识库
- 切换知识库
- 上传文档或图片资料
- 删除资料
- 重建知识库
- 删除知识库

在发起提问时，系统会自动尝试从当前知识库中检索相关内容，并在回答下方显示：
- `本次已命中知识库`
- `命中 N 条参考`
- `多模态 RAG`

## 项目结构

```bash
src
├─ assets
├─ components
│  ├─ ChatInput.vue
│  ├─ ChatMessage.vue
│  ├─ KnowledgeBasePanel.vue
│  └─ SettingsPanel.vue
├─ stores
│  ├─ chat.js
│  ├─ knowledge.js
│  └─ settings.js
├─ utils
│  ├─ api.js
│  ├─ appDatabase.js
│  ├─ chatStorage.js
│  ├─ documentUtils.js
│  ├─ imageUtils.js
│  ├─ messageHandler.js
│  ├─ ragStorage.js
│  ├─ retriever.js
│  └─ textChunker.js
└─ views
   └─ ChatView.vue
```

## 后续可优化方向

- 接入真实 Embedding 接口，替换当前本地轻量向量检索
- 接入服务端知识库与对象存储
- 增加引用来源高亮与命中文本定位
- 增加知识库导出、重命名、搜索
- 对大体积依赖进行按需拆包，进一步优化构建体积

## License

本项目采用仓库内已有 `LICENSE`。
