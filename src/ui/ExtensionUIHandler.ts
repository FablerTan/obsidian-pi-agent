// Extension UI 协议处理器
// 负责处理 pi 扩展通过 RPC 发来的 UI 交互请求（select/confirm/input/editor 弹窗，
// 以及 notify/setStatus/setWidget/setTitle/set_editor_text 广播通知）
import { App, Modal, Notice, setIcon, Setting } from 'obsidian';
import { PiRpcClient } from '../pi/rpc-client';

export class ExtensionUIHandler {
    constructor(
        private app: App,
        private piClient: PiRpcClient,
        private textarea: HTMLTextAreaElement,
    ) {}

    // ── 统一入口：根据 method 分派到具体的处理方法 ──
    handleRequest(event: any): void {
        const { id, method } = event;
        switch (method) {
            // ── 对话型方法 ──
            case 'select':   this.handleSelect(event); break;
            case 'confirm':  this.handleConfirm(event); break;
            case 'input':    this.handleInput(event); break;
            case 'editor':   this.handleEditor(event); break;
            // ── 广播型方法 ──
            case 'notify':         this.handleNotify(event); break;
            case 'setStatus':      this.handleSetStatus(event); break;
            case 'setWidget':      this.handleSetWidget(event); break;
            case 'setTitle':       this.handleSetTitle(event); break;
            case 'set_editor_text': this.handleSetEditorText(event); break;
            default:
                console.warn('未知的 Extension UI 方法:', method);
        }
    }

    // ══════════════════════════════════════════════
    //  对话型方法（需要回传 response）
    // ══════════════════════════════════════════════

    // ── select：弹出选项列表 ────────────────────
    private handleSelect(request: any): void {
        const modal = new SelectModal(
            this.app,
            request.title || '请选择',
            request.options || [],
            (value) => this.respond(request.id, { value }),
            () => this.respond(request.id, { cancelled: true }),
        );
        modal.open();
    }

    // ── confirm：确认弹窗 ──────────────────────
    private handleConfirm(request: any): void {
        const modal = new ConfirmModal(
            this.app,
            request.title || '确认',
            request.message || '',
            (confirmed) => this.respond(request.id, { confirmed }),
            () => this.respond(request.id, { cancelled: true }),
        );
        modal.open();
    }

    // ── input：单行文字输入 ────────────────────
    private handleInput(request: any): void {
        const modal = new InputModal(
            this.app,
            request.title || '输入',
            request.placeholder || '',
            (value) => this.respond(request.id, { value }),
            () => this.respond(request.id, { cancelled: true }),
        );
        modal.open();
    }

    // ── editor：多行文字编辑 ───────────────────
    private handleEditor(request: any): void {
        const modal = new EditorModal(
            this.app,
            request.title || '编辑',
            request.prefill || '',
            (value) => this.respond(request.id, { value }),
            () => this.respond(request.id, { cancelled: true }),
        );
        modal.open();
    }

    // ══════════════════════════════════════════════
    //  广播型方法（不需 response）
    // ══════════════════════════════════════════════

    // ── notify：显示通知 ───────────────────────
    private handleNotify(request: any): void {
        const { message, notifyType } = request;
        if (!message) return;
        const notice = new Notice(message, 5000);
        // 根据通知类型调整图标（通过设置 noticeEl 的 CSS class）
        const noticeEl = notice.noticeEl;
        if (notifyType === 'error') {
            noticeEl.addClass('pi-ext-notify-error');
        } else if (notifyType === 'warning') {
            noticeEl.addClass('pi-ext-notify-warning');
        }
    }

    // ── setStatus：设置/清除状态栏文字 ─────────
    // 使用 Map 存储状态，每次更新后渲染到输入框下方的一个小状态条
    private statusMap = new Map<string, string>();

    private handleSetStatus(request: any): void {
        const { statusKey, statusText } = request;
        if (statusText === undefined || statusText === null) {
            this.statusMap.delete(statusKey);
        } else {
            this.statusMap.set(statusKey, statusText);
        }
        this.renderStatusBar();
    }

    private statusBarEl: HTMLElement | null = null;

    private renderStatusBar(): void {
        // 状态栏插入到 textarea 前面
        if (!this.statusBarEl) {
            this.statusBarEl = this.textarea.parentElement?.createDiv({
                cls: 'pi-ext-status-bar',
            }) ?? null;
            if (this.statusBarEl) {
                this.textarea.parentElement?.insertBefore(
                    this.statusBarEl, this.textarea,
                );
            }
        }
        if (!this.statusBarEl) return;
        this.statusBarEl.empty();
        if (this.statusMap.size === 0) {
            this.statusBarEl.hidden = true;
            return;
        }
        this.statusBarEl.hidden = false;
        for (const [key, text] of this.statusMap) {
            const item = this.statusBarEl.createSpan({
                cls: 'pi-ext-status-item',
                text,
            });
            item.setAttr('data-key', key);
        }
    }

