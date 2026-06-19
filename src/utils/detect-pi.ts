// ── 自动检测 pi 可执行文件路径 ────────────────
import { execSync } from 'child_process';

/**
 * 尝试从多个来源检测 pi 的安装路径。
 * 按优先级返回第一个找到的可用路径，没找到则返回 null。
 */
export function detectPiPath(): string | null {
    // 1. which pi（PATH 环境变量）
    try {
        const result = execSync('which pi', { encoding: 'utf-8', timeout: 3000 }).trim();
        if (result) return result;
    } catch {
        // which 失败，继续尝试
    }

    // 2. Homebrew
    try {
        const result = execSync('brew --prefix pi', { encoding: 'utf-8', timeout: 3000 }).trim();
        if (result) {
            const candidate = `${result}/bin/pi`;
            return candidate;
        }
    } catch {
        // Homebrew 没装 pi
    }

    // 3. 常见安装位置
    const commonPaths = [
        '/opt/homebrew/bin/pi',
        '/usr/local/bin/pi',
        '/usr/bin/pi',
        `${process.env.HOME}/.local/bin/pi`,
        `${process.env.HOME}/.nix-profile/bin/pi`,
    ];

    for (const p of commonPaths) {
        try {
            execSync(`test -x "${p}"`, { timeout: 1000 });
            return p;
        } catch {
            continue;
        }
    }

    return null;
}
