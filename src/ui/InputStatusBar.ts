// 输入框底部状态栏：显示当前模型和思考层级
// 点击模型名 → 弹出列表选择模型
// 点击思考层级 → 循环切换
import { setIcon, Notice } from 'obsidian';
import { PiRpcClient } from '../pi/rpc-client';

// 思考层级缩写
const THINKING_LABELS: Record<string, string> = {
    off: 'off',
    minimal: 'min',
    low: 'low',
    medium: 'med',
    high: 'high',
    xhigh: 'xhigh',
};

// 提供商图标
const PROVIDER_ICONS: Record<string, string> = {
    anthropic: 'bot',
    openai: 'bot',
    google: 'globe',
    openrouter: 'globe',
};

export class InputStatusBar {
    private el: HTMLElement;
    private modelBtn: HTMLElement;
    private modelNameEl: HTMLElement;
    private thinkingEl: HTMLElement;
    private dropdownEl: HTMLElement | null = null;
    private state: { modelName: string; thinkingLevel: string } = {
        modelName: '加载中…',
        thinkingLevel: '',
    };

    constructor(
        private container: HTMLElement,      // .pi-chat-container
        private piClient: PiRpcClient,
    ) {
        this.el = container.createDiv({ cls: 'pi-input-status-bar' });

        // ── 模型（点击弹出选择列表） ──
        this.modelBtn = this.el.createSpan({ cls: 'pi-status-btn' });
        const modelIcon = this.modelBtn.createSpan({ cls: 'pi-status-icon' });
        setIcon(modelIcon, 'bot');
        this.modelNameEl = this.modelBtn.createSpan({ cls: 'pi-status-label' });
        this.modelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openModelPicker();
        });

        // 间隔
        this.el.createSpan({ cls: 'pi-status-sep', text: '·' });

        // ── 思考层级（点击循环切换） ──
        const thinkBtn = this.el.createSpan({ cls: 'pi-status-btn' });
        const thinkIcon = thinkBtn.createSpan({ cls: 'pi-status-icon' });
        setIcon(thinkIcon, 'brain');
        this.thinkingEl = thinkBtn.createSpan({ cls: 'pi-status-label' });
        thinkBtn.addEventListener('click', () => this.cycleThinking());

        // 加载初始状态
        this.loadState();

        // 点击下拉外部关闭
        activeDocument.addEventListener('click', (e) => {
            if (this.dropdownEl && !this.dropdownEl.contains(e.target as Node)) {
                this.closeDropdown();
            }
        });
    }

    // ── 加载当前状态 ──────────────────────────
    private async loadState(): Promise<void> {
        try {
            const resp = await this.piClient.sendAndWait({ type: 'get_state' });
            if (resp?.success && resp.data) {
                this.applyState(resp.data);
            }
        } catch { /* pi 未就绪 */ }
    }

    // ── 应用状态到 UI ─────────────────────────
    // data 可能来自 get_state/cycle_model: { model: {...}, thinkingLevel: '...' }
    // 也可能来自 set_model: Model 对象直接 { name: '...', id: '...', ... }
    private applyState(data: any): void {
        const model = data.model || data;
        const modelName = model?.name || model?.id || '未知';
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

    // ── 弹出模型选择列表（悬浮在按钮上方） ─────
    private async openModelPicker(): Promise<void> {
        if (this.dropdownEl) {
            this.closeDropdown();
            return;
        }

        let models: any[] = [];
        try {
            const resp = await this.piClient.sendAndWait({ type: 'get_available_models' });
            if (resp?.success && resp.data?.models) {
                models = resp.data.models;
            }
        } catch {
            new Notice('获取模型列表失败');
            return;
        }

        if (models.length === 0) {
            new Notice('没有可用模型');
            return;
        }

        // 计算按钮位置
        const btnRect = this.modelBtn.getBoundingClientRect();

        // 创建悬浮下拉
        this.dropdownEl = activeDocument.body.createDiv({ cls: 'pi-model-picker' });
        this.dropdownEl.style.position = 'fixed';
        this.dropdownEl.style.left = btnRect.left + 'px';
        this.dropdownEl.style.bottom = (window.innerHeight - btnRect.top) + 'px';
        this.dropdownEl.style.minWidth = Math.max(btnRect.width, 240) + 'px';

        const list = this.dropdownEl.createEl('ul', { cls: 'pi-model-list' });

        for (const model of models) {
            const li = list.createEl('li', { cls: 'pi-model-item' });
            const isCurrent = model.name === this.state.modelName || model.id === this.state.modelName;
            if (isCurrent) li.addClass('pi-model-item-current');

            // 提供商图标
            const iconSpan = li.createSpan({ cls: 'pi-model-icon' });
            setIcon(iconSpan, PROVIDER_ICONS[model.provider] || 'bot');

            // 模型名
            li.createSpan({ cls: 'pi-model-name', text: model.name || model.id });

            // 提供商标签
            li.createSpan({ cls: 'pi-model-provider', text: model.provider });

            // 选中标记
            if (isCurrent) {
                const checkSpan = li.createSpan({ cls: 'pi-model-check' });
                setIcon(checkSpan, 'check');
            }

            li.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectModel(model);
            });
        }

        // 阻止点击下拉内部关闭
        this.dropdownEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // ── 选择模型 ──────────────────────────────
    private async selectModel(model: any): Promise<void> {
        this.closeDropdown();
        try {
            const resp = await this.piClient.sendAndWait({
                type: 'set_model',
                provider: model.provider,
                modelId: model.id,
            });
            if (resp?.success) {
                // set_model 的 data 是 Model 对象直接（不含 thinkingLevel）
                this.state.modelName = resp.data?.name || resp.data?.id || '未知';
                this.render();
                new Notice(`已切换到 ${model.name || model.id}`);
            } else {
                new Notice('切换模型失败: ' + (resp?.error || '未知错误'));
            }
        } catch {
            new Notice('切换模型失败');
        }
    }

    // ── 关闭下拉 ──────────────────────────────
    private closeDropdown(): void {
        if (this.dropdownEl) {
            this.dropdownEl.remove();
            this.dropdownEl = null;
        }
    }

    // ── 循环切换思考层级 ──────────────────────
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
