---
name: obsidian-coding-docs
description: 按需访问 Obsidian 开发文档（https://docs.obsidian.md）。当用户询问 Obsidian 插件开发、主题开发、TypeScript API、CSS 变量、manifest 配置等开发相关问题时使用此技能，所有内容通过 defuddle 从官网提取。
---

# Obsidian 开发文档查阅

Obsidian 开发文档托管在 https://docs.obsidian.md，是一个基于 Obsidian Publish 的网站。所有页面通过 `defuddle parse <url> --md` 在线提取。

> **所有文档均在线获取**，无本地缓存。使用 `defuddle parse <url> --md` 提取纯净 Markdown。

---

## 文档总览

| 板块 | 说明 |
|------|------|
| **插件入门** | 构建、开发、调试第一个插件 |
| **插件指南** | UI、编辑器、Vault、视图、发布等进阶主题 |
| **主题开发** | 构建、发布主题，Publish 主题 |
| **TypeScript API 参考** | obsidian 包完整 API（类/接口/函数/类型） |
| **CSS 变量参考** | 所有可自定义的 CSS 变量 |
| **其他参考** | manifest.json、versions.json、版本历史 |

---

## 插件开发

### 入门

| 页面 | URL |
|------|-----|
| 构建你的第一个插件 | `https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin` |
| 插件的结构 | `https://docs.obsidian.md/Plugins/Getting+started/Anatomy+of+a+plugin` |
| 开发工作流 | `https://docs.obsidian.md/Plugins/Getting+started/Development+workflow` |
| 移动端开发 | `https://docs.obsidian.md/Plugins/Getting+started/Mobile+development` |
| 在插件中使用 React | `https://docs.obsidian.md/Plugins/Getting+started/Use+React+in+your+plugin` |
| 在插件中使用 Svelte | `https://docs.obsidian.md/Plugins/Getting+started/Use+Svelte+in+your+plugin` |

### 用户界面

| 页面 | URL |
|------|-----|
| UI 概览 | `https://docs.obsidian.md/Plugins/User+interface/About+user+interface` |
| 命令（Commands） | `https://docs.obsidian.md/Plugins/User+interface/Commands` |
| 右键菜单 | `https://docs.obsidian.md/Plugins/User+interface/Context+menus` |
| HTML 元素 | `https://docs.obsidian.md/Plugins/User+interface/HTML+elements` |
| 图标 | `https://docs.obsidian.md/Plugins/User+interface/Icons` |
| 模态框（Modals） | `https://docs.obsidian.md/Plugins/User+interface/Modals` |
| Ribbon 操作 | `https://docs.obsidian.md/Plugins/User+interface/Ribbon+actions` |
| 从右到左布局 | `https://docs.obsidian.md/Plugins/User+interface/Right-to-left` |
| 设置（Settings） | `https://docs.obsidian.md/Plugins/User+interface/Settings` |
| 状态栏 | `https://docs.obsidian.md/Plugins/User+interface/Status+bar` |
| 视图（Views） | `https://docs.obsidian.md/Plugins/User+interface/Views` |
| 工作区（Workspace） | `https://docs.obsidian.md/Plugins/User+interface/Workspace` |

### 编辑器

| 页面 | URL |
|------|-----|
| 编辑器概览 | `https://docs.obsidian.md/Plugins/Editor/Editor` |
| 编辑器扩展 | `https://docs.obsidian.md/Plugins/Editor/Editor+extensions` |
| 与编辑器扩展通信 | `https://docs.obsidian.md/Plugins/Editor/Communicating+with+editor+extensions` |
| 装饰（Decorations） | `https://docs.obsidian.md/Plugins/Editor/Decorations` |
| Markdown 后处理 | `https://docs.obsidian.md/Plugins/Editor/Markdown+post+processing` |
| State 字段 | `https://docs.obsidian.md/Plugins/Editor/State+fields` |
| State 管理 | `https://docs.obsidian.md/Plugins/Editor/State+management` |
| View 插件 | `https://docs.obsidian.md/Plugins/Editor/View+plugins` |
| 视口（Viewport） | `https://docs.obsidian.md/Plugins/Editor/Viewport` |

### Vault

| 页面 | URL |
|------|-----|
| Vault API | `https://docs.obsidian.md/Plugins/Vault` |

### 事件

| 页面 | URL |
|------|-----|
| 事件系统 | `https://docs.obsidian.md/Plugins/Events` |

