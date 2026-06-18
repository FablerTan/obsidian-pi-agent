// 导入 Obsidian 的 ItemView 基类
// ItemView: 可以在 Obsidian 工作区中创建自定义面板
// WorkspaceLeaf: 每个视图都挂在一个"叶子"上
import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import { PiRpcClient } from '../pi/rpc-client';
import { HistoryPanel } from './HistoryPanel';

// 视图的唯一标识符，用来注册和查找这个视图
export const PI_CHAT_VIEW_TYPE = 'pi-chat-view';

export class PiChatView extends ItemView {
    // 消息列表容器
    messagesEl!: HTMLDivElement;

    // 欢迎文字元素（首次对话前显示，发消息后移除）
    private welcomeEl!: HTMLParagraphElement;

    // 加载动画元素（发送消息后、收到回复前显示）
    private loadingEl: HTMLDivElement | null = null;

    // 历史会话管理器
    private historyPanel!: HistoryPanel;

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
        this.welcomeEl = messagesEl.createEl('p', {
            text: '开始和 Pi 对话吧！',
            cls: 'pi-chat-welcome',
        });

        // 历史会话按钮（输入框上方靠右）
        this.historyPanel = new HistoryPanel(this.piClient, messagesEl, contentEl, this.app);
        const historyBar = container.createDiv({ cls: 'pi-chat-history-bar' });
        const historyIcon = historyBar.createEl('span', { cls: 'pi-chat-history-btn' });
        setIcon(historyIcon, 'history');
        historyIcon.addEventListener('click', () => {
            this.historyPanel.open();
        });

        // 输入框
        const textarea = container.createEl('textarea', {
            cls: 'pi-chat-input',
            placeholder: '输入消息... (Enter 发送, Shift+Enter 换行)',
        });

        // Enter 发送，Shift+Enter 换行
        textarea.addEventListener('keydown', (e) => {
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

        this.messagesEl = messagesEl;
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

    // ── 追加助手回复 ──────────────────────────
    appendAssistantText(text: string): void {
        this.hideLoading();

        let lastMsg = this.messagesEl.querySelector(
            '.pi-chat-msg-assistant:last-child',
        ) as HTMLDivElement | null;
        if (!lastMsg) {
            lastMsg = this.messagesEl.createDiv({ cls: 'pi-chat-msg-assistant' });
        }
        lastMsg.setText((lastMsg.textContent || '') + text);
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
                break;
            }
            case 'agent_end': {
                console.log('pi 回复完成');
                break;
            }
            case 'extension_error':
            case 'error': {
                this.hideLoading();
                new Notice('Pi 返回了错误');
                break;
            }
        }
    }
}
