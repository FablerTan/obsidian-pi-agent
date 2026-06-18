// 命令菜单 —— 输入 / 时弹出命令列表，支持键盘导航和筛选
import { setIcon } from 'obsidian';

export interface CommandItem {
    name: string;
    description?: string;
    source: 'extension' | 'prompt' | 'skill';
    location?: string;
    path?: string;
}

export class CommandMenu {
    private overlayEl: HTMLElement | null = null;
    private listEl: HTMLElement | null = null;
    private items: CommandItem[] = [];
    private filtered: CommandItem[] = [];
    private selectedIndex = 0;
    private _visible = false;

    constructor(
        private container: HTMLElement,       // 定位容器（.pi-chat-container）
        private textarea: HTMLTextAreaElement,
        private onSelect: (cmd: CommandItem) => void,
    ) {}

    // ── 设置可用命令列表 ──────────────────────
    setCommands(items: CommandItem[]): void {
        this.items = items;
    }

    // ── 显示菜单（按 query 筛选） ──────────────
    show(query: string): void {
        const q = query.toLowerCase();
        this.filtered = this.items.filter(cmd =>
            cmd.name.toLowerCase().startsWith(q),
        );
        this.selectedIndex = 0;
        this._visible = true;
        this.render();
    }

    // ── 隐藏菜单 ──────────────────────────────
    hide(): void {
        this._visible = false;
        if (this.overlayEl) {
            this.overlayEl.remove();
            this.overlayEl = null;
            this.listEl = null;
        }
    }

    isVisible(): boolean {
        return this._visible;
    }

    // ── 键盘导航（在 textarea keydown 中调用） ──
    handleKeydown(e: KeyboardEvent): boolean {
        if (!this._visible || this.filtered.length === 0) return false;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = (this.selectedIndex + 1) % this.filtered.length;
                this.highlightSelected();
                return true;
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = (this.selectedIndex - 1 + this.filtered.length) % this.filtered.length;
                this.highlightSelected();
                return true;
            case 'Enter':
                e.preventDefault();
                this.confirm();
                return true;
            case 'Escape':
                e.preventDefault();
                this.hide();
                return true;
        }
        return false;
    }

    // ── 渲染菜单 ──────────────────────────────
    private render(): void {
        // 移除旧菜单
        if (this.overlayEl) {
            this.overlayEl.remove();
            this.overlayEl = null;
            this.listEl = null;
        }

        if (this.filtered.length === 0) return;

        this.overlayEl = this.container.createDiv({ cls: 'pi-command-menu' });
        this.listEl = this.overlayEl.createEl('ul', { cls: 'pi-command-list' });

        this.filtered.forEach((cmd, i) => {
            const li = this.listEl!.createEl('li', { cls: 'pi-command-item' });
            if (i === this.selectedIndex) li.addClass('pi-command-item-selected');

            // 来源图标
            const iconSpan = li.createSpan({ cls: 'pi-command-icon' });
            const iconName = cmd.source === 'skill' ? 'sparkles'
                : cmd.source === 'extension' ? 'puzzle'
                : 'file-text';
            setIcon(iconSpan, iconName);

            // 命令名（带 / 前缀）
            li.createSpan({ cls: 'pi-command-name', text: '/' + cmd.name });

            // 描述
            if (cmd.description) {
                li.createSpan({ cls: 'pi-command-desc', text: cmd.description });
            }

            // 点击选中
            li.addEventListener('mousedown', (e) => {
                e.preventDefault(); // 防止 textarea 失焦
                this.onSelect(cmd);
                this.hide();
            });
        });
    }

    // ── 高亮当前选中项 ────────────────────────
    private highlightSelected(): void {
        if (!this.listEl) return;
        const items = this.listEl.querySelectorAll('.pi-command-item');
        items.forEach((el, i) => {
            el.toggleClass('pi-command-item-selected', i === this.selectedIndex);
        });
        const selected = items[this.selectedIndex] as HTMLElement | undefined;
        if (selected) {
            selected.scrollIntoView({ block: 'nearest' });
        }
    }

    // ── 确认选择 ──────────────────────────────
    private confirm(): void {
        const cmd = this.filtered[this.selectedIndex];
        if (!cmd) return;
        this.onSelect(cmd);
        this.hide();
    }
}
