// 笔记栏 + 选中文本追踪
// 位于输入框上方：左侧显示笔记名（点击切换附加），右侧显示选中字数
import { App, setIcon } from 'obsidian';

export class NoteBar {
    // DOM 元素
    el: HTMLElement;                       // 整条 note-bar
    private nameEl: HTMLElement;           // 笔记名文字
    private toggleIcon: HTMLElement;       // 切换图标
    private selectionInfoEl: HTMLElement;  // 选中字数

    // 状态
    private _notePath: string | null = null;
    private _noteName: string | null = null;
    private _attached = false;
    private _selectedText = '';

    // 外部传入的 textarea，用于 mousedown 提前抓取选区
    private textarea: HTMLTextAreaElement;

    // 清理函数列表
    private cleanups: Array<() => void> = [];

    constructor(
        private app: App,
        container: HTMLElement,      // .pi-chat-input-area
        textarea: HTMLTextAreaElement,
    ) {
        this.textarea = textarea;

        // ── 构建 DOM ──
        this.el = container.createDiv({ cls: 'pi-chat-note-bar' });
        const noteLeft = this.el.createSpan({ cls: 'pi-chat-note-left' });
        this.toggleIcon = noteLeft.createSpan({ cls: 'pi-chat-note-icon' });
        this.nameEl = noteLeft.createSpan({ cls: 'pi-chat-note-name', text: '无活动笔记' });
        noteLeft.addEventListener('click', () => this.toggleAttach());
        this.updateIcon();
        this.selectionInfoEl = this.el.createSpan({ cls: 'pi-chat-selection-info' });

        // ── 事件绑定 ──
        this.setupEvents();
        // 初始加载当前笔记（插件加载时文件已打开，不会触发 file-open）
        this.onFileOpen();
    }

    // ── getter ──────────────────────────────────
    get isAttached(): boolean { return this._attached; }
    get notePath(): string | null { return this._notePath; }

    /** 返回格式化的上下文片段列表，供消息组装用 */
    getContextParts(): string[] {
        const parts: string[] = [];
        if (this._attached && this._notePath) {
            parts.push(`[当前笔记: ${this._notePath}]`);
        }
        if (this._selectedText) {
            parts.push(`[选中文本 (${this._selectedText.length} 字)]\n\n${this._selectedText}`);
        }
        return parts;
    }

    // ── 切换笔记附加 ───────────────────────────────
    private toggleAttach(): void {
        this._attached = !this._attached;
        this.updateIcon();
    }

    private updateIcon(): void {
        this.el.toggleClass('pi-chat-note-attached', this._attached);
        setIcon(this.toggleIcon, this._attached ? 'pin' : 'pin-off');
    }

    // ── 监听器设置 ────────────────────────────────
    private setupEvents(): void {
        // 文件切换
        const fileOpenRef = this.app.workspace.on('file-open', () => this.onFileOpen());
        this.cleanups.push(() => this.app.workspace.offref(fileOpenRef));

        // 编辑器内容变化
        const editorChangeRef = this.app.workspace.on('editor-change', () => {
            this.updateSelectedText(true);
        });
        this.cleanups.push(() => this.app.workspace.offref(editorChangeRef));

        // 鼠标松开（无内容变化的纯选择）
        const onMouseUp = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const inEditor = !!target.closest('.cm-editor, .markdown-source-view');
            this.updateSelectedText(inEditor);
        };
        this.app.workspace.containerEl.addEventListener('mouseup', onMouseUp);
        this.cleanups.push(() => this.app.workspace.containerEl.removeEventListener('mouseup', onMouseUp));

        // 点击输入框时在焦点转移前抓取选区
        this.textarea.addEventListener('mousedown', () => this.captureBeforeFocusLost());
        // 不需要 clean up，textarea 生命周期与 NoteBar 相同
    }

    // ── 文件切换 ──────────────────────────────────
    private onFileOpen(): void {
        const file = this.app.workspace.getActiveFile();
        if (file) {
            if (file.path !== this._notePath) {
                this._selectedText = '';  // 切换文件 → 清空选中
            }
            this._notePath = file.path;
            this._noteName = file.name;
            this.nameEl.setText(file.name);
            this.el.toggleClass('pi-chat-note-empty', false);
        } else {
            this._notePath = null;
            this._noteName = null;
            this._selectedText = '';
            this.nameEl.setText('无活动笔记');
            this.el.toggleClass('pi-chat-note-empty', true);
        }
        this.refreshDisplay();
    }

    // ── 选中文本 ──────────────────────────────────
    private captureBeforeFocusLost(): void {
        const editor = this.app.workspace.activeEditor?.editor;
        if (editor) {
            const sel = editor.getSelection();
            if (sel) {
                this._selectedText = sel;
                this.refreshDisplay();
            }
        }
    }

    private updateSelectedText(clickInEditor = false): void {
        const editor = this.app.workspace.activeEditor?.editor;
        if (editor) {
            const sel = editor.getSelection();
            if (sel) {
                this._selectedText = sel;
            } else if (clickInEditor) {
                this._selectedText = '';
            }
        }
        this.refreshDisplay();
    }

    // ── 刷新 UI ──────────────────────────────────
    private refreshDisplay(): void {
        if (this._selectedText) {
            const charCount = this._selectedText.length;
            const lineCount = this._selectedText.split('\n').filter(l => l.length > 0).length;
            this.selectionInfoEl.setText(`「选中 ${lineCount} 行 ${charCount} 字」`);
            this.selectionInfoEl.toggleClass('pi-chat-selection-active', true);
        } else {
            this.selectionInfoEl.setText('');
            this.selectionInfoEl.toggleClass('pi-chat-selection-active', false);
        }
    }

    // ── 清理 ──────────────────────────────────────
    destroy(): void {
        for (const fn of this.cleanups) fn();
        this.cleanups = [];
    }
}
