# RPC 机制未处理清单

对照 Pi RPC 协议文档（`pi --mode rpc`）与当前实现代码，整理出以下尚未处理的部分。

---

## 一、漏掉的 RPC 命令（插件没发出去的）

这些是 `pi --mode rpc` 支持的指令类型，但插件从未调用：

| 命令 | 作用 | 优先级 |
|------|------|--------|
| `steer` | AI 正在输出时插入引导消息（`streamingBehavior: "steer"`） | ⭐ 高 |
| `follow_up` | AI 完成后才发送的后续消息（`streamingBehavior: "followUp"`） | ⭐ 高 |
| `compact` | 手动压缩对话上下文 | ⭐ 高 |
| `set_auto_compaction` | 开启/关闭自动压缩 | ⭐ 高 |
| `get_session_stats` | 获取 token 用量、费用、上下文窗口 | ⭐ 高 |
| `bash` | 直接执行 shell 命令并加入对话上下文（非 LLM 工具调用） | 中 |
| `set_auto_retry` | 开启/关闭自动重试 | 中 |
| `fork` | 从某条消息创建分叉新会话 | 中 |
| `clone` | 复制当前分支为新会话 | 中 |
| `get_fork_messages` | 获取可分叉的消息列表 | 中 |
| `abort_bash` | 打断正在执行的 bash | 低 |
| `abort_retry` | 打断进行中的自动重试 | 低 |
| `export_html` | 导出会话为 HTML | 低 |
| `get_last_assistant_text` | 获取最后一条助手回复的纯文本 | 低 |
| `set_session_name` | 设置会话显示名称 | 低 |
| `set_steering_mode` / `set_follow_up_mode` | 配置队列投递模式（`all` / `one-at-a-time`） | 低 |

### 已实现的命令

以下 RPC 命令已在插件中处理：

| 命令 | 位置 |
|------|------|
| `prompt` | `rpc-client.ts` — `prompt()` 方法 |
| `abort` | `PiChatView.ts` — `abort()` 方法 |
| `new_session` | `PiChatView.ts` — `handleNewSession()` |
| `get_state` | `rpc-client.ts` — `start()` 中用于等待就绪；`InputStatusBar.ts` — 加载模型/思考层级 |
| `get_messages` | `HistoryPanel.ts` — `switchToSession()` / `loadMessages()` |
| `switch_session` | `HistoryPanel.ts` — `switchToSession()` |
| `get_commands` | `PiChatView.ts` — `loadCommands()` / `handleReload()` |
| `set_model` | `InputStatusBar.ts` — `selectModel()` |
| `get_available_models` | `InputStatusBar.ts` — `openModelPicker()` |
| `cycle_thinking_level` | `InputStatusBar.ts` — `cycleThinking()` |

---

## 二、漏掉的事件类型（pi 推过来但插件没处理）

`handlePiEvent()` 的 switch 中缺少以下 case，这些事件被静默丢弃：

| 事件 | 用途 | 影响 |
|------|------|------|
| ~~`agent_start`~~ | ~~AI 开始处理请求~~ | ✅ 已处理 |
| `turn_start` / `turn_end` | 一个回合开始/完成（含助手回复 + 工具结果） | 无法精确追踪回合边界 |
| `message_start` / `message_end` | 一条消息开始/完成 | 无法获取完整消息对象 |
| `queue_update` | 待处理队列变化（steering/followUp 数组） | 无法知道排了多少消息等待处理 |
| `compaction_start` / `compaction_end` | 压缩开始/完成 | 无法展示压缩状态 |
| `auto_retry_start` / `auto_retry_end` | 自动重试开始/完成 | 用户不知道在重试 |

### `message_update` 子事件中漏掉的

`assistantMessageEvent.type` 只处理了 `text_delta`、`thinking_start/delta/end`、`toolcall_start`、`text_start`，漏掉了：

| 子事件 | 用途 | 影响 |
|--------|------|------|
| `toolcall_delta` | 工具调用参数流式到达 | 无法实时显示参数构建过程 |
| `toolcall_end` | 工具调用完成（含完整 toolCall 对象） | 工具执行完成时缺少完整信息 |
| `text_end` | 文本块完成 | 无法感知文本块边界 |
| `done` | 消息完成（含 `stopReason`：`"stop"`/`"length"`/`"toolUse"`/`"error"`/`"aborted"`） | 无法知道消息为什么结束 |
| `error` (子类型) | 消息层出错（不同于顶层 `error` 事件） | 消息级别错误未能捕获 |

