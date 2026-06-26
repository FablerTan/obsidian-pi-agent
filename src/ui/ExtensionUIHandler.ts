// Extension UI 协议处理器
// 负责处理 pi 扩展通过 RPC 发来的 UI 交互请求
//
// 对话型方法（select/confirm/input/editor）：
//   渲染在输入框上方的内联面板中，不弹出独立弹窗
// 广播型方法（notify/setStatus/setWidget/setTitle/set_editor_text）：
//   直接执行对应操作
import { App, Notice } from 'obsidian';
import { PiRpcClient } from '../pi/rpc-client';
import type {
    ExtensionUiRequest,
    SelectRequest,
    ConfirmRequest,
    InputRequest,
    EditorRequest,
    NotifyRequest,
    SetStatusRequest,
    SetWidgetRequest,
    SetTitleRequest,
    SetEditorTextRequest,
} from '../pi/types';

export class ExtensionUIHandler {
    // 当前内联对话框的 DOM 元素（不存在时为 null）
    private dialogEl: HTMLElement | null = null;

    constructor(
        private app: App,
        private piClient: PiRpcClient,
        private textarea: HTMLTextAreaElement,
        // 内联对话框渲染到的容器（位于输入框上方）
        private containerEl: HTMLElement,
    ) {}

    // ── 统一入口：根据 method 分派到具体的处理方法 ──
    handleRequest(event: ExtensionUiRequest): void {
        switch (event.method) {
            case 'select':   this.handleSelect(event); break;
            case 'confirm':  this.handleConfirm(event); break;
            case 'input':    this.handleInput(event); break;
            case 'editor':   this.handleEditor(event); break;
            case 'notify':         this.handleNotify(event); break;
            case 'setStatus':      this.handleSetStatus(event); break;
            case 'setWidget':      this.handleSetWidget(event); break;
            case 'setTitle':       this.handleSetTitle(event); break;
            case 'set_editor_text': this.handleSetEditorText(event); break;
            default:
                console.warn('未知的 Extension UI 方法:', (event as { method: string }).method);
        }
    }

    // ══════════════════════════════════════════════
    //  对话型方法（内联面板，需要回传 response）
    // ══════════════════════════════════════════════

    // ── select：选项列表 ────────────────────────
    private handleSelect(request: SelectRequest): void {
        this.showDialog((el) => {
            // 标题
            el.createDiv({
                cls: 'pi-ext-inline-title',
                text: request.title || '请选择',
            });

            // 选项列表
            const list = el.createDiv({ cls: 'pi-ext-inline-options' });
            for (const opt of (request.options || [])) {
                const btn = list.createEl('button', {
                    cls: 'pi-ext-inline-option',
                    text: opt,
                });
                btn.addEventListener('click', () => {
                    this.closeDialog();
                    this.respond(request.id, { value: opt });
                });
            }

            // 取消按钮
            this.renderCancelButton(el, request.id);
        });
    }

    // ── confirm：确认/取消 ──────────────────────
    private handleConfirm(request: ConfirmRequest): void {
        this.showDialog((el) => {
            el.createDiv({
                cls: 'pi-ext-inline-title',
                text: request.title || '确认',
            });

            if (request.message) {
                el.createDiv({
                    cls: 'pi-ext-inline-message',
                    text: request.message,
                });
            }

            // 操作栏
            const footer = el.createDiv({ cls: 'pi-ext-inline-footer' });

            const cancelBtn = footer.createEl('button', {
                cls: 'pi-ext-inline-btn-cancel',
                text: '取消',
            });
            cancelBtn.addEventListener('click', () => {
                this.closeDialog();
                this.respond(request.id, { cancelled: true });
            });

            const confirmBtn = footer.createEl('button', {
                cls: 'pi-ext-inline-btn-confirm',
                text: '确认',
            });
            confirmBtn.addEventListener('click', () => {
                this.closeDialog();
                this.respond(request.id, { confirmed: true });
            });

            setTimeout(() => confirmBtn.focus(), 50);
        });
    }

