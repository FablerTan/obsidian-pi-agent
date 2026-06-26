// 历史会话底部浮层：读取、显示、切换历史会话
import { Notice, setIcon, App } from 'obsidian';
import { PiRpcClient } from '../pi/rpc-client';
import type { SwitchSessionData, GetMessagesData } from '../pi/types';
import { AssistantMessageView } from './AssistantMessageView';
import { enhanceCodeBlocks } from './code-blocks';
import { extractText } from '../pi/types';
import { readSessions } from '../utils/session-file-reader';

export class HistoryPanel {
    constructor(
        private piClient: PiRpcClient,
        private messagesEl: HTMLElement,
        private contentEl: HTMLElement,
        private app: App,
    ) {}

    // ── 打开历史会话浮层 ──────────────────────
    async open(): Promise<void> {
        // 如果浮层已打开就关掉
        const existing = this.contentEl.querySelector('.pi-history-panel');
        if (existing) {
            existing.remove();
            this.contentEl.querySelector('.pi-history-backdrop')?.remove();
            return;
        }

        const sessions = await readSessions(this.app);

        // 半透明背景（点击关闭）
        const backdrop = this.contentEl.createDiv({ cls: 'pi-history-backdrop' });
        backdrop.addEventListener('click', () => {
            backdrop.remove();
            panel.remove();
        });

        // 底部浮层
        const panel = this.contentEl.createDiv({ cls: 'pi-history-panel' });

        // iOS 风格拖拽横条
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


    // ── 切换到指定会话 ──────────────────────────
    private async switchToSession(sessionPath: string): Promise<void> {
        new Notice('正在切换会话...');

        let switchResp: { success: boolean; data?: SwitchSessionData; error?: string } | undefined;
        try {
            switchResp = await this.piClient.sendAndWait<SwitchSessionData>({
                type: 'switch_session',
                sessionPath,
            });
        } catch (e) {
            new Notice('切换会话失败: ' + (e as Error).message);
            return;
        }

        if (!switchResp?.success) {
            new Notice('切换会话失败');
            return;
        }

        let msgResp: { success: boolean; data?: GetMessagesData; error?: string } | undefined;
        try {
            msgResp = await this.piClient.sendAndWait<GetMessagesData>({
                type: 'get_messages',
            });
        } catch (e) {
            new Notice('获取消息失败: ' + (e as Error).message);
            return;
        }

        if (!msgResp?.success) {
            new Notice('获取消息失败');
            return;
        }

        this.loadMessages(msgResp.data?.messages || []);
    }

    // ── 增强代码块由 code-blocks.ts 公共函数提供，直接调用 ──

    // ── 清空并加载消息 ──────────────────────────
    // 与流式路径共用 AssistantMessageView，保证 DOM 结构一致
    private async loadMessages(messages: any[]): Promise<void> {
        this.messagesEl.empty();

        // 重新显示欢迎文字
        const welcomeEl = this.messagesEl.createEl('p', {
            text: '开始和 Pi 对话吧！',
            cls: 'pi-chat-welcome',
        });

        // toolCallId → 所属的 AssistantMessageView，用于路由后续 toolResult 消息
        const toolCallOwners = new Map<string, AssistantMessageView>();

        const removeWelcome = () => {
            if (welcomeEl) welcomeEl.remove();
        };

        for (const msg of messages) {
            if (msg.role === 'user') {
                const text = extractText(msg.content as any);
                if (text) {
                    removeWelcome();
                    const el = this.messagesEl.createDiv({ cls: 'pi-chat-msg-user' });
                    el.setText(text);
                }
            } else if (msg.role === 'assistant') {
                const content = Array.isArray(msg.content) ? msg.content : [];
                // 预检查是否有可见内容（原逻辑：无文本且无工具调用则跳过）
                const hasText = content.some((c: any) => c.type === 'text' && c.text);
                const hasTool = content.some((c: any) => c.type === 'toolCall');
                const hasThinking = content.some((c: any) => c.type === 'thinking');
                if (!hasText && !hasTool && !hasThinking) continue;

                removeWelcome();
                const view = new AssistantMessageView(
                    this.messagesEl, this.app, this.messagesEl as any,
                    { onToolCall: (id) => toolCallOwners.set(id, view) },
                );
                view.renderFinal(msg);
                // 统一增强代码块（MarkdownMsg 内部已增强，但 renderFinal 走的是同一路径，
                // 这里冗余调用是 no-op：已增强的 pre 会被跳过）
                enhanceCodeBlocks(view.element);

            } else if (msg.role === 'toolResult' || msg.role === 'tool_result') {
                // 路由到工具调用所在的 view，填入结果
                const owner = toolCallOwners.get(msg.toolCallId);
                if (owner) {
                    owner.applyToolResult(msg.toolCallId, msg, msg.isError || false);
                    toolCallOwners.delete(msg.toolCallId);
                }
            }
        }

        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
}
