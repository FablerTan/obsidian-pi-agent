// ── 读写 Pi 的 settings.json ──────────────────
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SETTINGS_PATH = path.join(os.homedir(), '.pi', 'agent', 'settings.json');

export interface PiCompactionSettings {
	reserveTokens: number;
	keepRecentTokens: number;
}

// ── 读取 pi settings.json，返回完整对象 ──
function readFullSettings(): Record<string, any> {
	try {
		return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
	} catch {
		return {};
	}
}

// ── 写入 pi settings.json，保留已有设置 ──
function writeFullSettings(json: Record<string, any>): void {
	const dir = path.dirname(SETTINGS_PATH);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(SETTINGS_PATH, JSON.stringify(json, null, 2) + '\n', 'utf-8');
}

/** 读取 pi 的压缩阈值设置 */
export function readCompactionSettings(): PiCompactionSettings {
	const json = readFullSettings();
	const c = json.compaction || {};
	return {
		reserveTokens: c.reserveTokens ?? 16384,
		keepRecentTokens: c.keepRecentTokens ?? 20000,
	};
}

/** 写入压缩阈值 */
export function writeCompactionSettings(settings: PiCompactionSettings): void {
	const json = readFullSettings();
	json.compaction = { ...json.compaction, ...settings };
	writeFullSettings(json);
}

/** 读取资源路径配置 */
export function readResourcePaths(): { skills: string[]; prompts: string[]; extensions: string[] } {
	const json = readFullSettings();
	return {
		skills: json.skills ?? [],
		prompts: json.prompts ?? [],
		extensions: json.extensions ?? [],
	};
}

/** 写入资源路径配置 */
export function writeResourcePaths(paths: { skills?: string[]; prompts?: string[]; extensions?: string[] }): void {
	const json = readFullSettings();
	if (paths.skills !== undefined) json.skills = paths.skills;
	if (paths.prompts !== undefined) json.prompts = paths.prompts;
	if (paths.extensions !== undefined) json.extensions = paths.extensions;
	writeFullSettings(json);
}
