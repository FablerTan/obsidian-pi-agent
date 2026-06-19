# Pi Chat — Obsidian 聊天面板插件

## 项目概述

在 Obsidian 中创建一个和 Pi（终端 AI 编程助手）对话的聊天面板。通过 RPC 协议启动 pi 子进程进行通信。

## 技术路线

- 语言: TypeScript → 编译为 `main.js`
- 打包: esbuild
- 通信: 通过 `child_process.spawn()` 启动 `pi --mode rpc`，用 JSONL 协议通信
- 平台: 仅桌面端（需要 Node.js `child_process` 模块）

## 当前状态

功能完整的 Pi 聊天面板插件，支持完整的 RPC 协议通信、Extension UI、压缩管理、命令系统等功能。

## 代码规范

- `main.ts` 只放生命周期相关代码
- 功能逻辑拆分到 `src/ui/`、`src/pi/` 等独立模块
- 变量/函数/类型都用中文注释说明

### Git 提交规则

- 每次写完一段可编译运行的代码后，立即提交 git
- 提交信息用中文，简洁说明本次改动

## 构建命令

```bash
npm install        # 安装依赖
npm run build      # 编译
npm run dev        # 监听模式
```
