# UI 模块 — `src/ui/`

全部 UI 组件。核心聊天面板 `PiChatView` 通过协作服务分工：
- **回合渲染** → `TurnContext` → `AssistantMessageView`
- **命令路由** → `CommandRouter`
- **reload 业务** → `ReloadService`
- **stats 业务** → `StatsService`
- **系统消息** → `SystemMessageRenderer`

---

## 1. `PiChatView.ts` — 聊天面板核心（576 行）

**职责**：Obsidian 右侧栏的聊天面板生命周期、UI 构建、事件分发、阶段状态机。

### 外部协作

| 协作服务 | 视图持有的引用 |
|----------|---------------|
| `TurnContext` | `turn` — 当前回合上下文 |
| `SystemMessageRenderer` | `systemMsg` — 系统消息渲染 |
| `ReloadService` | `reloadService` — /reload + 命令加载 + 扩展发现 |
| `StatsService` | `statsService` — /stats 查询渲染 |
| `CommandRouter` | `commandRouter` — 命令菜单分派 |
| `NoteBar` | `noteBar` — 笔记栏 |
| `HistoryPanel` | `historyPanel` — 历史会话 |
| `InputStatusBar` | `inputStatusBar` — 底部状态栏 |
| `ExtensionUIHandler` | `extUiHandler` — Extension UI 协议 |
| `CommandMenu` | `commandMenu` — 命令菜单 |

### 阶段状态机

```ts
type ChatPhase = 'idle' | 'thinking' | 'reloading';
```

| 阶段 | 进入 | 离开 |
|------|------|------|
| `idle` | (初始) / agent_end / error / abort / reload 完成 | 发消息 → loading |
| `thinking` | agent_start | agent_end / error / abort |
| `reloading` | handleReload | reload 完成 |

- `isCompacting` 为独立布尔标志（可与 `thinking` 重叠，如 overflow 压缩）
- 发送消息检查：`phase === 'idle' && !isCompacting`
- Escape 打断检查：`phase === 'thinking'`

### 事件处理 (handlePiEvent)

```
agent_start       → phase=thinking, new TurnContext, showLoading
agent_end         → resetTurnAndPhase(), updateContextUsage
message_update    → 委托 turn (appendText/startThinking等)
tool_execution_*  → 委托 turn (addToolCall/updateToolCall/endToolCall)
compaction_start  → isCompacting=true, systemMsg.add('正在压缩')
compaction_end    → isCompacting=false, 更新/重写系统消息
error             → resetTurnAndPhase(), Notice(具体错误信息)
extension_error   → resetTurnAndPhase(), Notice(具体错误信息)
extension_ui_request → extUiHandler.handleRequest(event)
turn_*/message_*/auto_retry_*/queue_update → 暂未处理（空 case）
```

### UI 结构

```
.pi-chat-wrapper
  ├── .pi-chat-header (pi 图标 + 标题)
  └── .pi-chat-container
        ├── .pi-chat-messages (消息列表，可滚动)
        └── .pi-chat-input-area (贴底)
              ├── .pi-ext-inline-container
              ├── .pi-command-menu
              ├── .pi-chat-note-bar
              │     ├── .pi-chat-note-left (pin + 笔记名)
              │     └── .pi-chat-selection-info
              ├── .pi-chat-input (textarea)
              └── .pi-input-status-bar
```

---

## 2. `TurnContext.ts` — 当前回合渲染上下文

**职责**：一次 AI 回合（agent_start → agent_end）的薄适配器。持有 `AssistantMessageView`，把流式 delta 委托给它，并在内容到达时隐藏加载动画。

| 方法 | 委托目标 |
|------|----------|
| `appendText(delta)` | view.appendText(delta) + onActivity |
| `ensureTextContainer()` | view.ensureTextContainer() |
| `startThinking()` | view.startThinking() |
| `appendThinking(delta)` | view.appendThinking(delta) |
| `endThinking()` | view.endThinking() |
| `addToolCall(id, name, args)` | view.addToolCall(id, name, args) |
| `updateToolCall(id, partial)` | view.updateToolCall(id, partial) |
| `endToolCall(id, result, err)` | view.endToolCall(id, result, err) |

回合结束（agent_end/error/abort）时，`PiChatView.resetTurnAndPhase()`
将 `turn` 置 null，下一回合新建。

---

## 3. `AssistantMessageView.ts` — 单条助手消息视图