### 已处理的事件

| 事件 / 子事件 | 位置 |
|------|------|
| `agent_start` | `PiChatView.handlePiEvent()` — 设置 `isAgentActive` + 确保加载动画 |
| `agent_end` | `PiChatView.handlePiEvent()` — 清理状态 + 清除 `isAgentActive` |
| `message_update.text_delta` | `PiChatView.handlePiEvent()` — 追加助手文字 |
| `message_update.toolcall_start` | `PiChatView.handlePiEvent()` — 隐藏加载动画 |
| `message_update.thinking_start` | `PiChatView.handlePiEvent()` — 创建 ThinkingBlock |
| `message_update.thinking_delta` | `PiChatView.handlePiEvent()` — 追加思考内容 |
| `message_update.thinking_end` | `PiChatView.handlePiEvent()` — 完成思考块 |
| `message_update.text_start` | `PiChatView.handlePiEvent()` — 初始化 MarkdownMsg |
| `tool_execution_start` | `PiChatView.handlePiEvent()` — 创建 ToolCallMsg 卡片 |
| `tool_execution_update` | `PiChatView.handlePiEvent()` — 更新执行输出 |
| `tool_execution_end` | `PiChatView.handlePiEvent()` — 标记完成/失败 |
| `extension_error` | `PiChatView.handlePiEvent()` — 显示 Notice |
| `error` | `PiChatView.handlePiEvent()` — 显示 Notice |

---

## 三、Extension UI 协议 — 完全缺失 ⭐ 最严重

Pi 扩展可以通过 `ctx.ui.select()`、`ctx.ui.confirm()`、`ctx.ui.input()` 等与用户交互。在 RPC 模式下，这些调用被转换为 `extension_ui_request` 事件走 stdout 推送给客户端，客户端需要回传 `extension_ui_response` 给 stdin。

**当前插件完全不处理 `extension_ui_request`，也不发送 `extension_ui_response`。**

### 对话型方法（需回传 response）

| 方法 | 说明 | 期望的 response 格式 |
|------|------|----------------------|
| `select` | 弹出选项列表供用户选择 | `{"type":"extension_ui_response","id":"...","value":"选中项"}` |
| `confirm` | 确认弹窗 | `{"type":"extension_ui_response","id":"...","confirmed":true/false}` |
| `input` | 文字输入弹窗 | `{"type":"extension_ui_response","id":"...","value":"用户输入"}` |
| `editor` | 多行编辑弹窗 | `{"type":"extension_ui_response","id":"...","value":"编辑后的文本"}` |

所有对话型方法均可回传 `cancelled: true` 表示取消。

### 广播型方法（不需 response）

| 方法 | 说明 | 数据字段 |
|------|------|----------|
| `notify` | 显示通知 | `message` + `notifyType`（`info`/`warning`/`error`） |
| `setStatus` | 设置/清除状态栏文字 | `statusKey` + `statusText` |
| `setWidget` | 设置/清除部件 | `widgetKey` + `widgetLines` + `widgetPlacement` |
| `setTitle` | 设置窗口标题 | `title` |
| `set_editor_text` | 预设输入框文本 | `text` |

### 影响

没有 Extension UI 协议，依赖用户交互的扩展全部无法工作，例如：
- 安全确认弹窗（"允许执行危险命令？"）
- 交互式命令选择
- 需要用户输入参数的工具
- 通知推送

### 实现提示

- `rpc-client.ts` 的 `handleEvent()` 收到 `type === "extension_ui_request"` 时，应该走 `onEvent` 回调
- `PiChatView.handlePiEvent()` 需要增加 `case 'extension_ui_request'`，根据 `event.method` 分派到不同的 UI 交互
- `rpc-client.ts` 需要新增 `sendExtensionUIResponse(id, data)` 方法，组装 response JSON 写入 stdin

---

## 优先级总结

| 层级 | 内容 | 状态 |
|------|------|------|
| 🚨 ~~P0~~ | ~~Extension UI 协议（9 个子方法全部缺失）~~ | ✅ 已完成（`ExtensionUIHandler.ts`） |
| 🔴 P1 | 漏掉的关键事件（`queue_update`、`compaction_*`、`auto_retry_*`、`message_update` 子事件） | 待做 |
| 🟡 P2 | 有用的命令（`compact`、`get_session_stats`、`steer`/`follow_up`） | 待做 |
| 🟢 P3 | 锦上添花（`fork`/`clone`、`bash`、`export_html` 等） | 待做 |
