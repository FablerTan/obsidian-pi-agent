---
name: pi-docs
description: 按需访问 Pi 官方文档（https://pi.dev/docs）。当用户询问 Pi CLI 用法、配置、技能/扩展开发、RPC/SDK 集成等 Pi 相关问题时使用此技能，优先读取本地 Markdown 文档，在线文档用 defuddle 提取。
---

# Pi 文档查阅

Pi 通过 Homebrew 安装在本地，文档在 Cellar 中可直接读取。

> **本地文档路径**（自动跟随 brew upgrade，版本无关）：
> `/opt/homebrew/opt/pi-coding-agent/libexec/lib/node_modules/@earendil-works/pi-coding-agent/docs/`

优先使用 `read` 读取本地 `.md` 文件，在线文档用 `defuddle` 作为 fallback。

---

## 本地文档索引

所有文档都是纯 Markdown，用 `Read file_path="<路径>"` 直接读取。

### 入门
| 页面 | 文件 |
|------|------|
| Overview（总览） | `...docs/index.md` |
| Quickstart | `...docs/quickstart.md` |
| Usage（基础用法） | `...docs/usage.md` |

### 核心配置
| 页面 | 文件 |
|------|------|
| Settings | `...docs/settings.md` |
| Skills（技能系统） | `...docs/skills.md` |
| Extensions（TS 扩展） | `...docs/extensions.md` |
| Models（自定义模型） | `...docs/models.md` |
| Providers（提供商） | `...docs/providers.md` |
| Sessions（会话） | `...docs/sessions.md` |
| Themes（主题） | `...docs/themes.md` |
| Keybindings | `...docs/keybindings.md` |

### 进阶能力
| 页面 | 文件 |
|------|------|
| RPC Mode | `...docs/rpc.md` |
| SDK | `...docs/sdk.md` |
| JSON Event Stream | `...docs/json.md` |
| Prompt Templates | `...docs/prompt-templates.md` |
| Custom Providers | `...docs/custom-provider.md` |
| Compaction & Branch | `...docs/compaction.md` |
| Containerization | `...docs/containerization.md` |
| Development | `...docs/development.md` |
| Packages | `...docs/packages.md` |
| Session File Format | `...docs/session-format.md` |
| TUI Components | `...docs/tui.md` |

### 环境配置
| 页面 | 文件 |
|------|------|
| Terminal Setup | `...docs/terminal-setup.md` |
| tmux Setup | `...docs/tmux.md` |
| Shell Aliases | `...docs/shell-aliases.md` |
| Termux (Android) | `...docs/termux.md` |
| Windows Setup | `...docs/windows.md` |

> 完整路径前缀：`/opt/homebrew/opt/pi-coding-agent/libexec/lib/node_modules/@earendil-works/pi-coding-agent`

---

## 在线文档（fallback）

本地文档不完整或版本过旧时，用 `defuddle` 提取在线版：

```bash
defuddle parse <url> --md
```

| 页面 | 链接 |
|------|------|
| Quickstart | https://pi.dev/docs/latest/quickstart |
| Usage | https://pi.dev/docs/latest/usage |
| Settings | https://pi.dev/docs/latest/settings |
| Skills | https://pi.dev/docs/latest/skills |
| Extensions | https://pi.dev/docs/latest/extensions |
| Models | https://pi.dev/docs/latest/models |
| Providers | https://pi.dev/docs/latest/providers |
| Sessions | https://pi.dev/docs/latest/sessions |
| Themes | https://pi.dev/docs/latest/themes |
| Keybindings | https://pi.dev/docs/latest/keybindings |
| Security | https://pi.dev/docs/latest/security |
| RPC Mode | https://pi.dev/docs/latest/rpc |
| SDK | https://pi.dev/docs/latest/sdk |
| JSON Event Stream | https://pi.dev/docs/latest/json |
| Prompt Templates | https://pi.dev/docs/latest/prompt-templates |
| Custom Providers | https://pi.dev/docs/latest/custom-provider |
| Compaction & Branch | https://pi.dev/docs/latest/compaction |
| Containerization | https://pi.dev/docs/latest/containerization |
| Development | https://pi.dev/docs/latest/development |
| Packages | https://pi.dev/docs/latest/packages |
| Session File Format | https://pi.dev/docs/latest/session-format |
| Terminal Setup | https://pi.dev/docs/latest/terminal-setup |
| tmux Setup | https://pi.dev/docs/latest/tmux |
| TUI Components | https://pi.dev/docs/latest/tui |
| Shell Aliases | https://pi.dev/docs/latest/shell-aliases |
| Termux (Android) | https://pi.dev/docs/latest/termux |
| Windows Setup | https://pi.dev/docs/latest/windows |

## 查阅原则

1. **优先本地** — 用户问什么先用 `Read file_path` 读取对应本地 `.md` 文件，不走网络，零 token 开销
2. **本地不够再在线** — 本地文档不完整或版本不对时，用 `defuddle parse <url> --md` 获取在线版
3. **关注核心** — 提取后聚焦用户问题的具体段落，不需要通读全文给用户
4. **根文档** — 总览和概览类问题读 `...docs/index.md`（本地）或 https://pi.dev/docs/latest（在线）
