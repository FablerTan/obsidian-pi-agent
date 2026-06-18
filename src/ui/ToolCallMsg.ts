// 工具调用卡片 —— 显示 Pi 调用的工具（bash、read、edit 等）
// 包含工具名称、参数摘要、执行状态、输出结果
// 可点击头部展开/收起参数详情和输出
import { setIcon } from 'obsidian';

// 工具名称到 Lucide 图标的映射
const TOOL_ICONS: Record<string, string> = {
    bash: 'terminal',
    read: 'file-text',
    edit: 'pencil',
    write: 'file-plus',
    grep: 'search',
    defuddle: 'globe',
    ls: 'list',
    cd: 'folder',
    find: 'search',
};

export class ToolCallMsg {
    private cardEl!: HTMLElement;
    private headerEl!: HTMLElement;
    private statusIcon!: HTMLElement;
    private bodyEl!: HTMLElement;
    private outputPre: HTMLElement | null = null;
    private _isExpanded = false;

    constructor(
        private container: HTMLElement,
        private toolName: string,
        private args: any,
    ) {
        this.render();
    }

    // ── 渲染卡片 ──────────────────────────────
    private render(): void {
        this.cardEl = this.container.createDiv({ cls: 'pi-chat-tool-call' });

        // ── 头部（可点击展开/收起） ──
        this.headerEl = this.cardEl.createDiv({ cls: 'pi-chat-tool-header' });

        // 状态图标（旋转中/完成/错误）
        this.statusIcon = this.headerEl.createSpan({ cls: 'pi-chat-tool-status' });
        this.setSpinning();

        // 工具图标
        const iconName = TOOL_ICONS[this.toolName] || 'terminal';
        const toolIcon = this.headerEl.createSpan({ cls: 'pi-chat-tool-icon' });
        setIcon(toolIcon, iconName);

        // 工具名称
        this.headerEl.createSpan({ cls: 'pi-chat-tool-name', text: this.toolName });

        // 参数摘要（一行）
        const summary = this.formatArgsSummary();
        if (summary) {
            this.headerEl.createSpan({ cls: 'pi-chat-tool-args-summary', text: summary });
        }

        // 展开/收起图标
        const toggleIcon = this.headerEl.createSpan({ cls: 'pi-chat-tool-toggle' });
        setIcon(toggleIcon, 'chevron-down');

        // ── 主体（参数详情 + 输出，可折叠） ──
        this.bodyEl = this.cardEl.createDiv({ cls: 'pi-chat-tool-body' });

        // 参数详情
        const argsDetail = this.bodyEl.createDiv({ cls: 'pi-chat-tool-args-detail' });
        const argsPre = argsDetail.createEl('pre');
        argsPre.setText(JSON.stringify(this.args, null, 2));

        // 输出区域（运行时逐步填充，执行完成后显示结果）
        this.bodyEl.createDiv({ cls: 'pi-chat-tool-output' });

        // 点击头部切换展开/收起
        this.headerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleExpand();
        });

        // 默认收起
        this.collapse();
    }

    // ── 格式化参数为一行摘要 ──────────────────
    private formatArgsSummary(): string {
        if (!this.args) return '';

        // bash 命令直接显示命令内容
        if (this.toolName === 'bash' && this.args.command) {
            return `▸ ${this.args.command}`;
        }
        // read/edit/write 显示路径
        if (this.args.path) {
            return `▸ ${this.args.path}`;
        }
        if (this.args.file) {
            return `▸ ${this.args.file}`;
        }
        // 其他工具取第一个字符串参数
        const values = Object.values(this.args).filter(v => typeof v === 'string');
        if (values.length > 0) {
            const val = values[0] as string;
            const truncated = val.length > 60 ? val.slice(0, 60) + '…' : val;
            return `▸ ${truncated}`;
        }
        return '';
    }

    // ── 展开/收起 ──────────────────────────────
    private toggleExpand(): void {
        if (this._isExpanded) {
            this.collapse();
        } else {
            this.expand();
        }
    }

    private expand(): void {
        this._isExpanded = true;
        this.bodyEl.removeClass('pi-chat-tool-body-collapsed');
        this.cardEl.removeClass('pi-chat-tool-collapsed');
    }

    private collapse(): void {
        this._isExpanded = false;
        this.bodyEl.addClass('pi-chat-tool-body-collapsed');
        this.cardEl.addClass('pi-chat-tool-collapsed');
    }

    // ── 设置旋转状态（执行中） ────────────────
    private setSpinning(): void {
        this.statusIcon.empty();
        setIcon(this.statusIcon, 'loader');
        this.statusIcon.addClass('pi-chat-tool-spin');
        this.statusIcon.removeClass('pi-chat-tool-success');
        this.statusIcon.removeClass('pi-chat-tool-error');
    }

    // ── 设置输出内容（流式更新或最终结果） ────
    setOutput(text: string): void {
        const outputEl = this.bodyEl.querySelector('.pi-chat-tool-output') as HTMLElement;
        if (!outputEl) return;

        if (!this.outputPre) {
            this.outputPre = outputEl.createEl('pre');
        }
        this.outputPre.setText(text);

        // 有输出时自动展开
        if (!this._isExpanded) {
            this.expand();
        }
    }

    // ── 标记执行完成 ──────────────────────────
    setResult(result: any, isError: boolean): void {
        // 更新状态图标
        this.statusIcon.empty();
        this.statusIcon.removeClass('pi-chat-tool-spin');
        if (isError) {
            setIcon(this.statusIcon, 'alert-circle');
            this.statusIcon.addClass('pi-chat-tool-error');
        } else {
            setIcon(this.statusIcon, 'check-circle');
            this.statusIcon.addClass('pi-chat-tool-success');
        }

        // 提取结果文本并显示
        if (result) {
            const text = this.extractResultText(result);
            if (text) {
                this.setOutput(text);
            }
        }
    }

    // ── 从 result 对象里提取纯文本 ────────────
    private extractResultText(result: any): string {
        // result.content: [{ type: "text", text: "..." }]
        if (result.content && Array.isArray(result.content)) {
            return result.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text || '')
                .join('\n');
        }
        // result 本身是字符串
        if (typeof result === 'string') return result;
        // result.text
        if (result.text) return result.text;
        return '';
    }
}
