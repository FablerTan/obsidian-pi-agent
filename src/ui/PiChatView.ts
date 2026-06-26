// 聊天面板核心视图
// 负责：面板生命周期、消息流（用户输入 + AI 回复）、加载动画、事件分发
// 业务逻辑拆分到协作服务：
//   ReloadService（/reload + 命令加载 + 扩展发现）
//   StatsService（/stats）
//   SystemMessageRenderer（系统消息）
//   CommandRouter（命令菜单分派）
//   TurnContext（回合渲染状态）
import { ItemView, WorkspaceLeaf, Notice, setIcon, FileSystemAdapter } from 'obsidian';
import { PiRpcClient } from '../pi/rpc-client';
import { HistoryPanel } from './HistoryPanel';
import { CommandMenu } from './CommandMenu';
import { InputStatusBar } from './InputStatusBar';
import { NoteBar } from './NoteBar';
import { WelcomePage } from './WelcomePage';
import { ExtensionUIHandler } from './ExtensionUIHandler';
import { TurnContext } from './TurnContext';
import { SystemMessageRenderer } from './SystemMessageRenderer';
import { ReloadService } from './ReloadService';
import { StatsService } from './StatsService';
import { CommandRouter } from './CommandRouter';
import { PiChatSettings } from '../settings';
import type { PiEvent } from '../pi/types';

// 视图的唯一标识符，用来注册和查找这个视图
export const PI_CHAT_VIEW_TYPE = 'pi-chat-view';

// 聊天面板阶段状态机
// - idle：空闲，可发送消息
// - thinking：AI 正在处理请求（agent_start → agent_end）
// - reloading：正在重载 pi（/reload 互斥）
// 注：isCompacting 是独立布尔，可与 thinking 重叠（overflow 压缩在流式中触发）
type ChatPhase = 'idle' | 'thinking' | 'reloading';

export class PiChatView extends ItemView {
    // 消息列表容器
    messagesEl!: HTMLDivElement;

    // 欢迎页
    private welcomePage!: WelcomePage;

    // 加载动画元素（发送消息后、收到回复前显示）
    private loadingEl: HTMLDivElement | null = null;

    // 5 秒超时保护定时器
    private loadingTimeout: number | null = null;

    // 当前回合的渲染上下文（agent_start 创建，agent_end/error/abort 丢弃）
    // 封装助手气泡、流式 Markdown、思考块、工具卡片，回合结束整体清理
    private turn: TurnContext | null = null;

    // 历史会话管理器
    private historyPanel!: HistoryPanel;

    // 命令菜单（输入 / 时弹出）
    private commandMenu!: CommandMenu;

    // 命令路由器（分派内置命令到各处理器）
    private commandRouter!: CommandRouter;

    // 底部状态栏（模型 + 思考层级）
    private inputStatusBar!: InputStatusBar;

    // 笔记栏（笔记名 + 选中文本追踪）
    private noteBar!: NoteBar;

    // 输入框
    private textarea!: HTMLTextAreaElement;

    // vault 根目录（绝对路径）
    private vaultPath: string;

    // 插件设置（用于扩展目录配置）
    private settings: PiChatSettings;

    // 阶段状态机：合并原 isAgentActive + isReloading
    private phase: ChatPhase = 'idle';

    // 是否正在压缩会话上下文（独立标志，可与 thinking 重叠）
    private isCompacting = false;

    // 压缩状态的系统消息元素（用于更新而不是重复添加）
    private compactionMsgEl: HTMLElement | null = null;

    // 系统消息渲染器
    private systemMsg!: SystemMessageRenderer;

    // /reload 服务（含命令加载 + 扩展发现）
    private reloadService!: ReloadService;

    // /stats 服务
    private statsService!: StatsService;



    // Extension UI 协议处理器
    private extUiHandler!: ExtensionUIHandler;

    // RPC 客户端
    private piClient: PiRpcClient;

    // 事件订阅取消函数（onClose 时调用）
    private eventUnsub: (() => void) | null = null;

    // 断开订阅取消函数
    private disconnectUnsub: (() => void) | null = null;

