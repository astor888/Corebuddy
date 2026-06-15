# CoreBuddy — 项目文档

> **你的私人 AI 秘书桌面应用。数据完全本地，永不上传。**
>
> 本文档供 AI 助手阅读，确保任何 AI 都能快速理解项目架构并无缝接续工作。

---

## 1. 项目概览

| 项 | 值 |
|----|-----|
| **名称** | CoreBuddy |
| **版本** | 1.4.0 |
| **形态** | Electron 桌面应用（Windows x64） |
| **语言** | TypeScript + React |
| **AI 后端** | DeepSeek API（OpenAI 兼容），支持自定义模型/API |
| **总代码量** | ~6,700 行 |
| **许可证** | 私有 |

---

## 2. 目录结构

```
MiniBuddy/
├── src/                          # 前端渲染进程（React）
│   ├── App.tsx                   # 主应用，2480行，15+组件（单文件架构）
│   ├── main.tsx                  # ReactDOM 入口，11行
│   ├── index.css                 # 全局样式 + highlight.js主题，46行
│   ├── utils.ts                  # 工具函数，4行
│   └── types/
│       └── electron.d.ts         # Electron API 类型声明
│
├── electron/                     # Electron 主进程
│   ├── main.ts                   # 主入口，IPC处理、窗口管理、模型配置，458行
│   ├── preload.ts                # 预加载脚本，暴露 API 到渲染进程，109行
│   ├── agent-loop.ts             # AI 对话循环，三层上下文压缩，616行
│   ├── system-prompt.ts          # 系统提示词构建，189行
│   ├── tool-registry.ts          # 工具注册（30+工具），2276行
│   ├── memory.ts                 # 记忆管理，112行
│   └── mcp-client.ts             # MCP 连接器客户端，429行
│
├── assets/                       # 静态资源
│   ├── icon.ico                  # 应用图标
│   ├── logo-text.png             # 文字 Logo
│   ├── logo-icon.png             # 图标 Logo
│   ├── app-icon.jpg              # 应用头像
│   └── ai-avatar-round.png       # AI 头像
│
├── runtime/node/                 # 便携 Node.js v22.12.0（自包含开发环境）
│
├── index.html                    # HTML 入口
├── package.json                  # 项目配置
├── vite.config.ts                # Vite 构建配置
├── tsconfig.json                 # TypeScript 配置
├── tailwind.config.ts            # Tailwind CSS 配置
├── postcss.config.mjs            # PostCSS 配置
│
├── test-mcp-server.js            # 测试 MCP Server
├── github-mcp-server.js          # GitHub MCP Server
├── feishu-mcp-server.js          # 飞书 MCP Server
│
├── install.bat                   # 首次安装依赖
├── dev.bat                       # 启动开发模式
├── build.bat                     # 仅构建
├── dist.bat                      # 构建+打包安装包
│
├── dist/                         # 前端构建产物（gitignore）
├── dist-electron/                # 主进程构建产物（gitignore）
└── release/                      # 安装包输出（gitignore）
```

---

## 3. 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| **框架** | Electron 33 | 桌面应用壳 |
| **前端** | React 18 + TypeScript | 渲染进程 |
| **构建** | Vite 6 | 前端+主进程构建 |
| **样式** | Tailwind CSS 3 | 实用优先的 CSS |
| **Markdown渲染** | react-markdown + remark-gfm + rehype-highlight | GFM 语法 + 代码高亮 |
| **图表** | Mermaid 11 | 文本转图表 |
| **代码高亮** | highlight.js 11 | GitHub 主题 |
| **AI 后端** | DeepSeek API (OpenAI 兼容格式) | 支持自定义模型/自定义 API 端点 |
| **打包** | electron-builder 26 | NSIS 安装包 |

---

## 4. 核心架构

### 4.1 进程模型

