# Pi Agent 插件架构文档

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
    CommandMenu.ts      命令菜单（输入 / 时弹出命令列表）
    HistoryPanel.ts     历史会话管理器（读取、浮层、切换）
    NoteBar.ts          笔记栏（笔记名 + 选中文本追踪，位于输入框上方）
    WelcomePage.ts      欢迎页（首次对话前显示上下文和命令列表）
  utils/
    helpers.ts          工具函数（文本提取等）

styles.css              所有 UI 样式
docs/architecture.md    本文档
```

---

## 模块职责

### 1. `src/main.ts` — 插件入口

**职责**：插件的加载和卸载，注册全局资源。

| 方法 | 触发时机 | 做什么 |
|------|---------|--------|
| `onload()` | Obsidian 加载插件 | 注册 pi 图标、启动 RPC 客户端、注册聊天面板视图、添加侧栏图标 |
| `onunload()` | 禁用/卸载插件 | 关闭聊天面板、停止 pi 子进程 |
| `activatePiChatView()` | 用户点击侧栏图标 | 找到或创建聊天面板，切换到它 |
| `loadSettings()` | onload 中调用 | 从磁盘读取用户配置 |
| `saveSettings()` | 设置变更时 | 保存用户配置到磁盘 |

**关键流程**：
1. 注册自定义图标 `pi-logo`（pi.dev 官网 SVG）
2. 创建 `PiRpcClient`，传入 vault 路径并启动
3. 注册 `PI_CHAT_VIEW_TYPE` 视图，把 `PiRpcClient` 传给 `PiChatView`
4. 侧栏图标绑定 `activatePiChatView()`

**状态**：
- `settings` — 用户配置
- `piClient` — RPC 客户端实例

---

### 2. `src/pi/rpc-client.ts` — RPC 通信层

**职责**：管理 pi 子进程生命周期，提供 JSONL 协议通信。

| 方法 | 说明 |
|------|------|
| `start(cwd)` | 启动 `pi --mode rpc` 子进程，等待就绪后 resolve |
| `stop()` | 杀掉 pi 子进程 |
| `send(command)` | 发送 JSON 命令到 pi，自动添加递增 ID。返回 ID |
| `sendAndWait(command)` | 发送命令并返回 Promise，等待对应的 response |
| `prompt(message)` | 快捷发送 `{ type: 'prompt', message }` |

| 字段 | 说明 |
|------|------|
| `onEvent` | 外部事件回调（非 response 类型的消息都走这里） |
| `pendingRequests` | Map<id, resolve> 挂起的请求，收到 response 时匹配调用 |

**通信协议**：
```
插件 → pi: stdin.write(JSON.stringify({ id, ...command }) + '\n')
pi → 插件: stdout 逐行输出 JSONL（事件流 + response）
```

**启动流程**：
1. `spawn('/opt/homebrew/bin/pi', ['--mode', 'rpc'])`
2. 设置 stdout/stderr/exit 监听器
3. 发送 `get_state` 命令确认 pi 就绪
4. 10 秒超时未响应则 reject

**数据流**：
```
stdout 'data' 事件 → buffer 累积 → processLines() 按 \n 切分
  → JSON.parse → handleEvent(event)
    → response 类型 + 有 pending → resolve pending 请求
    → 其他 → onEvent 回调
