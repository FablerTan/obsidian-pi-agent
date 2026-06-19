# Pi Agent — Obsidian 聊天面板插件

在 Obsidian 中与 [Pi](https://pi.dev)（终端 AI 编程助手）对话的侧边栏聊天面板。通过 RPC 协议启动 pi 子进程，实现完整的 AI 对话体验。

## 功能

### 💬 聊天
- 右侧栏聊天面板，用户消息与 AI 回复以气泡形式展示
- AI 回复流式逐 token 输出，实时渲染 Markdown
- 支持思考链折叠展示、工具调用卡片（bash/read/edit 等）
- Esc 打断 AI 输出

### 🤖 Pi 集成
- 插件启动时自动在后台启动 `pi --mode rpc` 子进程
- 通过 JSONL 协议通信，支持全部 RPC 事件和命令
- 自动检测 pi 安装路径，支持自定义路径

### 🔧 命令系统
- 输入 `/` 弹出命令菜单，支持任意子串搜索，IME 兼容
- 内置命令：`/new`（新建会话）、`/reload`（重载扩展）、`/history`（历史会话）、`/compact`（压缩上下文）、`/stats`（Token 统计）
- 自动发现 pi 扩展注册的自定义命令

### 📎 笔记上下文
- 自动追踪当前打开的笔记名
- 选中文本自动捕获，显示行数/字数
- 可切换是否附加笔记路径到消息中

### 🧩 Extension UI 协议
- 支持 pi 扩展的 `select`/`confirm`/`input`/`editor` 等交互弹窗（内联面板形式）
- 支持 `notify`/`setStatus`/`setWidget`/`setTitle`/`set_editor_text` 广播

### 📊 状态栏
- 显示当前模型（点击切换）、思考层级（点击循环切换）、Token 用量

### ⚙️ 设置
- Pi 路径配置 + 自动检测按钮
- 自动压缩开关（百分比或 Token 阈值）
- Skills / Prompts / Extensions 路径配置
- 所有配置写入项目 `.pi/settings.json`

## 安装

1. 将 `obsidian-pi-chat` 目录复制到 vault 的 `.obsidian/plugins/` 下
2. 在 Obsidian 设置中启用「Pi Agent」插件
3. 确保系统已安装 [Pi](https://pi.dev)（`brew install pi` 或官网下载）

## 构建

```bash
npm install        # 安装依赖
npm run build      # 编译为 main.js
npm run dev        # 监听模式
```

## 技术栈

- **语言**: TypeScript
- **打包**: esbuild
- **通信**: child_process.spawn + JSONL RPC
- **平台**: 仅桌面端（需要 Node.js child_process）

## 项目结构

```
src/
├── main.ts              # 插件入口
├── settings.ts          # 设置接口 + 设置页面
├── pi/
│   └── rpc-client.ts    # pi RPC 客户端
├── ui/
│   ├── PiChatView.ts    # 聊天面板核心
│   ├── CommandMenu.ts   # / 命令菜单
│   ├── ExtensionUIHandler.ts  # 扩展 UI 协议
│   ├── InputStatusBar.ts      # 底部状态栏
│   ├── NoteBar.ts       # 笔记栏
│   ├── MarkdownMsg.ts   # Markdown 渲染
│   ├── ThinkingBlock.ts # 思考链组件
│   ├── ToolCallMsg.ts   # 工具调用卡片
│   ├── HistoryPanel.ts  # 历史会话
│   └── WelcomePage.ts   # 欢迎页
└── utils/
    ├── helpers.ts       # 工具函数
    ├── detect-pi.ts     # pi 路径检测
    └── pi-settings.ts   # .pi/settings.json 读写
```

## 许可证

MIT