    constructor(leaf: WorkspaceLeaf, piClient: PiRpcClient, settings: PiChatSettings) {
        super(leaf);
        this.piClient = piClient;
        this.settings = settings;
        this.vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();

        // 订阅 pi 事件：pi 返回的事件都到这里（支持多视图同时订阅）
        this.eventUnsub = this.piClient.on((event) => {
            this.handlePiEvent(event);
        });

        // 订阅进程意外断开：通知用户并重置 UI 状态
        this.disconnectUnsub = this.piClient.onDisconnect((reason) => {
            new Notice(`Pi 进程已退出 (code ${reason.code ?? 'null'})，请检查后重载`);
            this.resetTurnAndPhase();
            this.isCompacting = false;
        });
    }

    getViewType(): string { return PI_CHAT_VIEW_TYPE; }
    getDisplayText(): string { return 'Pi Agent'; }
    getIcon(): string { return 'pi-logo'; }

    // ── 构建 UI ──────────────────────────────────
    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('pi-chat-wrapper');

        // 顶部横条
        const header = contentEl.createDiv({ cls: 'pi-chat-header' });
        const iconEl = header.createSpan({ cls: 'pi-chat-header-icon' });
        setIcon(iconEl, 'pi-logo');
        header.createSpan({ cls: 'pi-chat-header-title', text: 'Pi' });

        // 内容区域（消息列表 + 输入框）
        const container = contentEl.createDiv({ cls: 'pi-chat-container' });

        // 消息列表
        const messagesEl = container.createDiv({ cls: 'pi-chat-messages' });
        this.welcomePage = new WelcomePage(messagesEl, this.app, this.piClient);

        // 历史会话管理器（通过 /history 命令触发）
        this.historyPanel = new HistoryPanel(this.piClient, messagesEl, contentEl, this.app);

        // ── 输入区域（自动撑到最底部） ──
        const inputArea = container.createDiv({ cls: 'pi-chat-input-area' });

        // ── 命令菜单容器 ──
        const menuContainer = inputArea.createDiv({ cls: 'pi-command-menu' });

        // ── Extension UI 内联对话框容器 ──
        const extUiContainer = inputArea.createDiv({ cls: 'pi-ext-inline-container' });
        extUiContainer.hidden = true;

        // 输入框
        this.textarea = inputArea.createEl('textarea', {
            cls: 'pi-chat-input',
            placeholder: '输入消息... (Enter 发送, Shift+Enter 换行)',
        });
        const textarea = this.textarea;

        // ── 笔记栏（笔记名 + 选中文本追踪，位于输入框上方） ──
        this.noteBar = new NoteBar(this.app, inputArea, textarea);
        // 把笔记栏移到输入框前面
        inputArea.insertBefore(this.noteBar.el, textarea);

        // ── 命令菜单（输入 / 时弹出） ──
        this.commandMenu = new CommandMenu(menuContainer, textarea, (cmd) => {
            this.commandRouter.handle(cmd);
        });
        // 命令路由器：分派内置命令到各处理器
        this.commandRouter = new CommandRouter(this.commandMenu, textarea, {
            newSession: () => this.handleNewSession(),
            reload: () => this.handleReload(),
            history: () => this.handleHistory(),
            compact: () => this.handleCompact(),
            stats: () => this.handleStats(),
        });

        // 输入变化时检测 / 命令
        // 中文输入法（IME）组合期间，拼音音节间的空格是输入法缓冲区的一部分，
        // 不是命令和参数的分隔符，因此组合期间忽略空格，取空格前的文字作为检索词
        textarea.addEventListener('input', (e: Event) => {
            const val = textarea.value;
            const ie = e as InputEvent;
            if (val.startsWith('/') && (!val.includes(' ') || ie.isComposing)) {
                let query = val.slice(1);
                // IME 组合期间拼音可能有空格，例如 "zhong wen" → 取 "zhong" 作为检索词
                if (ie.isComposing && query.includes(' ')) {
                    query = query.split(' ')[0] || query;
                }
                this.commandMenu.show(query);
            } else {
                this.commandMenu.hide();
            }
        });

