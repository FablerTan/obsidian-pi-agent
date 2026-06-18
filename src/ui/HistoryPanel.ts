// 历史会话底部浮层：读取、显示、切换历史会话
import { Notice, setIcon, FileSystemAdapter, App, MarkdownRenderer } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PiRpcClient } from '../pi/rpc-client';
import { extractTextContent } from '../utils/helpers';

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

        const sessions = this.readSessions();

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
            let displayName: string;

            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const header = JSON.parse(lines[0] || '{}');

                if (header.name) {
                    displayName = header.name;
                } else {
                    // 没有名称则取第一条用户消息
                    let firstMsg = '';
                    for (let i = 1; i < lines.length; i++) {
                        try {
                            const line = lines[i];
                            if (!line) continue;
                            const entry = JSON.parse(line);
                            if (entry.type === 'message' && entry.message?.role === 'user') {
                                const rawContent = entry.message.content;
                                const text = rawContent ? extractTextContent(rawContent) : '';
                                if (text) {
                                    firstMsg = text.length > 40 ? text.slice(0, 40) + '...' : text;
                                    break;
                                }
                            }
                        } catch {}
                    }

                    if (firstMsg) {
                        displayName = firstMsg;
                    } else {
                        const dateStr = f.split('_')[0] || f;
                        displayName = dateStr.replace(/T/, ' ').replace(/-\d+Z$/, '');
                    }
                }
            } catch {
                displayName = f;
            }

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

    // ── 增强代码块（同 MarkdownMsg 中的逻辑） ──
    private enhanceCodeBlocks(container: HTMLElement): void {
        container.querySelectorAll('pre').forEach((pre) => {
            const code = pre.querySelector('code');
            if (!code || pre.hasAttribute('data-enhanced')) return;
            pre.setAttribute('data-enhanced', 'true');

            const classNames = code.className || '';
            const langMatch = classNames.match(/language-(\w+)/);
            const lang = langMatch ? langMatch[1] || '' : '';

            const header = document.createElement('div');
            header.className = 'pi-chat-code-header';
            const langLabel = document.createElement('span');
            langLabel.className = 'pi-chat-code-lang';
            langLabel.textContent = lang || 'code';
            header.appendChild(langLabel);

            const copyBtn = document.createElement('button');
            copyBtn.className = 'pi-chat-copy-btn';
            copyBtn.textContent = '复制';
            copyBtn.addEventListener('click', async () => {
                const codeText = code.textContent || '';
                try {
                    await navigator.clipboard.writeText(codeText);
                    copyBtn.textContent = '已复制 ✓';
                    setTimeout(() => { copyBtn.textContent = '复制'; }, 2000);
                } catch { new Notice('复制失败'); }
            });
            header.appendChild(copyBtn);

            const wrapper = document.createElement('div');
            wrapper.className = 'pi-chat-code-wrapper';
            pre.parentNode?.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
        });
    }

    // ── 清空并加载消息 ──────────────────────────
    private async loadMessages(messages: any[]): Promise<void> {
        this.messagesEl.empty();

        // 重新显示欢迎文字
        const welcomeEl = this.messagesEl.createEl('p', {
            text: '开始和 Pi 对话吧！',
            cls: 'pi-chat-welcome',
        });

        let hasContent = false;
        for (const msg of messages) {
            if (msg.role === 'user') {
                const text = extractTextContent(msg.content);
                if (text) {
                    if (welcomeEl) {
                        welcomeEl.remove();
                    }
                    const el = this.messagesEl.createDiv({ cls: 'pi-chat-msg-user' });
                    el.setText(text);
                    hasContent = true;
                }
            } else if (msg.role === 'assistant') {
                const text = extractTextContent(msg.content);
                if (text) {
                    if (welcomeEl) {
                        welcomeEl.remove();
                    }
                    const el = this.messagesEl.createDiv({ cls: 'pi-chat-msg-assistant' });
                    // 用 Obsidian 的 MarkdownRenderer 渲染历史消息
                    await MarkdownRenderer.render(this.app, text, el, '/', this.messagesEl as any);
                    // 增强代码块
                    this.enhanceCodeBlocks(el);
                    hasContent = true;
                }
            }
        }

        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
}
