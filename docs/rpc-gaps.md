# RPC 机制处理状态

对照 Pi RPC 协议文档（`pi --mode rpc`）与当前实现代码，整理出已处理和未处理的部分。

> **说明**: `src/pi/types.ts` 已依据协议文档定义了全部事件/命令/响应类型（`PiEvent` / `AssistantMessageEvent` / `ExtensionUiRequest` / `PiResponse<T>`）。以下表格反映**运行时行为**，类型定义已全覆盖。

---

## 一、RPC 命令（插件 → pi）

### ✅ 已实现的命令

| 命令 | 位置 | 方式 |
|------|------|------|
| `prompt` | `rpc-client.ts` — `prompt()` | 直接发送 |
| `abort` | `PiChatView.ts` — `abort()` | 直接发送 + `resetTurnAndPhase()` |
| `new_session` | `PiChatView.ts` — `handleNewSession()` | `sendAndWait` |
| `get_state` | `rpc-client.ts` — `start()` 等待就绪；`InputStatusBar.ts` — 加载模型/思考层级 | `sendAndWait<GetStateData>` |
| `get_messages` | `HistoryPanel.ts` — `switchToSession()` / `loadMessages()` | `sendAndWait<GetMessagesData>` |
| `switch_session` | `HistoryPanel.ts` — `switchToSession()` | `sendAndWait<SwitchSessionData>` |
| `get_commands` | `ReloadService.ts` — `loadCommands()` / `run()` | `sendAndWait<GetCommandsData>` |
| `set_model` | `InputStatusBar.ts` — `selectModel()` | `sendAndWait<Model>` |
| `get_available_models` | `InputStatusBar.ts` — `openModelPicker()` | `sendAndWait<GetAvailableModelsData>` |
| `cycle_thinking_level` | `InputStatusBar.ts` — `cycleThinking()` | `sendAndWait<CycleThinkingLevelData>` |
| `compact` | `PiChatView.ts` — `handleCompact()` | 直接发送 |
| `set_auto_compaction` | `rpc-client.ts` — `setAutoCompaction()` | `sendAndWait` |
| `get_session_stats` | `InputStatusBar.ts` — `updateContextUsage()` + `StatsService.run()` | `sendAndWait<GetSessionStatsData>` |
| `extension_ui_response` | `rpc-client.ts` — `sendExtensionUIResponse()` | 直接发送 |

### ❌ 未实现的命令

| 命令 | 作用 | 优先级 | 备注 |
|------|------|--------|------|
| `bash` | 直接执行 shell 命令并加入对话上下文 | 中 | |
| `set_auto_retry` | 开启/关闭自动重试 | 中 | |
| `fork` | 从某条消息创建分叉新会话 | 中 | |
| `clone` | 复制当前分支为新会话 | 中 | |
| `get_fork_messages` | 获取可分叉的消息列表 | 中 | |
| `abort_bash` | 打断正在执行的 bash | 低 | |
| `abort_retry` | 打断进行中的自动重试 | 低 | |
| `export_html` | 导出会话为 HTML | 低 | |
| `get_last_assistant_text` | 获取最后一条助手回复的纯文本 | 低 | |
| `set_session_name` | 设置会话显示名称 | 低 | |
| `set_steering_mode` / `set_follow_up_mode` | 配置队列投递模式 | 低 | |

### ⬜ 不打算实现的命令

| 命令 | 原因 |
|------|------|
| `steer`（`streamingBehavior: "steer"`） | 插件侧简单禁止 AI 输出时发送消息，无需队列机制 |
| `follow_up`（`streamingBehavior: "followUp"`） | 同上 |

---

## 二、事件（pi → 插件）

### ✅ 已处理的事件