```
┌─────────────────────────────────────────┐
│  Main Process (electron/main.ts)         │
│  - IPC handlers                          │
│  - Agent Loop (agent-loop.ts)            │
│  - Tool Registry (tool-registry.ts)      │
│  - MCP Client (mcp-client.ts)            │
│  - Memory (memory.ts)                    │
│  - System Prompt (system-prompt.ts)      │
│         │                                │
│         │ contextBridge (preload.ts)      │
│         ▼                                │
│  Renderer Process (src/App.tsx)          │
│  - Chat UI                               │
│  - Connectors View                       │
│  - Settings Modal                        │
│  - Skills / Experts / Artifacts panels   │
└─────────────────────────────────────────┘
```

### 4.2 数据流

```
用户输入 → sendMessage(text, modelId, convId) → IPC
  → main.ts: 解析模型配置(apiUrl, apiKey) → agent-loop.ts
  → AI API 调用 → 流式响应 → 逐块发送到渲染进程
  → onStreamChunk → 追加到消息列表
  → 工具调用 → tool-registry 执行 → 结果返回 Agent Loop
```

### 4.3 上下文压缩（三层机制）

| 层 | 触发条件 | 行为 |
|----|----------|------|
| Layer 1 | 每次工具调用 | 工具结果截断 ≤3000 字符 |
| Layer 2 | 上下文 >51K tokens (80%) | LLM 生成 3-5 句摘要，插入 `[COMPACT_BOUNDARY]` |
| Layer 3 | 上下文 >57K tokens (90%) | 兜底裁剪：丢弃最早消息，保留 system + 最后 5 条 |

---

## 5. 关键文件说明

### `src/App.tsx` (2480行)
单文件 React 应用，包含所有 UI 组件和业务逻辑。组件列表：

| 组件 | 行号 | 功能 |
|------|------|------|
| `CollapsibleSection` | 14 | 可折叠区域 |
| `MermaidBlock` | 31 | Mermaid 图表渲染 |
| `CodeBlockRenderer` | 58 | 代码块（高亮+复制+语言标签） |
| `FormattedContent` | 109 | Markdown 渲染器（react-markdown） |
| `ArtifactsPanel` | 324 | 右侧面板-产物 |
| `FilesPanel` | 358 | 右侧面板-文件 |
| `ChangesPanel` | 427 | 右侧面板-变更历史 |
| `PreviewPanel` | 467 | 右侧面板-内容预览 |
| `SkillsView` | 596 | 技能管理页面 |
| `ConnectorsView` | 684 | 连接器管理页面 |
| `ExpertsView` | 996 | 专家管理页面 |
| `AutomationsView` | 1011 | 自动化任务页面 |
| `MoreView` | 1266 | 更多菜单 |
| `App` (main) | 1292 | 主应用组件 |
| `SettingsModal` | 2315 | 设置弹窗（API Key、模型管理） |
| `MemoryModal` | 2425 | 记忆查看器 |

**App 状态管理**：使用 `useState` + `useCallback` 实现全局状态 `AppState`。

### `electron/main.ts` (458行)
Electron 主进程入口。
- 窗口管理（无边框，自定义标题栏）
- IPC 处理：chat、config、mcp、models、file、dialog
- 模型配置文件读写 (`%APPDATA%/corebuddy-data/models.json`)
- API Key 管理（全局 + 每模型独立）

### `electron/agent-loop.ts` (616行)
AI 对话循环引擎。
- `agentLoop(text, convId, config)` — 主入口
- `callLLM(messages, config)` — API 调用
- `compactMessages(messages)` — 三层上下文压缩
- `summarizeMessages(messages)` — LLM 摘要生成
- `executeAndLog(tool, params)` — 工具执行 + 结果截断

