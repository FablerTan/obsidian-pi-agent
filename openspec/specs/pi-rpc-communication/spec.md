# Pi RPC 通信能力规格

## Purpose

Obsidian 插件通过 `child_process.spawn` 启动 `pi --mode rpc` 子进程，以 stdin/stdout JSONL 协议与其通信。本能力覆盖子进程生命周期、命令收发、事件订阅、超时与错误处理，是聊天面板、命令系统、历史会话等上层能力赖以运转的通信底座。

## Requirements

### Requirement: 子进程启动与就绪确认

`PiRpcClient` SHALL 在 `start(cwd)` 时 spawn `pi --mode rpc` 子进程，并向其发送 `get_state` 命令以 10 秒超时确认进程就绪，就绪后自动应用预设的自动压缩设置。

#### Scenario: 正常启动

- **WHEN** 调用 `start(cwd)` 且系统已安装 pi
- **THEN** 子进程被 spawn，`get_state` 在 10 秒内返回响应，`start()` resolve
- **AND** 启动完成后自动应用 `setAutoCompactionSilent` 预设的压缩开关

#### Scenario: spawn 失败

- **WHEN** pi 路径不存在或无执行权限导致 spawn 失败
- **THEN** 抛出 code 为 `spawn_error` 的 `PiRpcError`

#### Scenario: 启动超时

- **WHEN** `get_state` 在 10 秒内未返回响应
- **THEN** `start()` reject code 为 `timeout` 的 `PiRpcError`

### Requirement: 命令发送与递增 ID

`send(command)` SHALL 向 stdin 写入 `JSON.stringify({id, ...command}) + '\n'`，其中 id 为递增自增字段；stdin.write MUST 用 try/catch 包裹，失败时返回 `null` 而非抛出。

#### Scenario: 写入成功

- **WHEN** 子进程存活且调用 `send(cmd)`
- **THEN** 命令被序列化并写入 stdin，返回写入时附带的 id

#### Scenario: 子进程已退出时写入

- **WHEN** `proc` 为 null 或 stdin 已关闭时调用 `send(cmd)`
- **THEN** 返回 null，不抛出未捕获异常

### Requirement: 命令响应与超时

`sendAndWait<T>(command, opts?)` SHALL 返回 Promise，等待对应 id 的 `response` 后 resolve；未指定 `opts.timeoutMs` 时默认 30 秒超时，超时 MUST reject 并从 pending 表移除该 id。

#### Scenario: 正常响应

- **WHEN** 调用 `sendAndWait(cmd)` 且 pi 在 30 秒内返回对应 response
- **THEN** Promise resolve 为 `PiResponse<T>`

#### Scenario: 自定义超时

- **WHEN** 调用 `sendAndWait(cmd, { timeoutMs: 5000 })` 且 pi 5 秒内未响应
- **THEN** Promise reject code 为 `timeout` 的 `PiRpcError`，id 从 pending 移除

#### Scenario: 进程退出时清理 pending

- **WHEN** 子进程意外退出或主动 `stop()`
- **THEN** 所有 pending 请求 MUST reject code 为 `process_exit` 的错误并清空 pending Map

### Requirement: 事件广播订阅

`on(handler)` SHALL 把事件回调登记到订阅者列表，返回取消订阅函数；`onDisconnect(handler)` SHALL 在 pi 意外退出时被触发。多个视图 MUST 能同时订阅同一事件而不互相覆盖。

#### Scenario: 多视图订阅同一事件

- **WHEN** 视图 A 与视图 B 先后调用 `on(handler)`
- **THEN** 一次事件到达时 A、B 的 handler 都被调用

#### Scenario: 取消订阅

- **WHEN** 调用 `on()` 返回的 unsub 函数
- **THEN** 该 handler 从订阅列表中移除，不再收到后续事件

#### Scenario: 意外退出通知

- **WHEN** 子进程在运行中意外 exit
- **THEN** 所有 `onDisconnect` 订阅者被调用一次，且 exit 处理器通过 `this.proc === proc` 判断避免覆盖新进程引用

### Requirement: stdout 行解析与事件分发

stdout 的 data 事件 SHALL 累积到 buffer 并按 `\n` 切分逐行 `JSON.parse`；解析结果若为 `response` 且存在 pending 则 resolve 对应请求，否则通过 `emitEvent` 广播给订阅者。解析失败的行 MUST 被丢弃而不崩溃整个客户端。

#### Scenario: 多行一次到达

- **WHEN** stdout 一次 data 含 3 行 JSON
- **THEN** 3 个事件/response 依次被处理，未完成行保留在 buffer

#### Scenario: JSON 解析失败

- **WHEN** 某行非合法 JSON
- **THEN** 跳过该行，继续处理后续行，客户端不崩溃

### Requirement: 重启互斥

`restart()` SHALL 先 `stop()` 再 `start()`；stop 阶段 MUST reject 所有 pending、`removeAllListeners('exit')`，避免旧进程异步 exit 触发覆盖新进程引用的数据竞争。

#### Scenario: 重启期间旧进程事件

- **WHEN** restart 期间旧进程触发 exit
- **THEN** 新进程的 `this.proc` 引用不被覆盖

### Requirement: 错误类型

所有错误 SHALL 抛出继承自 Error 的 `PiRpcError` 并携带 `code` 字段，code 取值限定为 `not_running` / `timeout` / `process_exit` / `spawn_error` / `write_error` 之一。

#### Scenario: 未运行时发送

- **WHEN** proc 为 null 时调用 `sendAndWait`
- **THEN** reject code 为 `not_running` 的 `PiRpcError`