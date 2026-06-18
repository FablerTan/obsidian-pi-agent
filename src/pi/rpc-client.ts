// child_process: Node.js 内置模块，用来启动和管理子进程
import { spawn, ChildProcess } from 'child_process';

export class PiRpcClient {
    // pi 子进程的引用，启动后才有值
    private proc: ChildProcess | null = null;

    // 接收 stdout 数据的缓冲区（数据是一块块到的，要拼成完整行再解析）
    private buffer = '';

    // ── 事件回调 ────────────────────────────────
    // 外部通过这个字段接收 pi 返回的事件
    onEvent: ((event: any) => void) | null = null;

    // ── 启动 pi 子进程 ──────────────────────────
    start(cwd: string): void {
        console.log(`Starting pi RPC in ${cwd}`);

        // pi 的完整路径（macOS Homebrew 安装路径）
        const piPath = '/opt/homebrew/bin/pi';

        // 不加 --no-session，让 pi 自动保存会话文件到 ~/.pi/agent/sessions/
        this.proc = spawn(piPath, ['--mode', 'rpc'], {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        // 监听 stdout：pi 返回的事件流
        this.proc.stdout?.on('data', (chunk: Buffer) => {
            this.buffer += chunk.toString('utf-8');
            this.processLines();
        });

        // 监听 stderr：错误信息
        this.proc.stderr?.on('data', (chunk: Buffer) => {
            console.error('pi stderr:', chunk.toString());
        });

        // 监听进程退出
        this.proc.on('exit', (code) => {
            console.log(`pi exited with code ${code}`);
            this.proc = null;
        });
    }

    // ── 停止 pi 子进程 ──────────────────────────
    stop(): void {
        if (this.proc) {
            this.proc.kill();
            this.proc = null;
        }
    }

    // ── 发送 JSON 命令到 pi ─────────────────────
    send(command: object): void {
        if (!this.proc || !this.proc.stdin) {
            console.error('pi not running');
            return;
        }
        const line = JSON.stringify(command) + '\n';
        this.proc.stdin.write(line, 'utf-8');
    }

    // ── 快捷发送 prompt ─────────────────────────
    prompt(message: string): void {
        this.send({ type: 'prompt', message });
    }

    // ── 从缓冲区里解析完整的 JSONL 行 ──────────
    private processLines(): void {
        while (true) {
            const idx = this.buffer.indexOf('\n');
            if (idx === -1) break;

            let line = this.buffer.slice(0, idx);
            this.buffer = this.buffer.slice(idx + 1);

            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (!line) continue;

            try {
                const event = JSON.parse(line);
                this.handleEvent(event);
            } catch (e) {
                console.error('Failed to parse JSON:', line, e);
            }
        }
    }

    // ── 处理收到的事件 ──────────────────────────
    private handleEvent(event: any): void {
        if (this.onEvent) {
            this.onEvent(event);
        }
    }
}