    // ── setWidget：设置/清除部件 ───────────────
    private widgetMap = new Map<string, {
        lines: string[];
        placement: string;
    }>();

    private handleSetWidget(request: any): void {
        const { widgetKey, widgetLines, widgetPlacement } = request;
        if (widgetLines === undefined || widgetLines === null) {
            this.widgetMap.delete(widgetKey);
        } else {
            this.widgetMap.set(widgetKey, {
                lines: widgetLines,
                placement: widgetPlacement || 'aboveEditor',
            });
        }
        this.renderWidgets();
    }

    private widgetsAboveEl: HTMLElement | null = null;
    private widgetsBelowEl: HTMLElement | null = null;

    private renderWidgets(): void {
        // 准备容器
        const above = this.getOrCreateWidgetContainer('aboveEditor');
        const below = this.getOrCreateWidgetContainer('belowEditor');
        above.empty();
        below.empty();

        let hasAbove = false;
        let hasBelow = false;

        for (const [key, w] of this.widgetMap) {
            const container = w.placement === 'belowEditor' ? below : above;
            const wrapper = container.createDiv({ cls: 'pi-ext-widget' });
            // 标题行
            const header = wrapper.createDiv({ cls: 'pi-ext-widget-header' });
            header.setText(key);
            // 内容行
            const body = wrapper.createDiv({ cls: 'pi-ext-widget-body' });
            for (const line of w.lines) {
                body.createDiv({ cls: 'pi-ext-widget-line', text: line });
            }
            if (w.placement === 'belowEditor') hasBelow = true;
            else hasAbove = true;
        }

        above.hidden = !hasAbove;
        below.hidden = !hasBelow;
    }

    private getOrCreateWidgetContainer(placement: string): HTMLElement {
        const isAbove = placement === 'aboveEditor';
        const key = isAbove ? 'widgetsAboveEl' : 'widgetsBelowEl';
        const cls = isAbove ? 'pi-ext-widgets-above' : 'pi-ext-widgets-below';

        let el = isAbove ? this.widgetsAboveEl : this.widgetsBelowEl;
        if (el && el.parentElement) return el;

        // 找到 chat 容器
        const chatContainer = this.textarea.closest('.pi-chat-container');
        if (!chatContainer) {
            // fallback：插入到 textarea 父元素
            el = this.textarea.parentElement!.createDiv({ cls });
        } else if (isAbove) {
            // 插入到消息列表和输入区域之间
            const inputArea = chatContainer.querySelector('.pi-chat-input-area');
            if (inputArea) {
                el = chatContainer.insertBefore(
                    chatContainer.createDiv({ cls }),
                    inputArea,
                );
            } else {
                el = chatContainer.createDiv({ cls });
            }
        } else {
            // 插入到输入区域底部
            el = chatContainer.createDiv({ cls });
        }

        if (isAbove) this.widgetsAboveEl = el;
        else this.widgetsBelowEl = el;
        return el;
    }

    // ── setTitle：设置窗口标题 ─────────────────
    private handleSetTitle(request: any): void {
        const { title } = request;
        if (title) {
            document.title = title;
        }
    }

    // ── set_editor_text：预设输入框文本 ────────
    private handleSetEditorText(request: any): void {
        const { text } = request;
        if (text !== undefined && text !== null) {
            this.textarea.value = text;
            this.textarea.focus();
        }
    }

    // ══════════════════════════════════════════════
    //  工具方法
    // ══════════════════════════════════════════════

    // ── 回传 extension_ui_response ─────────────
    private respond(id: string, data: Record<string, any>): void {
        this.piClient.sendExtensionUIResponse(id, data);
    }

    // ── 清理（视图关闭时调用） ─────────────────
    destroy(): void {
        this.widgetsAboveEl?.remove();
        this.widgetsBelowEl?.remove();
        this.statusBarEl?.remove();
        this.widgetsAboveEl = null;
        this.widgetsBelowEl = null;
        this.statusBarEl = null;
        this.statusMap.clear();
        this.widgetMap.clear();
    }
}

// ══════════════════════════════════════════════════
//  模态弹窗组件
// ══════════════════════════════════════════════════

// ── Select 弹窗 ────────────────────────────────
class SelectModal extends Modal {
    constructor(
        app: App,
        private titleText: string,
        private options: string[],
        private onSelect: (value: string) => void,
        private onCancel: () => void,
    ) {
        super(app);
    }

