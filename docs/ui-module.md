# UI 模块 — `src/ui/`

全部 UI 组件，包括聊天面板核心、笔记栏、思考链、欢迎页、历史会话、Markdown 渲染、工具调用卡片、命令菜单、底部状态栏。

---

## 1. `PiChatView.ts` — 聊天面板核心

**职责**：Obsidian 右侧栏的聊天界面，消息展示与输入。

### 方法

| 方法 | 说明 |
|------|------|
| `onOpen()` | 构建面板 DOM：顶栏、消息列表、输入框及状态栏 |
| `onClose()` | 清理事件回调和定时器 |
| `getIcon()` | 返回面板标签页图标名 `pi-logo`（拖拽移动用） |
| `addUserMessage(text)` | 添加用户消息气泡（蓝色，靠右） |
| `appendAssistantText(text)` | 追加助手回复文字（灰色，靠左），流式追加到同一条 |
| `showLoading()` / `hideLoading()` | 显示/隐藏加载动画（三个跳动圆点） |
| `clearLoadingTimeout()` | 清除 5 秒超时保护定时器 |
| `handlePiEvent(event)` | 处理 pi 返回的事件，更新 UI |
| `getOrCreateAssistantEl()` | 获取或创建当前助手消息气泡容器（DOM 查询 + 缓存） |
| `loadCommands()` | 从 pi 加载可用命令列表，传给 CommandMenu |
| `handleNewSession()` | 发送 `new_session` RPC，清空消息列表 + 输入框 + 加载状态 |
| `handleReload()` | 重启 pi 子进程，轮询 `get_commands`，对比新增/移除并显示 |
| `handleReloadSuccess(cmds, oldNames)` | reload 成功后渲染命令列表分组 |
| `handleReloadFallback(oldCmdList, oldNames)` | ⚠️ 死代码 — 定义了但从未被调用 |
| `fetchCurrentCmdNames()` | 获取当前命令名集合作为对比基准 |
| `renderReloadGroup(...)` | 渲染 reload 消息中的一个分组 |
| `renderReloadFromCache(...)` | get_commands 失败时用缓存数据回退渲染 |
| `handleHistory()` | 打开历史会话浮层 |
| `abort()` | 发送 `abort` RPC，重置 UI 状态 |
| `extractTextFromContent(content)` | 从 content 数组中提取纯文本 |
| `addSystemMessage(icon, title, bodyFn)` | 添加系统通知消息 |

> 笔记栏相关方法（`toggleNoteAttach`、`updateNoteIcon` 等）已重构到 `NoteBar` 模块。

### 关键字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `textarea` | `HTMLTextAreaElement` | 输入框引用 |
| `loadingTimeout` | `number \| null` | 5 秒超时保护定时器 ID |
| `currentAssistantEl` | `HTMLElement \| null` | 当前助手气泡容器 |
| `currentMarkdown` | `MarkdownMsg \| null` | 当前流式输出的 Markdown 实例 |
| `thinkingBlock` | `ThinkingBlock \| null` | 当前 AI 思考链折叠卡片 |
| `toolCalls` | `Map<string, ToolCallMsg>` | 追踪正在执行的工具调用 |
| `previousCmdNames` | `Set<string>` | 上一次加载的命令名集合（reload 对比用） |
| `isReloading` | `boolean` | reload 互斥锁 |

### UI 结构

```
.pi-chat-wrapper
  ├── .pi-chat-header (pi 图标 + 标题)
  └── .pi-chat-container
        ├── .pi-chat-messages (消息列表，可滚动)
        └── .pi-chat-input-area (贴底)
              ├── .pi-command-menu
              ├── .pi-chat-note-bar
              │     ├── .pi-chat-note-left (pin + 笔记名)
              │     └── .pi-chat-selection-info
              ├── .pi-chat-input (textarea)
              └── .pi-input-status-bar
```

### 事件处理

**已处理的事件**：

| 事件 | 处理 |
|------|------|
| `message_update` + `text_start` | 初始化 MarkdownMsg |
| `message_update` + `text_delta` | 追加助手文字 |
| `message_update` + `toolcall_start` | 隐藏加载动画 |
| `message_update` + `thinking_start` | 创建 ThinkingBlock |
| `message_update` + `thinking_delta` | 追加思考内容 |
| `message_update` + `thinking_end` | ThinkingBlock 标记完成 |
| `tool_execution_start` | 创建 ToolCallMsg 卡片 |
| `tool_execution_update` | 更新执行输出 |
| `tool_execution_end` | 标记完成/失败 |
| `agent_start` | 设置 `isAgentActive` + 确保加载动画 |
| `agent_end` | 清理状态 + 清除 `isAgentActive` |
| `compaction_start` | 显示「正在压缩…」系统消息 |
| `compaction_end` | 更新消息为完成/取消/失败（含释放 token 数） |
| `error` / `extension_error` | 显示 Notice |

**未处理的事件**（被静默丢弃）：详见 `docs/rpc-gaps.md`

### 内置 `/` 命令