| 事件 / 子事件 | 位置 | 行为 |
|------|------|------|
| `agent_start` | `PiChatView.handlePiEvent()` | `phase = thinking` + `new TurnContext` + `showLoading` |
| `agent_end` | `PiChatView.handlePiEvent()` | `resetTurnAndPhase()` + Token 用量更新 |
| `compaction_start` | `PiChatView.handlePiEvent()` | `isCompacting = true` + 系统消息「正在压缩」 |
| `compaction_end` | `PiChatView.handlePiEvent()` | `isCompacting = false` + 更新为完成/取消/失败 |
| `message_update.text_delta` | `PiChatView.handlePiEvent()` | → `TurnContext.appendText` → `AssistantMessageView.appendText` |
| `message_update.text_start` | `PiChatView.handlePiEvent()` | → `TurnContext.ensureTextContainer` |
| `message_update.thinking_start` | `PiChatView.handlePiEvent()` | → `TurnContext.startThinking` |
| `message_update.thinking_delta` | `PiChatView.handlePiEvent()` | → `TurnContext.appendThinking` |
| `message_update.thinking_end` | `PiChatView.handlePiEvent()` | → `TurnContext.endThinking` |
| `message_update.toolcall_start` | `PiChatView.handlePiEvent()` | 隐藏加载动画 |
| `tool_execution_start` | `PiChatView.handlePiEvent()` | → `TurnContext.addToolCall` |
| `tool_execution_update` | `PiChatView.handlePiEvent()` | → `TurnContext.updateToolCall` |
| `tool_execution_end` | `PiChatView.handlePiEvent()` | → `TurnContext.endToolCall` |
| `extension_ui_request` | `PiChatView.handlePiEvent()` | → `ExtensionUIHandler.handleRequest` |
| `extension_error` | `PiChatView.handlePiEvent()` | `resetTurnAndPhase()` + 显示具体错误 |
| `error` | `PiChatView.handlePiEvent()` | `resetTurnAndPhase()` + 显示具体消息 |

### ❌ 未处理的事件

| 事件 | 用途 | 影响 |
|------|------|------|
| `turn_start` / `turn_end` | 一个回合开始/完成 | 无法精确追踪回合边界 |
| `message_start` / `message_end` | 一条消息开始/完成 | 无法获取完整消息对象 |
| `auto_retry_start` / `auto_retry_end` | 自动重试开始/完成 | 用户不知道在重试 |
| `message_update.toolcall_delta` | 工具调用参数流式到达 | 无法实时显示参数构建过程 |
| `message_update.toolcall_end` | 工具调用完成（含完整 toolCall 对象） | 工具执行完成时缺少完整信息 |
| `message_update.text_end` | 文本块完成 | 无法感知文本块边界 |
| `message_update.done` | 消息完成（含 `stopReason`） | 无法知道消息为什么结束 |
| `message_update.error` (子类型) | 消息层出错（不同于顶层 `error` 事件） | 消息级别错误未能捕获 |

### ⬜ 忽略的事件

| 事件 | 原因 |
|------|------|
| `queue_update` | 插件侧禁止 AI 输出时发送消息，无需关注队列状态 |

---

## 三、Extension UI 协议

✅ **已完成**（`src/ui/ExtensionUIHandler.ts`）

| 方法 | 类型 | UI 位置 |
|------|------|---------|
| `select` | 对话型（需 response） | 输入框上方内联面板 |
| `confirm` | 对话型（需 response） | 输入框上方内联面板 |
| `input` | 对话型（需 response） | 输入框上方内联面板 |
| `editor` | 对话型（需 response） | 输入框上方内联面板 |
| `notify` | 广播型 | Obsidian Notice |
| `setStatus` | 广播型 | 输入框上方状态栏 |
| `setWidget` | 广播型 | 输入框上方状态栏 |
| `setTitle` | 广播型 | 聊天面板 header |
| `set_editor_text` | 广播型 | 输入框 |

所有方法已使用 TypeScript discriminated union（`ExtensionUiRequest`），
`handleRequest(event: ExtensionUiRequest)` switch 获得 narrowing。

---

## 优先级总结

| 层级 | 内容 | 状态 |
|------|------|------|
| 🚨 P0 | Extension UI 协议 | ✅ 已完成 |
| 🔴 P1 | 漏掉的关键事件（`auto_retry_*`、`message_update` 子事件、`turn_*`） | 待做（类型已定义，运行时未处理） |
| 🟡 P2 | 有用的命令（`bash`、`set_auto_retry`） | 待做 |
| 🟢 P3 | 锦上添花（`fork`/`clone`、`export_html`、`session_name` 等） | 待做 |