### 指南

| 页面 | URL |
|------|-----|
| 构建 Bases 视图 | `https://docs.obsidian.md/Plugins/Guides/Build+a+Bases+view` |
| 延迟加载视图 | `https://docs.obsidian.md/Plugins/Guides/Defer+views` |
| 迁移到声明式设置 | `https://docs.obsidian.md/Plugins/Guides/Migrate+to+declarative+settings` |
| 优化插件加载时间 | `https://docs.obsidian.md/Plugins/Guides/Optimize+plugin+load+time` |
| 存储密钥 | `https://docs.obsidian.md/Plugins/Guides/Store+secrets` |
| 支持弹窗窗口 | `https://docs.obsidian.md/Plugins/Guides/Support+pop-out+windows` |

### 发布

| 页面 | URL |
|------|-----|
| 提交你的插件 | `https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin` |
| 使用 GitHub Actions 发布 | `https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions` |
| 插件指南 | `https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines` |
| 提交要求 | `https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins` |
| Beta 测试插件 | `https://docs.obsidian.md/Plugins/Releasing/Beta-testing+plugins` |

---

## 主题开发

### App 主题

| 页面 | URL |
|------|-----|
| 构建第一个主题 | `https://docs.obsidian.md/Themes/App+themes/Build+a+theme` |
| 提交你的主题 | `https://docs.obsidian.md/Themes/App+themes/Submit+your+theme` |
| 在主题中嵌入字体和图片 | `https://docs.obsidian.md/Themes/App+themes/Embed+fonts+and+images+in+your+theme` |
| 使用 GitHub Actions 发布主题 | `https://docs.obsidian.md/Themes/App+themes/Release+your+theme+with+GitHub+Actions` |
| 主题指南 | `https://docs.obsidian.md/Themes/App+themes/Theme+guidelines` |

### Obsidian Publish 主题

| 页面 | URL |
|------|-----|
| 关于 Publish 主题 | `https://docs.obsidian.md/Themes/Obsidian+Publish+themes/About+Obsidian+Publish+themes` |
| 构建 Publish 主题 | `https://docs.obsidian.md/Themes/Obsidian+Publish+themes/Build+a+Publish+theme` |
| Publish 主题最佳实践 | `https://docs.obsidian.md/Themes/Obsidian+Publish+themes/Best+practices+for+Publish+themes` |

---

## TypeScript API 参考

完整的 API 参考（自动生成），入口页面：`https://docs.obsidian.md/Reference/TypeScript+API/index`

### 核心类

| 类 | 说明 | URL |
|-----|------|-----|
| `Plugin` | 插件基类，所有插件入口 | `https://docs.obsidian.md/Reference/TypeScript+API/Plugin` |
| `App` | 应用实例，访问全局功能 | `https://docs.obsidian.md/Reference/TypeScript+API/App` |
| `Vault` | 文件与文件夹操作 | `https://docs.obsidian.md/Reference/TypeScript+API/Vault` |
| `Workspace` | 工作区管理（布局、活动 leaf） | `https://docs.obsidian.md/Reference/TypeScript+API/Workspace` |
| `Component` | 组件基类（生命周期管理） | `https://docs.obsidian.md/Reference/TypeScript+API/Component` |
| `View` / `ItemView` | 自定义视图 | `https://docs.obsidian.md/Reference/TypeScript+API/View` |
| `Modal` | 模态框 | `https://docs.obsidian.md/Reference/TypeScript+API/Modal` |
| `Setting` / `SettingTab` | 设置界面 | `https://docs.obsidian.md/Reference/TypeScript+API/Setting` |
| `Editor` | 编辑器接口（CM5/CM6 桥接） | `https://docs.obsidian.md/Reference/TypeScript+API/Editor` |
| `Menu` / `MenuItem` | 菜单系统 | `https://docs.obsidian.md/Reference/TypeScript+API/Menu` |
| `Notice` | 通知组件 | `https://docs.obsidian.md/Reference/TypeScript+API/Notice` |
| `MetadataCache` | 元数据缓存（链接、标签、frontmatter） | `https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache` |
| `TFile` / `TFolder` | 文件/文件夹对象 | `https://docs.obsidian.md/Reference/TypeScript+API/TFile` |
| `FileManager` | 文件管理（重命名、trash 等） | `https://docs.obsidian.md/Reference/TypeScript+API/FileManager` |
| `Keymap` | 快捷键管理 | `https://docs.obsidian.md/Reference/TypeScript+API/Keymap` |
| `SugggestModal` / `FuzzySuggestModal` | 搜索建议模态框 | `https://docs.obsidian.md/Reference/TypeScript+API/SuggestModal` |
| `EditorSuggest` | 编辑器内联建议 | `https://docs.obsidian.md/Reference/TypeScript+API/EditorSuggest` |
| `Component` 系列组件 | Button / Text / Dropdown / Slider / Toggle / Color 等 | `https://docs.obsidian.md/Reference/TypeScript+API/ButtonComponent` |

