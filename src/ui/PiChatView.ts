// 导入 Obsidian 的 ItemView 基类
// ItemView: 可以在 Obsidian 工作区中创建自定义面板
// WorkspaceLeaf: 每个视图都挂在一个"叶子"上
import { ItemView, WorkspaceLeaf, Notice, setIcon, FileSystemAdapter } from 'obsidian';
import { PiRpcClient } from '../pi/rpc-client';
import { HistoryPanel } from './HistoryPanel';
import { MarkdownMsg } from './MarkdownMsg';
import { ToolCallMsg } from './ToolCallMsg';
import { CommandMenu } from './CommandMenu';
import { InputStatusBar } from './InputStatusBar';
import * as fs from 'fs';
import * as path from 'path';

// 视图的唯一标识符，用来注册和查找这个视图
export const PI_CHAT_VIEW_TYPE = 'pi-chat-view';

export class PiChatView extends ItemView {
    // 消息列表容器
    messagesEl!: HTMLDivElement;

    // 欢迎页元素（首次对话前显示，发消息后移除）
    private welcomeEl!: HTMLElement;

    // 加载动画元素（发送消息后、收到回复前显示）
    private loadingEl: HTMLDivElement | null = null;

    // 当前正在流式输出的 markdown 消息（没有时为空）
    private currentMarkdown: MarkdownMsg | null = null;

    // 当前助手消息的容器 DOM 元素（文字 + 工具卡片都在这个容器里）
    private currentAssistantEl: HTMLElement | null = null;

    // 追踪正在执行的工具调用（toolCallId -> ToolCallMsg）
    private toolCalls: Map<string, ToolCallMsg> = new Map();

    // 历史会话管理器
    private historyPanel!: HistoryPanel;

    // 命令菜单（输入 / 时弹出）
    private commandMenu!: CommandMenu;

    // 底部状态栏（模型 + 思考层级）
    private inputStatusBar!: InputStatusBar;

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

    getViewType(): string {
        return PI_CHAT_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Pi Chat';
    }

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
        this.welcomeEl = this.createWelcomeEl(messagesEl);
        this.loadWelcomeData();

        // 历史会话按钮（输入框上方靠右）
        this.historyPanel = new HistoryPanel(this.piClient, messagesEl, contentEl, this.app);
        const historyBar = container.createDiv({ cls: 'pi-chat-history-bar' });
        const historyIcon = historyBar.createEl('span', { cls: 'pi-chat-history-btn' });
        setIcon(historyIcon, 'history');
        historyIcon.addEventListener('click', () => {
            this.historyPanel.open();
        });

        // ── 命令菜单容器（在 DOM 中位于输入框正上方，靠文档流排列） ──
        const menuContainer = container.createDiv({ cls: 'pi-command-menu' });

        // 输入框
        const textarea = container.createEl('textarea', {
            cls: 'pi-chat-input',
            placeholder: '输入消息... (Enter 发送, Shift+Enter 换行)',
        });

