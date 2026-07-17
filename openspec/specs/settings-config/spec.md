# 配置管理能力规格

## Purpose

管理 Pi Chat 插件的三段式配置：Obsidian `data.json`（插件 UI 偏好）、项目级 `.pi/settings.json`（pi 进程运行时配置，单一真相源）、磁盘资源路径检测。`.pi/settings.json` 是运行时配置的真相源，Obsidian 设置面板仅是其编辑器而非独立分叉。

## Requirements

### Requirement: 插件 UI 偏好持久化

`PiChatSettings` SHALL 由 Obsidian `data.json` 持久化，包含 `piPath` / `autoCompaction` / `skillPaths` / `promptPaths` / `extensionPaths` 字段；`compactionMode` / `compactionPercent` MUST 不出现在 `PiChatSettings`（仅作为设置面板本地 UI 状态，写入 `.pi/settings.json`）。

#### Scenario: 保存插件偏好

- **WHEN** 用户在设置面板修改 pi 路径或自动压缩开关
- **THEN** `data.json` 被更新并在下次启动时读取

### Requirement: .pi/settings.json 单一真相源

`pi-settings.ts` SHALL 负责读写 `.pi/settings.json`，其字段含 `compaction.reserveTokens` / `compaction.keepRecentTokens` / `skills` / `prompts` / `extensions`；Obsidian 设置面板对压缩阈值与资源路径的修改 MUST 写入该文件而非仅在 `data.json` 中分叉。

#### Scenario: 修改压缩阈值

- **WHEN** 用户在面板修改 keepRecentTokens
- **THEN** `writeCompactionSettings` 异步写入 `.pi/settings.json`，pi 进程下次启动读取

#### Scenario: 配置不分叉

- **WHEN** 仅修改 `data.json` 中的 compactionMode 而不写 `.pi/settings.json`
- **THEN** 视为非法状态，pi 进程启动读取 `.pi/settings.json` 实际值

### Requirement: 同步读 + 异步写

`readFullSettings` SHALL 保留同步实现（被同步 `display()` 调用）；`writeFullSettings` / `writeCompactionSettings` / `writeResourcePaths` MUST 使用 `fs/promises` 异步写入，绝不阻塞 UI 线程。

#### Scenario: 设置面板渲染

- **WHEN** Obsidian 调用 `display()` 渲染设置面板
- **THEN** `readFullSettings` 同步返回当前 `.pi/settings.json` 内容

#### Scenario: 写入配置

- **WHEN** 用户保存设置
- **THEN** 异步 writeFile 完成且不冻结 UI

### Requirement: pi 路径自动检测

`detect-pi.ts` 的 `detectPiPath()` SHALL 自动探测系统已安装 pi 的可执行文件路径；用户 MUST 能在设置面板手动覆盖该路径。

#### Scenario: 自动检测成功

- **WHEN** 系统通过 brew 等方式安装 pi
- **THEN** `detectPiPath()` 返回探测到的路径

#### Scenario: 手动覆盖

- **WHEN** 用户在面板填入自定义 pi 路径
- **THEN** 该路径作为 `piPath` 持久化到 data.json，RPC 客户端使用该路径 spawn

### Requirement: 扩展路径与命令交叉

`extension-loader.ts` 的 `discoverExtensions(cmds, dirs)` SHALL 先从 `get_commands` 建立 `path → [commandNames]` 索引（`source === 'extension'` 且有 `path`），再扫描磁盘目录（递归子目录 `index.ts` + 单文件 `*.ts`），合并两者得到扩展列表（磁盘存在的标记 `confirmed`，仅 commands 中有而无磁盘文件的也计入）。

#### Scenario: 命令有但磁盘无

- **WHEN** 某扩展在 get_commands 中有命令但磁盘扫描未找到对应文件
- **THEN** 该路径仍出现在扩展列表中，`confirmed` 为 false

#### Scenario: 磁盘有但命令无

- **WHEN** 磁盘扫描发现某 index.ts 但 get_commands 中无对应命令
- **THEN** 该文件标记 `confirmed`，commands 列表为空