```

---

### 3. `src/ui/PiChatView.ts` — 聊天面板核心

**职责**：Obsidian 右侧栏的聊天界面，消息展示与输入。

| 方法 | 说明 |
|------|------|
| `onOpen()` | 构建面板 DOM：顶栏、消息列表、输入框及状态栏 |
| `onClose()` | 清理事件回调 |
| `getIcon()` | 返回面板标签页图标名 `pi-logo`（拖拽移动用） |
| `addUserMessage(text)` | 添加用户消息气泡（蓝色，靠右） |
| `appendAssistantText(text)` | 追加助手回复文字（灰色，靠左），流式追加到同一条 |
| `showLoading()` / `hideLoading()` | 显示/隐藏加载动画（三个跳动圆点） |
| `clearLoadingTimeout()` | 清除 5 秒超时保护定时器 |
| `handlePiEvent(event)` | 处理 pi 返回的事件，更新 UI |
| `getOrCreateAssistantEl()` | 获取或创建当前助手消息气泡容器（DOM 查询 + 缓存） |
| `loadCommands()` | 从 pi 加载可用命令列表（`get_commands`），传给 CommandMenu |
| `handleNewSession()` | 发送 `new_session` RPC，清空消息列表 + 输入框 + 加载状态 |

| `handleHistory()` | 打开历史会话浮层（`/history` 命令触发） |
| `abort()` | 发送 `abort` RPC，重置 UI 状态，清除超时定时器 |
| `extractTextFromContent(content)` | 从 content 数组中提取纯文本 |
| `toggleNoteAttach()` | 切换是否将当前笔记路径作为上下文发送 |
| `updateNoteIcon()` | 更新笔记栏图标（pin-off / pin）+ 激活样式 |
| `updateCurrentNote()` | 从 `workspace.getActiveFile()` 读取当前笔记名和路径 |
| `updateSelectedText()` | 从 `activeEditor` 读取选中文本 |
| `captureSelectionBeforeFocusLost()` | 在焦点转移前（mousedown）抓取一次选区 |
| `updateSelectionDisplay()` | 更新选中字数 UI |

**关键字段**：
| 字段 | 类型 | 说明 |
|------|------|------|
| `textarea` | `HTMLTextAreaElement` | 输入框引用，/new 等命令需要清空 |
| `loadingTimeout` | `number \| null` | 5 秒超时保护定时器 ID，可精确清除 |
| `currentAssistantEl` | `HTMLElement \| null` | 当前助手气泡容器（文字 + 工具卡片共享） |
| `currentNotePath` | `string \| null` | 当前活动笔记的文件路径 |
| `currentNoteName` | `string \| null` | 当前活动笔记的文件名 |
| `noteAttached` | `boolean` | 是否将笔记路径附加到消息中 |
| `selectedText` | `string` | 当前编辑器中选中的文本（失焦时保留） |

**UI 结构**：
```
.pi-chat-wrapper (flex column, 100% 高, position: relative)
  ├── .pi-chat-header (顶栏：pi 图标 + 标题)
  └── .pi-chat-container (flex: 1)
        ├── .pi-chat-messages (消息列表，可滚动)
        └── .pi-chat-input-area (贴底)
              ├── .pi-command-menu (/ 命令弹出列表)
              ├── .pi-chat-note-bar (flex, space-between)
              │     ├── .pi-chat-note-left (pin图标 + 笔记名，点击切换笔记附加)
              │     └── .pi-chat-selection-info (选中字数「选中 N 字」)
              ├── .pi-chat-input (textarea 输入框)
              └── .pi-input-status-bar (模型 + 思考层级)
