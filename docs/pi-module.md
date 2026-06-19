# pi 通信模块 — `src/pi/rpc-client.ts`

## 职责

管理 pi 子进程生命周期，提供 JSONL 协议通信。

## API

| 方法 | 说明 |
|------|------|
| `start(cwd)` | 启动 `pi --mode rpc` 子进程，等待就绪后 resolve |
| `stop()` | 杀掉 pi 子进程 |
| `restart()` | 停止并重新启动子进程（让新增 skill/extension 生效） |
| `send(command)` | 发送 JSON 命令到 pi，自动添加递增 ID。返回 ID |
| `sendAndWait(command)` | 发送命令并返回 Promise，等待对应的 response |
| `prompt(message)` | 快捷发送 `{ type: 'prompt', message }` |

| 字段 | 说明 |
|------|------|
| `onEvent` | 外部事件回调（非 response 类型的消息都走这里） |
| `pendingRequests` | Map<id, resolve> 挂起的请求，收到 response 时匹配调用 |

## 通信协议

```
插件 → pi: stdin.write(JSON.stringify({ id, ...command }) + '\n')
pi → 插件: stdout 逐行输出 JSONL（事件流 + response）
```

## 启动流程

1. `spawn('/opt/homebrew/bin/pi', ['--mode', 'rpc'])`，用局部变量 `proc` 保存引用
2. 设置 stdout/stderr/exit 监听器（exit 处理器用 `this.proc === proc` 判断，防止旧进程异步退出覆盖新进程）
3. 发送 `get_state` 命令确认 pi 就绪
4. 10 秒超时未响应则 reject

## 数据流

```
stdout 'data' 事件 → buffer 累积 → processLines() 按 \n 切分
  → JSON.parse → handleEvent(event)
    → response 类型 + 有 pending → resolve pending 请求
    → 其他 → onEvent 回调
```

## 已知问题

- `send()` 没有 try/catch，进程退出后写入会崩溃
- `sendAndWait()` 没有超时（除 `get_state` 外），pi 卡住时 Promise 永久挂起
- `stop()` 不清理 `pendingRequests`，可能内存泄漏
