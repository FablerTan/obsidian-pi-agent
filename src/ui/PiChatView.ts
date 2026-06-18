// 导入 Obsidian 的 ItemView 基类
// ItemView: 可以在 Obsidian 工作区中创建自定义面板
// WorkspaceLeaf: 每个视图都挂在一个"叶子"上
import { ItemView, WorkspaceLeaf, Notice, setIcon, Modal } from 'obsidian';
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
        contentEl.addClass('pi-chat-wrapper'); // ← 让 contentEl 变成 flex 列

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

        // ── 底部输入框（历史图标浮在右上角） ────
        const inputWrapper = container.createDiv({ cls: 'pi-chat-input-wrapper' });
        const textarea = inputWrapper.createEl('textarea', {
            cls: 'pi-chat-input',
            placeholder: '输入消息... (Enter 发送, Shift+Enter 换行)',
        });

        // 历史图标浮在输入框右上角
        const historyIcon = inputWrapper.createEl('span', {
            cls: 'pi-chat-history-btn',
        });
        setIcon(historyIcon, 'history');
        historyIcon.addEventListener('click', () => {
            this.openHistory();
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

    // ── 打开历史会话列表 ──────────────────────
    private async openHistory(): Promise<void> {
        // pi 的会话目录：~/.pi/agent/sessions/
        const sessionsDir = path.join(
            os.homedir(),
            '.pi', 'agent', 'sessions',
        );

        // 当前 vault 路径对应的会话子目录名
        // pi 把路径中的 / 替换为 -，去掉开头的 /，前后加 --
        const basePath = (this.app.vault.adapter as any).basePath;
        const encodedPath = basePath.replace(/^\//, '').replace(/\//g, '-');
        const projectDir = '--' + encodedPath + '--';
        const fullDir = path.join(sessionsDir, projectDir);

        let files: string[] = [];
        try {
            files = fs.readdirSync(fullDir).filter(f => f.endsWith('.jsonl'));
        } catch {
            new Notice('没有找到历史会话');
            return;
        }

        // 按文件名倒序（最新的在前面）
        files.sort().reverse();

        // 弹出一个选择界面
        const modal = new HistoryModal(this.app, files, fullDir, async (sessionPath) => {
            // 用户选了一个会话，切换到它
            const switchResp = await this.piClient.sendAndWait({
                type: 'switch_session',
                sessionPath,
            });

            if (!switchResp?.success) {
                new Notice('切换会话失败');
                return;
            }

            // 获取历史消息
            const msgResp = await this.piClient.sendAndWait({
                type: 'get_messages',
            });

            if (!msgResp?.success) {
                new Notice('获取消息失败');
                return;
            }

            // 清空当前消息列表，渲染历史消息
            this.loadMessages(msgResp.data.messages || []);
        });
        modal.open();
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

// ── 历史会话选择弹窗 ──────────────────────────
class HistoryModal extends Modal {
    constructor(
        app: any,
        private files: string[],
        private dir: string,
        private onSelect: (sessionPath: string) => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: '历史会话' });

        if (this.files.length === 0) {
            contentEl.createEl('p', { text: '没有历史会话' });
            return;
        }

        const list = contentEl.createEl('ul', { cls: 'pi-history-list' });

        for (const file of this.files) {
            // 文件名: 2026-06-14T15-24-55-995Z_xxx.jsonl
            // 取下划线前的时间部分，把 T 替换为空格，去掉毫秒和 Z
            const dateStr = file.split('_')[0] || file;
            const displayTime = (dateStr || '')
                .replace(/T/, ' ')
                .replace(/-\d+Z$/, '');

            const item = list.createEl('li', { cls: 'pi-history-item' });
            item.setText(displayTime);
            item.addEventListener('click', () => {
                this.onSelect(path.join(this.dir, file));
                this.close();
            });
        }
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
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
