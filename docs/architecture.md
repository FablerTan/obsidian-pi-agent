# Pi Agent 插件 — 架构文档

## 目录结构

```
src/
  main.ts               插件入口，生命周期管理
  settings.ts           设置接口 + 默认值 + 设置页面
  pi/
    rpc-client.ts       pi RPC 通信客户端
  ui/
    PiChatView.ts       聊天面板核心（消息流、加载动画、命令菜单、生命周期）
    MarkdownMsg.ts      流式 Markdown 渲染（代码块增强）
    ToolCallMsg.ts      工具调用卡片（显示工具执行状态和结果）
    ThinkingBlock.ts    思考链展示（AI 推理过程折叠卡片）
    CommandMenu.ts      命令菜单（输入 / 时弹出命令列表）
    HistoryPanel.ts     历史会话管理器（读取、浮层、切换）
    NoteBar.ts          笔记栏（笔记名 + 选中文本追踪，位于输入框上方）
    InputStatusBar.ts   底部状态栏（模型选择 + 思考层级切换）
    WelcomePage.ts      欢迎页（首次对话前显示上下文和命令列表）
    ExtensionUIHandler.ts Extension UI 协议处理器（select/confirm/input/editor 弹窗等）
  utils/
    helpers.ts          工具函数（文本提取等）

styles.css              所有 UI 样式
docs/
  architecture.md       本文档（索引 + 目录结构）
  overview.md           总览：外部依赖 + 数据流 + 会话存储
  pi-module.md          pi 通信模块（rpc-client.ts）
  ui-module.md          UI 模块（聊天面板、笔记栏、命令菜单等全部 UI 组件）
  utils-and-settings.md 工具函数 + 配置管理
  known-issues.md       已知问题
  rpc-gaps.md           RPC 机制未处理清单
```

## 文档索引

| 文档 | 说明 |
|------|------|
| [`docs/overview.md`](overview.md) | 外部依赖、数据流全景、会话存储 |
| [`docs/pi-module.md`](pi-module.md) | RPC 通信层 `rpc-client.ts` |
| [`docs/ui-module.md`](ui-module.md) | 全部 UI 组件（PiChatView、NoteBar、ThinkingBlock、WelcomePage、HistoryPanel、MarkdownMsg、ToolCallMsg、CommandMenu、InputStatusBar、ExtensionUIHandler） |
| [`docs/utils-and-settings.md`](utils-and-settings.md) | 工具函数 `helpers.ts` + 配置管理 `settings.ts` |
| [`docs/known-issues.md`](known-issues.md) | 已知 Bug、安全性问题、功能缺陷 |
| [`docs/rpc-gaps.md`](rpc-gaps.md) | Pi RPC 协议未处理清单 |

## 测试资源

| 文件 | 说明 |
|------|------|
| `.pi/extensions/test-ext-ui.ts` | Extension UI 协议测试扩展，覆盖全部 9 个方法 |