        // ── 命令菜单（输入 / 时弹出） ──
        this.commandMenu = new CommandMenu(menuContainer, textarea, (cmd) => {
            if (cmd.name === 'new') {
                this.handleNewSession();
            } else if (cmd.name === 'reload') {
                this.handleReload();
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

        // Enter 发送，Shift+Enter 换行
        textarea.addEventListener('keydown', (e) => {
            // 如果命令菜单开着，优先让菜单处理键盘事件
            if (this.commandMenu.isVisible()) {
                const handled = this.commandMenu.handleKeydown(e);
                if (handled) return;
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                const msg = textarea.value.trim();
                if (!msg) return;

                this.addUserMessage(msg);
                textarea.value = '';
                this.showLoading();
                this.piClient.prompt(msg);

                // 5 秒超时保护
                setTimeout(() => {
                    if (this.loadingEl) {
                        this.hideLoading();
                        new Notice('Pi 没有响应，请检查 pi 是否正常运行');
                    }
                }, 5000);
            }
        });

        // ── 底部状态栏（模型 + 思考层级） ──
        this.inputStatusBar = new InputStatusBar(container, this.piClient);

        this.messagesEl = messagesEl;

        // 预加载命令列表（首次 / 时不用等待）
        this.loadCommands();
    }

    async onClose(): Promise<void> {
        this.piClient.onEvent = null;
    }

    // ── 添加用户消息 ──────────────────────────
    addUserMessage(text: string): void {
        if (this.welcomeEl) {
            this.welcomeEl.remove();
            this.welcomeEl = null as any;
        }
        const msgEl = this.messagesEl.createDiv({ cls: 'pi-chat-msg-user' });
        msgEl.setText(text);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    // ── 追加助手回复（Markdown 渲染） ──────────
    appendAssistantText(text: string): void {
        this.hideLoading();

        if (!this.currentMarkdown) {
            // 获取或创建助手消息气泡
            this.currentAssistantEl = this.getOrCreateAssistantEl();
            // MarkdownMsg 只操作文字子容器，不影响同级的工具卡片
            const textEl = this.currentAssistantEl.createDiv({ cls: 'pi-chat-msg-assistant-text' });
            this.currentMarkdown = new MarkdownMsg(this.app, textEl, this);
        }

        // 追加文字并渲染
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

    // ── 处理 pi 事件 ──────────────────────────
    private handlePiEvent(event: any): void {
        switch (event.type) {
            case 'message_update': {
                const delta = event.assistantMessageEvent;
                if (delta.type === 'text_delta') {
                    this.appendAssistantText(delta.delta);
                }
                // 模型开始使用工具（无文字回复时），隐藏加载动画
                if (delta.type === 'toolcall_start' && this.loadingEl) {
                    this.hideLoading();
                }
                break;
            }
            // ── 工具开始执行 ──
            case 'tool_execution_start': {
                this.hideLoading();
                // 关闭当前 MarkdownMsg，后续文字会创建新的 textEl 排在工具卡片后面
                this.currentMarkdown = null;
                // 工具卡片放进同一个助手气泡（和文字在一起）
                this.currentAssistantEl = this.getOrCreateAssistantEl();
                const toolEl = this.currentAssistantEl.createDiv({ cls: 'pi-chat-tool-wrapper' });
                const card = new ToolCallMsg(toolEl, event.toolName, event.args);
                this.toolCalls.set(event.toolCallId, card);
                this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
                break;
            }
            // ── 工具执行进度（流式输出） ──
            case 'tool_execution_update': {
                const card = this.toolCalls.get(event.toolCallId);
                if (card) {
                    const text = this.extractTextFromContent(event.partialResult?.content);
                    if (text) {
                        card.setOutput(text);
                    }
                    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
                }
                break;
            }
            // ── 工具执行完成 ──
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
                // 回复完成，重置所有状态
                this.currentMarkdown = null;
                this.currentAssistantEl = null;
                this.toolCalls.clear();
                break;
            }
            case 'extension_error':
            case 'error': {
                this.hideLoading();
                this.currentMarkdown = null;
                this.currentAssistantEl = null;
                this.toolCalls.clear();
                new Notice('Pi 返回了错误');
                break;
            }
        }
    }

    // ── 获取或创建助手消息气泡 ────────────────
    // 找消息列表中最后一个 .pi-chat-msg-assistant，
    // 如果当前 agent run 还没有气泡则新建一个
    private getOrCreateAssistantEl(): HTMLElement {
        // 优先用缓存的
        if (this.currentAssistantEl && this.messagesEl.contains(this.currentAssistantEl)) {
            return this.currentAssistantEl;
        }
        // 找消息列表最后一个助手气泡
        const last = this.messagesEl.querySelector('.pi-chat-msg-assistant:last-child') as HTMLElement | null;
        if (last) {
            this.currentAssistantEl = last;
            return last;
        }
        // 一个都没有，新建
        const el = this.messagesEl.createDiv({ cls: 'pi-chat-msg-assistant' });
        this.currentAssistantEl = el;
        return el;
    }

    // ── 从 Pi 加载可用命令列表 ────────────────
    private async loadCommands(): Promise<void> {
        try {
            const resp = await this.piClient.sendAndWait({ type: 'get_commands' });
            if (resp?.success && resp.data?.commands) {
                // 在前面加上内置命令（不走 text prompt，直接发 RPC）
                const builtins = [
                    { name: 'new', description: '新建会话', source: 'extension' as const },
                    { name: 'reload', description: '重新加载扩展', source: 'extension' as const },
                ];
                this.commandMenu.setCommands([...builtins, ...resp.data.commands]);
            }
        } catch {
            // pi 还未就绪，忽略
        }
    }

    // ── 处理 /new ──────────────────────────────
    private async handleNewSession(): Promise<void> {
        this.commandMenu.hide();
        try {
            const resp = await this.piClient.sendAndWait({ type: 'new_session' });
            if (resp?.success) {
                // 清空消息列表
                this.messagesEl.empty();
                this.currentMarkdown = null;
                this.currentAssistantEl = null;
                this.toolCalls.clear();
                // 重新显示欢迎页并加载数据
                this.welcomeEl = this.createWelcomeEl(this.messagesEl);
                this.loadWelcomeData();
                new Notice('已创建新会话');
            } else {
                new Notice('新建会话失败');
            }
        } catch {
            new Notice('新建会话失败');
        }
    }

    // ── 处理 /reload ──────────────────────────
    private async handleReload(): Promise<void> {
        this.commandMenu.hide();
        try {
            // 尝试通过 prompt 发送 reload 命令
            this.piClient.prompt('/reload');
            new Notice('正在重新加载…');
        } catch {
            new Notice('重新加载失败');
        }
    }

    // ── 创建欢迎页 ────────────────────────────
    private createWelcomeEl(parent: HTMLElement): HTMLElement {
        const el = parent.createDiv({ cls: 'pi-chat-welcome' });

        // 标题
        const title = el.createDiv({ cls: 'pi-welcome-title' });
        const logo = title.createSpan({ cls: 'pi-welcome-logo' });
        setIcon(logo, 'pi-logo');
        title.createSpan({ text: 'Pi Chat' });

        // 内容容器
        el.createDiv({ cls: 'pi-welcome-sections' });

        return el;
    }

    // ── 加载欢迎页数据 ──────────────────────────
    private async loadWelcomeData(): Promise<void> {
        const sectionsEl = this.welcomeEl?.querySelector('.pi-welcome-sections') as HTMLElement | null;
        if (!sectionsEl) return;

        // 并行获取上下文文件和命令列表
        const [contextFiles, cmdResp] = await Promise.all([
            this.readContextFiles(),
            this.piClient.sendAndWait({ type: 'get_commands' }).catch(() => null),
        ]);

        // ── Context ──
        if (contextFiles.length > 0) {
            this.addSectionList(sectionsEl, 'file-text', 'Context', contextFiles);
        }

        if (cmdResp?.success && cmdResp.data?.commands) {
            const cmds: any[] = cmdResp.data.commands;

            // 按 source 分组
            const groups = new Map<string, { items: string[] }>();
            for (const c of cmds) {
                const src = c.source || 'other';
                if (!groups.has(src)) groups.set(src, { items: [] });
                groups.get(src)!.items.push(c.name);
            }

            // 固定顺序 + 图标映射
            const order: Array<{ key: string; icon: string; label: string }> = [
                { key: 'extension', icon: 'puzzle', label: 'Extensions' },
                { key: 'prompt', icon: 'file-plus', label: 'Prompts' },
                { key: 'skill', icon: 'sparkles', label: 'Skills' },
            ];
            for (const { key, icon, label } of order) {
                const g = groups.get(key);
                if (g) {
                    this.addSectionList(sectionsEl, icon, label, g.items);
                    groups.delete(key);
                }
            }
            // 剩余未知类型
            for (const [key, g] of groups) {
                this.addSectionList(sectionsEl, 'terminal', key, g.items);
            }
        }
    }

    // ── 读取上下文文件 ──────────────────────────
    private async readContextFiles(): Promise<string[]> {
        try {
            const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
            const agentDir = path.join(vaultPath, '.pi', 'agent');
            const files = fs.readdirSync(agentDir);
            return files
                .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
                .sort();
        } catch {
            return [];
        }
    }

    // ── 添加带图标和标题的列表区块 ────────────
    private addSectionList(
        parent: Element, icon: string, title: string, items: string[],
    ): void {
        if (items.length === 0) return;

        const section = parent.createDiv({ cls: 'pi-welcome-section' });

        // 标题行（图标 + 标题）
        const titleRow = section.createDiv({ cls: 'pi-welcome-section-title' });
        const iconEl = titleRow.createSpan({ cls: 'pi-welcome-section-icon' });
        setIcon(iconEl, icon);
        titleRow.createSpan({ cls: 'pi-welcome-section-label', text: title });

        // 列表
        const list = section.createEl('ul', { cls: 'pi-welcome-list' });
        for (const item of items) {
            list.createEl('li', { cls: 'pi-welcome-list-item', text: item });
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