### UI 组件类（Setting 可用的 add* 方法）

每个组件类通过 `new Setting(containerEl).addXxx(...)` 使用。

| 组件 | Setting 方法 | 说明 |
|------|-------------|------|
| TextComponent | `addText(cb)` | 文本输入 |
| TextAreaComponent | `addTextArea(cb)` | 多行文本 |
| SearchComponent | `addSearch(cb)` | 搜索框 |
| DropdownComponent | `addDropdown(cb)` | 下拉选择 |
| ToggleComponent | `addToggle(cb)` | 开关 |
| SliderComponent | `addSlider(cb)` | 滑块 |
| ButtonComponent | `addButton(cb)` | 按钮 |
| ColorComponent | `addColorPicker(cb)` | 颜色选择器 |
| ExtraButtonComponent | `addExtraButton(cb)` | 额外按钮（图标） |
| MomentFormatComponent | `addMomentFormat(cb)` | 时间格式 |
| ProgressBarComponent | `addProgressBar(cb)` | 进度条 |
| SecretComponent | `addComponent(cb)` | 密钥输入（settings-secret） |
| SettingGroup | — | 设置分组（v1.13+ 声明式设置） |

### 重要函数

| 函数 | 说明 | URL |
|------|------|-----|
| `addIcon()` | 注册自定义图标 | `https://docs.obsidian.md/Reference/TypeScript+API/addIcon` |
| `setIcon()` | 在 DOM 元素中插入图标 | `https://docs.obsidian.md/Reference/TypeScript+API/setIcon` |
| `getIcon()` / `getIconIds()` | 获取图标 / 图标列表 | `https://docs.obsidian.md/Reference/TypeScript+API/getIcon` |
| `request()` / `requestUrl()` | HTTP 请求（无 CORS 限制） | `https://docs.obsidian.md/Reference/TypeScript+API/request` |
| `normalizePath()` | 标准化文件路径 | `https://docs.obsidian.md/Reference/TypeScript+API/normalizePath` |
| `parseLinktext()` / `getLinkpath()` | 链接文本解析 | `https://docs.obsidian.md/Reference/TypeScript+API/parseLinktext` |
| `getAllTags()` | 从 cache 提取所有标签 | `https://docs.obsidian.md/Reference/TypeScript+API/getAllTags` |
| `getFrontMatterInfo()` | 获取 frontmatter 信息 | `https://docs.obsidian.md/Reference/TypeScript+API/getFrontMatterInfo` |
| `htmlToMarkdown()` | HTML 转 Markdown | `https://docs.obsidian.md/Reference/TypeScript+API/htmlToMarkdown` |
| `debounce()` | 防抖函数 | `https://docs.obsidian.md/Reference/TypeScript+API/debounce` |
| `prepareFuzzySearch()` | 模糊搜索 | `https://docs.obsidian.md/Reference/TypeScript+API/prepareFuzzySearch` |
| `requireApiVersion()` | API 版本检查 | `https://docs.obsidian.md/Reference/TypeScript+API/requireApiVersion` |

### Plugin 注册方法