### `electron/tool-registry.ts` (2276行)
30+ 内置工具：
- 文件读写：read、write、edit、multi_edit、glob、grep
- 文档处理：read_document (docx/pptx/xlsx/pdf)、create_doc、create_pptx
- 图片处理：image_edit (sharp)、read_image_content (tesseract.js OCR)
- 系统操作：bash、shell、web_fetch、web_search
- MCP：wait_for_mcp
- 其他：notebook_read、workflow、slash_command、team_create/delete、send_message、structured_output

### `electron/mcp-client.ts` (429行)
MCP 协议客户端，管理连接器生命周期。
- 连接/断开/重连
- 配置导入/导出
- 服务器状态管理
- 本地系统工具（builtin）

### `electron/system-prompt.ts` (189行)
构建 AI 系统提示词。
- 参数化用户名（`{userName}`）
- 场景提示词（开发、写作、分析等）
- 工具使用指南

---

## 6. 开发命令

### 安装依赖
```bash
# 使用项目自带的 Node.js
install.bat

# 或手动
runtime/node/npm.cmd install
```

### 开发模式
```bash
dev.bat
# 启动 Vite 热更新 + Electron 窗口
```

### 构建
```bash
build.bat
# 输出到 dist/ + dist-electron/
```

### 打包安装包
```bash
dist.bat
# 输出到 release/CoreBuddy Setup x.x.x.exe
# 国内用户自动使用 npmmirror 镜像
```

---

## 7. 模型配置

**配置文件位置**：`%APPDATA%/corebuddy-data/models.json`

```json
{
  "models": [
    { "id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro", "apiUrl": "https://api.deepseek.com/v1", "apiKey": "" },
    { "id": "gpt-4o", "name": "OpenAI GPT-4o", "apiUrl": "https://api.openai.com/v1", "apiKey": "sk-xxx" }
  ],
  "defaultModel": "deepseek-v4-pro"
}
```

**优先级**：模型 Key → 全局 Key（设置页面的 API Key）
- 模型有 `apiKey` → 用模型的
- 模型 `apiKey` 为空 → 用全局的

---

## 8. MCP 连接器

三个内置 MCP Server：
- `test-mcp-server.js` — 测试用
- `github-mcp-server.js` — GitHub 操作
- `feishu-mcp-server.js` — 飞书集成

**连接器状态**：
- `connected` — 绿色开关 + "断开"按钮
- `disconnected-with-saved-keys` — "重新连接"按钮 + "密钥已保存"
- `unconfigured` — "连接"按钮

**配置导入/导出**：支持企业批量部署。

---

## 9. 设计规范

### 配色
| 用途 | 颜色 |
|------|------|
| 主色 | `#165DFF` |
| 成功 | `#61C454` |
| 错误 | `#EC5B56` |
| 背景 | `#F7F8FA` / `#FFFFFF` |
| 文本主色 | `#1D2129` |
| 文本辅色 | `#4E5969` / `#86909C` |
| 边框 | `#E5E6EB` / `#F2F3F5` |

### 字体
- 系统默认：`-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei'`
- 代码：`font-mono` (Tailwind)

### 组件尺寸
- 标题栏高度：36px (`h-9`)
- 侧边栏宽度：48px
- 用户气泡：`max-w-[75%]`，背景 `#E8F3FF`
- 代码块：圆角 `rounded-lg`，边框 `#E5E6EB`

---

## 10. 常见问题

### Q: 打包时 electron 下载失败？
`dist.bat` 已设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`

### Q: 换电脑后如何开发？
整个 `MiniBuddy/` 目录是自包含的，包含 Node.js 运行时。解压后直接双击 `dev.bat` 即可。

### Q: 如何添加新工具？
在 `electron/tool-registry.ts` 的 `getTools()` 函数中添加工具定义，实现 handler。

### Q: 如何修改 AI 行为？
编辑 `electron/system-prompt.ts` 的 `buildSystemPrompt()`。

### Q: 运行时数据存在哪里？
`%APPDATA%/corebuddy-data/` — 对话、记忆、配置、MCP 设置。删除此目录可重置应用。
