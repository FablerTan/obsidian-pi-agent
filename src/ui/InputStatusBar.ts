// 输入框底部状态栏：显示当前模型和思考层级，点击即可切换
import { setIcon, Notice } from 'obsidian';
import { PiRpcClient } from '../pi/rpc-client';

// 思考层级缩写映射
const THINKING_LABELS: Record<string, string> = {
    off: 'off',
    minimal: 'min',
    low: 'low',
    medium: 'med',
    high: 'high',
    xhigh: 'xhigh',
};

export class InputStatusBar {
    private el: HTMLElement;
    private modelNameEl: HTMLElement;
    private thinkingEl: HTMLElement;
    private state: { modelName: string; thinkingLevel: string } = {
        modelName: '加载中…',
        thinkingLevel: '',
    };

    constructor(
        container: HTMLElement,
        private piClient: PiRpcClient,
    ) {
        this.el = container.createDiv({ cls: 'pi-input-status-bar' });

        // ── 模型（点击切换） ──
        const modelBtn = this.el.createSpan({ cls: 'pi-status-btn' });
        const modelIcon = modelBtn.createSpan({ cls: 'pi-status-icon' });
        setIcon(modelIcon, 'bot');
        this.modelNameEl = modelBtn.createSpan({ cls: 'pi-status-label' });
        modelBtn.addEventListener('click', () => this.cycleModel());

        // 间隔
        this.el.createSpan({ cls: 'pi-status-sep', text: '·' });

        // ── 思考层级（点击切换） ──
        const thinkBtn = this.el.createSpan({ cls: 'pi-status-btn' });
        const thinkIcon = thinkBtn.createSpan({ cls: 'pi-status-icon' });
        setIcon(thinkIcon, 'brain');
        this.thinkingEl = thinkBtn.createSpan({ cls: 'pi-status-label' });
        thinkBtn.addEventListener('click', () => this.cycleThinking());

        // 加载初始状态
        this.loadState();
    }

    // ── 加载当前状态 ──────────────────────────
    private async loadState(): Promise<void> {
        try {
            const resp = await this.piClient.sendAndWait({ type: 'get_state' });
            if (resp?.success && resp.data) {
                this.applyState(resp.data);
            }
        } catch {
            // pi 未就绪
        }
    }

    // ── 刷新状态（外部调用） ──────────────────
    async refresh(): Promise<void> {
        await this.loadState();
    }

    // ── 应用状态到 UI ─────────────────────────
    private applyState(data: any): void {
        const modelName = data.model?.name || data.model?.id || '未知';
        const thinkingLevel = data.thinkingLevel || '';
        this.state = { modelName, thinkingLevel };
        this.render();
    }

    // ── 渲染 ──────────────────────────────────
    private render(): void {
        this.modelNameEl.setText(this.state.modelName);
        const label = THINKING_LABELS[this.state.thinkingLevel] || this.state.thinkingLevel;
        this.thinkingEl.setText(label);
    }

    // ── 切换模型 ──────────────────────────────
    private async cycleModel(): Promise<void> {
        try {
            const resp = await this.piClient.sendAndWait({ type: 'cycle_model' });
            if (resp?.success && resp.data) {
                this.applyState(resp.data);
                new Notice(`模型: ${resp.data.model?.name || resp.data.model?.id || ''}`);
            }
        } catch {
            new Notice('切换模型失败');
        }
    }

    // ── 切换思考层级 ──────────────────────────
    private async cycleThinking(): Promise<void> {
        try {
            const resp = await this.piClient.sendAndWait({ type: 'cycle_thinking_level' });
            if (resp?.success && resp.data) {
                this.state.thinkingLevel = resp.data.level;
                this.render();
                const label = THINKING_LABELS[resp.data.level] || resp.data.level;
                new Notice(`思考层级: ${label}`);
            }
        } catch {
            new Notice('切换思考层级失败');
        }
    }
}
