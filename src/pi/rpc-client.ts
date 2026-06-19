// child_process: Node.js 内置模块，用来启动和管理子进程
import { spawn, ChildProcess } from 'child_process';

export class PiRpcClient {
    // pi 子进程的引用，启动后才有值
    private proc: ChildProcess | null = null;

    // 接收 stdout 数据的缓冲区（数据是一块块到的，要拼成完整行再解析）
    private buffer = '';

    // ── 事件回调 ────────────────────────────────
    // 外部通过这个字段接收 pi 返回的事件（非 response 类型）
    onEvent: ((event: any) => void) | null = null;

    // ── 挂起的请求 ──────────────────────────────
    // key=请求ID, value=回调函数，收到对应 response 时调用
    private pendingRequests: Map<string, (resp: any) => void> = new Map();

    // 自增 ID 计数器
    private requestIdCounter = 0;

    // ── 启动 pi 子进程（异步，等 pi 准备好后 resolve） ─
    start(cwd: string): Promise<void> {
        this.cwd = cwd;
        console.log(`Starting pi RPC in ${cwd}`);

        // pi 的完整路径（macOS Homebrew 安装路径）
        const piPath = '/opt/homebrew/bin/pi';

        // 保存局部引用，用于 exit 处理器判断是否还是同一个进程
        const proc = spawn(piPath, ['--mode', 'rpc'], {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.proc = proc;

        const readyPromise = new Promise<void>((resolve, reject) => {
            // 监听 stdout：pi 返回的事件流
            proc.stdout?.on('data', (chunk: Buffer) => {
                this.buffer += chunk.toString('utf-8');
                this.processLines();
            });

            // 监听 stderr：错误信息
            proc.stderr?.on('data', (chunk: Buffer) => {
                console.error('pi stderr:', chunk.toString());
            });

            // 监听进程退出（用局部引用判断，避免旧进程退出时覆盖新进程）
            proc.on('exit', (code) => {
                console.log(`pi exited with code ${code}`);
                // 只有 this.proc 仍然指向当前进程时，才清空它
                // 防止 restart() 中旧进程的 exit 异步触发覆盖新进程
                if (this.proc === proc) {
                    this.proc = null;
                }
                if (code !== 0) {
                    reject(new Error(`pi exited with code ${code}`));
                }
            });

            // 发送 get_state 确认 pi 已就绪
            // 如果 10 秒内没响应，说明 pi 启动有问题
            const timeout = setTimeout(() => {
                reject(new Error('pi failed to respond within 10s'));
            }, 10000);

            this.sendAndWait({ type: 'get_state' }).then(() => {
                clearTimeout(timeout);
                resolve();
            }).catch(reject);
        });

        return readyPromise;
    }

    // 记住工作目录，重启时复用
    private cwd = '';

    // ── 停止 pi 子进程 ──────────────────────────
    stop(): void {
        if (this.proc) {
            this.proc.kill();
            this.proc = null;
        }
    }

    // ── 重启 pi 子进程（让新增 skill/extension 生效） ──
    async restart(): Promise<void> {
        this.stop();
        // 清空挂起的请求（重启后旧请求作废）
        this.pendingRequests.clear();
        this.buffer = '';
        this.requestIdCounter = 0;
        await this.start(this.cwd);
    }

    // ── 发送 JSON 命令到 pi ─────────────────────
    // 返回请求 ID，可用于关联响应
    send(command: object): string | null {
        if (!this.proc || !this.proc.stdin) {
            console.error('pi not running');
            return null;
        }
        // 自动加上递增 ID
        const id = `req-${++this.requestIdCounter}`;
        const cmd = { id, ...command };
        const line = JSON.stringify(cmd) + '\n';
        this.proc.stdin.write(line, 'utf-8');
        return id;
    }

    // ── 发送命令并等待响应 ──────────────────────
    // 返回一个 Promise，收到对应 response 时 resolve
    sendAndWait(command: object): Promise<any> {
        return new Promise((resolve) => {
            const id = this.send(command);
            if (!id) {
                resolve({ success: false, error: 'pi not running' });
                return;
            }
            this.pendingRequests.set(id, resolve);
        });
    }

    // ── 发送 Extension UI 响应（回应用户在弹窗中的选择） ──
    sendExtensionUIResponse(id: string, data: Record<string, any>): boolean {
        return this.send({ type: 'extension_ui_response', id, ...data }) !== null;
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
        // 如果是 response 类型且有对应的 pending 请求，走请求回调
        if (event.type === 'response' && event.id) {
            const resolve = this.pendingRequests.get(event.id);
            if (resolve) {
                this.pendingRequests.delete(event.id);
                resolve(event);
                return;
            }
        }
        // 否则走通用事件回调
        if (this.onEvent) {
            this.onEvent(event);
        }
    }
}