    onOpen(): void {
        this.titleEl.setText(this.titleText);
        this.modalEl.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.onCancel();
                this.close();
            }
        });
        const list = this.contentEl.createDiv({ cls: 'pi-ext-select-list' });
        for (const opt of this.options) {
            const btn = list.createEl('button', {
                cls: 'pi-ext-select-option',
                text: opt,
            });
            btn.addEventListener('click', () => {
                this.onSelect(opt);
                this.close();
            });
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// ── Confirm 弹窗 ──────────────────────────────
class ConfirmModal extends Modal {
    constructor(
        app: App,
        private titleText: string,
        private message: string,
        private onConfirm: (confirmed: boolean) => void,
        private onCancel: () => void,
    ) {
        super(app);
    }

    onOpen(): void {
        this.titleEl.setText(this.titleText);
        this.modalEl.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.onCancel();
                this.close();
            }
        });
        this.contentEl.createDiv({
            cls: 'pi-ext-confirm-message',
            text: this.message,
        });
        const btnGroup = this.contentEl.createDiv({
            cls: 'pi-ext-confirm-buttons',
        });
        const cancelBtn = btnGroup.createEl('button', {
            cls: 'pi-ext-btn-cancel',
            text: '取消',
        });
        cancelBtn.addEventListener('click', () => {
            this.onCancel();
            this.close();
        });
        const confirmBtn = btnGroup.createEl('button', {
            cls: 'pi-ext-btn-confirm',
            text: '确认',
        });
        confirmBtn.addEventListener('click', () => {
            this.onConfirm(true);
            this.close();
        });
        // 焦点给确认按钮
        setTimeout(() => confirmBtn.focus(), 50);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// ── Input 弹窗 ────────────────────────────────
class InputModal extends Modal {
    private inputEl!: HTMLInputElement;

    constructor(
        app: App,
        private titleText: string,
        private placeholder: string,
        private onSubmit: (value: string) => void,
        private onCancel: () => void,
    ) {
        super(app);
    }

    onOpen(): void {
        this.titleEl.setText(this.titleText);
        this.modalEl.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.onCancel();
                this.close();
            }
        });
        this.inputEl = this.contentEl.createEl('input', {
            cls: 'pi-ext-input-field',
            type: 'text',
            placeholder: this.placeholder,
        });
        this.inputEl.style.width = '100%';
        this.inputEl.style.marginBottom = '12px';
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.onSubmit(this.inputEl.value);
                this.close();
            }
        });
        const btnGroup = this.contentEl.createDiv({
            cls: 'pi-ext-confirm-buttons',
        });
        const cancelBtn = btnGroup.createEl('button', {
            cls: 'pi-ext-btn-cancel',
            text: '取消',
        });
        cancelBtn.addEventListener('click', () => {
            this.onCancel();
            this.close();
        });
        const okBtn = btnGroup.createEl('button', {
            cls: 'pi-ext-btn-confirm',
            text: '确定',
        });
        okBtn.addEventListener('click', () => {
            this.onSubmit(this.inputEl.value);
            this.close();
        });
        setTimeout(() => this.inputEl.focus(), 50);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// ── Editor 弹窗（多行文本编辑） ──────────────
class EditorModal extends Modal {
    private textareaEl!: HTMLTextAreaElement;

    constructor(
        app: App,
        private titleText: string,
        private prefill: string,
        private onSubmit: (value: string) => void,
        private onCancel: () => void,
    ) {
        super(app);
    }

    onOpen(): void {
        this.titleEl.setText(this.titleText);
        this.modalEl.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.onCancel();
                this.close();
            }
        });
        this.textareaEl = this.contentEl.createEl('textarea', {
            cls: 'pi-ext-editor-field',
            text: this.prefill,
        });
        this.textareaEl.style.width = '100%';
        this.textareaEl.style.height = '200px';
        this.textareaEl.style.marginBottom = '12px';
        this.textareaEl.style.resize = 'vertical';
        const btnGroup = this.contentEl.createDiv({
            cls: 'pi-ext-confirm-buttons',
        });
        const cancelBtn = btnGroup.createEl('button', {
            cls: 'pi-ext-btn-cancel',
            text: '取消',
        });
        cancelBtn.addEventListener('click', () => {
            this.onCancel();
            this.close();
        });
        const okBtn = btnGroup.createEl('button', {
            cls: 'pi-ext-btn-confirm',
            text: '确定',
        });
        okBtn.addEventListener('click', () => {
            this.onSubmit(this.textareaEl.value);
            this.close();
        });
        setTimeout(() => {
            this.textareaEl.focus();
            this.textareaEl.select();
        }, 50);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