| 命令 | 处理 |
|------|------|
| `/new` | 新会话 |
| `/reload` | 重启 pi 并对比命令变化 |
| `/history` | 历史会话浮层 |
| 其他 | 填入 `/命令名 ` 到输入框 |

### 安全机制

1. **IME 兼容**：检查 `e.isComposing`，组词期间不拦截 Enter；输入 `/` 命令时忽略 IME 拼音音节间的空格，不误藏命令菜单
2. **打断**：AI 输出时按 Escape 发送 `abort`
3. **超时保护**：5 秒无回复移除 loading

> ⚠️ AI 输出中按 Enter **不拦截**（文档早期版本描述有误），且 `prompt` 未传 `streamingBehavior`，Pi 返回错误但无人接收。

### 上下文组装

| 条件 | 拼接内容 |
|------|----------|
| 笔记附加开启 + 路径存在 | `[当前笔记: path/to/note.md]` |
| 编辑器中有选中文本 | `[选中文本 (N 字)]\n\n...` |
| 两者都有 | 按顺序拼接，`\n\n` 分隔 |

通过 `noteBar.getContextParts()` 获取片段，Enter 发送时拼接到消息前。

---

## 2. `NoteBar.ts` — 笔记栏

位于输入框上方，左侧笔记名（点击切换是否发送笔记路径），右侧选中文本行数和字数。

### API

| 方法/属性 | 说明 |
|-----------|------|
| `isAttached` | 是否将笔记路径作为上下文发送 |
| `notePath` | 当前笔记路径 |
| `getContextParts()` | 返回格式化上下文片段数组 |
| `destroy()` | 清理事件监听 |

### 事件绑定

- `file-open` → 切换笔记时刷新
- `editor-change` → 刷新选中文本
- `containerEl.mouseup` → 编辑器内无选中则清空
- `textarea.mousedown` → 失焦前抓取选区

### UI 结构

```
.pi-chat-note-bar
  ├── .pi-chat-note-left (pin 图标 + 笔记名)
  └── .pi-chat-selection-info (「选中 N 行 M 字」)
```

### 选中文本保活策略

- 只有**新的非空选中**才更新
- 失焦不覆盖，保留上次选中
- 编辑器内部点击无选中 → 清空
- 切换/关闭文件 → 清空

---

## 3. `ThinkingBlock.ts` — 思考链展示

以可折叠卡片显示 AI 内部推理过程。

| 方法 | 说明 |
|------|------|
| `append(text)` | 追加思考文本 |
| `finish()` | 标记完成，标题改为「思考完成」 |
| `expand()` | 展开卡片 |
| `toggle()` | 展开/收起切换 |

```
.pi-thinking-block
  ├── .pi-thinking-header (可点击)
  │   ├── .pi-thinking-icon (brain)
  │   ├── .pi-thinking-title
  │   └── .pi-thinking-toggle
  └── .pi-thinking-body (可折叠)
        └── .pi-thinking-content
```

---

## 4. `WelcomePage.ts` — 欢迎页

首次对话前显示 Pi Agent 标题、上下文文件列表、可用命令列表。

| 方法 | 说明 |
|------|------|
| `loadData()` | 异步加载上下文文件和命令列表并渲染 |
| `remove()` | 移除欢迎页 DOM |

**数据来源**：
- 上下文文件：vault 下 `.pi/agent/` 目录的 `.md`/`.txt` 文件
- 命令列表：`get_commands` RPC

---

## 5. `HistoryPanel.ts` — 历史会话管理器

读取 pi 会话文件、显示 iOS 风格底部浮层、切换会话。

| 方法 | 说明 |
|------|------|
| `open()` | 创建半透明背景 + 底部浮层 |
| `readSessions()` | 从 `~/.pi/agent/sessions/` 读取会话列表 |
| `switchToSession(path)` | 切换会话 |
| `loadMessages(messages)` | 清空并渲染历史消息 |

**构造参数**：`(piClient, messagesEl, contentEl, app)`

**会话标题优先级**：
1. header 中的 `name` 字段
2. 第一条用户消息（取前 40 字）
3. 时间戳

---

## 6. `MarkdownMsg.ts` — 流式 Markdown 渲染

渲染 AI 回复的 Markdown 并增强代码块（语言标签 + 复制按钮）。

| 方法 | 说明 |
|------|------|
| `append(text)` | 追加文字并触发渲染 |
| `getText()` | 获取累积纯文本 |

内部用 `MarkdownRenderer.render()` 渲染，每次追加后全量重渲染，通过 `rendering`/`needsRerender` 标志防并发。

---

## 7. `ToolCallMsg.ts` — 工具调用卡片

展示工具名称、参数、执行状态和输出结果。

| 方法 | 说明 |
|------|------|
| `setOutput(text)` | 设置输出内容，默认折叠 |
| `setResult(result, isError)` | 标记完成，显示 ✓/✗ |

**行为**：
- 三种状态：收起 → 限制5行 → 展开全部 → 收起
- 状态图标三态：旋转、绿色 ✓、红色 ✗
- 参数摘要一行显示（bash 展示命令，其他展示路径或首参）

**工具图标映射**：

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

## 8. `CommandMenu.ts` — 命令菜单

