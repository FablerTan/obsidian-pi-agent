// 工具调用卡片 —— 显示 Pi 调用的工具（bash、read、edit 等）
// 包含工具名称、参数摘要、执行状态、输出结果
// 可点击头部切换三种状态：收起 → 限制5行 → 展开全部
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

type ViewState = 'collapsed' | 'limited' | 'expanded';

// 状态 → 状态名（用于 aria-label / title）
const STATE_LABEL: Record<ViewState, string> = {
    collapsed: '展开',
    limited: '显示全部',
    expanded: '收起',
};

export class ToolCallMsg {
    private cardEl!: HTMLElement;
    private headerEl!: HTMLElement;
    private statusIcon!: HTMLElement;
    private bodyEl!: HTMLElement;
    private outputEl!: HTMLElement;
    private toggleIcon!: HTMLElement;
    private outputPre: HTMLElement | null = null;
    private state: ViewState = 'collapsed';  // 默认折叠
    private _hasManyLines = false;          // 输出是否超过5行

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

        // ── 头部（可点击切换三种状态） ──
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

        // 状态切换图标
        this.toggleIcon = this.headerEl.createSpan({ cls: 'pi-chat-tool-toggle' });
        setIcon(this.toggleIcon, 'chevron-down');

        // ── 主体（参数详情 + 输出） ──
        this.bodyEl = this.cardEl.createDiv({ cls: 'pi-chat-tool-body' });

        // 参数详情
        const argsDetail = this.bodyEl.createDiv({ cls: 'pi-chat-tool-args-detail' });
        const argsPre = argsDetail.createEl('pre');
        argsPre.setText(JSON.stringify(this.args, null, 2));

        // 输出区域
        this.outputEl = this.bodyEl.createDiv({ cls: 'pi-chat-tool-output' });

        // 点击头部切换状态
        this.headerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.cycleState();
        });

        // 初始状态：限制模式
        this.applyState();
    }

    // ── 格式化参数为一行摘要 ──────────────────
    private formatArgsSummary(): string {
        if (!this.args) return '';

        if (this.toolName === 'bash' && this.args.command) {
            return `▸ ${this.args.command}`;
        }
        if (this.args.path) {
            return `▸ ${this.args.path}`;
        }
        if (this.args.file) {
            return `▸ ${this.args.file}`;
        }
        const values = Object.values(this.args).filter(v => typeof v === 'string');
        if (values.length > 0) {
            const val = values[0] as string;
            const truncated = val.length > 60 ? val.slice(0, 60) + '…' : val;
            return `▸ ${truncated}`;
        }
        return '';
    }

    // ── 循环切换状态 ──────────────────────────
    // 超过5行时: collapsed → limited → expanded → collapsed
    // 不超过5行时: collapsed → expanded → collapsed
    private cycleState(): void {
        const next: Record<ViewState, ViewState> = {
            collapsed: this._hasManyLines ? 'limited' : 'expanded',
            limited: 'expanded',
            expanded: 'collapsed',
        };
        this.state = next[this.state];
        this.applyState();
    }

    // ── 应用当前状态到 UI ──────────────────────
    private applyState(): void {
        // 清除所有状态类
        this.cardEl.removeClass('pi-tool-collapsed');
        this.cardEl.removeClass('pi-tool-limited');
        this.cardEl.removeClass('pi-tool-expanded');
        this.bodyEl.removeClass('pi-tool-body-collapsed');
        this.bodyEl.removeClass('pi-tool-body-limited');
        this.bodyEl.removeClass('pi-tool-body-expanded');
        this.outputEl.removeClass('pi-tool-output-limited');

        // 更新图标（指向切换后的方向）
        const iconMap: Record<ViewState, string> = {
            collapsed: 'chevron-right',   // 点击后展开
            limited: 'chevron-down',      // 点击后展开更多
            expanded: 'chevron-up',       // 点击后收起
        };
        this.toggleIcon.empty();
        setIcon(this.toggleIcon, iconMap[this.state]);

        // 设置 title
        this.headerEl.title = STATE_LABEL[this.state];

        switch (this.state) {
            case 'collapsed':
                this.cardEl.addClass('pi-tool-collapsed');
                this.bodyEl.addClass('pi-tool-body-collapsed');
                break;
            case 'limited':
                this.cardEl.addClass('pi-tool-limited');
                this.bodyEl.addClass('pi-tool-body-limited');
                this.outputEl.addClass('pi-tool-output-limited');
                break;
            case 'expanded':
                this.cardEl.addClass('pi-tool-expanded');
                this.bodyEl.addClass('pi-tool-body-expanded');
                break;
        }
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
        if (!this.outputPre) {
            this.outputPre = this.outputEl.createEl('pre');
        }
        this.outputPre.setText(text);

        // 检查行数：超过5行才启用限制态
        this._hasManyLines = (text.match(/\n/g) || []).length >= 5;

        // 有输出时至少切换到限制模式（如果当前是收起态）
        if (this.state === 'collapsed') {
            this.state = this._hasManyLines ? 'limited' : 'expanded';
            this.applyState();
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

        // 显示结果
        if (result) {
            const text = this.extractResultText(result);
            if (text) {
                this.setOutput(text);
            }
        }
    }

    // ── 从 result 对象里提取纯文本 ────────────
    private extractResultText(result: any): string {
        if (result.content && Array.isArray(result.content)) {
            return result.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text || '')
                .join('\n');
        }
        if (typeof result === 'string') return result;
        if (result.text) return result.text;
        return '';
    }
}