**职责**：一条助手消息气泡（`.pi-chat-msg-assistant`）的渲染原语。
流式与历史回放共用，保证 DOM 结构一致。

### 流式 API

| 方法 | 说明 |
|------|------|
| `appendText(delta)` | 追加流式文本（隐藏 loading + 确保 MarkdownMsg + 追加） |
| `ensureTextContainer()` | 确保 Markdown 文本容器存在 |
| `startThinking()` | 创建 ThinkingBlock，重置 markdown |
| `appendThinking(delta)` | 追加思考文本，自动展开 |
| `endThinking()` | 标记思考完成 |
| `addToolCall(id, name, args)` | 创建 ToolCallMsg 卡片 |
| `updateToolCall(id, content)` | 更新卡片输出 |
| `endToolCall(id, result, isError)` | 标记卡片完成/失败 |

### 回放 API

| 方法 | 说明 |
|------|------|
| `renderFinal(message)` | 一次性渲染完整 AssistantMessage（text + thinking + toolCall） |
| `applyToolResult(id, result, isError)` | 填入 toolResult 消息 |

### 渲染顺序

`renderFinal` 严格保留 `text → thinking → toolCall` 的块顺序：
- 连续 text 块合并为一次 Markdown 渲染
- 遇到 thinking/toolCall 先 flush 待写文本，再渲染该块

### opts

```ts
interface AssistantMessageViewOpts {
  onActivity?: () => void;    // 流式：通知视图隐藏 loading
  onToolCall?: (id: string) => void;  // 回放：记录 toolCallId → view 映射
}
```

---

## 4. `MarkdownMsg.ts` — 流式 Markdown 渲染

内部用 `MarkdownRenderer.render()`，每次追加后全量重渲染，通过 `rendering`/`needsRerender` 标志防并发。
渲染完成后调用 `code-blocks.ts` 的 `enhanceCodeBlocks()` 增强代码块。

| 方法 | 说明 |
|------|------|
| `append(text)` | 追加文字并触发渲染 |
| `getText()` | 获取累积纯文本 |

---

## 5. `ToolCallMsg.ts` — 工具调用卡片

展示工具名称、参数、执行状态和输出结果。

| 方法 | 说明 |
|------|------|
| `setOutput(text)` | 设置输出内容，默认折叠 |
| `setResult(result, isError)` | 标记完成（✓/✗），结果文本通过 `extractText(result.content)` 提取 |

**三态切换**: 收起 → 限制5行 → 展开全部 → 收起

---

## 6. `ThinkingBlock.ts` — 思考链展示

可折叠卡片，显示 AI 内部推理过程。

| 方法 | 说明 |
|------|------|
| `append(text)` | 追加思考文本 |
| `finish()` | 标记完成 |
| `expand()` | 展开卡片（收到新内容时自动调用） |

---

## 7. `CommandMenu.ts` — 命令菜单

输入 `/` 时弹出命令建议列表，支持键盘导航。

| 方法 | 说明 |
|------|------|
| `setCommands(items)` | 设置可用命令列表 |
| `show(query)` | 按子串筛选并渲染 |
| `hide()` | 移除菜单 |
| `handleKeydown(e)` | 键盘导航（↑↓→Enter→Esc） |

`CommandItem.source` 类型支持 `'extension' | 'prompt' | 'skill' | (string & {})`，
兼容 pi 返回的自定义 source 标签（如 `model`、`tool`）。

---

## 8. `CommandRouter.ts` — 命令路由器

**职责**：收拢命令菜单的回调分派，替代原始 if-else 链。

```ts
class CommandRouter {
  constructor(commandMenu, textarea, handlers: BuiltinHandlers)
  handle(cmd): void  // 分派到 handlers[cmd.name] 或回填输入框
}
```

`BuiltinHandlers` 包含 `newSession` / `reload` / `history` / `compact` / `stats`。
非内置命令回填到输入框（`/命令名 `），用户补全参数。

---

## 9. `HistoryPanel.ts` — 历史会话管理器

读取 pi 会话文件、显示 iOS 风格底部浮层、切换会话。

| 方法 | 说明 |
|------|------|
| `open()` | 异步读取会话列表 → 创建浮层 |
| `switchToSession(path)` | 切换会话 |
| `loadMessages(messages)` | 清空并渲染历史消息 |

**渲染**：每条 assistant 消息创建 `AssistantMessageView` → `renderFinal(message)`
→ `applyToolResult()` 填入后续 toolResult 消息。

