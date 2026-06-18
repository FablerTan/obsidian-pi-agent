# Pi Chat 插件架构文档

## 目录结构

```
src/
  main.ts               插件入口，生命周期管理
  settings.ts           设置接口 + 默认值 + 设置页面
  pi/
    rpc-client.ts       pi RPC 通信客户端
  ui/
    PiChatView.ts       聊天面板视图（核心 UI + 消息流）
    HistoryPanel.ts     历史会话管理器（读取、浮层、切换）
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
| `onOpen()` | 构建面板 DOM：顶栏、消息列表、历史按钮、输入框 |
| `onClose()` | 清理事件回调 |
| `addUserMessage(text)` | 添加用户消息气泡（蓝色，靠右） |
| `appendAssistantText(text)` | 追加助手回复文字（灰色，靠左），流式追加到同一条 |
| `showLoading()` / `hideLoading()` | 显示/隐藏加载动画（三个跳动圆点） |
| `handlePiEvent(event)` | 处理 pi 返回的事件，更新 UI |

**UI 结构**：
```
.pi-chat-wrapper (flex column, 100% 高, position: relative)
  ├── .pi-chat-header (顶栏：pi 图标 + 标题)
  └── .pi-chat-container (flex: 1)
        ├── .pi-chat-messages (消息列表，可滚动)
        ├── .pi-chat-history-bar (历史图标，靠右)
        └── .pi-chat-input (输入框)
```

**事件驱动**：
- `message_update` + `text_delta` → 追加助手文字
- `agent_end` → 回复完成
- `error` / `extension_error` → 显示错误 Notice

**超时保护**：发消息后 5 秒无回复，移除加载动画并提示。

---

### 4. `src/ui/HistoryPanel.ts` — 历史会话管理器

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

### 5. `src/utils/helpers.ts` — 工具函数

| 函数 | 说明 |
|------|------|
| `extractTextContent(content)` | 从消息 content（字符串或数组）中提取纯文本 |

---

### 6. `src/settings.ts` — 配置管理

**职责**：定义设置接口、默认值和设置页面 UI。

| 导出 | 说明 |
|------|------|
| `MyPluginSettings` | 设置接口（当前为占位） |
| `DEFAULT_SETTINGS` | 默认配置 |
| `SampleSettingTab` | 设置页面，继承 `PluginSettingTab` |

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
