// 扩展发现工具 — 从磁盘目录 + get_commands 响应中合并扩展加载情况
// 解决扩展即使不注册命令也能在欢迎页/重载中可见的问题
import * as fs from 'fs';
import * as path from 'path';

/** 单个扩展的加载信息 */
export interface ExtensionInfo {
    /** 文件名（不含 .ts） */
    name: string;
    /** 绝对路径 */
    path: string;
    /** 是否在 get_commands 中注册了命令 */
    hasCommands: boolean;
    /** 注册的命令名列表 */
    commandNames: string[];
}

/**
 * 发现所有扩展（含无命令的）
 *
 * @param cmds      get_commands 返回的原始命令数组（需含 source、name、path 字段）
 * @param scanDirs  要扫描的扩展目录绝对路径列表
 */
export function discoverExtensions(
    cmds: { name: string; source: string; path?: string }[],
    scanDirs: string[],
): ExtensionInfo[] {
    // ── 1. 从 commands 中提取有路径的扩展命令 ──
    // key = 规范化后的绝对路径, value = 命令名列表
    const cmdMap = new Map<string, string[]>();
    for (const c of cmds) {
        if (c.source === 'extension' && c.path) {
            const resolved = path.resolve(c.path);
            if (!cmdMap.has(resolved)) cmdMap.set(resolved, []);
            cmdMap.get(resolved)!.push(c.name);
        }
    }

    // ── 2. 扫描磁盘目录，找出所有 .ts 文件 ──
    // 支持两种扩展布局：
    //   *.ts           （直接文件名，如 test-ext-ui.ts）
    //   */index.ts     （子目录，如 auto-commit/index.ts）
    const diskFiles = new Set<string>();
    for (const dir of scanDirs) {
        try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const fullPath = path.resolve(dir, entry.name);
                if (entry.isFile() && entry.name.endsWith('.ts')) {
                    diskFiles.add(fullPath);
                } else if (entry.isDirectory()) {
                    // 子目录，检查 index.ts
                    const indexPath = path.join(fullPath, 'index.ts');
                    if (fs.existsSync(indexPath)) {
                        diskFiles.add(indexPath);
                    }
                }
            }
        } catch {
            // 目录不存在，跳过即可（不要报错）
        }
    }

    // ── 3. 合并结果 ──
    const resultMap = new Map<string, ExtensionInfo>();

    // 磁盘文件
    for (const p of diskFiles) {
        resultMap.set(p, {
            name: path.basename(p, '.ts'),
            path: p,
            hasCommands: cmdMap.has(p),
            commandNames: cmdMap.get(p) ?? [],
        });
    }

    // commands 中有但磁盘上没找到的（可能是绝对路径或已删除的扩展）
    for (const [p, names] of cmdMap) {
        if (!diskFiles.has(p)) {
            resultMap.set(p, {
                name: path.basename(p, '.ts'),
                path: p,
                hasCommands: true,
                commandNames: names,
            });
        }
    }

    // 按名称排序
    const result = [...resultMap.values()];
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
}
