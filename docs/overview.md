# 总览

## 外部依赖

| 依赖 | 用途 |
|------|------|
| `obsidian` | Obsidian API 类型和基类 |
| `child_process` (Node.js) | 启动 pi 子进程 |
| `fs` (Node.js) | 读取历史会话文件 |
| `path` (Node.js) | 路径拼接 |
| `os` (Node.js) | 获取用户 home 目录 |

## 数据流全景

### 发送消息

```
用户按 Enter
  → PiChatView 取输入框文字 → addUserMessage() 显示气泡
  → showLoading() → piClient.prompt(msg)
  → rpc-client send({ type:'prompt', message }) → stdin
  → pi 进程处理 → stdout JSONL
  → processLines() → handleEvent() → onEvent
  → PiChatView.handlePiEvent() → appendAssistantText() 更新 UI
```

### 切换历史会话

```
点击历史图标
  → HistoryPanel.open()
    → readSessions() 读取 ~/.pi/agent/sessions/
    → 创建半透明遮罩 + 底部浮层
    → 选中会话 → switchToSession(path)
      → sendAndWait(switch_session) → sendAndWait(get_messages)
      → loadMessages() 清空并渲染历史
```

## 会话存储

- **位置**: `~/.pi/agent/sessions/--编码后的vault路径--/*.jsonl`
- **格式**: 每行一个 JSON 对象，第一行为 session header
- **共享**: 插件和终端 pi 共享同一份会话历史
- **持久化**: `--no-session` 已移除，每次对话自动保存