        // Enter 发送，Shift+Enter 换行，Esc 打断
        textarea.addEventListener('keydown', (e) => {
            if (this.commandMenu.isVisible() && !e.isComposing) {
                const handled = this.commandMenu.handleKeydown(e);
                if (handled) return;
            }
            if (e.key === 'Escape' && this.phase === 'thinking') {
                e.preventDefault();
                this.abort();
                return;
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                const msg = textarea.value.trim();
                if (!msg) return;

                // 组装上下文 + 消息
                const parts = this.noteBar.getContextParts();
                const finalMsg = parts.length > 0
                    ? parts.join('\n\n') + '\n\n' + msg
                    : msg;

                if (this.phase !== 'idle') {
                    new Notice('请等待当前回复完成后再发送');
                    return;
                }
                if (this.isCompacting) {
                    new Notice('正在压缩会话，请稍候…');
                    return;
                }

                this.addUserMessage(msg);
                textarea.value = '';
                this.showLoading();
                this.piClient.prompt(finalMsg);

                // 5 秒超时保护
                this.loadingTimeout = window.setTimeout(() => {
                    if (this.loadingEl) {
                        this.hideLoading();
                        new Notice('Pi 没有响应，请检查 pi 是否正常运行');
                    }
                    this.loadingTimeout = null;
                }, 5000);
            }
        });

        // ── Extension UI 协议处理器 ──
        this.extUiHandler = new ExtensionUIHandler(this.app, this.piClient, textarea, extUiContainer);

        // ── 底部状态栏（模型 + 思考层级） ──
        this.inputStatusBar = new InputStatusBar(inputArea, this.piClient);
        // 首次加载 Token 用量
        this.inputStatusBar.updateContextUsage();

        this.messagesEl = messagesEl;

        // 系统消息渲染器（压缩状态/统计/reload 结果共用）
        this.systemMsg = new SystemMessageRenderer(messagesEl, () => this.removeWelcomePage());
        // /reload 服务（含命令加载 + 扩展发现）
        this.reloadService = new ReloadService(
            this.piClient, this.commandMenu, this.systemMsg, this.vaultPath, this.settings,
        );
        // /stats 服务
        this.statsService = new StatsService(this.piClient, this.systemMsg);

        // 预加载命令列表（作为 reload 对比基准）
        await this.reloadService.loadCommands();

