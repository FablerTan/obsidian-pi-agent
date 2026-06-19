// ── 读写 Pi 的 settings.json ──────────────────
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SETTINGS_PATH = path.join(os.homedir(), '.pi', 'agent', 'settings.json');

export interface PiCompactionSettings {
	reserveTokens: number;
	keepRecentTokens: number;
}

/** 读取 pi 的压缩阈值设置，文件不存在时返回默认值 */
export function readCompactionSettings(): PiCompactionSettings {
	try {
		const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
		const json = JSON.parse(raw);
		const c = json.compaction || {};
		return {
			reserveTokens: c.reserveTokens ?? 16384,
			keepRecentTokens: c.keepRecentTokens ?? 20000,
		};
	} catch {
		return { reserveTokens: 16384, keepRecentTokens: 20000 };
	}
}

/** 写入压缩阈值到 pi 的 settings.json，保留其他已有设置 */
export function writeCompactionSettings(settings: PiCompactionSettings): void {
	let json: Record<string, any> = {};
	try {
		const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
		json = JSON.parse(raw);
	} catch {
		// 文件不存在，用空对象
	}

	json.compaction = {
		...json.compaction,
		reserveTokens: settings.reserveTokens,
		keepRecentTokens: settings.keepRecentTokens,
	};

	// 确保目录存在
	const dir = path.dirname(SETTINGS_PATH);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	fs.writeFileSync(SETTINGS_PATH, JSON.stringify(json, null, 2) + '\n', 'utf-8');
}
