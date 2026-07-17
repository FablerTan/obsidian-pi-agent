# Extension UI 协议能力规格

## Purpose

处理 pi 扩展通过 RPC 发起的交互式 UI 请求。包含 4 种对话型方法（需通过 `extension_ui_response` 回传响应）与 5 种广播型方法（无响应）。`ExtensionUIHandler` 用 TypeScript discriminated union `ExtensionUiRequest` 在 switch 中获得类型 narrowing。

## Requirements

### Requirement: 对话型内联面板

`select` / `confirm` / `input` / `editor` 四种对话型方法 SHALL 在输入框上方的内联面板容器（`.pi-ext-inline-container`）渲染交互 UI，并在用户操作后通过 `piClient.sendExtensionUIResponse(id, data)` 回传响应。

#### Scenario: select 选项

- **WHEN** 收到 `extension_ui_request` method=`select`
- **THEN** 渲染选项按钮列表，用户点击某项后回传 `{ value: <选中项> }`

#### Scenario: confirm 确认

- **WHEN** 收到 method=`confirm`
- **THEN** 渲染确认/取消按钮，点击后回传 `{ confirmed: true|false }`

#### Scenario: input 单行输入

- **WHEN** 收到 method=`input`
- **THEN** 渲染单行输入框 + 确定/取消，确定后回传 `{ text: <输入> }`

#### Scenario: editor 多行编辑

- **WHEN** 收到 method=`editor`
- **THEN** 渲染多行编辑区 + 确定/取消，确定后回传编辑文本

### Requirement: 广播型方法

`notify` / `setStatus` / `setWidget` / `setTitle` / `set_editor_text` 五种广播型方法 SHALL 直接作用于对应 UI 区域，无需回传响应。

#### Scenario: notify

- **WHEN** 收到 method=`notify`
- **THEN** 弹出 Obsidian `new Notice()` 提示

#### Scenario: setStatus / setWidget

- **WHEN** 收到 `setStatus` 或 `setWidget`
- **THEN** 内容显示在输入框上方状态栏 / 浮动部件区域

#### Scenario: setTitle

- **WHEN** 收到 `setTitle`
- **THEN** 聊天面板 header 标题被更新

#### Scenario: set_editor_text

- **WHEN** 收到 `set_editor_text`
- **THEN** 输入框 textarea 内容被替换为指定文本

### Requirement: 类型 narrowing

`ExtensionUiRequest` SHALL 为 discriminated union，每种 method 对应独立的 Request 类型（`SelectRequest` / `ConfirmRequest` / `InputRequest` / `EditorRequest` 等）；`handleRequest(event: ExtensionUiRequest)` MUST 用 switch on `event.method` 获得每个分支的类型 narrowing，禁止 `any` 强转。

#### Scenario: 新增 method

- **WHEN** pi 协议新增一种 dialog method
- **THEN** 在 `ExtensionUiRequest` 联合中加入后，switch 未覆盖的分支触发 TS 编译告警