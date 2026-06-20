// 扩展发现工具 — 从磁盘目录 + get_commands 响应中合并扩展加载情况
// 由于 pi 不提供列出已加载扩展的 RPC，采用混合方案：
//   扫磁盘发现所有可能扩展，再用 get_commands 标记哪些确认已加载
import * as fs from 'fs';
import * as path from 'path';

/** 单个扩展的信息 */
export interface ExtensionInfo {
    /** 文件名（不含后缀） */
    name: string;
    /** 扩展文件绝对路径 */
    path: string;
    /** 是否在 get_commands 中有对应的命令 */
    confirmed: boolean;
    /** 注册的命令名列表 */
    commandNames: string[];
}

/**
 * 扫描磁盘目录，找出所有扩展文件
 * 匹配 pi 的扩展加载规则：
 *   *.ts        (直接文件名, 如 test-ext-ui.ts)
 *   sub/index.ts  (子目录, 如 auto-commit/index.ts)
 */
function scanDiskExtensions(dirs: string[]): Map<string, string> {
    const extMap = new Map<string, string>();
    for (const dir of dirs) {
        try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const fullPath = path.resolve(dir, entry.name);
                if (entry.isFile() && entry.name.endsWith('.ts')) {
                    const name = path.basename(entry.name, '.ts');
                    if (!extMap.has(fullPath)) extMap.set(fullPath, name);
                } else if (entry.isDirectory()) {
                    const indexPath = path.join(fullPath, 'index.ts');
                    if (fs.existsSync(indexPath)) {
                        if (!extMap.has(indexPath)) extMap.set(indexPath, entry.name);
                    }
                }
            }
        } catch {
            // 目录不存在，跳过
        }
    }
    return extMap;
}

/**
 * 发现扩展（磁盘扫描 + get_commands 交叉验证）
 *
 * @param cmds      get_commands 返回的原始命令数组
 * @param scanDirs  要扫描的扩展目录绝对路径列表
 */
export function discoverExtensions(
    cmds: { name: string; source: string; path?: string }[],
    scanDirs: string[],
): ExtensionInfo[] {
    // 1. 从 get_commands 建立命令索引
    const cmdMap = new Map<string, string[]>();
    for (const c of cmds) {
        if (c.source === 'extension' && c.path) {
            const resolved = path.resolve(c.path);
            if (!cmdMap.has(resolved)) cmdMap.set(resolved, []);
            cmdMap.get(resolved)!.push(c.name);
        }
    }

    // 2. 扫描磁盘
    const diskFiles = scanDiskExtensions(scanDirs);

    // 3. 合并结果
    const resultMap = new Map<string, ExtensionInfo>();

    // 磁盘文件
    for (const [absPath, name] of diskFiles) {
        resultMap.set(absPath, {
            name,
            path: absPath,
            confirmed: cmdMap.has(absPath),
            commandNames: cmdMap.get(absPath) ?? [],
        });
    }

    // commands 中有但磁盘上没找到的
    for (const [absPath, names] of cmdMap) {
        if (!diskFiles.has(absPath)) {
            resultMap.set(absPath, {
                name: path.basename(absPath, '.ts'),
                path: absPath,
                confirmed: true,
                commandNames: names,
            });
        }
    }

    // 按名称排序
    const result = [...resultMap.values()];
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
}
