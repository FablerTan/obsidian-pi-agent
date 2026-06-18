# Pi Chat — Obsidian 聊天面板插件

## 项目概述

在 Obsidian 中创建一个和 Pi（终端 AI 编程助手）对话的聊天面板。通过 RPC 协议启动 pi 子进程进行通信。

## 技术路线

- 语言: TypeScript → 编译为 `main.js`
- 打包: esbuild
- 通信: 通过 `child_process.spawn()` 启动 `pi --mode rpc`，用 JSONL 协议通信
- 平台: 仅桌面端（需要 Node.js `child_process` 模块）

## 当前状态

从 Obsidian 官方 sample plugin 起步，逐步添加功能。

## 开发约定

### 学习方式

- 每次只加一个小功能，写一段代码就停下来解释
- 先从界面入手，再一步步加功能
- TypeScript 教学穿插在开发过程中

### 代码规范

- `main.ts` 只放生命周期相关代码
- 功能逻辑拆分到 `src/ui/`、`src/pi/` 等独立模块
- 变量/函数/类型都用中文注释说明

### 文档书写流程

- 每次新增模块或修改模块接口后，更新 `docs/architecture.md`
- 文档用中文，说明每个模块的职责、方法、数据流向
- 结构变化时更新目录树

### Git 提交规则

- 提交前确保文档已更新
- 每次写完一段可编译运行的代码后，立即提交 git
- 提交信息用中文，简洁说明本次改动
- 示例：`feat: 添加聊天面板基础视图`

## 功能计划（按实现顺序）

1. **聊天面板 UI** — 在 Obsidian 右侧栏创建一个 ItemView，包含消息列表和输入框
2. **启动 pi 子进程** — 插件加载时后台启动 `pi --mode rpc`
3. **发送消息** — 在输入框输入文字，通过 RPC 发给 pi
4. **流式显示回复** — pi 的回复一个字一个字地显示在聊天面板中
5. **设置页面** — 配置 pi 路径、模型选择等
6. （后续按需添加）

## 构建命令

```bash
npm install        # 安装依赖
npm run build      # 编译
npm run dev        # 监听模式
```
