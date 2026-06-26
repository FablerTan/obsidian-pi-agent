# pi 通信模块 — `src/pi/`

## `rpc-client.ts`

### 职责

管理 pi 子进程生命周期，提供 JSONL 协议通信。支持多个订阅者。

### API

| 方法 | 说明 |
|------|------|
| `start(cwd)` | 启动 `pi --mode rpc` 子进程，等待就绪后 resolve；超时传递 10s |
| `stop()` | 杀掉 pi 子进程，reject 所有 pending 请求 |
| `restart()` | 停止并重新启动子进程（stop + clear + start） |
| `send(command)` | 发送 JSON 命令到 pi，自动添加递增 ID；失败返回 null |
| `sendAndWait<T>(command, opts?)` | 发送命令并返回 Promise\<PiResponse\<T\>\>，等待对应 response |
| `prompt(message)` | 快捷发送 `{ type: 'prompt', message }` |
| `getSessionStats()` | 快捷调用 `get_session_stats` RPC |
| `setAutoCompaction(enabled)` | 启用/禁用自动压缩 |
| `sendExtensionUIResponse(id, data)` | 发送 Extension UI 交互响应 |

| 事件订阅 | 说明 |
|----------|------|
| `on(handler: (event: PiEvent) => void)` | 订阅 pi 事件，返回取消函数 |
| `onDisconnect(handler)` | 订阅 pi 意外退出，返回取消函数 |

### 错误类型

`PiRpcError`（继承 Error）:

| code | 说明 |
|------|------|
| `not_running` | pi 未运行（send/sendAndWait 时 proc 为 null） |
| `timeout` | 请求超时（默认 30s，可覆盖） |
| `process_exit` | pi 进程意外退出或主动停止 |
| `spawn_error` | spawn 失败（路径不存在、权限不足） |
| `write_error` | stdin.write 抛出异常（如 EPIPE） |

### 通信协议

```
插件 → pi: stdin.write(JSON.stringify({ id, ...command }) + '\n')
pi → 插件: stdout 逐行输出 JSONL（事件流 + response）
```

### 启动流程

1. `spawn(piPath, ['--mode', 'rpc'])`，用局部变量 `proc` 保存引用
2. 设置 stdout/stderr/exit 监听器（exit 处理器用 `this.proc === proc` 判断）
3. 发送 `get_state` 命令确认 pi 就绪（10 秒超时）
4. 就绪后应用自动压缩设置
5. 运行中意外退出 → `emitDisconnect()` 通知所有订阅者

### 数据流

```
stdout 'data' 事件 → buffer 累积 → processLines() 按 \n 切分
  → JSON.parse → handleEvent(event)
    → response 类型 + 有 pending → resolve pending（reject 超时/进程退出）
    → 其他 → emitEvent() 广播给所有订阅者
```

### 请求超时

- 默认 30s，调用方可通过 `opts.timeoutMs` 覆盖
- 超时后 reject PiRpcError，从 pending 中移除
- 进程退出时 reject 所有 pending 请求（不再永久挂起）

### 已知问题（历史）

- ~~`send()` 没有 try/catch，进程退出后写入会崩溃~~ ✅ 已修复（try/catch 包裹 stdin.write）
- ~~`sendAndWait()` 无超时，pi 卡住时 Promise 永久挂起~~ ✅ 已修复（默认 30s 超时，支持自定义）
- ~~`stop()` 不清理 pendingRequests~~ ✅ 已修复（stop + reject all）
- ~~事件回调单覆盖，多视图无法共用~~ ✅ 已修复（on() 订阅模式）

## `types.ts`

### 职责

依据 Pi RPC 协议（https://pi.dev/docs/latest/rpc）定义完整类型体系。

### 主要导出

| 导出 | 说明 |
|------|------|
| `PiEvent` | 事件 discriminated union（17 种事件类型） |
| `AssistantMessageEvent` | 流式 delta 联合（12 种子类型） |
| `ExtensionUiRequest` | Extension UI 请求联合（9 种方法） |
| `PiResponse<T>` | 命令响应泛型 |
| `GetStateData` / `GetCommandsData` / `GetSessionStatsData` | 响应 data 形状 |
| `extractText(content)` | 从 content 中提取纯文本 |
| `AgentMessage` / `AssistantMessage` / `ToolResultMessage` | 消息类型 |
| `Model` | 模型信息 |
| `ContentBlock` / `TextContent` / `ImageContent` | 内容块类型 |
