# 聊天面板能力规格

## Purpose

提供 Obsidian 右侧栏的聊天面板（`PiChatView`），承担视图生命周期、UI 构建、阶段状态机与 pi 事件分发职责。面板通过协作服务（TurnContext、CommandRouter、ReloadService、StatsService、SystemMessageRenderer、NoteBar、HistoryPanel、InputStatusBar、ExtensionUIHandler、CommandMenu）分工，自身保留薄控制层；首次会话前显示 WelcomePage 引导页。

## Requirements

### Requirement: 视图生命周期与 DOM 结构

`PiChatView` SHALL 在 `onOpen` 时构建 `.pi-chat-wrapper` 树（含 header 与 container，container 内含 messages 区、命令菜单容器、扩展内联容器、笔记栏、输入框、底部状态栏），并订阅 piClient 事件；`onClose` MUST 清理所有定时器、取消订阅、销毁 InputStatusBar 与 NoteBar 等下游监听器。

#### Scenario: 打开面板

- **WHEN** 用户在 Obsidian 中打开 Pi Chat 视图
- **THEN** 构建 `.pi-chat-wrapper` DOM 树，订阅 pi 事件并显示 WelcomePage（首次）

#### Scenario: 关闭面板

- **WHEN** 用户关闭视图
- **THEN** loadingTimeout 定时器被 clear，事件订阅取消，InputStatusBar.destroy() 与 NoteBar.destroy() 被调用，无遗留 document 级监听器

### Requirement: 阶段状态机

面板 SHALL 维护 `phase: 'idle' | 'thinking' | 'reloading'`；`isCompacting` 为独立布尔标志可与 thinking 重叠。发送消息前 MUST 检查 `phase === 'idle' && !isCompacting`；Escape 打断仅在 `phase === 'thinking'` 时触发。

#### Scenario: 发送消息

- **WHEN** 用户按 Enter 且 `phase === 'idle' && !isCompacting`
- **THEN** 组装 NoteBar 上下文，显示用户气泡、显示 loading，并 `piClient.prompt(msg)`

#### Scenario: 思考中发送

- **WHEN** phase 为 `thinking` 时用户按 Enter
- **THEN** 消息不被发送（被拦截）

#### Scenario: 打断输出

- **WHEN** phase 为 `thinking` 时用户按 Escape
- **THEN** 发送 `abort` 命令并 `resetTurnAndPhase()`

### Requirement: Pi 事件分发

`handlePiEvent(event)` SHALL 按 PiEvent union 分发：`agent_start` 进入 thinking 阶段并 new TurnContext；`message_update.*` / `tool_execution_*` 委托给当前 turn；`compaction_start/end` 切换 isCompacting 标志并通过 SystemMessageRenderer 提示；`agent_end` reset；`error` / `extension_error` reset 并显示具体错误信息；`extension_ui_request` 转交 ExtensionUIHandler。

#### Scenario: agent_start

- **WHEN** 收到 `agent_start` 事件
- **THEN** phase=thinking，new TurnContext，显示 loading 动画

#### Scenario: agent_end

- **WHEN** 收到 `agent_end` 事件
- **THEN** `resetTurnAndPhase()`，刷新 Token 用量显示

#### Scenario: compaction 进行中

- **WHEN** 收到 `compaction_start`
- **THEN** isCompactoring=true，系统消息渲染「正在压缩」提示

#### Scenario: 具体错误呈现

- **WHEN** 收到 `error` 或 `extension_error` 事件
- **THEN** reset 后通过 Notice 显示该事件携带的具体错误消息，而非泛化「Pi 返回了错误」

### Requirement: 已识别但未处理的事件

面板 SHALL 在 `turn_*` / `message_*` / `auto_retry_*` 等事件上存在空 case 占位，表明类型已覆盖但运行时未处理；这些 case MUST 不抛出未捕获异常。

#### Scenario: 收到未处理事件

- **WHEN** 收到 `turn_start` 或 `auto_retry_start` 等占位事件
- **THEN** 不抛异常，状态保持原样

### Requirement: 欢迎页引导

`WelcomePage` SHALL 在首次对话前在 messages 区显示 Pi Agent 标题、上下文文件清单与可用命令列表；收到任何会改变 messages 区的事件前，欢迎页 MUST 先被 `onBeforeInsert` 回调移除。

#### Scenario: 首次打开

- **WHEN** 视图打开且尚无任何对话
- **THEN** 异步加载扩展命令与上下文文件并渲染欢迎页

#### Scenario: 发送首条消息

- **WHEN** 第一次插入用户/系统消息
- **THEN** 欢迎页被移除，消息流开始