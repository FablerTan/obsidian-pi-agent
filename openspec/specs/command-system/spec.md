# 命令系统能力规格

## Purpose

提供输入框 `/` 命令菜单、命令路由分派、内置命令与扩展命令发现等能力。`CommandMenu` 处理弹出 + 子串筛选 + IME 兼容 + 键盘导航；`CommandRouter` 收拢分派逻辑替代 if-else 链；`ReloadService` 承担 `/reload` + 命令加载 + 扩展发现业务；`StatsService` 承担 `/stats`；`command-groups.ts` 提供按 source 分组的共用工具。

## Requirements

### Requirement: 命令菜单弹与筛选

输入 `/` 时 SHALL 弹出 `CommandMenu`；`show(query)` 按任意子串筛选命令，MUST 兼容 IME 组合输入，不在组合中触发筛选；`hide()` 移除菜单 DOM。

#### Scenario: 输入斜杠

- **WHEN** 用户在输入框键入 `/`
- **THEN** 命令菜单弹出并显示全部命令

#### Scenario: 子串筛选

- **WHEN** 用户继续输入 `new`
- **THEN** 仅显示 name 含 `new` 的命令

#### Scenario: IME 组合中

- **WHEN** 用户处于中文/日文 IME 组合输入态键入字符
- **THEN** 菜单不触发筛选，避免打断输入

### Requirement: 键盘导航

`handleKeydown(e)` SHALL 支持方向键 ↑↓ 移动高亮、Enter 选中、→ 展开或填充、Esc 关闭菜单。

#### Scenario: 方向键移动

- **WHEN** 用户按 ↓
- **THEN** 高亮下移一项

#### Scenario: Enter 选中

- **WHEN** 用户按 Enter 且菜单可见
- **THEN** 触发当前高亮命令的 `handle(cmd)`

### Requirement: 命令路由分派

`CommandRouter.handle(cmd)` SHALL 命中 `BuiltinHandlers` 时调用对应处理器（`newSession` / `reload` / `history` / `compact` / `stats`）；非内置命令 MUST 回填到输入框（`/命令名 `），由用户补全参数后发送。

#### Scenario: 内置命令

- **WHEN** 选中 `/new`
- **THEN** `BuiltinHandlers.newSession` 被调用

#### Scenario: 扩展命令

- **WHEN** 选中扩展注册的 `/commit`
- **THEN** `/commit ` 被回填到输入框，不直接执行

### Requirement: 命令分组共实现

`command-groups.ts` 的 `groupCommandsBySource()` 与 `sourceLabel()` SHALL 被 ReloadService 与 WelcomePage 共用；分组展示顺序由 `SOURCE_ORDER` 决定，source 标签由 `SOURCE_LABELS` 映射（如 `extension` → 「扩展」）；未知 source MUST 原样回退显示。

#### Scenario: 未知 source

- **WHEN** pi 返回 source 为 `model` 的命令
- **THEN** 该 source 直接以 `model` 为分组键显示，不报错

### Requirement: /reload 互斥与轮询

`/reload` SHALL 进入 `phase = 'reloading'` 互斥锁防止重复触发；`ReloadService.run()` 先 lockState 快照旧命令名列表，再 `piClient.restart()`，然后轮询 `get_commands`（最多 12 次 × 800ms）等待命令列表稳定；超时 MUST 调用 `handleReloadFallback` 兜底显示；成功后通过 SystemMessageRenderer 展示新增/移除命令对比，最后 phase 回到 idle。

#### Scenario: 重载成功

- **WHEN** 重启后 get_commands 返回稳定结果
- **THEN** 渲染新增/移除命令分组系统消息

#### Scenario: 重复触发

- **WHEN** 重载中再次输入 `/reload`
- **THEN** 第二次请求被 phase=reloading 拦截

#### Scenario: 轮询超时

- **WHEN** 12 次 × 800ms 轮询后结果仍不稳定
- **THEN** `handleReloadFallback` 兜底渲染当前命令列表，不让 UI 卡死

### Requirement: 命令加载与扩展发现

`ReloadService.loadCommands()` SHALL 调用 `get_commands` 并设置到 `CommandMenu.setCommands`；`getExtensionInfo()` SHALL 通过 `extension-loader` 的磁盘扫描 + get_commands 交叉验证得到扩展列表（磁盘存在的标记 `confirmed`，仅 commands 中有而无磁盘文件的也计入）。

#### Scenario: 命令变更

- **WHEN** reload 后扩展新增了命令
- **THEN** `loadCommands()` 设置新命令到 CommandMenu，下次输入 `/` 可见

### Requirement: /stats 统计

`StatsService.run()` SHALL 调用 `piClient.getSessionStats()` 获取 Token 用量，格式化为多行文本后通过 `SystemMessageRenderer.add()` 渲染为系统消息。

#### Scenario: 执行 stats

- **WHEN** 用户输入 `/stats`
- **THEN** 系统消息展示本次会话与累计的 Token 用量