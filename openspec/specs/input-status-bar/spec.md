# 输入状态栏能力规格

## Purpose

位于输入框下方的 `InputStatusBar` 显示当前模型名、思考层级与 Token 用量，并提供交互：点击模型名弹出模型选择列表并切换、点击思考层级循环切换、Token 用量随会话进展刷新。同时负责通过 `get_state` 加载初始状态。

## Requirements

### Requirement: 状态加载与显示

`InputStatusBar.loadState()` SHALL 通过 `sendAndWait<GetStateData>` 的 `get_state` 加载当前模型与思考层级并显示在状态栏。

#### Scenario: 加载初始

- **WHEN** 视图打开时
- **THEN** 状态栏显示当前模型名与思考层级标签

### Requirement: 模型选择

`openModelPicker()` SHALL 通过 `get_available_models` 取可用模型列表弹出选择 UI；`selectModel(model)` MUST 通过 `sendAndWait<Model>` 的 `set_model` 切换当前模型并更新状态栏显示。

#### Scenario: 弹出模型列表

- **WHEN** 用户点击状态栏的模型名
- **THEN** 弹出可用模型列表

#### Scenario: 切换模型

- **WHEN** 用户在列表中点选某模型
- **THEN** 发送 `set_model`，成功后状态栏更新为新模型名

### Requirement: 思考层级循环切换

`cycleThinking()` SHALL 通过 `sendAndWait<CycleThinkingLevelData>` 的 `cycle_thinking_level` 循环切换思考层级；点击思考层级区域 MUST 触发一次循环并刷新标签。

#### Scenario: 循环切换

- **WHEN** 用户点击状态栏的思考层级标签
- **THEN** 思考层级变到下一档，标签立即刷新

### Requirement: Token 用量更新

`updateContextUsage()` SHALL 通过 `get_session_stats` 取会话 Token 用量并更新状态栏显示，作为 public 方法对外暴露供 agent_end / compaction_end 等时机调用。

#### Scenario: 回合结束刷新

- **WHEN** 收到 `agent_end`
- **THEN** 状态栏 Token 用量被刷新

### Requirement: 监听器清理

`InputStatusBar.destroy()` SHALL 移除其注册的 activeDocument 点击监听器，公共方法对外暴露以便 PiChatView 在 onClose 中调用。

#### Scenario: 视图关闭

- **WHEN** 视图关闭调用 destroy()
- **THEN** document 点击监听被移除，点击不再误触发模型选择弹层