// ── 读写项目 .pi/settings.json ────────────────
import * as fs from 'fs';
import * as path from 'path';

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

/** 读取项目 .pi/settings.json 中的压缩阈值，没有则返回默认值 */
export function readCompactionSettings(projectPath: string): PiCompactionSettings {
	const path_ = path.join(projectPath, '.pi', 'settings.json');
	const json = readFullSettings(path_);
	const c = json.compaction || {};
	return {
		reserveTokens: c.reserveTokens ?? 16384,
		keepRecentTokens: c.keepRecentTokens ?? 20000,
	};
}

/** 写入压缩阈值到项目 .pi/settings.json */
export function writeCompactionSettings(settings: PiCompactionSettings, projectPath: string): void {
	const path_ = path.join(projectPath, '.pi', 'settings.json');
	const json = readFullSettings(path_);
	json.compaction = { ...json.compaction, ...settings };
	writeFullSettings(path_, json);
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
