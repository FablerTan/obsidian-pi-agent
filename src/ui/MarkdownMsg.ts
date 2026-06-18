// 流式 Markdown 渲染模块
// 将 AI 回复的 markdown 文本实时渲染到消息气泡中
import { App, MarkdownRenderer, Component } from 'obsidian';

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

    // ── 安排渲染（避免频繁重复渲染） ────────────
    private scheduleRender(): void {
        if (this.rendering) {
            // 正在渲染中，标记为"需要重绘"
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

                // 清空容器
                this.container.empty();

                // 用 Obsidian 的 MarkdownRenderer 渲染
                // sourcePath 设为 "/" 表示 vault 根目录（用于解析内部链接）
                await MarkdownRenderer.render(
                    this.app,
                    this.text,
                    this.container,
                    '/',
                    this.component,
                );
            } while (this.needsRerender);
        } catch (e) {
            console.error('Markdown render error:', e);
            // 渲染失败时，至少显示纯文本
            if (!this.container.hasChildNodes()) {
                this.container.setText(this.text);
            }
        } finally {
            this.rendering = false;
        }
    }
}
