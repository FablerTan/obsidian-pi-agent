// 流式 Markdown 渲染模块
// 将 AI 回复的 markdown 文本实时渲染到消息气泡中
// 自动为代码块添加语言标签和复制按钮
import { App, MarkdownRenderer, Component, Notice } from 'obsidian';

export class MarkdownMsg {
    // 当前累积的原始 markdown 文本
    private text = '';

    // 消息气泡容器（渲染结果放到这里）
    private container: HTMLElement;

    // 是否正在渲染中（避免并发）
    private rendering = false;

    // 是否需要重新渲染（渲染中又来新数据时设此标记）
    private needsRerender = false;

    constructor(
        private app: App,
        container: HTMLElement,
        private component: Component,
    ) {
        this.container = container;
    }

    // ── 追加文字 ────────────────────────────────
    append(text: string): void {
        this.text += text;
        this.scheduleRender();
    }

    // ── 获取纯文本（用于复制等） ────────────────
    getText(): string {
        return this.text;
    }

    // ── 安排渲染 ────────────────────────────────
    private scheduleRender(): void {
        if (this.rendering) {
            this.needsRerender = true;
            return;
        }
        this.render();
    }

    // ── 实际渲染 ────────────────────────────────
    private async render(): Promise<void> {
        this.rendering = true;
        try {
            do {
                this.needsRerender = false;
                this.container.empty();

                await MarkdownRenderer.render(
                    this.app,
                    this.text,
                    this.container,
                    '/',
                    this.component,
                );

                // 渲染完成后增强代码块
                this.enhanceCodeBlocks();
            } while (this.needsRerender);
        } catch (e) {
            console.error('Markdown render error:', e);
            if (!this.container.hasChildNodes()) {
                this.container.setText(this.text);
            }
        } finally {
            this.rendering = false;
        }
    }

    // ── 增强代码块：加语言标签 + 复制按钮 ──────
    private enhanceCodeBlocks(): void {
        this.container.querySelectorAll('pre').forEach((pre) => {
            const code = pre.querySelector('code');
            if (!code || pre.hasAttribute('data-enhanced')) return;
            pre.setAttribute('data-enhanced', 'true');

            // 提取语言名
            const classNames = code.className || '';
            const langMatch = classNames.match(/language-(\w+)/);
            const lang = langMatch ? langMatch[1] || '' : 'code';

            // 右上角语言标签，点击复制整个代码块
            const label = document.createElement('span');
            label.className = 'pi-chat-code-lang';
            label.textContent = lang;
            label.title = '点击复制代码';
            label.addEventListener('click', async () => {
                const codeText = (code as HTMLElement).textContent || '';
                try {
                    await navigator.clipboard.writeText(codeText);
                    label.textContent = '已复制 ✓';
                    setTimeout(() => { label.textContent = lang; }, 2000);
                } catch {
                    new Notice('复制失败');
                }
            });
            pre.appendChild(label);
        });
    }
}