输入 `/` 时弹出命令建议列表，支持键盘导航和鼠标点击。

| 方法 | 说明 |
|------|------|
| `setCommands(items)` | 设置可用命令列表 |
| `show(query)` | 按任意连续子串筛选并渲染（IME 组合期间忽略拼音空格） |
| `hide()` | 移除菜单 |
| `isVisible()` | 菜单是否可见 |
| `handleKeydown(e)` | 键盘导航 |

**数据来源**：`get_commands` RPC

**图标映射**：

| source 类型 | 图标 |
|-------------|------|
| `extension` | puzzle |
| `skill`     | sparkles |
| `prompt`    | file-plus |
| 其他        | file-text |

**UI 结构**：
```
.pi-command-menu
  └── ul.pi-command-list
        └── li.pi-command-item
              ├── .pi-command-icon
              ├── .pi-command-name
              └── .pi-command-desc
```

**构造参数**：`(container, textarea, onSelect)`

---

## 9. `InputStatusBar.ts` — 底部状态栏

显示当前模型名和思考层级，支持交互切换。

| 方法 | 说明 |
|------|------|
| `loadState()` | 通过 `get_state` 加载状态 |
| `applyState(data)` | 应用状态到 UI |
| `openModelPicker()` | 弹出模型选择列表 |
| `selectModel(model)` | 选择模型 |
| `cycleThinking()` | 循环切换思考层级 |

**UI 结构**：
```
.pi-input-status-bar
  ├── .pi-status-btn (模型，点击弹列表)
  │     ├── .pi-status-icon (bot)
  │     └── .pi-status-label (模型名)
  ├── .pi-status-sep (·)
  └── .pi-status-btn (思考层级，点击循环)
        ├── .pi-status-icon (brain)
        └── .pi-status-label (off/min/med/high)
```

---

## 10. `ExtensionUIHandler.ts` — Extension UI 协议处理

处理 pi 扩展发起的用户交互请求。所有方法通过 `handleRequest(event)` 统一入口分派。

### 对话型方法（需用户操作后回传 response）

| 方法 | UI 展现 | 说明 |
|------|---------|------|
| `select` | 输入框上方内联面板（选项列表按钮） | 用户选择一项后回传 `value` |
| `confirm` | 输入框上方内联面板（消息 + 确认/取消按钮） | 用户确认/取消后回传 `confirmed` |
| `input` | 输入框上方内联面板（单行输入框 + 确定/取消） | 用户输入后回传 `value` |
| `editor` | 输入框上方内联面板（多行文本区 + 确定/取消） | 用户编辑后回传 `value` |

Escape 关闭面板时自动点击「取消」按钮，发送 `cancelled: true` 响应。

### 广播型方法（fire-and-forget）

| 方法 | 实现 |
|------|------|
| `notify` | `new Notice()` + 根据 warn/error 添加边框颜色 |
| `setStatus` | 输入框上方小状态条，Map 管理多 key |
| `setWidget` | 消息列表与输入区之间的浮动部件（aboveEditor/belowEditor） |
| `setTitle` | `document.title = title` |
| `set_editor_text` | 设置 textarea.value |

### 数据流向

```
pi 进程 → stdout (extension_ui_request) → rpc-client.handleEvent()
  → onEvent → PiChatView.handlePiEvent('extension_ui_request')
  → ExtensionUIHandler.handleRequest(event)
    → 对话型：弹出 Modal → 用户操作 → sendExtensionUIResponse(id, data) → stdin
    → 广播型：直接执行（Notice / 状态栏 / 部件等）
```

### 生命周期

- 构造：`onOpen()` 中实例化，传入 `app`、`piClient`、`textarea`
- 销毁：`onClose()` 中调用 `destroy()` 移除 DOM 元素

---

## 11. 测试扩展 — `.pi/extensions/test-ext-ui.ts`

用于手动验证 Extension UI 协议的 Pi 扩展，覆盖全部 9 个方法。

### 注册命令

| 命令 | 测试内容 |
|------|----------|
| `/test-ui` | 全流程：select → confirm → input → editor |
| `/test-select` | select 弹窗 |
| `/test-confirm` | confirm 弹窗 |
| `/test-input` | input 弹窗 |
| `/test-editor` | editor 弹窗 |
| `/test-prefill` | setEditorText（预设输入框） |
| `/test-notify` | 三种通知类型 info/warning/error |
| `/test-status` | setStatus 设置/清除状态栏 |
| `/test-widget` | setWidget 设置/清除部件 |
| `/test-title` | setTitle 修改窗口标题 |

### 自动触发场景

| 场景 | 触发的方法 |
|------|-----------|
| `/new` 新建会话 | confirm（确认是否清空） |
| LLM 调用 `rm -rf` 等危险命令 | select（选择放行/拦截） |
| 会话启动 | setTitle + setWidget + setStatus |
| turn 开始/结束 | setStatus 更新 |
| `/reload` 热重载 | notify（info 类型） |

### 使用方法

```bash
# 确保扩展被加载
pi --mode rpc --extension .pi/extensions/test-ext-ui.ts

# 或在终端 pi 中
/reload
/test-ui
```