**会话文件读取**：委托给 `src/utils/session-file-reader.ts` 异步读取。

---

## 10. `NoteBar.ts` — 笔记栏

位于输入框上方，左侧笔记名（点击切换是否发送笔记路径），右侧选中文本行数和字数。

| 方法 | 说明 |
|------|------|
| `isAttached` | 是否将笔记路径作为上下文发送 |
| `getContextParts()` | 返回格式化上下文片段数组 |
| `destroy()` | 清理事件监听 |

---

## 11. `InputStatusBar.ts` — 底部状态栏

显示当前模型名和思考层级，支持交互切换。

| 方法 | 说明 |
|------|------|
| `loadState()` | 通过 `get_state` 加载状态 |
| `openModelPicker()` | 弹出模型选择列表 |
| `selectModel(model)` | 选择模型（发 `set_model` RPC） |
| `cycleThinking()` | 循环切换思考层级 |
| `updateContextUsage()` | 更新 Token 用量显示 |
| `destroy()` | 清理 activeDocument 点击监听器 |

---

## 12. `WelcomePage.ts` — 欢迎页

首次对话前显示 Pi Agent 标题、上下文文件列表、可用命令列表。

| 方法 | 说明 |
|------|------|
| `loadData(extensions?)` | 异步加载上下文文件和命令列表并渲染 |
| `remove()` | 移除欢迎页 DOM |

**分组渲染**：使用 `command-groups.ts` 的 `groupCommandsBySource()` 共用实现。

---

## 13. `ExtensionUIHandler.ts` — Extension UI 协议处理

处理 pi 扩展发起的 4 种对话框方法 + 5 种广播方法。

| 对话型 | UI 位置 |
|--------|---------|
| `select` | 输入框上方内联面板（选项按钮列表） |
| `confirm` | 输入框上方内联面板（确认/取消） |
| `input` | 输入框上方内联面板（单行输入 + 确定/取消） |
| `editor` | 输入框上方内联面板（多行编辑 + 确定/取消） |

| 广播型 | 实现 |
|--------|------|
| `notify` | `new Notice()` |
| `setStatus` | 输入框上方状态栏 |
| `setWidget` | 输入区上下浮动部件 |
| `setTitle` | 窗口标题 |
| `set_editor_text` | 设置 textarea 内容 |

`handleRequest(event: ExtensionUiRequest)` — 各 method 对应的 Request 类型独立（`SelectRequest`/`ConfirmRequest` 等），switch 得到 narrowing。

---

## 14. `SystemMessageRenderer.ts` — 系统消息渲染器

在消息流中插入一条系统通知（带 icon + 标题 + body），用于压缩/统计/reload 结果。

```ts
class SystemMessageRenderer {
  constructor(messagesEl, onBeforeInsert)
  add(icon, title, bodyFn): HTMLElement  // 返回根元素供后续更新
}
```

`onBeforeInsert` 回调在插入前移除欢迎页（如果存在）。

---

## 15. `ReloadService.ts` — /reload 服务 + 命令加载 + 扩展发现

**职责**：从 PiChatView 抽离的整片 reload 业务：

| 方法 | 说明 |
|------|------|
| `loadCommands()` | 加载命令列表并设置到 `CommandMenu` |
| `run()` | reload 主流程（重启 pi → 轮询 get_commands → 渲染结果） |
| `getExtensionInfo()` | 磁盘扫描 + commands 交叉验证的扩展列表 |

持有 `previousCmdNames`/`previousCmdList`/`lastRawCommands` 状态。

---

## 16. `StatsService.ts` — /stats 服务

```ts
class StatsService {
  async run(): Promise<void>
    // 调用 getSessionStats → 格式化为多行文本 → systemMsg.add()
}
```

---

## 17. `code-blocks.ts` — 代码块增强工具

```ts
function enhanceCodeBlocks(container: HTMLElement): void
```

为 `pre > code` 加语言标签 + 点击复制功能。已增强的（`data-enhanced` 属性）跳过。

---

## 18. `command-groups.ts` — 命令分组工具

```ts
const SOURCE_LABELS: Record<string, string>  // extension→'扩展' etc.
const SOURCE_ORDER: string[]                 // 分组展示顺序
function groupCommandsBySource<T>(cmds, opts?): Array<{key, items}>
function sourceLabel(key): string
```

ReloadService 与 WelcomePage 共用。