        // pi 就绪后再加载欢迎页数据（含扩展发现）
        this.welcomePage.loadData(this.reloadService.getExtensionInfo());
    }

    async onClose(): Promise<void> {
        // 取消事件订阅，避免视图销毁后仍被回调
        this.eventUnsub?.();
        this.eventUnsub = null;
        this.disconnectUnsub?.();
        this.disconnectUnsub = null;
        // 清理超时定时器，防止视图销毁后操作已销毁的 DOM
        this.clearLoadingTimeout();
        this.noteBar?.destroy();
        this.extUiHandler?.destroy();
    }

    // ── 移除欢迎页（插入系统消息前调用） ─────
    private removeWelcomePage(): void {
        if (this.welcomePage) {
            this.welcomePage.remove();
            this.welcomePage = null as any;
        }
    }

    // ── 添加用户消息 ──────────────────────────
    addUserMessage(text: string): void {
        this.removeWelcomePage();
        const msgEl = this.messagesEl.createDiv({ cls: 'pi-chat-msg-user' });
        msgEl.setText(text);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    // ── 追加助手回复（Markdown 渲染） ──────────
    // 委托给当前回合上下文；无回合时丢弃（不应发生）
    appendAssistantText(text: string): void {
        this.getOrCreateTurn().appendText(text);
    }

    // ── 获取或创建当前回合上下文 ──────────────
    // 正常情况下 agent_start 已创建；防御性地处理事件早于 agent_start 的边界
    private getOrCreateTurn(): TurnContext {
        if (!this.turn) {
            this.turn = new TurnContext(this.messagesEl, this.app, this);
        }
        return this.turn;
    }

    // ── 丢弃当前回合并回到 idle 阶段 ──────────
    // 统一清理入口：agent_end / error / abort / newSession / disconnect 都调它
    private resetTurnAndPhase(): void {
        this.clearLoadingTimeout();
        this.hideLoading();
        this.turn = null;
        this.phase = 'idle';
    }

    // ── 滚动消息列表到底部（供 TurnContext 调用） ──
    scrollMessagesToBottom(): void {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    // ── 加载动画 ──────────────────────────────
    showLoading(): void {
        this.hideLoading();
        this.loadingEl = this.messagesEl.createDiv({ cls: 'pi-chat-loading' });
        for (let i = 0; i < 3; i++) {
            this.loadingEl.createEl('span', { cls: 'pi-chat-loading-dot' });
        }
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    hideLoading(): void {
        if (this.loadingEl) {
            this.loadingEl.remove();
            this.loadingEl = null;
        }
    }

    private clearLoadingTimeout(): void {
        if (this.loadingTimeout !== null) {
            clearTimeout(this.loadingTimeout);
            this.loadingTimeout = null;
        }
    }

    // ── 处理 pi 事件 ──────────────────────────
    private handlePiEvent(event: PiEvent): void {
        switch (event.type) {
            case 'message_update': {
                const delta = event.assistantMessageEvent;
                const turn = this.getOrCreateTurn();
                if (delta.type === 'text_delta') {
                    turn.appendText(delta.delta);
                }
                if (delta.type === 'toolcall_start' && this.loadingEl) {
                    this.hideLoading();
                }
                if (delta.type === 'thinking_start') {
                    turn.startThinking();
                }
                if (delta.type === 'thinking_delta') {
                    turn.appendThinking(delta.delta);
                }
                if (delta.type === 'thinking_end') {
                    turn.endThinking();
                }
                if (delta.type === 'text_start') {
                    turn.ensureTextContainer();
                }
                break;
            }
            case 'tool_execution_start': {
                this.getOrCreateTurn().addToolCall(event.toolCallId, event.toolName, event.args);
                break;
            }
            case 'tool_execution_update': {
                this.getOrCreateTurn().updateToolCall(event.toolCallId, event.partialResult?.content);
                break;
            }
            case 'tool_execution_end': {
                this.getOrCreateTurn().endToolCall(event.toolCallId, event.result, event.isError);
                break;
            }
            case 'agent_start': {
                this.phase = 'thinking';
                // 新建本回合上下文（丢弃可能残留的旧回合）
                this.turn = new TurnContext(this.messagesEl, this.app, this);
                if (!this.loadingEl) {
                    this.showLoading();
                }
                break;
            }
            case 'agent_end': {
                this.resetTurnAndPhase();
                // 更新底部 Token 用量
                this.inputStatusBar.updateContextUsage();
                break;
            }
            case 'extension_error': {
                this.resetTurnAndPhase();
                const detail = event.error
                    ? `扩展错误 (${event.event ?? ''}): ${event.error}`
                    : 'Pi 扩展发生错误';
                new Notice(detail);
                break;
            }
            case 'error': {
                this.resetTurnAndPhase();
                const msg = event.message ?? 'Pi 返回了错误';
                new Notice(typeof msg === 'string' ? msg : 'Pi 返回了错误');
                break;
            }
            case 'compaction_start': {
                this.isCompacting = true;
                const reasonMap: Record<string, string> = {
                    manual: '手动', threshold: '阈值', overflow: '溢出',
                };
                const reasonText = reasonMap[event.reason] || event.reason || '';
                this.systemMsg.add('compress', '正在压缩会话…', (el) => {
                    // el 是 body 子元素，存父元素以便后续更新 header
                    this.compactionMsgEl = el.parentElement ?? el;
                    el.createDiv({ text: '正在压缩上下文，请稍候…' });
                    if (reasonText) {
                        el.createDiv({ text: `原因: ${reasonText}` });
                    }
                });
                break;
            }
            case 'compaction_end': {
                this.isCompacting = false;
                // 尝试更新之前添加的 compaction 消息
                const el = this.compactionMsgEl;
                this.compactionMsgEl = null;
                if (el && this.messagesEl.contains(el)) {
                    // 直接更新已有消息的图标和标题
                    const header = el.querySelector('.pi-msg-system-header');
                    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
                    if (header) {
                        const iconEl = header.querySelector('.pi-msg-system-icon');
                        if (iconEl) setIcon(iconEl as HTMLElement, event.aborted ? 'x-circle' : 'check-circle');
                        const titleEl = header.querySelector('.pi-msg-system-title');
                        if (titleEl) {
                            if (event.aborted) titleEl.setText('压缩已取消');
                            else if (event.errorMessage) titleEl.setText('压缩失败');
                            else titleEl.setText('压缩完成');
                        }
                    }
                    const body = el.querySelector('.pi-msg-system-body');
                    if (body) {
                        if (event.aborted) {
                            body.setText('会话压缩被中止');
                        } else if (event.errorMessage) {
                            body.setText(`压缩失败: ${event.errorMessage}`);
                        } else if (event.result) {
                            const saved = event.result.tokensBefore ?? 0;
                            body.setText(`已释放 ${saved.toLocaleString()} token 空间`);
                        }
                    }
                } else {
                    // 消息不在 DOM 中了，重新添加一条
                    if (event.aborted) {
                        this.systemMsg.add('x-circle', '压缩已取消', (el) => {
                            el.setText('会话压缩被中止');
                        });
                    } else if (event.errorMessage) {
                        this.systemMsg.add('alert-circle', '压缩失败', (el) => {
                            el.setText(`压缩失败: ${event.errorMessage}`);
                        });
                    } else if (event.result) {
                        const saved = event.result.tokensBefore ?? 0;
                        this.systemMsg.add('check-circle', '压缩完成', (el) => {
                            el.setText(`已释放 ${saved.toLocaleString()} token 空间`);
                        });
                    }
                }
                break;
            }
            case 'extension_ui_request': {
                this.extUiHandler?.handleRequest(event);
                break;
            }
            // 以下事件暂未处理（详见 docs/rpc-gaps.md）
            case 'turn_start':
            case 'turn_end':
            case 'message_start':
            case 'message_end':
            case 'queue_update':
            case 'auto_retry_start':
            case 'auto_retry_end':
                break;
        }
    }

    // ── 处理 /new ──────────────────────────────
    private async handleNewSession(): Promise<void> {
        this.commandMenu.hide();
        this.textarea.value = '';
        try {
            const resp = await this.piClient.sendAndWait<{ cancelled: boolean }>({ type: 'new_session' });
            if (resp?.success) {
                this.resetTurnAndPhase();
                this.messagesEl.empty();
                this.welcomePage = new WelcomePage(this.messagesEl, this.app, this.piClient);
                this.welcomePage.loadData(this.reloadService.getExtensionInfo());
                new Notice('已创建新会话');
            } else {
                new Notice('新建会话失败');
            }
        } catch {
            new Notice('新建会话失败');
        }
    }

    // ── 打断 AI 输出 ──────────────────────────
    private abort(): void {
        this.commandMenu.hide();
        this.piClient.send({ type: 'abort' });
        this.resetTurnAndPhase();
        // 打断后如果有排队的消息，保持其排队样式，等待后续处理
        new Notice('已打断');
    }

    // ── 处理 /history ──────────────────────────
    private handleHistory(): void {
        this.commandMenu.hide();
        this.textarea.value = '';
        this.historyPanel.open();
    }

    // ── 处理 /compact ───────────────────────────
    private handleCompact(): void {
        this.commandMenu.hide();
        this.textarea.value = '';
        this.piClient.send({ type: 'compact' });
        new Notice('正在压缩会话…');
    }

    // ── 处理 /stats ────────────────────────────
    private async handleStats(): Promise<void> {
        this.commandMenu.hide();
        this.textarea.value = '';
        await this.statsService.run();
    }

    // ── 处理 /reload ──────────────────────────
    private async handleReload(): Promise<void> {
        // 互斥锁：reload 进行中时禁止重复触发
        if (this.phase === 'reloading') {
            new Notice('Pi 正在重载中，请稍候…');
            return;
        }
        this.phase = 'reloading';
        this.commandMenu.hide();
        this.textarea.value = '';
        try {
            await this.reloadService.run();
        } catch {
            new Notice('重载失败');
        } finally {
            this.phase = 'idle';
        }
    }
}