    // ── input：单行输入 ────────────────────────
    private handleInput(request: InputRequest): void {
        this.showDialog((el) => {
            el.createDiv({
                cls: 'pi-ext-inline-title',
                text: request.title || '输入',
            });

            const input = el.createEl('input', {
                cls: 'pi-ext-inline-input',
                type: 'text',
                placeholder: request.placeholder || '',
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.closeDialog();
                    this.respond(request.id, { value: input.value });
                }
            });

            const footer = el.createDiv({ cls: 'pi-ext-inline-footer' });
            const cancelBtn = footer.createEl('button', {
                cls: 'pi-ext-inline-btn-cancel',
                text: '取消',
            });
            cancelBtn.addEventListener('click', () => {
                this.closeDialog();
                this.respond(request.id, { cancelled: true });
            });
            const okBtn = footer.createEl('button', {
                cls: 'pi-ext-inline-btn-confirm',
                text: '确定',
            });
            okBtn.addEventListener('click', () => {
                this.closeDialog();
                this.respond(request.id, { value: input.value });
            });

            setTimeout(() => input.focus(), 50);
        });
    }

    // ── editor：多行编辑 ────────────────────────
    private handleEditor(request: EditorRequest): void {
        this.showDialog((el) => {
            el.createDiv({
                cls: 'pi-ext-inline-title',
                text: request.title || '编辑',
            });

            const textarea = el.createEl('textarea', {
                cls: 'pi-ext-inline-textarea',
                text: request.prefill || '',
            });

            const footer = el.createDiv({ cls: 'pi-ext-inline-footer' });
            const cancelBtn = footer.createEl('button', {
                cls: 'pi-ext-inline-btn-cancel',
                text: '取消',
            });
            cancelBtn.addEventListener('click', () => {
                this.closeDialog();
                this.respond(request.id, { cancelled: true });
            });
            const okBtn = footer.createEl('button', {
                cls: 'pi-ext-inline-btn-confirm',
                text: '确定',
            });
            okBtn.addEventListener('click', () => {
                this.closeDialog();
                this.respond(request.id, { value: textarea.value });
            });

            setTimeout(() => { textarea.focus(); textarea.select(); }, 50);
        });
    }

    // ══════════════════════════════════════════════
    //  内联面板渲染工具
    // ══════════════════════════════════════════════

    // ── 显示内联对话框 ─────────────────────────
    private showDialog(buildFn: (el: HTMLElement) => void): void {
        this.closeDialog();

        this.dialogEl = this.containerEl.createDiv({ cls: 'pi-ext-inline-dialog' });

        // Escape 关闭对话框（触发取消按钮）
        this.dialogEl.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                const cancelBtn = this.dialogEl?.querySelector(
                    '.pi-ext-inline-btn-cancel',
                ) as HTMLElement | null;
                cancelBtn?.click();
            }
        });

        buildFn(this.dialogEl);

        // 使容器可聚焦，捕获键盘事件
        this.dialogEl.tabIndex = 0;
        this.dialogEl.focus();
        this.containerEl.hidden = false;
    }

    // ── 关闭内联对话框 ─────────────────────────
    private closeDialog(): void {
        if (this.dialogEl) {
            this.dialogEl.remove();
            this.dialogEl = null;
        }
        this.containerEl.hidden = true;
        // 焦点回到输入框
        this.textarea.focus();
    }

    // ── 通用取消按钮 ───────────────────────────
    private renderCancelButton(el: HTMLElement, requestId: string): void {
        const footer = el.createDiv({ cls: 'pi-ext-inline-footer' });
        const cancelBtn = footer.createEl('button', {
            cls: 'pi-ext-inline-btn-cancel',
            text: '取消',
        });
        cancelBtn.addEventListener('click', () => {
            this.closeDialog();
            this.respond(requestId, { cancelled: true });
        });
    }

    // ══════════════════════════════════════════════
    //  广播型方法（不需 response）
    // ══════════════════════════════════════════════

    // ── notify：显示通知 ───────────────────────
    private handleNotify(request: NotifyRequest): void {
        const { message, notifyType } = request;
        if (!message) return;
        const notice = new Notice(message, 5000);
        const noticeEl = notice.noticeEl;
        if (notifyType === 'error') {
            noticeEl.addClass('pi-ext-notify-error');
        } else if (notifyType === 'warning') {
            noticeEl.addClass('pi-ext-notify-warning');
        }
    }

    // ── setStatus：设置/清除状态栏文字 ─────────
    private statusMap = new Map<string, string>();

    private handleSetStatus(request: SetStatusRequest): void {
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
        if (!this.statusBarEl) {
            // 状态栏插入到 pi-chat-header 和 pi-chat-container 之间
            const wrapper = this.textarea.closest('.pi-chat-wrapper');
            const container = wrapper?.querySelector('.pi-chat-container');
            if (wrapper && container) {
                this.statusBarEl = wrapper.insertBefore(
                    wrapper.createDiv({ cls: 'pi-ext-status-bar' }),
                    container,
                );
            } else {
                // fallback：插入到 textarea 前面
                this.statusBarEl = this.textarea.parentElement?.createDiv({
                    cls: 'pi-ext-status-bar',
                }) ?? null;
                if (this.statusBarEl) {
                    this.textarea.parentElement?.insertBefore(
                        this.statusBarEl, this.textarea,
                    );
                }
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

    private handleSetWidget(request: SetWidgetRequest): void {
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
        const above = this.getOrCreateWidgetContainer('aboveEditor');
        const below = this.getOrCreateWidgetContainer('belowEditor');
        above.empty();
        below.empty();

        let hasAbove = false;
        let hasBelow = false;

        for (const [key, w] of this.widgetMap) {
            const container = w.placement === 'belowEditor' ? below : above;
            const wrapper = container.createDiv({ cls: 'pi-ext-widget' });
            const header = wrapper.createDiv({ cls: 'pi-ext-widget-header' });
            header.setText(key);
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
        const cls = isAbove ? 'pi-ext-widgets-above' : 'pi-ext-widgets-below';

        let el = isAbove ? this.widgetsAboveEl : this.widgetsBelowEl;
        if (el && el.parentElement) return el;

        const chatContainer = this.textarea.closest('.pi-chat-container');
        if (!chatContainer) {
            el = this.textarea.parentElement!.createDiv({ cls });
        } else if (isAbove) {
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
            el = chatContainer.createDiv({ cls });
        }

        if (isAbove) this.widgetsAboveEl = el;
        else this.widgetsBelowEl = el;
        return el;
    }

    // ── setTitle ─────────────────────────────────
    private handleSetTitle(request: SetTitleRequest): void {
        const { title } = request;
        if (title) {
            document.title = title;
        }
    }

    // ── set_editor_text ──────────────────────────
    private handleSetEditorText(request: SetEditorTextRequest): void {
        const { text } = request;
        if (text !== undefined && text !== null) {
            this.textarea.value = text;
            this.textarea.focus();
        }
    }

    // ══════════════════════════════════════════════
    //  工具方法
    // ══════════════════════════════════════════════

    private respond(id: string, data: Record<string, any>): void {
        this.piClient.sendExtensionUIResponse(id, data);
    }

    // ── 清理（视图关闭时调用） ─────────────────
    destroy(): void {
        this.closeDialog();
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
