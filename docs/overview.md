# 总览

## 外部依赖

| 依赖 | 用途 |
|------|------|
| `obsidian` | Obsidian API 类型和基类 |
| `child_process` (Node.js) | 启动 pi 子进程 |
| `fs/promises` (Node.js) | 读取历史会话文件、扩展磁盘扫描 |
| `path` (Node.js) | 路径拼接 |
| `os` (Node.js) | 获取用户 home 目录 |

## 数据流全景

### 发送消息

```
用户按 Enter (Ctrl+Enter)
  → NoteBar.getContextParts() 组装上下文
  → phase === 'idle'? 检查通过
  → addUserMessage() 显示用户气泡
  → showLoading() 显示加载动画
  → piClient.prompt(msg) → rpc-client send({type:'prompt',message}) → stdin
  → pi 进程处理 → stdout JSONL
  → processLines() → handleEvent()
  → on() 订阅 → PiChatView.handlePiEvent(event)
    → message_update.text_delta → turn.appendText(delta)
      → AssistantMessageView.appendText() → MarkdownMsg.append() → 增量渲染
    → tool_execution_start → turn.addToolCall() → ToolCallMsg 卡片
    → tool_execution_update → turn.updateToolCall() → 更新卡片输出
    → tool_execution_end → turn.endToolCall() → 标记完成
    → agent_end → resetTurnAndPhase()
```

### 切换历史会话

```
点击历史图标
  → HistoryPanel.open()
    → readSessions(app)  → SessionFileReader 异步读取 ~/.pi/agent/sessions/
    → 创建半透明遮罩 + 底部浮层
    → 选中会话 → switchToSession(path)
      → sendAndWait(switch_session) → sendAndWait(get_messages)
      → loadMessages() 清空并渲染历史消息
        → 每条 assistant 消息创建 AssistantMessageView
        → renderFinal(message) 一次性渲染
        → toolResult 消息 applyToolResult() 填入结果
```

### /reload

```
用户输入 /reload
  → phase = 'reloading'（互斥锁，防止重复触发）
  → ReloadService.run()
    → lockState() 快照旧命令名列表
    → piClient.restart() 重启子进程
    → 轮询 get_commands（最多 12 次 × 800ms）
    → handleReloadSuccess() 或 handleReloadFallback()
    → 通过 SystemMessageRenderer 展示结果
  → phase = 'idle'
```

## 事件订阅

PiRpcClient 支持多个视图同时订阅 pi 事件：

```ts
// 返回取消订阅函数，视图 onClose 时调用
const unsub = piClient.on(event => handleEvent(event));
const disconnectUnsub = piClient.onDisconnect(reason => {
    // pi 意外退出时触发
});
```

## 会话存储

- **位置**: `~/.pi/agent/sessions/--编码后的vault路径--/*.jsonl`
- **格式**: 每行一个 JSON 对象，第一行为 session header
- **共享**: 插件和终端 pi 共享同一份会话历史
- **读取**: 已隔离到 `src/utils/session-file-reader.ts`，异步 IO
- **持久化**: 每次对话自动保存

## 设置

- **Obsidian data.json**: 存储插件自身的 UI 偏好（pi 路径、自动压缩开关、资源路径）
- **`.pi/settings.json`**: 项目级设置，pi 进程读取（压缩阈值、资源路径）
- **设计原则**: `.pi/settings.json` 是运行时配置的单一真相源；
  Obsidian 设置面板是其编辑器，不独自分叉配置值
