# 工具函数 + 配置管理

---

## `src/utils/helpers.ts` — 工具函数

| 函数 | 说明 |
|------|------|
| `extractTextContent(content)` | 从消息 content（字符串或数组）中提取纯文本 |

---

## `src/settings.ts` — 配置管理

**职责**：定义设置接口、默认值和设置页面 UI。

| 导出 | 说明 |
|------|------|
| `PiChatSettings` | 设置接口 |
| `DEFAULT_SETTINGS` | 默认配置 |
| `PiChatSettingTab` | 设置页面，继承 `PluginSettingTab` |
