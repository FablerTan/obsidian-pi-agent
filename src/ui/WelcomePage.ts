// 欢迎页 — 首次对话前显示上下文文件、扩展/模板/技能列表
import { App, setIcon, FileSystemAdapter } from 'obsidian';
import { PiRpcClient } from '../pi/rpc-client';
import * as fs from 'fs';
import * as path from 'path';

export class WelcomePage {
    el!: HTMLElement;

    constructor(
        private messagesEl: HTMLElement,
        private app: App,
        private piClient: PiRpcClient,
    ) {
        this.create();
    }

    // ── 构建 DOM ────────────────────────────────
    private create(): void {
        this.el = this.messagesEl.createDiv({ cls: 'pi-chat-welcome' });

        // 标题
        const title = this.el.createDiv({ cls: 'pi-welcome-title' });
        const logo = title.createSpan({ cls: 'pi-welcome-logo' });
        setIcon(logo, 'pi-logo');
        title.createSpan({ text: 'Pi Chat' });

        // 内容容器
        this.el.createDiv({ cls: 'pi-welcome-sections' });
    }

    // ── 加载数据 ────────────────────────────────
    async loadData(): Promise<void> {
        const sectionsEl = this.el?.querySelector('.pi-welcome-sections') as HTMLElement | null;
        if (!sectionsEl) return;

        const [contextFiles, cmdResp] = await Promise.all([
            this.readContextFiles(),
            this.piClient.sendAndWait({ type: 'get_commands' }).catch(() => null),
        ]);

        // Context 文件
        if (contextFiles.length > 0) {
            this.addSection(sectionsEl, 'file-text', 'Context', contextFiles);
        }

        if (cmdResp?.success && cmdResp.data?.commands) {
            const cmds: any[] = cmdResp.data.commands;
            const groups = new Map<string, { items: string[] }>();
            for (const c of cmds) {
                const src = c.source || 'other';
                if (!groups.has(src)) groups.set(src, { items: [] });
                groups.get(src)!.items.push(c.name);
            }

            const order: Array<{ key: string; icon: string; label: string }> = [
                { key: 'extension', icon: 'puzzle', label: 'Extensions' },
                { key: 'prompt', icon: 'file-plus', label: 'Prompts' },
                { key: 'skill', icon: 'sparkles', label: 'Skills' },
            ];
            for (const { key, icon, label } of order) {
                const g = groups.get(key);
                if (g) {
                    this.addSection(sectionsEl, icon, label, g.items);
                    groups.delete(key);
                }
            }
            for (const [key, g] of groups) {
                this.addSection(sectionsEl, 'terminal', key, g.items);
            }
        }
    }

    // ── 读取上下文文件 ──────────────────────────
    private async readContextFiles(): Promise<string[]> {
        try {
            const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
            const agentDir = path.join(vaultPath, '.pi', 'agent');
            const files = fs.readdirSync(agentDir);
            return files
                .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
                .sort();
        } catch {
            return [];
        }
    }

    // ── 添加区块 ────────────────────────────────
    private addSection(
        parent: Element, icon: string, title: string, items: string[],
    ): void {
        if (items.length === 0) return;

        const section = parent.createDiv({ cls: 'pi-welcome-section' });
        const titleRow = section.createDiv({ cls: 'pi-welcome-section-title' });
        const iconEl = titleRow.createSpan({ cls: 'pi-welcome-section-icon' });
        setIcon(iconEl, icon);
        titleRow.createSpan({ cls: 'pi-welcome-section-label', text: title });

        const list = section.createEl('ul', { cls: 'pi-welcome-list' });
        for (const item of items) {
            list.createEl('li', { cls: 'pi-welcome-list-item', text: item });
        }
    }

    // ── 移除 ─────────────────────────────────────
    remove(): void {
        if (this.el) {
            this.el.remove();
            this.el = null as any;
        }
    }
}
