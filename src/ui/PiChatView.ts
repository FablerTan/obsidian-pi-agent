// 聊天面板核心视图
// 负责：面板生命周期、消息流（用户输入 + AI 回复）、加载动画、命令菜单、历史面板
import * as os from 'os';
import * as path from 'path';
import { ItemView, WorkspaceLeaf, Notice, setIcon, FileSystemAdapter } from 'obsidian';
import { PiRpcClient } from '../pi/rpc-client';
import { HistoryPanel } from './HistoryPanel';
import { MarkdownMsg } from './MarkdownMsg';
import { ToolCallMsg } from './ToolCallMsg';
import { CommandMenu } from './CommandMenu';
import { InputStatusBar } from './InputStatusBar';
import { NoteBar } from './NoteBar';
import { WelcomePage } from './WelcomePage';
import { ThinkingBlock } from './ThinkingBlock';
import { ExtensionUIHandler } from './ExtensionUIHandler';
import { PiChatSettings } from '../settings';
import { discoverExtensions, ExtensionInfo } from '../utils/extension-loader';

// 视图的唯一标识符，用来注册和查找这个视图
export const PI_CHAT_VIEW_TYPE = 'pi-chat-view';

export class PiChatView extends ItemView {
    // 消息列表容器
    messagesEl!: HTMLDivElement;

    // 欢迎页
    private welcomePage!: WelcomePage;

    // 加载动画元素（发送消息后、收到回复前显示）
    private loadingEl: HTMLDivElement | null = null;

    // 当前正在流式输出的 markdown 消息（没有时为空）
    private currentMarkdown: MarkdownMsg | null = null;

    // 当前助手消息的容器 DOM 元素（文字 + 工具卡片都在这个容器里）
    private currentAssistantEl: HTMLElement | null = null;

    // 当前思考块（AI 推理过程）
    private thinkingBlock: ThinkingBlock | null = null;

    // 追踪正在执行的工具调用（toolCallId -> ToolCallMsg）
    private toolCalls: Map<string, ToolCallMsg> = new Map();

    // 历史会话管理器
    private historyPanel!: HistoryPanel;

    // 命令菜单（输入 / 时弹出）
    private commandMenu!: CommandMenu;

    // 底部状态栏（模型 + 思考层级）
    private inputStatusBar!: InputStatusBar;

    // 笔记栏（笔记名 + 选中文本追踪）
    private noteBar!: NoteBar;

    // 输入框
    private textarea!: HTMLTextAreaElement;

    // 5 秒超时保护定时器
    private loadingTimeout: number | null = null;

    // 上一次加载的命令名集合（用于 /reload 对比新增/移除）
    private previousCmdNames: Set<string> = new Set();

    // 上一次加载的完整命令数据（含 source），用于 /reload 失败时回退显示
    private previousCmdList: { name: string; source: string }[] = [];

    // 上一次 get_commands 返回的原始命令数组（含 path 字段），用于扩展发现
    private lastRawCommands: any[] = [];

    // vault 根目录（绝对路径）
    private vaultPath: string;

    // 插件设置（用于扩展目录配置）
    private settings: PiChatSettings;

    // reload 进行中标志，防止重复触发
    private isReloading = false;

    // 当前 AI 是否正在处理请求
    private isAgentActive = false;

    // 是否正在压缩会话上下文
    private isCompacting = false;

