// ── 读写 Pi 的 settings.json ──────────────────
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 全局设置（~/.pi/agent/settings.json）：压缩阈值等用户级配置
const GLOBAL_SETTINGS_PATH = path.join(os.homedir(), '.pi', 'agent', 'settings.json');

export interface PiCompactionSettings {
	reserveTokens: number;
	keepRecentTokens: number;
}

// ── 读取指定位置的 settings.json ──
function readFullSettings(settingsPath: string): Record<string, any> {
	try {
		return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
	} catch {
		return {};
	}
}

// ── 写入指定位置的 settings.json ──
function writeFullSettings(settingsPath: string, json: Record<string, any>): void {
	const dir = path.dirname(settingsPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(settingsPath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
}

/** 读取 pi 的压缩阈值设置（全局 ~/.pi/agent/settings.json） */
export function readCompactionSettings(): PiCompactionSettings {
	const json = readFullSettings(GLOBAL_SETTINGS_PATH);
	const c = json.compaction || {};
	return {
		reserveTokens: c.reserveTokens ?? 16384,
		keepRecentTokens: c.keepRecentTokens ?? 20000,
	};
}

/** 写入压缩阈值到全局设置 */
export function writeCompactionSettings(settings: PiCompactionSettings): void {
	const json = readFullSettings(GLOBAL_SETTINGS_PATH);
	json.compaction = { ...json.compaction, ...settings };
	writeFullSettings(GLOBAL_SETTINGS_PATH, json);
}

/** 读取项目级资源路径配置（.pi/settings.json） */
export function readResourcePaths(projectPath: string): { skills: string[]; prompts: string[]; extensions: string[] } {
	const settingsPath = path.join(projectPath, '.pi', 'settings.json');
	const json = readFullSettings(settingsPath);
	return {
		skills: json.skills ?? [],
		prompts: json.prompts ?? [],
		extensions: json.extensions ?? [],
	};
}

/** 写入资源路径配置到项目 .pi/settings.json */
export function writeResourcePaths(projectPath: string, paths: { skills?: string[]; prompts?: string[]; extensions?: string[] }): void {
	const settingsPath = path.join(projectPath, '.pi', 'settings.json');
	const json = readFullSettings(settingsPath);
	if (paths.skills !== undefined) json.skills = paths.skills;
	if (paths.prompts !== undefined) json.prompts = paths.prompts;
	if (paths.extensions !== undefined) json.extensions = paths.extensions;
	writeFullSettings(settingsPath, json);
}
