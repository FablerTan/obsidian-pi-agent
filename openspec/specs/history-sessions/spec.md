# 历史会话能力规格

## Purpose

读取 pi 的会话文件、显示 iOS 风格底部浮层供用户选择历史会话、并切换会话后回放历史消息。本能力隔离 pi 内部存储格式耦合于 `SessionFileReader`，并提供透明浮层 + 历史回放 UI。

## Requirements

### Requirement: 会话文件异步读取

`SessionFileReader.readSessions(app)` SHALL 使用 `fs/promises` 异步读取 `~/.pi/agent/sessions/--编码后的vault路径--/*.jsonl` 文件列表，绝不在 UI 线程上使用同步 IO。每个会话的显示名优先级 MUST 为：session header.name → 首条用户消息前 40 字 → 文件日期。

#### Scenario: 列出会话

- **WHEN** 调用 `readSessions(app)`
- **THEN** 返回 `SessionEntry[]`，含路径与显示名，且整个读取过程异步不阻塞

#### Scenario: 显示名回退

- **WHEN** 某会话 header 无 name 字段
- **THEN** 显示名回退为首条用户消息前 40 字，再退为文件日期

### Requirement: 历史浮层 UI

`HistoryPanel.open()` SHALL 异步读取会话列表后创建半透明遮罩 + 底部浮层；选中会话后调用 `switchToSession(path)`；关闭浮层 MUST 移除遮罩与浮层 DOM。

#### Scenario: 打开历史面板

- **WHEN** 用户点击历史图标或输入 `/history`
- **THEN** 出现遮罩与底部浮层，列表展示会话

### Requirement: 切换会话与消息回放

`switchToSession(path)` SHALL 通过 `sendAndWait(switch_session)` 切换 pi 的当前会话，随后 `sendAndWait(get_messages)` 取回消息列表；`loadMessages(messages)` MUST 清空 messages 区并为每条 assistant 消息创建 `AssistantMessageView` → `renderFinal(message)` 一次性渲染，后续 toolResult 消息通过 `applyToolResult()` 填入结果卡片。

#### Scenario: 选中会话

- **WHEN** 用户在浮层中点选某会话
- **THEN** 发送 switch_session 与 get_messages，回放历史消息到 messages 区

#### Scenario: 工具结果回填

- **WHEN** 回放中遇到 toolResult 消息
- **THEN** 找到对应 toolCallId 的 AssistantMessageView，调用 `applyToolResult` 填入结果，无对应则跳过

### Requirement: 格式耦合隔离

pi 的会话文件目录结构与 JSONL 一行格式（首行 header、后续行 message 条目）SHALL 仅由 `SessionFileReader` 知晓；UI 层 MUST 不直接 `readFileSync`/解析 JSONL，避免与 pi 内部格式强耦合。

#### Scenario: pi 改格式

- **WHEN** pi 修改 session 文件编码方式
- **THEN** 仅需更新 `SessionFileReader`，UI 层不感知