    // 压缩状态的系统消息元素（用于更新而不是重复添加）
    private compactionMsgEl: HTMLElement | null = null;



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
            this.clearLoadingTimeout();
            this.hideLoading();
            this.isAgentActive = false;
            this.isCompacting = false;
            this.currentMarkdown = null;
            this.currentAssistantEl = null;
            this.thinkingBlock = null;
            this.toolCalls.clear();
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
            if (cmd.name === 'new') {
                this.handleNewSession();
            } else if (cmd.name === 'reload') {
                this.handleReload();
            } else if (cmd.name === 'history') {
                this.handleHistory();
            } else if (cmd.name === 'compact') {
                this.handleCompact();
            } else if (cmd.name === 'stats') {
                this.handleStats();
            } else {
                textarea.value = '/' + cmd.name + ' ';
                textarea.focus();
            }
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
            if (e.key === 'Escape' && this.isAgentActive) {
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

                if (this.isAgentActive) {
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

        // 预加载命令列表（作为 reload 对比基准）
        await this.loadCommands();

        // pi 就绪后再加载欢迎页数据（含扩展发现）
        const extInfo = this.buildExtensionInfo();
        this.welcomePage.loadData(extInfo);
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

    // ── 添加用户消息 ──────────────────────────
    addUserMessage(text: string): void {
        if (this.welcomePage) {
            this.welcomePage.remove();
            this.welcomePage = null as any;
        }
        const msgEl = this.messagesEl.createDiv({ cls: 'pi-chat-msg-user' });
        msgEl.setText(text);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    // ── 追加助手回复（Markdown 渲染） ──────────
    appendAssistantText(text: string): void {
        this.hideLoading();

        if (!this.currentMarkdown) {
            this.currentAssistantEl = this.getOrCreateAssistantEl();
            const textEl = this.currentAssistantEl.createDiv({ cls: 'pi-chat-msg-assistant-text' });
            this.currentMarkdown = new MarkdownMsg(this.app, textEl, this);
        }

        this.currentMarkdown.append(text);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    // ── 加载动画 ──────────────────────────────
    private showLoading(): void {
        this.hideLoading();
        this.loadingEl = this.messagesEl.createDiv({ cls: 'pi-chat-loading' });
        for (let i = 0; i < 3; i++) {
            this.loadingEl.createEl('span', { cls: 'pi-chat-loading-dot' });
        }
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    private hideLoading(): void {
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
    private handlePiEvent(event: any): void {
        switch (event.type) {
            case 'message_update': {
                const delta = event.assistantMessageEvent;
                if (delta.type === 'text_delta') {
                    this.appendAssistantText(delta.delta);
                }
                if (delta.type === 'toolcall_start' && this.loadingEl) {
                    this.hideLoading();
                }
                // ── 思考链内容 ──
                if (delta.type === 'thinking_start') {
                    this.hideLoading();
                    this.currentMarkdown = null;  // 后续文字另起 textEl
                    this.currentAssistantEl = this.getOrCreateAssistantEl();
                    this.thinkingBlock = new ThinkingBlock(this.currentAssistantEl);
                }
                if (delta.type === 'thinking_delta' && this.thinkingBlock) {
                    this.thinkingBlock.append(delta.delta);
                    this.thinkingBlock.expand();
                    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
                }
                if (delta.type === 'thinking_end' && this.thinkingBlock) {
                    this.thinkingBlock.finish();
                    this.thinkingBlock = null;
                }
                // 文本块开始（确保 text 容器已初始化）
                if (delta.type === 'text_start') {
                    if (!this.currentMarkdown) {
                        this.currentAssistantEl = this.getOrCreateAssistantEl();
                        const textEl = this.currentAssistantEl.createDiv({ cls: 'pi-chat-msg-assistant-text' });
                        this.currentMarkdown = new MarkdownMsg(this.app, textEl, this);
                    }
                }
                break;
            }
            case 'tool_execution_start': {
                this.hideLoading();
                this.currentMarkdown = null;
                this.currentAssistantEl = this.getOrCreateAssistantEl();
                const toolEl = this.currentAssistantEl.createDiv({ cls: 'pi-chat-tool-wrapper' });
                const card = new ToolCallMsg(toolEl, event.toolName, event.args);
                this.toolCalls.set(event.toolCallId, card);
                this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
                break;
            }
            case 'tool_execution_update': {
                const card = this.toolCalls.get(event.toolCallId);
                if (card) {
                    const text = this.extractTextFromContent(event.partialResult?.content);
                    if (text) card.setOutput(text);
                    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
                }
                break;
            }
            case 'tool_execution_end': {
                const card = this.toolCalls.get(event.toolCallId);
                if (card) {
                    card.setResult(event.result, event.isError);
                    this.toolCalls.delete(event.toolCallId);
                    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
                }
                break;
            }
            case 'agent_start': {
                this.isAgentActive = true;
                if (!this.loadingEl) {
                    this.showLoading();
                }
                break;
            }
            case 'agent_end': {
                this.isAgentActive = false;
                this.currentMarkdown = null;
                this.currentAssistantEl = null;
                this.thinkingBlock = null;
                this.toolCalls.clear();
                // 更新底部 Token 用量
                this.inputStatusBar.updateContextUsage();
                break;
            }
            case 'extension_error':
            case 'error': {
                this.hideLoading();
                this.currentMarkdown = null;
                this.currentAssistantEl = null;
                this.thinkingBlock = null;
                this.toolCalls.clear();
                new Notice('Pi 返回了错误');
                break;
            }
            case 'queue_update': {
                // 插件侧无需主动处理排队状态
                break;
            }
            case 'compaction_start': {
                this.isCompacting = true;
                const reasonMap: Record<string, string> = {
                    manual: '手动', threshold: '阈值', overflow: '溢出',
                };
                const reasonText = reasonMap[event.reason] || event.reason || '';
                this.addSystemMessage('compress', '正在压缩会话…', (el) => {
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
                        this.addSystemMessage('x-circle', '压缩已取消', (el) => {
                            el.setText('会话压缩被中止');
                        });
                    } else if (event.errorMessage) {
                        this.addSystemMessage('alert-circle', '压缩失败', (el) => {
                            el.setText(`压缩失败: ${event.errorMessage}`);
                        });
                    } else if (event.result) {
                        const saved = event.result.tokensBefore ?? 0;
                        this.addSystemMessage('check-circle', '压缩完成', (el) => {
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
        }
    }

    // ── 获取或创建助手消息气泡 ────────────────
    private getOrCreateAssistantEl(): HTMLElement {
        if (this.currentAssistantEl && this.messagesEl.contains(this.currentAssistantEl)) {
            return this.currentAssistantEl;
        }
        const last = this.messagesEl.querySelector('.pi-chat-msg-assistant:last-child') as HTMLElement | null;
        if (last) {
            this.currentAssistantEl = last;
            return last;
        }
        const el = this.messagesEl.createDiv({ cls: 'pi-chat-msg-assistant' });
        this.currentAssistantEl = el;
        return el;
    }

    // ── 从 Pi 加载可用命令列表 ────────────────
    private async loadCommands(): Promise<void> {
        try {
            const resp = await this.piClient.sendAndWait({ type: 'get_commands' });
            if (resp?.success && resp.data?.commands) {
                const builtins = [
                    { name: 'new', description: '新建会话', source: 'extension' as const },
                    { name: 'reload', description: '重新加载扩展', source: 'extension' as const },
                    { name: 'history', description: '历史会话', source: 'extension' as const },
                    { name: 'compact', description: '压缩会话上下文', source: 'extension' as const },
                    { name: 'stats', description: '查看 Token 用量统计', source: 'extension' as const },
                ];
                const cmds: any[] = resp.data.commands;
                const allCmds = [...builtins, ...cmds];
                this.commandMenu.setCommands(allCmds);
                // 保存命令名（不含 builtins）用于 reload 对比
                this.previousCmdNames = new Set(cmds.map((c: any) => c.name));
                this.previousCmdList = cmds.map((c: any) => ({ name: c.name, source: c.source || 'other' }));
                this.lastRawCommands = cmds;
            }
        } catch { /* pi 还未就绪，忽略 */ }
    }

    // ── 处理 /new ──────────────────────────────
    private async handleNewSession(): Promise<void> {
        this.clearLoadingTimeout();
        this.hideLoading();
        this.commandMenu.hide();
        this.textarea.value = '';
        try {
            const resp = await this.piClient.sendAndWait({ type: 'new_session' });
            if (resp?.success) {
                this.messagesEl.empty();
                this.currentMarkdown = null;
                this.currentAssistantEl = null;
                this.thinkingBlock = null;
                this.toolCalls.clear();
                this.welcomePage = new WelcomePage(this.messagesEl, this.app, this.piClient);
                this.welcomePage.loadData(this.buildExtensionInfo());
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
        this.clearLoadingTimeout();
        this.commandMenu.hide();
        this.piClient.send({ type: 'abort' });
        this.hideLoading();
        this.isAgentActive = false;
        this.currentMarkdown = null;
        this.currentAssistantEl = null;
        this.thinkingBlock = null;
        this.toolCalls.clear();
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
        try {
            const resp = await this.piClient.getSessionStats();
            if (!resp?.success || !resp?.data) {
                new Notice('获取统计失败');
                return;
            }
            const d = resp.data;
            const tokens = d.tokens || {};
            const cost = d.cost;
            const ctx = d.contextUsage;

            const lines: string[] = [];
            lines.push(`消息: ${d.totalMessages} 条（用户 ${d.userMessages} / 助手 ${d.assistantMessages}）`);
            if (d.toolCalls) lines.push(`工具调用: ${d.toolCalls} 次`);
            lines.push('');
            lines.push(`输入 Token: ${(tokens.input ?? 0).toLocaleString()}`);
            lines.push(`输出 Token: ${(tokens.output ?? 0).toLocaleString()}`);
            if (tokens.cacheRead) lines.push(`缓存读取: ${tokens.cacheRead.toLocaleString()}`);
            if (tokens.cacheWrite) lines.push(`缓存写入: ${tokens.cacheWrite.toLocaleString()}`);
            lines.push(`总计 Token: ${(tokens.total ?? 0).toLocaleString()}`);
            if (cost != null) lines.push(`费用: $${cost.toFixed(4)}`);
            if (ctx) {
                const pct = ctx.percent != null ? `${ctx.percent}%` : '—';
                lines.push('');
                lines.push(`上下文: ${(ctx.tokens ?? 0).toLocaleString()} / ${ctx.contextWindow.toLocaleString()} (${pct})`);
            }

            this.addSystemMessage('bar-chart', '会话统计', (el) => {
                el.setText(lines.join('\n'));
            });
        } catch {
            new Notice('获取统计失败');
        }
    }



    // ── 添加系统通知消息 ──────────────────────
    private addSystemMessage(icon: string, title: string, bodyFn: (el: HTMLElement) => void): void {
        if (this.welcomePage) {
            this.welcomePage.remove();
            this.welcomePage = null as any;
        }
        const msgEl = this.messagesEl.createDiv({ cls: 'pi-msg-system' });
        // 头部（和思考块头部样式一致）
        const header = msgEl.createDiv({ cls: 'pi-msg-system-header' });
        const iconEl = header.createSpan({ cls: 'pi-msg-system-icon' });
        setIcon(iconEl, icon);
        header.createSpan({ cls: 'pi-msg-system-title', text: title });
        // 主体（和思考块主体样式一致）
        const body = msgEl.createDiv({ cls: 'pi-msg-system-body' });
        bodyFn(body);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    // ── 处理 /reload ──────────────────────────
    private async handleReload(): Promise<void> {
        // ── 互斥锁：reload 进行中时禁止重复触发 ──
        if (this.isReloading) {
            new Notice('Pi 正在重载中，请稍候…');
            return;
        }
        this.isReloading = true;
        this.commandMenu.hide();
        this.textarea.value = '';
        try {
            // ── 在进入 async 流程前就锁定对比基准（局部常量，不受后续副作用影响） ──
            const oldNames = this.previousCmdNames.size > 0
                ? new Set(this.previousCmdNames)
                : await this.fetchCurrentCmdNames();
            const oldCmdList = this.previousCmdList;

            new Notice('正在重载 Pi…');
            await this.piClient.restart();

            // 持续轮询直到 get_commands 成功（最长等 10 秒，每 800ms 一次）
            // 期间 isReloading = true，用户无法重复触发
            let cmds: any[] | null = null;
            for (let attempt = 0; attempt < 12; attempt++) {
                if (attempt > 0) {
                    await new Promise(r => setTimeout(r, 800));
                }
                const resp = await this.piClient.sendAndWait({ type: 'get_commands' });
                if (resp?.success && resp.data?.commands) {
                    cmds = resp.data.commands;
                    break;
                }
            }
            if (cmds) {
                this.handleReloadSuccess(cmds, oldNames, oldCmdList);
            } else {
                new Notice('Pi 重载超时，请重试');
            }
        } catch {
            new Notice('重载失败');
        } finally {
            this.isReloading = false;
        }
    }

    // ── /reload 成功：渲染命令列表 + 对比新增/移除 ──
    private handleReloadSuccess(
        cmds: any[],
        oldNames: Set<string>,
        oldCmdList: { name: string; source: string }[],
    ): void {
        this.commandMenu.setCommands([
            { name: 'new', description: '新建会话', source: 'extension' as const },
            { name: 'reload', description: '重新加载扩展', source: 'extension' as const },
            { name: 'history', description: '历史会话', source: 'extension' as const },
            { name: 'compact', description: '压缩会话上下文', source: 'extension' as const },
            { name: 'stats', description: '查看 Token 用量统计', source: 'extension' as const },
            ...cmds,
        ]);

        // 扩展发现（磁盘扫描 + commands 交叉引用）
        const extInfo = this.buildExtensionInfo();

        // 按 source 分组（排除 extension，扩展用磁盘扫描结果展示）
        const groups = new Map<string, { name: string; source: string }[]>();
        for (const c of cmds) {
            const src = c.source || 'other';
            if (src === 'extension') continue;
            if (!groups.has(src)) groups.set(src, []);
            groups.get(src)!.push({ name: c.name, source: src });
        }
        const newNames = new Set(cmds.map((c: any) => c.name));
        const removedNames = new Set<string>();
        for (const old of oldNames) {
            if (!newNames.has(old)) {
                removedNames.add(old);
            }
        }
        const labels: Record<string, string> = {
            extension: '扩展', skill: '技能', prompt: '模板',
            model: '模型', tool: '工具', other: '其他',
        };
        const order = ['extension', 'skill', 'prompt', 'tool', 'model'];
        this.addSystemMessage('refresh-cw', 'Pi 已重载', (el) => {
            // ── 扩展：用磁盘扫描结果展示（含无命令的扩展） ──
            if (extInfo.length > 0) {
                const extSection = el.createDiv({ cls: 'pi-reload-section' });
                extSection.createSpan({ cls: 'pi-reload-label', text: '扩展' });
                extSection.createSpan({ cls: 'pi-reload-count', text: String(extInfo.length) });
                const itemsWrap = el.createDiv({ cls: 'pi-reload-items' });
                for (const e of extInfo) {
                    const itemEl = itemsWrap.createSpan({ cls: 'pi-reload-item' });
                    itemEl.setText(e.name);
                    if (!e.confirmed) {
                        itemEl.addClass('pi-reload-item-unconfirmed');
                    }
                }
            }

            // ── 其他分组（prompts、skills 等） ──
            for (const key of order) {
                if (key === 'extension') continue;
                const items = groups.get(key);
                if (!items || items.length === 0) continue;
                this.renderReloadGroup(el, labels[key] || key, items, oldNames, removedNames);
                groups.delete(key);
            }
            for (const [key, items] of groups.entries()) {
                if (items.length === 0) continue;
                this.renderReloadGroup(el, labels[key] || key, items, oldNames, removedNames);
            }
            if (removedNames.size > 0) {
                const section = el.createDiv({ cls: 'pi-reload-section pi-reload-section-removed' });
                section.createSpan({ cls: 'pi-reload-label', text: '已移除' });
                section.createSpan({ cls: 'pi-reload-count', text: String(removedNames.size) });
                const itemsWrap = el.createDiv({ cls: 'pi-reload-items' });
                for (const n of removedNames) {
                    const itemEl = itemsWrap.createSpan({ cls: 'pi-reload-item pi-reload-item-removed' });
                    itemEl.setText(n);
                }
            }
            if (removedNames.size === 0 && ![...newNames].some(n => !oldNames.has(n))) {
                const note = el.createDiv({ cls: 'pi-reload-note' });
                note.setText('无变化');
            }
        });
        // 保存新数据供下次对比
        this.previousCmdNames = new Set(cmds.map((c: any) => c.name));
        this.previousCmdList = cmds.map((c: any) => ({ name: c.name, source: c.source || 'other' }));
        this.lastRawCommands = cmds;
    }

    // ── /reload 失败回退：显示缓存数据 ──
    private handleReloadFallback(
        oldCmdList: { name: string; source: string }[],
        oldNames: Set<string>,
    ): void {
        // 用局部变量展示缓存数据，不修改 this.previousCmdNames / this.previousCmdList
        if (oldCmdList.length > 0) {
            this.addSystemMessage('refresh-cw', 'Pi 已重载（命令列表未更新）', (el) => {
                this.renderReloadFromCache(el, oldCmdList, oldNames);
            });
        } else {
            this.addSystemMessage('refresh-cw', 'Pi 已重载', (el) => {
                el.createDiv({ cls: 'pi-reload-note', text: '未能获取命令列表，请检查 pi 是否正常运行' });
            });
        }
    }

    // ── 从当前 pi 进程获取命令列表作为对比基准 ──
    private async fetchCurrentCmdNames(): Promise<Set<string>> {
        try {
            const resp = await this.piClient.sendAndWait({ type: 'get_commands' });
            if (resp?.success && resp.data?.commands) {
                const cmds: any[] = resp.data.commands;
                return new Set(cmds.map((c: any) => c.name));
            }
        } catch { }
        return new Set<string>();
    }

    // ── 用缓存数据渲染 reload 消息（get_commands 失败时回退） ──
    private renderReloadFromCache(
        el: HTMLElement,
        cmds: { name: string; source: string }[],
        oldNames: Set<string>,
    ): void {
        const groups = new Map<string, { name: string; source: string }[]>();
        for (const c of cmds) {
            if (!groups.has(c.source)) groups.set(c.source, []);
            groups.get(c.source)!.push(c);
        }
        const labels: Record<string, string> = {
            extension: '扩展', skill: '技能', prompt: '模板',
            model: '模型', tool: '工具', other: '其他',
        };
        const order = ['extension', 'skill', 'prompt', 'tool', 'model'];
        const emptyRemoved = new Set<string>();
        for (const key of order) {
            const items = groups.get(key);
            if (!items || items.length === 0) continue;
            this.renderReloadGroup(el, labels[key] || key, items, oldNames, emptyRemoved);
            groups.delete(key);
        }
        for (const [key, items] of groups.entries()) {
            if (items.length === 0) continue;
            this.renderReloadGroup(el, labels[key] || key, items, oldNames, emptyRemoved);
        }
        const note = el.createDiv({ cls: 'pi-reload-note' });
        note.setText('↑ 命令列表未刷新，显示上次加载的内容');
    }

    // ── 渲染 reload 分组 ──────────────────────
    private renderReloadGroup(
        el: HTMLElement,
        label: string,
        items: { name: string; source: string }[],
        oldNames: Set<string>,
        removedNames: Set<string>,
    ): void {
        const section = el.createDiv({ cls: 'pi-reload-section' });
        section.createSpan({ cls: 'pi-reload-label', text: label });
        section.createSpan({ cls: 'pi-reload-count', text: String(items.length) });
        const itemsWrap = el.createDiv({ cls: 'pi-reload-items' });
        for (const item of items) {
            const isNew = !oldNames.has(item.name);
            const isRemoved = removedNames.has(item.name);
            const itemEl = itemsWrap.createSpan({ cls: 'pi-reload-item' });
            itemEl.setText(item.name);
            if (isNew) {
                itemEl.addClass('pi-reload-item-new');
                removedNames.delete(item.name);
            }
            if (isRemoved) {
                itemEl.addClass('pi-reload-item-removed');
            }
        }
    }

    // ── 从 content 数组中提取纯文本 ────────────
    private extractTextFromContent(content: any): string {
        if (!Array.isArray(content)) return '';
        return content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text || '')
            .join('\n');
    }

    // ── 构建扩展扫描目录列表 ──
    // 匹配 pi 的扩展搜索目录：全局 ~/.pi/agent/extensions + 项目 .pi/extensions + 配置路径
    private buildScanDirs(): string[] {
        const dirs: string[] = [
            path.join(os.homedir(), '.pi', 'agent', 'extensions'),   // 全局
            path.join(this.vaultPath, '.pi', 'extensions'),           // 项目默认
        ];
        const extra = this.settings.extensionPaths;
        if (extra) {
            for (const p of extra.split(',')) {
                const trimmed = p.trim();
                if (trimmed) dirs.push(path.resolve(this.vaultPath, trimmed));
            }
        }
        return dirs;
    }

    // ── 发现扩展（磁盘扫描 + get_commands 交叉验证） ──
    private buildExtensionInfo(): ExtensionInfo[] {
        return discoverExtensions(this.lastRawCommands, this.buildScanDirs());
    }
}
