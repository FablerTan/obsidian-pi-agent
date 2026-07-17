# 消息渲染能力规格

## Purpose

负责把 pi 返回的流式 delta 与历史回放消息渲染为一致的 DOM。核心是 `AssistantMessageView` 作为流式与回放共用的渲染原语，配合 `MarkdownMsg`（增量 Markdown）、`ThinkingBlock`（思考链折叠）、`ToolCallMsg`（工具卡片）、`code-blocks.ts`（代码块增强）等子组件。回合粒度的 `TurnContext` 作为薄适配器把事件委托给 view。

## Requirements

### Requirement: 流式与回放 DOM 一致

`AssistantMessageView` SHALL 同时作为流式增量渲染入口（`appendText` / `ensureTextContainer` / `startThinking` / `appendThinking` / `endThinking` / `addToolCall` / `updateToolCall` / `endToolCall`）与历史回放入口（`renderFinal(message)` / `applyToolResult`）；两条路径产出的 `.pi-chat-msg-assistant` DOM 结构 MUST 完全一致，不允许流式用子 div、回放直接渲染到气泡根节点的差异。

#### Scenario: 流式新增气泡

- **WHEN** 一回合开始时新建 `AssistantMessageView`
- **THEN** 创建独立气泡 DOM，后续 delta 仅追加到当前气泡

#### Scenario: 回放渲染历史消息

- **WHEN** HistoryPanel 加载一条 assistant 消息调用 `renderFinal(message)`
- **THEN** 产出与流式相同的气泡 DOM 结构

### Requirement: 回放块顺序保留

`renderFinal(message)` SHALL 严格保留 `text → thinking → toolCall` 的内容块顺序：连续 text 块合并为一次 Markdown 渲染，遇到 thinking 或 toolCall 块 MUST 先 flush 待写文本，再渲染该块。

#### Scenario: 文本后跟思考后跟工具调用

- **WHEN** message 内容块依次为 text、text、thinking、toolcall
- **THEN** 先合并渲染两段文本，再插入 ThinkingBlock，再插入 ToolCallMsg 卡片，顺序不可被打乱

### Requirement: 流式 Markdown 增量渲染

`MarkdownMsg.append(text)` SHALL 累积文本并以 `MarkdownRenderer.render()` 全量重渲染；并发渲染 MUST 通过 `rendering`/`needsRerender` 标志防抖，避免重叠渲染产生残留。

#### Scenario: 快速多次 append

- **WHEN** 连续多次 `append()` 触发
- **THEN** 同时只允许一次渲染进行中，后续标记 `needsRerender`，渲染完成后补一次

### Requirement: 思考链折叠展示

`ThinkingBlock` SHALL 提供可折叠卡片展示 AI 思考过程；`append(text)` 累积文本，收到新内容时自动 `expand()`，`finish()` 标记完成。

#### Scenario: 接收思考 delta

- **WHEN** `thinking_delta` 到达
- **THEN** 思考卡片自动展开显示新内容

#### Scenario: 思考完成

- **WHEN** `thinking_end` 到达
- **THEN** 卡片标记完成，用户可手动折叠

### Requirement: 工具调用卡片三态

`ToolCallMsg` SHALL 展示工具名、参数、执行状态与输出；点击切换三态：收起 → 限制 5 行 → 展开全部 → 收起；完成时通过 `extractText(result.content)` 提取结果文本并以 ✓/✗ 标记成功/失败。

#### Scenario: 工具执行中

- **WHEN** `tool_execution_start` 到达
- **THEN** 创建卡片，loading 动画隐藏

#### Scenario: 工具失败

- **WHEN** `endToolCall(id, result, true)` 被调用
- **THEN** 卡片标记 ✗，输出折叠

#### Scenario: 三态切换

- **WHEN** 用户连续点击卡片
- **THEN** 输出在「收起 / 5 行 / 全部」之间循环

### Requirement: 代码块增强

`enhanceCodeBlocks(container)` SHALL 为 `pre > code` 加语言标签与点击复制按钮；已增强的元素（带 `data-enhanced` 属性）MUST 跳过，避免重复增强。

#### Scenario: 重复渲染

- **WHEN** MarkdownMsg 因 delta 触发重渲染
- **THEN** 仅增强未带 `data-enhanced` 的新代码块

### Requirement: 回合上下文薄适配

`TurnContext` SHALL 持有当前回合的 `AssistantMessageView`，把事件方法直接委托给 view，并在内容首次到达时通过 `onActivity` 回调隐藏 loading 动画；agent_end/error/abort 时 PiChatView MUST 置 `turn` 为 null，下一回合新建。

#### Scenario: 文本首次到达

- **WHEN** `appendText(delta)` 被调用
- **THEN** view.appendText(delta) 被调用，且若为该回合首次内容到达则触发 onActivity 隐藏 loading