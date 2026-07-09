# 工具函数 + 配置管理

---

## `src/utils/` — 工具模块

| 文件 | 导出 | 说明 |
|------|------|------|
| `session-file-reader.ts` | `readSessions(app): Promise<SessionEntry[]>` | 异步读取 pi 会话文件列表（隔离格式耦合） |
| `extension-loader.ts` | `discoverExtensions(cmds, dirs): Promise<ExtensionInfo[]>` | 磁盘扫描 + get_commands 交叉扩展发现（异步） |
| `pi-settings.ts` | `readCompactionSettings(projectPath)`, `writeCompactionSettings(settings, projectPath)`(async), `readResourcePaths(projectPath)`, `writeResourcePaths(projectPath, paths)`(async) | 读写项目 `.pi/settings.json` |
| `detect-pi.ts` | `detectPiPath(): string \| null` | 自动检测 pi 可执行文件路径 |

### `session-file-reader.ts`

封装 pi 的 session 文件目录结构 + JSONL 解析：

```
~/.pi/agent/sessions/--用户-fabler-my-vault--/2024-01-01_123456.jsonl
```

- 第一行：session header（`{ name: "会话名" }`）
- 后续行：消息条目（`{ type: "message", message: { role: "user", content: "..." } }`）

**显示名优先级**：header.name → 首条用户消息（前 40 字）→ 日期

### `extension-loader.ts`

`discoverExtensions()` 流程：

1. 从 `get_commands` 建立 `path → [commandNames]` 索引（`source === 'extension'` 且有 `path`）
2. 扫描磁盘目录（递归子目录 `index.ts` + 单文件 `*.ts`）
3. 合并：磁盘文件标记 `confirmed`，commands 中有但磁盘无的也计入

### `pi-settings.ts`

- `readFullSettings` 保留同步（被同步 `display()` 调用）
- `writeFullSettings` 异步（`fsPromises.writeFile`）
- 所有公共 write 函数（`writeCompactionSettings` / `writeResourcePaths`）异步

---

## `src/settings.ts` — 配置管理

### `PiChatSettings`（Obsidian data.json 持久化）

```ts
interface PiChatSettings {
  piPath: string;          // pi 可执行文件路径
  autoCompaction: boolean; // 自动压缩开关
  skillPaths: string;      // 自定义技能路径（逗号分隔）
  promptPaths: string;     // 自定义模板路径（逗号分隔）
  extensionPaths: string;  // 自定义扩展路径（逗号分隔）
}
```

### `.pi/settings.json`（项目级配置，单一真相源）

```json
{
  "compaction": {
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "skills": ["../.pi/skills"],
  "prompts": ["../.pi/prompts"],
  "extensions": ["../.pi/extensions"]
}
```

### 设计原则

| 设置 | 存储位置 | 原因 |
|------|----------|------|
| pi 路径、资源路径 | `data.json` + `.pi/settings.json` | 插件需要记住，pi 也需要读取 |
| 自动压缩开关 | `data.json` | 插件启动时通过 RPC 设置给 pi |
| 压缩模式/百分比 | 仅设置面板本地状态 | 仅用于 UI 交互，实际值写入 `.pi/settings.json` |
| 压缩阈值 | `.pi/settings.json` | pi 进程启动时读取 |

`.pi/settings.json` 是运行时配置的单一真相源。Obsidian 设置面板是其编辑器，
而非独立的分叉（以前 `compactionMode`/`compactionPercent` 只存在 `data.json` 中）。
