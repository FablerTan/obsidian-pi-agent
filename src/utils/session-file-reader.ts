// 会话文件读取器
// 封装 pi 会话文件目录结构格式和 JSONL 解析逻辑。
//
// 当前 pi 的会话文件存储在 ~/.pi/agent/sessions/--编码vault路径--/*.jsonl，
// 每文件为 JSONL 格式：第一行为 session header，后续为消息条目。
//
// ⚠️ 此模块与 pi 内部存储格式强耦合，pi 改格式时需要同步修改此模块。
//   如果 pi 未来提供 list_sessions RPC，应优先使用 RPC 而非直读文件。
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { App } from 'obsidian';
import type { FileSystemAdapter } from 'obsidian';

/** 单个会话的信息 */
export interface SessionEntry {
    /** session 文件绝对路径（传给 switch_session RPC） */
    file: string;
    /** 显示名称（会话名称 → 首条用户消息 → 文件名日期） */
    displayName: string;
}

/**
 * 构建 pi 会话目录路径
 * vault 路径 /Users/fabler/my-vault → sessions/--Users-fabler-my-vault--
 */
function buildSessionsDir(vaultPath: string): string {
    const sessionsDir = path.join(os.homedir(), '.pi', 'agent', 'sessions');
    const encoded = vaultPath.replace(/^\//, '').replace(/\//g, '-');
    return path.join(sessionsDir, `--${encoded}--`);
}

/**
 * 从 JSONL 首行提取会话名称
 */
function parseSessionName(firstLine: string): string | null {
    try {
        const header = JSON.parse(firstLine);
        return header.name || null;
    } catch {
        return null;
    }
}

/**
 * 从 JSONL 中找第一条用户消息的纯文本（截取前 40 字）
 */
function findFirstUserMessage(lines: string[]): string | null {
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        try {
            const entry = JSON.parse(line!);
            if (entry.type === 'message' && entry.message?.role === 'user') {
                const raw = entry.message.content;
                const text = extractTextFromRaw(raw);
                if (text) return text.length > 40 ? text.slice(0, 40) + '...' : text;
            }
        } catch {
            // 跳过解析失败的行
        }
    }
    return null;
}

/**
 * 从 content 字段提取纯文本（兼容字符串和数组两种格式）
 */
function extractTextFromRaw(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text || '')
            .join('\n');
    }
    return '';
}

/**
 * 从文件名提取日期作为显示名（fallback）
 */
function fileNameToDisplayName(fileName: string): string {
    const dateStr = fileName.split('_')[0] || fileName;
    return dateStr.replace(/T/, ' ').replace(/-\d+Z$/, '');
}

/**
 * 读取 vault 对应的历史会话列表
 *
 * @returns 按时间倒序排列的会话条目（最新在前）
 */
export async function readSessions(app: App): Promise<SessionEntry[]> {
    const vaultPath = (app.vault.adapter as FileSystemAdapter).getBasePath();
    const dir = buildSessionsDir(vaultPath);

    let files: string[];
    try {
        const entries = await fs.readdir(dir);
        files = entries
            .filter(f => f.endsWith('.jsonl'))
            .sort()
            .reverse();
    } catch {
        return [];
    }

    const sessions: SessionEntry[] = await Promise.all(
        files.map(async (f) => {
            const filePath = path.join(dir, f);
            const displayName = await readDisplayName(filePath, f);
            return { file: filePath, displayName };
        }),
    );

    return sessions;
}

/**
 * 读取单个会话文件的显示名称
 */
async function readDisplayName(filePath: string, fileName: string): Promise<string> {
    try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const lines = raw.split('\n');
        if (lines.length === 0) return fileNameToDisplayName(fileName);

        const name = parseSessionName(lines[0] ?? '');
        if (name) return name;

        const firstMsg = findFirstUserMessage(lines);
        if (firstMsg) return firstMsg;

        return fileNameToDisplayName(fileName);
    } catch {
        return fileName;
    }
}
