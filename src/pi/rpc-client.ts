// child_process: Node.js 内置模块，用来启动和管理子进程
import { spawn, ChildProcess } from 'child_process';

// ── RPC 传输错误 ────────────────────────────────
// sendAndWait 在「传输层」失败时 reject 这些错误；
// pi 正常返回的 response（即使 success:false）仍走 resolve，由调用方判断
export class PiRpcError extends Error {
    constructor(
        message: string,
        public code: 'not_running' | 'timeout' | 'process_exit' | 'spawn_error' | 'write_error',
    ) {
        super(message);
        this.name = 'PiRpcError';
    }
}

// 进程断开原因（onDisconnect 回调参数）
export interface DisconnectReason {
    code: number | null;
    unexpected: boolean;
}

export class PiRpcClient {
    // pi 子进程的引用，启动后才有值
    private proc: ChildProcess | null = null;

    // pi 可执行文件路径
    private piPath = '/opt/homebrew/bin/pi';

    // 自动压缩设置（启动后/重启后应用）
    private _autoCompaction = true;

    // 接收 stdout 数据的缓冲区（数据是一块块到的，要拼成完整行再解析）
    private buffer = '';

    // ── 事件订阅 ────────────────────────────────
    // 支持多个订阅者，订阅返回取消订阅函数
    private eventHandlers = new Set<(event: any) => void>();
    private disconnectHandlers = new Set<(reason: DisconnectReason) => void>();

    // ── 挂起的请求 ──────────────────────────────
    // key=请求ID, value=回调 + 超时定时器
    private pendingRequests: Map<
        string,
        { resolve: (resp: any) => void; reject: (err: Error) => void; timer: number | null }
    > = new Map();

    // 自增 ID 计数器
    private requestIdCounter = 0;

    // 默认请求超时（毫秒）。0 表示不超时
    // 避免 pi 卡住时 Promise 永久挂起；调用方可通过 opts.timeoutMs 覆盖
    private defaultTimeoutMs = 30_000;

    // 记住工作目录，重启时复用
    private cwd = '';

    // ── 设置 pi 路径 ────────────────────────────
    setPiPath(path: string): void {
        this.piPath = path;
    }

    // ── 订阅 pi 事件 ────────────────────────────
    // 多个视图可同时订阅；返回取消订阅函数，视图 onClose 时调用
    on(handler: (event: any) => void): () => void {
        this.eventHandlers.add(handler);
        return () => this.eventHandlers.delete(handler);
    }

    // ── 订阅进程断开事件（pi 意外退出时触发） ──
    // 注意：stop() / restart() 主动停止不会触发（属于预期断开）
    onDisconnect(handler: (reason: DisconnectReason) => void): () => void {
        this.disconnectHandlers.add(handler);
        return () => this.disconnectHandlers.delete(handler);
    }