| 方法 | 用途 |
|------|------|
| `plugin.addCommand(cmd)` | 注册命令（可通过命令面板触发） |
| `plugin.addRibbonIcon(icon, title, cb)` | 添加 Ribbon 图标 |
| `plugin.addSettingTab(tab)` | 注册设置页 |
| `plugin.addStatusBarItem()` | 添加状态栏元素 |
| `plugin.registerView(type, viewCreator)` | 注册自定义视图 |
| `plugin.registerEditorExtension(ext)` | 注册 CodeMirror 6 扩展 |
| `plugin.registerEditorSuggest(suggest)` | 注册编辑器建议 |
| `plugin.registerMarkdownPostProcessor(processor)` | 注册 Markdown 后处理器 |
| `plugin.registerMarkdownCodeBlockProcessor(lang, handler)` | 注册代码块处理器 |
| `plugin.registerObsidianProtocolHandler(action, handler)` | 注册自定义协议处理器 |
| `plugin.registerHoverLinkSource(id, source)` | 注册悬停链接源 |
| `plugin.registerExtensions(extensions, viewType)` | 注册自定义文件类型 |
| `plugin.registerBasesView(registration)` | 注册 Bases 自定义视图 |
| `plugin.registerCliHandler(flags, handler)` | 注册 CLI 命令处理 |
| `plugin.loadData()` / `plugin.saveData(data)` | 插件数据持久化 |
| `plugin.registerDomEvent(el, type, cb)` | 注册 DOM 事件 |
| `plugin.registerEvent(eventRef)` | 注册事件引用 |
| `plugin.registerInterval(id, cb, ms)` | 注册定时器 |

> 每个类的所有方法和属性的完整文档，请使用对应 URL：`https://docs.obsidian.md/Reference/TypeScript+API/<ClassName>/<method>`。

---

## CSS 变量参考

样式参考主页：`https://docs.obsidian.md/Reference/CSS+variables/About+styling`
CSS 变量索引：`https://docs.obsidian.md/Reference/CSS+variables/CSS+variables`

### 基础（Foundations）
| 模块 | URL |
|------|-----|
| 颜色 | `https://docs.obsidian.md/Reference/CSS+variables/Foundations/Colors` |
| 间距 | `https://docs.obsidian.md/Reference/CSS+variables/Foundations/Spacing` |
| 排版 | `https://docs.obsidian.md/Reference/CSS+variables/Foundations/Typography` |
| 边框 | `https://docs.obsidian.md/Reference/CSS+variables/Foundations/Borders` |
| 圆角 | `https://docs.obsidian.md/Reference/CSS+variables/Foundations/Radiuses` |
| 层级 | `https://docs.obsidian.md/Reference/CSS+variables/Foundations/Layers` |
| 图标 | `https://docs.obsidian.md/Reference/CSS+variables/Foundations/Icons` |
| 光标 | `https://docs.obsidian.md/Reference/CSS+variables/Foundations/Cursor` |

### 组件
| 模块 | URL |
|------|-----|
| Button | `https://docs.obsidian.md/Reference/CSS+variables/Components/Button` |
| Checkbox | `https://docs.obsidian.md/Reference/CSS+variables/Components/Checkbox` |
| Dialog | `https://docs.obsidian.md/Reference/CSS+variables/Components/Dialog` |
| Dropdown | `https://docs.obsidian.md/Reference/CSS+variables/Components/Dropdowns` |
| Modal | `https://docs.obsidian.md/Reference/CSS+variables/Components/Modal` |
| Multi-select | `https://docs.obsidian.md/Reference/CSS+variables/Components/Multi-select` |
| Navigation | `https://docs.obsidian.md/Reference/CSS+variables/Components/Navigation` |
| Popover | `https://docs.obsidian.md/Reference/CSS+variables/Components/Popover` |
| Prompt | `https://docs.obsidian.md/Reference/CSS+variables/Components/Prompt` |
| Slider | `https://docs.obsidian.md/Reference/CSS+variables/Components/Slider` |
| Tabs | `https://docs.obsidian.md/Reference/CSS+variables/Components/Tabs` |
| Text input | `https://docs.obsidian.md/Reference/CSS+variables/Components/Text+input` |
| Toggle | `https://docs.obsidian.md/Reference/CSS+variables/Components/Toggle` |
| Color input | `https://docs.obsidian.md/Reference/CSS+variables/Components/Color+input` |
| Indentation guides | `https://docs.obsidian.md/Reference/CSS+variables/Components/Indentation+guides` |
| Dragging | `https://docs.obsidian.md/Reference/CSS+variables/Components/Dragging` |

