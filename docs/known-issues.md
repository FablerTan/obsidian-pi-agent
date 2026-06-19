# 已知问题

当前代码中存在的 Bug、安全性问题、功能缺陷。详见各模块源码注释和 `docs/rpc-gaps.md`。

---

## Bug

| 问题 | 文件 | 说明 |
|------|------|------|
| `handleReloadFallback` 死代码 | `PiChatView.ts` | 定义了但从未被调用，reload 超时后没有回退显示 |
| `handleReloadSuccess` 未用参数 | `PiChatView.ts` | `oldCmdList` 参数在函数体内未使用 |
| `renderReloadGroup` 死代码 | `PiChatView.ts` | `removedNames.delete(item.name)` 永远不会执行 |
| 错误信息不具体 | `PiChatView.ts` | `error`/`extension_error` 只显示「Pi 返回了错误」，没有具体内容 |

## 安全性

| 问题 | 文件 | 说明 |
|------|------|------|
| `send()` 无错误处理 | `rpc-client.ts` | `stdin.write()` 没有 try/catch，进程退出后写入会崩溃 |
| `sendAndWait` 无超时 | `rpc-client.ts` | 除 `get_state` 外所有调用都没有超时，pi 卡住时 Promise 永久挂起 |
| `onClose` 清理不完整 | `PiChatView.ts` | `loadingTimeout` 定时器没有 clear，视图销毁后可能操作已销毁的 DOM |
| `stop()` 不清理 pending | `rpc-client.ts` | 直接 `stop()` 时 `pendingRequests` 不清空，可能内存泄漏 |
| 输入框事件监听器泄露 | `PiChatView.ts` / `InputStatusBar.ts` | 视图关闭后 document 级监听器未移除 |

## 功能缺陷

| 问题 | 说明 |
|------|------|
| AI 输出中按 Enter 不拦截 | 文档说会「静默忽略」但实际没有检查。`prompt` 未传 `streamingBehavior`，Pi 返回错误但无人接收 |
| `handleNewSession` 期间可发消息 | 异步执行期间用户按 Enter 会发 prompt 到旧会话 |
| `getOrCreateAssistantEl` 可能复用旧气泡 | `agent_end` 后如果 DOM 中还有最后一个 assistant 气泡，后续消息会被追加到旧消息 |

## RPC 缺失

详见 `docs/rpc-gaps.md`，按优先级：
- ~~P0 Extension UI 协议~~ ✅ 已完成（`ExtensionUIHandler.ts`、`test-ext-ui.ts`）
- P1 多个重要事件（`turn_start/end`、`message_start/end`、`auto_retry_*`、`message_update` 子事件等）被静默丢弃
- P2 多条命令（`compact`、`get_session_stats`、`steer`/`follow_up` 等）从未使用
- P3 锦上添花（`fork`/`clone`、`bash`、`export_html` 等）
