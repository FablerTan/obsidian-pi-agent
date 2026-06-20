// 扩展发现工具 — 从磁盘目录 + get_commands 响应中合并扩展加载情况
// 解决扩展即使不注册命令也能在欢迎页/重载中可见的问题
import * as path from 'path';

/** 单个扩展的加载信息 */
export interface ExtensionInfo {
    /** 文件名（不含后缀） */
    name: string;
    /** 扩展文件路径 */
    path: string;
    /** 注册的命令名列表 */
    commandNames: string[];
}

/**
 * 从 get_commands 响应中提取扩展信息（只返回有命令的扩展）
 * pi 不提供列出已加载扩展的 RPC，get_commands 是最可靠的来源。
 * 无命令的扩展（仅事件钩子）不会被列出。
 */
export function extractExtensions(
    cmds: { name: string; source: string; path?: string }[],
): ExtensionInfo[] {
    // key = 规范化后的绝对路径, value = 命令名列表
    const extMap = new Map<string, ExtensionInfo>();

    for (const c of cmds) {
        if (c.source !== 'extension' || !c.path) continue;
        const resolved = path.resolve(c.path);
        if (!extMap.has(resolved)) {
            extMap.set(resolved, {
                name: path.basename(resolved, '.ts').replace(/\/index$/, ''),
                path: resolved,
                commandNames: [],
            });
        }
        extMap.get(resolved)!.commandNames.push(c.name);
    }

    const result = [...extMap.values()];
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
}
