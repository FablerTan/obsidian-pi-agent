# 已知问题

当前代码中存在的 Bug、安全性问题、功能缺陷。详见各模块源码注释和 `docs/rpc-gaps.md`。

> **进度**: 以下 ✅ 标记的问题已在架构重构中修复。

---

## Bug

| 问题 | 文件 | 说明 | 状态 |
|------|------|------|------|
| `handleReloadFallback` 死代码 | `PiChatView.ts` | 定义了但从未被调用，reload 超时后没有回退显示 | ✅ **已修复** — 搬至 `ReloadService`，`run()` 失败时调 `handleReloadFallback` |
| `handleReloadSuccess` 未用参数 | `PiChatView.ts` | `oldCmdList` 参数在函数体内未使用 | ✅ **已修复** — 重构后消除 |
| `renderReloadGroup` 死代码 | `PiChatView.ts` | `removedNames.delete(item.name)` 永远不会执行 | ✅ **已修复** — 重构后逻辑正常执行 |
| 错误信息不具体 | `PiChatView.ts` | `error`/`extension_error` 只显示「Pi 返回了错误」，没有具体内容 | ✅ **已修复** — 事件类型化后 `handlePiEvent` 显示具体错误信息 |

## 安全性

| 问题 | 文件 | 说明 | 状态 |
|------|------|------|------|
| `send()` 无错误处理 | `rpc-client.ts` | `stdin.write()` 没有 try/catch，进程退出后写入会崩溃 | ✅ **已修复** — try/catch 包裹，失败返回 null |
| `sendAndWait` 无超时 | `rpc-client.ts` | 除 `get_state` 外所有调用都没有超时，pi 卡住时 Promise 永久挂起 | ✅ **已修复** — 默认 30s 超时，`opts.timeoutMs` 可覆盖 |
| `onClose` 清理不完整 | `PiChatView.ts` | `loadingTimeout` 定时器没有 clear，视图销毁后可能操作已销毁的 DOM | ✅ **已修复** — `onClose` + `resetTurnAndPhase` 均清理 |
| `stop()` 不清理 pending | `rpc-client.ts` | 直接 `stop()` 时 `pendingRequests` 不清空，可能内存泄漏 | ✅ **已修复** — `stop()` reject 所有 pending 并清空 Map |
| 输入框事件监听器泄露 | `PiChatView.ts` / `InputStatusBar.ts` | 视图关闭后 document 级监听器未移除 | ✅ **已修复** — `registerDomEvent` + `InputStatusBar.destroy` |
| 数据竞争：`restart()` 期间新旧 exit 处理器 | `rpc-client.ts` | 旧进程的异步 `exit` 可能在 `restart()` 后触发，覆盖新进程引用 | ✅ **已修复** — exit 处理器用 `this.proc === proc` 判断，`stop()` 调用 `removeAllListeners('exit')` |

## 功能缺陷

| 问题 | 说明 | 状态 |
|------|------|------|
| AI 输出中按 Enter 不拦截 | `prompt` 未传 `streamingBehavior`，Pi 可能返回错误 | ⚠️ **部分修复** — `phase === 'idle'` 检查拦截，但未传 `streamingBehavior` |
| `handleNewSession` 期间可发消息 | 异步 `new_session` 未完成时用户按 Enter 会发 prompt 到旧会话 | ⚠️ 仍存在 |
| `getOrCreateAssistantEl` 可能复用旧气泡 | `agent_end` 后 DOM 中还有最后一个 assistant 气泡，后续消息会被追加到旧消息 | ✅ **已修复** — `TurnContext` + `AssistantMessageView` 每回合独立新建气泡 |

## 架构层面

| 问题 | 说明 | 状态 |
|------|------|------|
| `onEvent` 单回调不支持多视图 | 后打开的视图覆盖前一个的 onEvent | ✅ **已修复** — `on()` 订阅模式，多视图可同时订阅 |
| PiChatView 上帝类（856 行） | 承担过多职责 | ✅ **已修复** — 拆到 6 个协作服务，降到 576 行 |
| 事件/响应类型全部 `any` | 缺乏类型安全 | ✅ **已修复** — 定义 `PiEvent`/`ExtensionUiRequest` discriminated union |
| 回合状态散落、清理代码重复 | 4 个字段 ± 3 个布尔标志，清理重复 4 次 | ✅ **已修复** — `TurnContext` 封装 + `ChatPhase` 状态机 |
| `enhanceCodeBlocks` 两份 | MarkdownMsg + HistoryPanel 各一份 | ✅ **已修复** — 抽 `code-blocks.ts` 公共函数 |
| `extractTextContent` 与 `extractText` 两套实现 | 多个模块各写各的提取逻辑 | ✅ **已修复** — 统一到 `pi/types.extractText` |
| 流式与历史回放 DOM 结构不一致 | 前者用子 div，后者直接渲染到气泡 | ✅ **已修复** — `AssistantMessageView` 共用 |
| `HistoryPanel` 直读 session 文件 | 与 pi 内部格式强耦合 | ✅ **已修复** — `SessionFileReader` 隔离 |
| 同步 IO | `readdirSync`/`readFileSync` 阻塞 UI 线程 | ✅ **已修复** — 全部改为 `fs/promises` |
| 设置双真相源 | `PiChatSettings` vs `.pi/settings.json` 不一致 | ✅ **已修复** — `compactionMode/Percent` 移出 PiChatSettings，`.pi/settings.json` 为单一源 |

## 剩余问题

| 问题 | 说明 |
|------|------|
| `streamingBehavior` 未传 | `prompt` 缺少 `streamingBehavior: "steer"`，AI 输出时发送可能返回错误 |
| `handleNewSession` 竞态 | 异步执行期间仍可发消息到旧会话 |
| `turn_*`/`message_*`/`auto_retry_*` 事件 | 已被代码识别（空 case），但未处理 |
| `message_update.toolcall_delta`/`toolcall_end`/`text_end`/`done`/`error` | 流式子事件未被利用 |
