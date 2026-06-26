// 命令分组工具
// ReloadService（/reload 结果渲染）与 WelcomePage（欢迎页分组展示）共用。
// 按 source 把命令列表分桶，再按固定 order 输出，剩余按原始顺序追加。
import type { CommandInfo } from '../pi/types';

// source → 中文标签
export const SOURCE_LABELS: Record<string, string> = {
    extension: '扩展', skill: '技能', prompt: '模板',
    model: '模型', tool: '工具', other: '其他',
};

// 分组展示顺序（未列出的 source 按原始顺序追加在后面）
export const SOURCE_ORDER = ['extension', 'skill', 'prompt', 'tool', 'model'];

/**
 * 按 source 把命令分组，返回 [key, items][] 有序数组：
 *   - 先按 SOURCE_ORDER 顺序输出存在的分组
 *   - 剩余 source 按首次出现顺序追加
 *   - 调用方可通过 opts.exclude 跳过某些 source（如 extension 用磁盘扫描单独展示）
 */
export function groupCommandsBySource<T>(
    cmds: CommandInfo[],
    opts: { exclude?: string[] } = {},
): Array<{ key: string; items: T[] }> {
    const exclude = new Set(opts.exclude ?? []);
    const groups = new Map<string, T[]>();
    for (const c of cmds) {
        const src = c.source || 'other';
        if (exclude.has(src)) continue;
        if (!groups.has(src)) groups.set(src, []);
        groups.get(src)!.push(c as unknown as T);
    }

    const result: Array<{ key: string; items: T[] }> = [];
    for (const key of SOURCE_ORDER) {
        const items = groups.get(key);
        if (items) {
            result.push({ key, items });
            groups.delete(key);
        }
    }
    for (const [key, items] of groups.entries()) {
        result.push({ key, items });
    }
    return result;
}

/** 取 source 的中文标签，未知 source 回退为其本身 */
export function sourceLabel(key: string): string {
    return SOURCE_LABELS[key] || key;
}