### 编辑器
| 模块 | URL |
|------|-----|
| Block | `https://docs.obsidian.md/Reference/CSS+variables/Editor/Block` |
| Blockquote | `https://docs.obsidian.md/Reference/CSS+variables/Editor/Blockquote` |
| Callout | `https://docs.obsidian.md/Reference/CSS+variables/Editor/Callout` |
| Code | `https://docs.obsidian.md/Reference/CSS+variables/Editor/Code` |
| Embed | `https://docs.obsidian.md/Reference/CSS+variables/Editor/Embed` |
| File | `https://docs.obsidian.md/Reference/CSS+variables/Editor/File` |
| Footnote | `https://docs.obsidian.md/Reference/CSS+variables/Editor/Footnote` |
| Headings | `https://docs.obsidian.md/Reference/CSS+variables/Editor/Headings` |
| Horizontal rule | `https://docs.obsidian.md/Reference/CSS+variables/Editor/Horizontal+rule` |
| Inline title | `https://docs.obsidian.md/Reference/CSS+variables/Editor/Inline+title` |
| Link | `https://docs.obsidian.md/Reference/CSS+variables/Editor/Link` |
| List | `https://docs.obsidian.md/Reference/CSS+variables/Editor/List` |
| Properties | `https://docs.obsidian.md/Reference/CSS+variables/Editor/Properties` |
| Table | `https://docs.obsidian.md/Reference/CSS+variables/Editor/Table` |
| Tag | `https://docs.obsidian.md/Reference/CSS+variables/Editor/Tag` |

### 窗口
| 模块 | URL |
|------|-----|
| Ribbon | `https://docs.obsidian.md/Reference/CSS+variables/Window/Ribbon` |
| Sidebar | `https://docs.obsidian.md/Reference/CSS+variables/Window/Sidebar` |
| Status bar | `https://docs.obsidian.md/Reference/CSS+variables/Window/Status+bar` |
| Scrollbar | `https://docs.obsidian.md/Reference/CSS+variables/Window/Scrollbar` |
| Workspace | `https://docs.obsidian.md/Reference/CSS+variables/Window/Workspace` |
| Window frame | `https://docs.obsidian.md/Reference/CSS+variables/Window/Window+frame` |
| Divider | `https://docs.obsidian.md/Reference/CSS+variables/Window/Divider` |
| Vault profile | `https://docs.obsidian.md/Reference/CSS+variables/Window/Vault+profile` |

### 插件
| 模块 | URL |
|------|-----|
| Canvas | `https://docs.obsidian.md/Reference/CSS+variables/Plugins/Canvas` |
| File explorer | `https://docs.obsidian.md/Reference/CSS+variables/Plugins/File+explorer` |
| Graph | `https://docs.obsidian.md/Reference/CSS+variables/Plugins/Graph` |
| Search | `https://docs.obsidian.md/Reference/CSS+variables/Plugins/Search` |
| Sync | `https://docs.obsidian.md/Reference/CSS+variables/Plugins/Sync` |

### Obsidian Publish
| 模块 | URL |
|------|-----|
| Publish | `https://docs.obsidian.md/Reference/CSS+variables/Publish/Publish` |
| Site components | `https://docs.obsidian.md/Reference/CSS+variables/Publish/Site+components` |
| Site fonts | `https://docs.obsidian.md/Reference/CSS+variables/Publish/Site+fonts` |
| Site footer | `https://docs.obsidian.md/Reference/CSS+variables/Publish/Site+footer` |
| Site header | `https://docs.obsidian.md/Reference/CSS+variables/Publish/Site+header` |
| Site navigation | `https://docs.obsidian.md/Reference/CSS+variables/Publish/Site+navigation` |
| Site pages | `https://docs.obsidian.md/Reference/CSS+variables/Publish/Site+pages` |
| Site sidebars | `https://docs.obsidian.md/Reference/CSS+variables/Publish/Site+sidebars` |

---

## 其他参考

| 页面 | 说明 | URL |
|------|------|-----|
| Manifest | `manifest.json` 字段说明 | `https://docs.obsidian.md/Reference/Manifest` |
| Versions | `versions.json` 兼容性控制 | `https://docs.obsidian.md/Reference/Versions` |

---

## 查阅原则

1. **全部在线获取** — 所有内容均使用 `defuddle parse <url> --md` 从官网提取，无本地缓存
2. **从总览入手** — 从本文档索引找到对应页面 URL，然后 defuddle 获取具体内容
3. **关注核心** — 提取后聚焦用户问题的具体段落，不需要通读全文
4. **API 文档导航** — 每个类/接口/函数都有独立页面，URL 规则为 `https://docs.obsidian.md/Reference/TypeScript+API/<Name>`，子方法为 `/<Name>/<method>`
5. **URL 编码** — Obsidian 文档 URL 中空格需编码为 `+` 号
