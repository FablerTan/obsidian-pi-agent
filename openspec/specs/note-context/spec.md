# 笔记上下文能力规格

## Purpose

在输入框上方提供 `NoteBar` 实时追踪当前打开的笔记名与选中文本，并按用户意愿把笔记路径作为上下文附加到发送给 pi 的消息中。提供「是否附笔记路径」开关与选中文本的行数/字数统计显示。

## Requirements

### Requirement: 笔记名与选中追踪

`NoteBar` SHALL 自动追踪 Obsidian 当前激活的笔记名显示在左侧；当用户在笔记中选中文本时，右侧 SHALL 显示选中文本的行数与字数。

#### Scenario: 切换笔记

- **WHEN** 用户切换到另一篇笔记
- **THEN** 笔记栏左侧立即更新为新笔记名

#### Scenario: 选中文本统计

- **WHEN** 用户在笔记中选中一段文本
- **THEN** 笔记栏右侧显示「N 行 / M 字」统计

### Requirement: 上下文附加与开关

`NoteBar.isAttached` SHALL 控制是否在发送消息时附笔记路径；点击笔记名 MUST 切换该开关并改变视觉态；`getContextParts()` MUST 在开关打开时返回格式化上下文片段数组（含笔记路径），关闭时返回空数组或不含路径的片段。

#### Scenario: 开启附加

- **WHEN** 用户点击笔记名开启 isAttached
- **THEN** 后续发送的消息附带当前笔记路径给 pi

#### Scenario: 关闭附加

- **WHEN** 用户再次点击关闭 isAttached
- **THEN** `getContextParts()` 不再返回笔记路径，仅可能在含选中文本时返回选中片段

### Requirement: 监听器清理

`NoteBar.destroy()` SHALL 移除其安装的 document/workspace 事件监听器，避免视图关闭后继续触发并写入已销毁的 DOM。

#### Scenario: 视图关闭

- **WHEN** PiChatView.onClose 调用 noteBar.destroy()
- **THEN** workspace 的 active-leaf 变更等监听被解除