    // ── 启动 pi 子进程（异步，等 pi 准备好后 resolve） ─
    start(cwd: string): Promise<void> {
        this.cwd = cwd;
        console.log(`Starting pi RPC in ${cwd}`);

        const piPath = this.piPath;
        const proc = spawn(piPath, ['--mode', 'rpc'], {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.proc = proc;

        // ready 标志：区分「启动阶段失败」与「运行中意外退出」
        let ready = false;

        return new Promise<void>((resolve, reject) => {
            // 监听 stdout：pi 返回的事件流
            proc.stdout?.on('data', (chunk: Buffer) => {
                this.buffer += chunk.toString('utf-8');
                this.processLines();
            });

            // 监听 stderr：错误信息
            proc.stderr?.on('data', (chunk: Buffer) => {
                console.error('pi stderr:', chunk.toString());
            });

            // spawn 错误：可执行文件不存在或权限不足
            proc.on('error', (err) => {
                console.error('pi spawn error:', err.message);
                if (this.proc === proc) this.proc = null;
                const rpcErr = new PiRpcError(
                    `无法启动 pi (${piPath}): ${err.message}`,
                    'spawn_error',
                );
                this.rejectAllPending(rpcErr);
                if (!ready) reject(rpcErr);
            });

            // 监听进程退出
            proc.on('exit', (code) => {
                console.log(`pi exited with code ${code}`);
                const wasThis = this.proc === proc;
                if (wasThis) this.proc = null;
                const rpcErr = new PiRpcError(
                    `pi 进程退出 (code ${code})`,
                    'process_exit',
                );
                this.rejectAllPending(rpcErr);
                if (!ready) {
                    reject(rpcErr);
                } else if (wasThis) {
                    // 运行中意外退出：通知订阅者
                    this.emitDisconnect({ code, unexpected: true });
                }
            });

            // 发送 get_state 确认 pi 已就绪
            // 如果 10 秒内没响应，说明 pi 启动有问题
            const timeout = window.setTimeout(() => {
                if (!ready) {
                    reject(new PiRpcError('pi 在 10 秒内未响应 get_state', 'timeout'));
                }
            }, 10_000);

            this.sendAndWait({ type: 'get_state' }, { timeoutMs: 10_000 }).then(() => {
                window.clearTimeout(timeout);
                ready = true;
                // pi 就绪后应用自动压缩设置
                this.setAutoCompaction(this._autoCompaction).catch(() => {});
                resolve();
            }).catch((err) => {
                window.clearTimeout(timeout);
                if (!ready) reject(err instanceof Error ? err : new PiRpcError(String(err), 'spawn_error'));
            });
        });
    }

    // ── 停止 pi 子进程 ──────────────────────────
    // 主动停止：移除 exit 监听以免触发 onDisconnect，并 reject 所有 pending
    stop(): void {
        if (this.proc) {
            this.proc.removeAllListeners('exit');
            this.proc.kill();
            this.proc = null;
        }
        this.rejectAllPending(new PiRpcError('pi 已停止', 'process_exit'));
    }

    // ── 重启 pi 子进程（让新增 skill/extension 生效） ──
    async restart(): Promise<void> {
        this.stop();
        this.buffer = '';
        this.requestIdCounter = 0;
        await this.start(this.cwd);
    }

    // ── 发送 JSON 命令到 pi ─────────────────────
    // 返回请求 ID，可用于关联响应；pi 未运行或写入失败返回 null
    send(command: object): string | null {
        if (!this.proc || !this.proc.stdin) {
            console.error('pi not running');
            return null;
        }
        const id = `req-${++this.requestIdCounter}`;
        const cmd = { id, ...command };
        const line = JSON.stringify(cmd) + '\n';
        try {
            this.proc.stdin.write(line, 'utf-8');
        } catch (e) {
            // 进程刚退出时写入会抛 EPIPE，捕获避免崩溃
            console.error('pi write failed:', e);
            return null;
        }
        return id;
    }

    // ── 发送命令并等待响应 ──────────────────────
    // 传输层失败（pi 未运行 / 超时 / 进程退出）时 reject PiRpcError；
    // pi 正常返回的 response（含 success:false）走 resolve，由调用方判断
    sendAndWait(
        command: object,
        opts: { timeoutMs?: number } = {},
    ): Promise<any> {
        const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;
        return new Promise((resolve, reject) => {
            let id: string | null = null;

            // 超时定时器：到点后从 pending 移除并 reject
            const timer: number | null = timeoutMs > 0
                ? window.setTimeout(() => {
                    if (id && this.pendingRequests.has(id)) {
                        this.pendingRequests.delete(id);
                        reject(new PiRpcError(`请求超时 (${timeoutMs}ms)`, 'timeout'));
                    }
                }, timeoutMs)
                : null;

            id = this.send(command);
            if (!id) {
                if (timer) window.clearTimeout(timer);
                reject(new PiRpcError('pi 未运行', 'not_running'));
                return;
            }
            this.pendingRequests.set(id, { resolve, reject, timer });
        });
    }

    // ── 发送 Extension UI 响应（回应用户在弹窗中的选择） ──
    sendExtensionUIResponse(id: string, data: Record<string, any>): boolean {
        return this.send({ type: 'extension_ui_response', id, ...data }) !== null;
    }

    // ── 获取会话统计（token 用量、费用等） ─────
    getSessionStats(): Promise<any> {
        return this.sendAndWait({ type: 'get_session_stats' });
    }

    // ── 设置自动压缩 ───────────────────────────
    setAutoCompaction(enabled: boolean): Promise<any> {
        this._autoCompaction = enabled;
        return this.sendAndWait({ type: 'set_auto_compaction', enabled });
    }

    // ── 预设自动压缩（不发送 RPC，启动后自动应用） ──
    setAutoCompactionSilent(enabled: boolean): void {
        this._autoCompaction = enabled;
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
            const entry = this.pendingRequests.get(event.id);
            if (entry) {
                this.pendingRequests.delete(event.id);
                if (entry.timer) window.clearTimeout(entry.timer);
                entry.resolve(event);
                return;
            }
        }
        // 否则走通用事件回调（广播给所有订阅者）
        this.emitEvent(event);
    }

    // ── 广播事件给所有订阅者 ───────────────────
    private emitEvent(event: any): void {
        for (const h of this.eventHandlers) {
            try {
                h(event);
            } catch (e) {
                console.error('pi event handler error:', e);
            }
        }
    }

    // ── 广播断开事件给所有订阅者 ───────────────
    private emitDisconnect(reason: DisconnectReason): void {
        for (const h of this.disconnectHandlers) {
            try {
                h(reason);
            } catch (e) {
                console.error('pi disconnect handler error:', e);
            }
        }
    }

    // ── reject 所有挂起请求（进程退出/停止时调用） ──
    private rejectAllPending(err: Error): void {
        for (const [, entry] of this.pendingRequests) {
            if (entry.timer) window.clearTimeout(entry.timer);
            entry.reject(err);
        }
        this.pendingRequests.clear();
    }
}
