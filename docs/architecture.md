# Pi Agent 插件 — 架构文档

## 目录结构

```
src/
  main.ts               插件入口，生命周期管理
  settings.ts           设置接口 + 默认值 + 设置页面
  pi/
    rpc-client.ts       pi RPC 通信客户端（订阅模式 + 超时 + 错误 reject）
    types.ts            RPC 协议类型定义（PiEvent / ExtensionUiRequest / 响应 data 形状）
  ui/
    PiChatView.ts       聊天面板核心（生命周期、UI 构建、事件分发、状态机）
    TurnContext.ts       当前回合渲染上下文（注入流式 delta 到 AssistantMessageView）
    AssistantMessageView.ts  单条助手消息视图（流式 + 历史回放共用渲染原语）
    MarkdownMsg.ts      流式 Markdown 渲染（增量 append + 全量重渲染）
    ToolCallMsg.ts      工具调用卡片（收起/5行/展开三种状态）
    ThinkingBlock.ts    思考链展示（AI 推理过程折叠卡片）
    CommandMenu.ts      命令菜单（输入 / 时弹出命令列表）
    CommandRouter.ts    命令路由器（分派内置命令到各处理器）
    HistoryPanel.ts     历史会话管理器（读取、浮层、切换）
    NoteBar.ts          笔记栏（笔记名 + 选中文本追踪，位于输入框上方）
    InputStatusBar.ts   底部状态栏（模型选择 + 思考层级切换）
    WelcomePage.ts      欢迎页（首次对话前显示上下文和命令列表）
    ExtensionUIHandler.ts  Extension UI 协议处理器（select/confirm/input/editor 弹窗等）
    SystemMessageRenderer.ts  系统消息渲染器（压缩/统计/reload 结果）
    ReloadService.ts    /reload 服务 + 命令加载 + 扩展发现
    StatsService.ts     /stats 服务
    code-blocks.ts      代码块增强工具（语言标签 + 复制按钮）
    command-groups.ts   命令分组工具（按 source 排序输出）
  utils/
    session-file-reader.ts  pi 会话文件读取器（隔离耦合 + 异步 IO）
    extension-loader.ts     扩展发现工具（磁盘扫描 + get_commands 交叉验证）
    pi-settings.ts          读写项目 .pi/settings.json
    detect-pi.ts            pi 可执行文件路径自动检测

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
| [`docs/pi-module.md`](pi-module.md) | RPC 通信层 `rpc-client.ts` + 类型定义 `types.ts` |
| [`docs/ui-module.md`](ui-module.md) | 全部 UI 组件（PiChatView、TurnContext、AssistantMessageView 等 16 个模块） |
| [`docs/utils-and-settings.md`](utils-and-settings.md) | 工具函数 + 配置文件读取 + 设置管理 |
| [`docs/known-issues.md`](known-issues.md) | 已知 Bug、安全性问题、功能缺陷（已修复项标注） |
| [`docs/rpc-gaps.md`](rpc-gaps.md) | Pi RPC 协议未处理清单 |

## 设计原则

- **单一职责**：`PiChatView` 只保留生命周期、事件分发、状态机；业务逻辑拆分到独立服务
- **共享原语**：流式渲染与历史回放共用 `AssistantMessageView`，DOM 结构一致
- **类型安全**：`PiEvent` / `ExtensionUiRequest` discriminated union，switch 获得 narrowing
- **隔离耦合**：pi 内部存储格式（session 文件、JSONL）集中在 `session-file-reader.ts`
- **异步 IO**：所有文件系统操作使用 `fs/promises`
- **事件订阅**：`rpc-client.on()` 支持多视图同时订阅，返回取消函数
