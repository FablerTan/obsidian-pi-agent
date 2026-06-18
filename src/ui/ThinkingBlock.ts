// 思考链展示组件
// 以可折叠卡片形式显示 AI 的内部推理过程（thinking content）
import { setIcon } from 'obsidian';

export class ThinkingBlock {
    private _el: HTMLElement;
    private headerEl: HTMLElement;
    private bodyEl: HTMLElement;
    private contentEl: HTMLElement;
    private toggleIcon: HTMLElement;
    private _expanded = false;
    private _content = '';

    constructor(container: HTMLElement) {
        // 外层卡片
        this._el = container.createDiv({ cls: 'pi-thinking-block' });

        // 头部（可点击切换展开/收起）
        this.headerEl = this._el.createDiv({ cls: 'pi-thinking-header' });
        this.headerEl.addEventListener('click', () => this.toggle());

        // 图标
        const icon = this.headerEl.createSpan({ cls: 'pi-thinking-icon' });
        setIcon(icon, 'brain');

        // 标题
        this.headerEl.createSpan({ cls: 'pi-thinking-title', text: '思考中…' });

        // 展开/收起箭头
        this.toggleIcon = this.headerEl.createSpan({ cls: 'pi-thinking-toggle' });
        setIcon(this.toggleIcon, 'chevron-down');

        // 主体（默认折叠）
        this.bodyEl = this._el.createDiv({ cls: 'pi-thinking-body' });
        this.contentEl = this.bodyEl.createDiv({ cls: 'pi-thinking-content' });
    }

    // ── 追加思考文本 ──
    append(text: string): void {
        this._content += text;
        this.contentEl.setText(this._content);
    }

    // ── 思考结束 ──
    finish(): void {
        this.headerEl.querySelector('.pi-thinking-title')!.setText('思考完成');
        // 停止旋转动画
        this._el.toggleClass('pi-thinking-done', true);
    }

    // ── 展开/收起 ──
    private toggle(): void {
        this._expanded = !this._expanded;
        this.bodyEl.toggleClass('pi-thinking-collapsed', !this._expanded);
        setIcon(this.toggleIcon, this._expanded ? 'chevron-up' : 'chevron-down');
    }

    /** 展开（收到新内容时自动展开） */
    expand(): void {
        if (!this._expanded) this.toggle();
    }

    get el(): HTMLElement { return this._el; }
}