```

**事件驱动**（已处理的事件类型）：
| 事件 | 处理 |
|------|------|
| `message_update` + `text_delta` | 追加助手文字 |
| `message_update` + `toolcall_start` | 隐藏加载动画（纯工具回复无文字时） |
| `tool_execution_start` | 创建 ToolCallMsg 卡片，显示工具名称和参数 |
| `tool_execution_update` | 更新 ToolCallMsg 中的流式输出内容 |
| `tool_execution_end` | 标记 ToolCallMsg 完成/失败，显示结果 |
| `agent_end` | 回复完成，重置 `currentMarkdown` 和 `toolCalls` |
| `error` / `extension_error` | 显示错误 Notice |

**追踪状态**：
- `toolCalls: Map<string, ToolCallMsg>` — 以 `toolCallId` 为键，追踪正在执行的工具

**内置 `/` 命令**：
| 命令 | 处理 |
|------|------|
| `/new` | 调用 `handleNewSession()`，清空会话 + 输入框 + 加载状态 |
| `/history` | 调用 `handleHistory()`，打开历史会话浮层 |
| 其他 | 填入 `/命令名 ` 到输入框继续编辑 |

**安全机制**：
1. **IME 兼容**：`keydown` 中检查 `e.isComposing`，IME 组词期间不拦截 Enter 键，避免组词内容回填
2. **输出中禁发**：AI 正在输出（loadingEl / currentMarkdown / toolCalls 非空）时，Enter 静默忽略，需先 Esc 打断
3. **超时保护**：发消息后 5 秒无回复，移除加载动画并提示；`/new` `abort` 时主动清除定时器

**上下文组装**（发送消息时，将额外信息拼接到 Prompt 前）：
| 条件 | 拼接内容 |
|------|----------|
| 笔记附加开启 + `currentNotePath` 存在 | `[当前笔记: path/to/note.md]` |
| 编辑器中有选中文本 | `[选中文本 (N 字)]\n\n选中内容` |
| 两者都有 | 按顺序拼接，用 `\n\n` 分隔，最后跟用户消息 |

**上下文组装**：通过 `noteBar.getContextParts()` 获取格式化上下文片段数组，`PiChatView` 在 Enter 发送时拼接到消息前。

---

### 4. `src/ui/NoteBar.ts` — 笔记栏（笔记名 + 选中文本）

**职责**：位于输入框上方，左侧显示当前笔记名（点击切换是否发送笔记路径），右侧显示编辑器中选中文本的行数和字数。

**API**：
| 方法/属性 | 说明 |
|-----------|------|
| `isAttached` | 是否将笔记路径作为上下文发送 |
| `notePath` | 当前笔记路径 |
| `getContextParts()` | 返回格式化的上下文片段数组 `[\"[当前笔记: path]\", \"[选中文本 (N 字)]\\n\\n...\"]` |
| `destroy()` | 清理事件监听 |

**事件绑定**：
- `file-open` → 切换笔记时刷新显示，切换文件时清空选中文本
- `editor-change` → 编辑器内容变化时刷新选中文本，无选中则清空
- `containerEl.mouseup` → 检测点击是否在编辑器内部，在编辑器内无选中则清空，编辑器外保留
- `textarea.mousedown` → 焦点转移前抓取一次选区

**UI 结构**：
```
.pi-chat-note-bar (flex, space-between)
  ├── .pi-chat-note-left (pin图标 + 笔记名，点击切换)
  │     ├── pi-chat-note-icon (pin-off / pin)
  │     └── pi-chat-note-name (max-width 180px, 截断)
  └── .pi-chat-selection-info (「选中 N 行 M 字」)
```

**选中文本保活策略**：
- 只有编辑器中有**新的非空选中**时才更新
- 编辑器失焦（点击 Pi 面板等）不覆盖，保留上次选中供发送
- 编辑器内部点击无选中 → 清空（用户移动了光标）
- 切换/关闭文件 → 清空

---

### 5. `src/ui/WelcomePage.ts` — 欢迎页

**职责**：首次对话前显示 Pi Agent 标题、上下文文件列表、可用命令列表（按 source 分组）。

| 方法 | 说明 |
|------|------|
| `loadData()` | 异步加载上下文文件和命令列表并渲染 |
| `remove()` | 移除欢迎页 DOM |

**数据来源**：
- 上下文文件：从 vault 路径下的 `.pi/agent/` 目录读取 `.md`/`.txt` 文件
- 命令列表：通过 `piClient.sendAndWait({ type: \"get_commands\" })` 获取

---

### 6. `src/ui/HistoryPanel.ts` — 历史会话管理器

**职责**：读取 pi 会话文件、显示 iOS 风格底部浮层、切换会话。

| 方法 | 说明 |
|------|------|
| `open()` | 创建半透明背景 + 底部浮层，显示会话列表 |
| `readSessions()` | 从 `~/.pi/agent/sessions/` 读取当前 vault 的会话列表 |
| `switchToSession(path)` | 发送 `switch_session` + `get_messages`，切换会话 |
| `loadMessages(messages)` | 清空消息列表，渲染历史消息 |

**构造参数**：`(piClient, messagesEl, contentEl, app)`

**显示优先级**（会话标题）：
1. header 中的 `name` 字段
2. 第一条用户消息（取前 40 字）
3. 时间戳

---

### 7. `src/ui/MarkdownMsg.ts` — 流式 Markdown 渲染

**见 MarkdownMsg.ts 顶部注释**，渲染 AI 回复并增强代码块（语言标签 + 复制按钮）。

---

### 8. `src/ui/ToolCallMsg.ts` — 工具调用卡片

**职责**：以卡片形式展示 Pi 调用的工具（bash、read、edit 等），包括名称、参数、执行状态和输出结果。

| 方法 | 说明 |
|------|------|
| `render()` | 构建卡片 DOM：头部图标 + 名称 + 参数摘要 + 展开/收起箭头 + 主体（参数详情 + 输出） |
| `setOutput(text)` | 设置/追加输出内容，自动展开卡片 |
| `setResult(result, isError)` | 标记执行完成，显示 ✓ 或 ✗ 图标，填入结果文本 |
| `extractResultText(result)` | 从 result 对象提取纯文本 |
| `formatArgsSummary()` | 格式化 args 为一行摘要（bash 显示命令，其他显示路径或首参） |

**UI 结构**：
```
.pi-chat-tool-call (卡片容器，border + border-radius)
  ├── .pi-chat-tool-header (可点击，切换展开/收起)
  │   ├── .pi-chat-tool-status (状态图标：旋转/✓/✗)
  │   ├── .pi-chat-tool-icon (工具类型图标)
  │   ├── .pi-chat-tool-name (工具名)
  │   ├── .pi-chat-tool-args-summary (一行参数摘要)
  │   └── .pi-chat-tool-toggle (展开/收起箭头)
  └── .pi-chat-tool-body (可折叠主体)
        ├── .pi-chat-tool-args-detail (JSON 参数详情)
        └── .pi-chat-tool-output (执行输出)
```

**行为**：
- 创建时默认收起（`.pi-chat-tool-body-collapsed`），有实时输出时自动展开
- 头部点击切换展开/收起
- 状态图标三态：旋转动画（执行中）、绿色 ✓（成功）、红色 ✗（失败）

**工具图标映射**（Lucide icons）：
| 工具 | 图标 |
|------|------|
| bash | terminal |
| read | file-text |
| edit | pencil |
| write | file-plus |
| grep / find | search |
| defuddle | globe |
| ls | list |
| cd | folder |

---

### 9. `src/ui/CommandMenu.ts` — 命令菜单

**职责**：输入框输入 `/` 时弹出命令建议列表，支持键盘导航和鼠标点击。

| 方法 | 说明 |
|------|------|
| `setCommands(items)` | 设置可用命令列表（从 `get_commands` 返回的数据填充） |
| `show(query)` | 按 query（`startsWith`）筛选命令并渲染下拉菜单 |
| `hide()` | 移除菜单 DOM |
| `isVisible()` | 菜单是否当前可见 |
| `handleKeydown(e)` | 键盘导航：↑↓ 切换、Enter 确认、Escape 关闭 |

**数据来源**：pi RPC `get_commands` 命令，返回 extension/ prompt 模板/ skill 三类命令。

**UI 结构**：
```
.pi-command-menu (absolute 定位，贴在输入框上方)
  └── ul.pi-command-list
        └── li.pi-command-item (.pi-command-item-selected 高亮)
              ├── .pi-command-icon (source 类型图标)
              ├── .pi-command-name (带 / 前缀)
              └── .pi-command-desc (描述文本)
```

**构造参数**：`(container, textarea, onSelect)`
- `container`：定位父容器（`.pi-chat-container`）
- `textarea`：输入框元素（维持焦点）
- `onSelect`：选中回调，填入 `/命令名 ` 到输入框

---

### 10. `src/utils/helpers.ts` — 工具函数

| 函数 | 说明 |
|------|------|
| `extractTextContent(content)` | 从消息 content（字符串或数组）中提取纯文本 |

---

### 11. `src/settings.ts` — 配置管理

**职责**：定义设置接口、默认值和设置页面 UI。

| 导出 | 说明 |
|------|------|
| `PiChatSettings` | 设置接口 |
| `DEFAULT_SETTINGS` | 默认配置 |
| `PiChatSettingTab` | 设置页面，继承 `PluginSettingTab` |

---

## 外部依赖

| 依赖 | 用途 |
|------|------|
| `obsidian` | Obsidian API 类型和基类 |
| `child_process` (Node.js) | 启动 pi 子进程 |
| `fs` (Node.js) | 读取历史会话文件 |
| `path` (Node.js) | 路径拼接 |
| `os` (Node.js) | 获取用户 home 目录 |

---

## 数据流全景

```
用户按 Enter
  → PiChatView 取输入框文字 → addUserMessage() 显示气泡
  → showLoading() → piClient.prompt(msg)
  → rpc-client send({ type:'prompt', message }) → stdin
  → pi 进程处理 → stdout JSONL
  → processLines() → handleEvent() → onEvent
  → PiChatView.handlePiEvent() → appendAssistantText() 更新 UI
```

```
点击历史图标
  → HistoryPanel.open()
    → readSessions() 读取 ~/.pi/agent/sessions/
    → 创建半透明遮罩 + 底部浮层
    → 选中会话 → switchToSession(path)
      → sendAndWait(switch_session) → sendAndWait(get_messages)
      → loadMessages() 清空并渲染历史
```

## 会话存储

- **位置**: `~/.pi/agent/sessions/--编码后的vault路径--/*.jsonl`
- **格式**: 每行一个 JSON 对象，第一行为 session header
- **共享**: 插件和终端 pi 共享同一份会话历史
- **持久化**: `--no-session` 已移除，每次对话自动保存
