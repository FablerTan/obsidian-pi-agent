// 导入 Obsidian 的 ItemView 基类
// ItemView: 可以在 Obsidian 工作区中创建自定义面板
// WorkspaceLeaf: 每个视图都挂在一个"叶子"上
import { ItemView, WorkspaceLeaf, Notice, setIcon, FileSystemAdapter } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PiRpcClient } from '../pi/rpc-client';

// 视图的唯一标识符，用来注册和查找这个视图
export const PI_CHAT_VIEW_TYPE = 'pi-chat-view';

export class PiChatView extends ItemView {
    // 消息列表容器
    messagesEl!: HTMLDivElement;

    // 欢迎文字元素（首次对话前显示，发消息后移除）
    private welcomeEl!: HTMLParagraphElement;

    // 加载动画元素（发送消息后、收到回复前显示）
    private loadingEl: HTMLDivElement | null = null;

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

    // Obsidian 用这个标识符来识别视图类型
    getViewType(): string {
        return PI_CHAT_VIEW_TYPE;
    }

    // 面板标题，显示在标签栏上
    getDisplayText(): string {
        return 'Pi Chat';
    }

    // 面板被打开时调用，在这里构建 UI
    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('pi-chat-wrapper');

        // ── 顶部横条：显示 pi 图标 + 标题 ────
        const header = contentEl.createDiv({ cls: 'pi-chat-header' });
        // 在左边放 pi 图标
        const iconEl = header.createSpan({ cls: 'pi-chat-header-icon' });
        setIcon(iconEl, 'pi-logo');
        // 图标右边显示标题
        header.createSpan({ cls: 'pi-chat-header-title', text: 'Pi' });

        // ── 整个内容区域（消息列表 + 输入框） ──
        const container = contentEl.createDiv({ cls: 'pi-chat-container' });

        // ── 消息列表区域（可滚动） ────────────
        const messagesEl = container.createDiv({ cls: 'pi-chat-messages' });
        this.welcomeEl = messagesEl.createEl('p', {
            text: '开始和 Pi 对话吧！',
            cls: 'pi-chat-welcome',
        });

        // ── 底部输入框 ────────────────────────
        // 历史图标放在输入框上方，靠右
        const historyBar = container.createDiv({ cls: 'pi-chat-history-bar' });
        const historyIcon = historyBar.createEl('span', {
            cls: 'pi-chat-history-btn',
        });
        setIcon(historyIcon, 'history');
        historyIcon.addEventListener('click', () => {
            this.openHistory();
        });

        const textarea = container.createEl('textarea', {
            cls: 'pi-chat-input',
            placeholder: '输入消息... (Enter 发送, Shift+Enter 换行)',
        });

