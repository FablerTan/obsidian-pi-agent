// 聊天面板核心视图
// 负责：面板生命周期、消息流（用户输入 + AI 回复）、加载动画、命令菜单、历史面板
import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import { PiRpcClient } from '../pi/rpc-client';
import { HistoryPanel } from './HistoryPanel';
import { MarkdownMsg } from './MarkdownMsg';
import { ToolCallMsg } from './ToolCallMsg';
import { CommandMenu } from './CommandMenu';
import { InputStatusBar } from './InputStatusBar';
import { NoteBar } from './NoteBar';
import { WelcomePage } from './WelcomePage';
import { ThinkingBlock } from './ThinkingBlock';

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

    // RPC 客户端
    private piClient: PiRpcClient;

    constructor(leaf: WorkspaceLeaf, piClient: PiRpcClient) {
        super(leaf);
        this.piClient = piClient;

        // 注册事件回调：pi 返回的事件都到这里
        this.piClient.onEvent = (event) => {
            this.handlePiEvent(event);
        };
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
        this.welcomePage.loadData();

        // 历史会话管理器（通过 /history 命令触发）
        this.historyPanel = new HistoryPanel(this.piClient, messagesEl, contentEl, this.app);

        // ── 输入区域（自动撑到最底部） ──
        const inputArea = container.createDiv({ cls: 'pi-chat-input-area' });

        // ── 命令菜单容器 ──
        const menuContainer = inputArea.createDiv({ cls: 'pi-command-menu' });

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
            } else {
                textarea.value = '/' + cmd.name + ' ';
                textarea.focus();
            }
        });

        // 输入变化时检测 / 命令
        textarea.addEventListener('input', () => {
            const val = textarea.value;
            if (val.startsWith('/') && !val.includes(' ')) {
                const query = val.slice(1);
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
            if (e.key === 'Escape' && (this.loadingEl || this.currentMarkdown || this.thinkingBlock || this.toolCalls.size > 0)) {
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

        // ── 底部状态栏（模型 + 思考层级） ──
        this.inputStatusBar = new InputStatusBar(inputArea, this.piClient);

        this.messagesEl = messagesEl;

        // 预加载命令列表
        this.loadCommands();
    }

    async onClose(): Promise<void> {
        this.piClient.onEvent = null;
        this.noteBar?.destroy();
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
            case 'agent_end': {
                this.currentMarkdown = null;
                this.currentAssistantEl = null;
                this.thinkingBlock = null;
                this.toolCalls.clear();
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
                ];
                const allCmds = [...builtins, ...resp.data.commands];
                this.commandMenu.setCommands(allCmds);
                // 保存命令名用于 reload 对比
                this.previousCmdNames = new Set(allCmds.map((c: any) => c.name));
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
                this.welcomePage.loadData();
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
        this.currentMarkdown = null;
        this.currentAssistantEl = null;
        this.thinkingBlock = null;
        this.toolCalls.clear();
        new Notice('已打断');
    }

    // ── 处理 /history ──────────────────────────
    private handleHistory(): void {
        this.commandMenu.hide();
        this.textarea.value = '';
        this.historyPanel.open();
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
        this.commandMenu.hide();
        this.textarea.value = '';
        try {
            new Notice('正在重载 Pi…');
            await this.piClient.restart();
            // 获取重载后的命令列表
            const resp = await this.piClient.sendAndWait({ type: 'get_commands' });
            if (resp?.success && resp.data?.commands) {
                const cmds: any[] = resp.data.commands;
                this.commandMenu.setCommands([
                    { name: 'new', description: '新建会话', source: 'extension' as const },
                    { name: 'reload', description: '重新加载扩展', source: 'extension' as const },
                    { name: 'history', description: '历史会话', source: 'extension' as const },
                    ...cmds,
                ]);
                // 分组统计
                const groups = new Map<string, string[]>();
                for (const c of cmds) {
                    const src = c.source || 'other';
                    if (!groups.has(src)) groups.set(src, []);
                    groups.get(src)!.push(c.name);
                }
                // 构建通知消息（DOM API，图标用 setIcon）
                this.addSystemMessage('refresh-cw', 'Pi 已重载', (el) => {
                    const order = ['extension', 'skill', 'prompt'];
                    const labels: Record<string, string> = { extension: '扩展', skill: '技能', prompt: '模板' };
                    for (const key of order) {
                        const items = groups.get(key);
                        if (items && items.length > 0) {
                            const section = el.createDiv({ cls: 'pi-reload-section' });
                            section.createSpan({ cls: 'pi-reload-label', text: labels[key] || key });
                            section.createSpan({ cls: 'pi-reload-count', text: String(items.length) });
                            const itemsWrap = el.createDiv({ cls: 'pi-reload-items' });
                            for (const n of items) {
                                const isNew = !this.previousCmdNames.has(n);
                                const isRemoved = false; // 在同组内无法判断移除，后面整体比对
                                const itemEl = itemsWrap.createSpan({ cls: 'pi-reload-item' });
                                itemEl.setText(n);
                                if (isNew) itemEl.addClass('pi-reload-item-new');
                            }
                        }
                        groups.delete(key);
                    }
                    // 检查被移除的命令
                    const newNames = new Set(cmds.map((c: any) => c.name));
                    const removed: string[] = [];
                    for (const old of this.previousCmdNames) {
                        if (!newNames.has(old) && old !== 'new' && old !== 'reload' && old !== 'history') {
                            removed.push(old);
                        }
                    }
                    if (removed.length > 0) {
                        const section = el.createDiv({ cls: 'pi-reload-section' });
                        section.createSpan({ cls: 'pi-reload-label', text: '已移除' });
                        section.createSpan({ cls: 'pi-reload-count', text: String(removed.length) });
                        const itemsWrap = el.createDiv({ cls: 'pi-reload-items' });
                        for (const n of removed) {
                            const itemEl = itemsWrap.createSpan({ cls: 'pi-reload-item pi-reload-item-removed' });
                            itemEl.setText(n);
                        }
                    }
                });
                // 保存新命令名供下次对比
                this.previousCmdNames = new Set(cmds.map((c: any) => c.name));
            } else {
                this.addSystemMessage('refresh-cw', 'Pi 已重载', () => {});
                this.loadCommands();
                this.previousCmdNames = new Set();
            }
        } catch {
            new Notice('重载失败');
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
}
