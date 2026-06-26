// 流式 Markdown 渲染模块
// 将 AI 回复的 markdown 文本实时渲染到消息气泡中
// 自动为代码块添加语言标签和复制按钮
import { App, MarkdownRenderer, Component } from 'obsidian';
import { enhanceCodeBlocks } from './code-blocks';

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

    // ── 增强代码块（委托公共工具） ──────
    private enhanceCodeBlocks(): void {
        enhanceCodeBlocks(this.container);
    }
}