        // Enter 发送消息给 pi，Shift+Enter 换行
        textarea.addEventListener('keydown', (e) => {
            // e.isComposing 为 true 表示正在输入法选词中
            // 此时按 Enter 应该是确认选词，而不是发送消息
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                const msg = textarea.value.trim();
                if (!msg) return;

                // 把用户消息显示在面板里
                this.addUserMessage(msg);

                // 清空输入框
                textarea.value = '';

                // 显示加载动画
                this.showLoading();

                // 发送给 pi
                this.piClient.prompt(msg);

                // 如果 pi 没响应，5 秒后移除加载动画
                setTimeout(() => {
                    // 如果加载动画还在（说明没收到任何回复）
                    if (this.loadingEl) {
                        this.hideLoading();
                        new Notice('Pi 没有响应，请检查 pi 是否正常运行');
                    }
                }, 5000);
            }
        });

        // 把元素存到字段上，方便其他地方引用
        this.messagesEl = messagesEl;
    }

    // ── 在消息列表里添加一条用户消息 ──────────
    addUserMessage(text: string): void {
        // 有欢迎文字就移除（首次发消息时）
        if (this.welcomeEl) {
            this.welcomeEl.remove();
            this.welcomeEl = null as any;
        }

        const msgEl = this.messagesEl.createDiv({ cls: 'pi-chat-msg-user' });
        msgEl.setText(text);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    // ── 显示加载动画 ──────────────────────────
    private showLoading(): void {
        // 先移除旧的加载动画（如果有）
        this.hideLoading();

        this.loadingEl = this.messagesEl.createDiv({ cls: 'pi-chat-loading' });

        // 三个跳动的小圆点
        for (let i = 0; i < 3; i++) {
            this.loadingEl.createEl('span', { cls: 'pi-chat-loading-dot' });
        }

        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    // ── 隐藏加载动画 ──────────────────────────
    private hideLoading(): void {
        if (this.loadingEl) {
            this.loadingEl.remove();
            this.loadingEl = null;
        }
    }

    // ── 追加一段 pi 的回复文字 ─────────────────
    // pi 的回复是一个字一个字流式到达的，所以要追加
    appendAssistantText(text: string): void {
        // 有加载动画就先移除它（第一次收到文字时）
        this.hideLoading();

        // 找最后一条 assistant 消息，没有就创建
        let lastMsg = this.messagesEl.querySelector('.pi-chat-msg-assistant:last-child') as HTMLDivElement | null;
        if (!lastMsg) {
            lastMsg = this.messagesEl.createDiv({ cls: 'pi-chat-msg-assistant' });
        }
        lastMsg.setText((lastMsg.textContent || '') + text);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    // ── 处理 pi 返回的事件 ──────────────────────
    private handlePiEvent(event: any): void {
        switch (event.type) {
            case 'message_update': {
                // pi 正在一个字一个字地输出回复
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

    // ── 打开历史会话列表（面板内浮层） ────────
    private async openHistory(): Promise<void> {
        // 如果浮层已打开就关掉
        const existing = this.contentEl.querySelector('.pi-history-panel');
        if (existing) {
            existing.remove();
            this.contentEl.querySelector('.pi-history-backdrop')?.remove();
            return;
        }

        // 读取会话列表
        const sessions = this.readSessions();

        // ── 半透明背景（点击关闭） ────────────
        const backdrop = this.contentEl.createDiv({ cls: 'pi-history-backdrop' });
        backdrop.addEventListener('click', () => {
            backdrop.remove();
            panel.remove();
        });

        // ── 底部浮层 ──────────────────────────────
        const panel = this.contentEl.createDiv({ cls: 'pi-history-panel' });

        // 顶部拖拽横条（iOS 风格）
        panel.createDiv({ cls: 'pi-history-pill' });

        // 标题栏
        const titleBar = panel.createDiv({ cls: 'pi-history-titlebar' });
        titleBar.createSpan({ text: '历史会话' });
        const closeBtn = titleBar.createEl('span', { cls: 'pi-history-close' });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', () => {
            backdrop.remove();
            panel.remove();
        });

        if (sessions.length === 0) {
            panel.createEl('p', {
                text: '没有找到历史会话',
                cls: 'pi-history-empty',
            });
            return;
        }

        // 会话列表
        const list = panel.createEl('ul', { cls: 'pi-history-list' });

        for (const s of sessions) {
            const item = list.createEl('li', { cls: 'pi-history-item' });
            item.setText(s.displayName);
            item.addEventListener('click', async () => {
                backdrop.remove();
                panel.remove();
                await this.switchToSession(s.file);
            });
        }
    }

    // ── 读取会话列表 ──────────────────────────
    private readSessions(): Array<{ file: string; displayName: string }> {
        const sessionsDir = path.join(os.homedir(), '.pi', 'agent', 'sessions');
        const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
        const encodedPath = vaultPath.replace(/^\//, '').replace(/\//g, '-');
        const fullDir = path.join(sessionsDir, '--' + encodedPath + '--');

        let files: string[] = [];
        try {
            files = fs.readdirSync(fullDir).filter(f => f.endsWith('.jsonl'));
        } catch {
            return [];
        }

        files.sort().reverse();

        const sessions: Array<{ file: string; displayName: string }> = [];
        for (const f of files) {
            const filePath = path.join(fullDir, f);
            let displayName = f;
            try {
                const headerLine = fs.readFileSync(filePath, 'utf-8').split('\n')[0] || '';
                const header = JSON.parse(headerLine);
                if (header.name) {
                    displayName = header.name;
                } else {
                    const dateStr = f.split('_')[0] || f;
                    displayName = dateStr.replace(/T/, ' ').replace(/-\d+Z$/, '');
                }
            } catch {}
            sessions.push({ file: filePath, displayName });
        }
        return sessions;
    }

    // ── 切换到指定会话 ──────────────────────────
    private async switchToSession(sessionPath: string): Promise<void> {
        new Notice('正在切换会话...');

        const switchResp = await this.piClient.sendAndWait({
            type: 'switch_session',
            sessionPath,
        });

        if (!switchResp?.success) {
            new Notice('切换会话失败');
            return;
        }

        const msgResp = await this.piClient.sendAndWait({
            type: 'get_messages',
        });

        if (!msgResp?.success) {
            new Notice('获取消息失败');
            return;
        }

        this.loadMessages(msgResp.data.messages || []);
    }

    // ── 清空并加载消息 ──────────────────────────
    private loadMessages(messages: any[]): void {
        // 清空消息列表（保留欢迎文字）
        this.messagesEl.empty();

        // 重新显示欢迎文字
        this.welcomeEl = this.messagesEl.createEl('p', {
            text: '开始和 Pi 对话吧！',
            cls: 'pi-chat-welcome',
        });

        // 遍历消息，只显示用户和助手的对话
        let hasContent = false;
        for (const msg of messages) {
            if (msg.role === 'user') {
                // 用户消息：从 content 中取文本
                const text = extractTextContent(msg.content);
                if (text) {
                    // 有内容就移除欢迎文字
                    if (this.welcomeEl) {
                        this.welcomeEl.remove();
                        this.welcomeEl = null as any;
                    }
                    const el = this.messagesEl.createDiv({ cls: 'pi-chat-msg-user' });
                    el.setText(text);
                    hasContent = true;
                }
            } else if (msg.role === 'assistant') {
                // 助手消息
                const text = extractTextContent(msg.content);
                if (text) {
                    if (this.welcomeEl) {
                        this.welcomeEl.remove();
                        this.welcomeEl = null as any;
                    }
                    const el = this.messagesEl.createDiv({ cls: 'pi-chat-msg-assistant' });
                    el.setText(text);
                    hasContent = true;
                }
            }
        }

        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    // 面板被关闭时调用
    async onClose(): Promise<void> {
        // 清理事件回调
        this.piClient.onEvent = null;
    }
}

// ── 从消息 content 中提取纯文本 ──────────────
// content 可能是字符串 "Hello" 或数组 [{ type: "text", text: "Hello" }, ...]
function extractTextContent(content: any): string {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text || '')
            .join('\n');
    }
    return '';
}
