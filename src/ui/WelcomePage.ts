// 欢迎页 — 首次对话前显示上下文文件、扩展/模板/技能列表
import { App, setIcon, FileSystemAdapter } from 'obsidian';
import { PiRpcClient } from '../pi/rpc-client';
import { ExtensionInfo } from '../utils/extension-loader';
import { groupCommandsBySource } from './command-groups';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { GetCommandsData } from '../pi/types';

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
        title.createSpan({ text: 'Pi Agent' });

        // 内容容器
        this.el.createDiv({ cls: 'pi-welcome-sections' });
    }

    // ── 加载数据 ────────────────────────────────
    // extensions: 磁盘扫描 + commands 交叉引用的扩展列表（含无命令的扩展）
    async loadData(extensions?: ExtensionInfo[]): Promise<void> {
        const sectionsEl = this.el?.querySelector('.pi-welcome-sections') as HTMLElement | null;
        if (!sectionsEl) return;

        const [contextFiles, cmdResp] = await Promise.all([
            this.readContextFiles(),
            this.piClient.sendAndWait<GetCommandsData>({ type: 'get_commands' }).catch(() => null),
        ]);

        // Context 文件
        if (contextFiles.length > 0) {
            this.addSection(sectionsEl, 'file-text', 'Context', contextFiles);
        }

        // ── 扩展：用磁盘扫描结果展示（含无命令的扩展） ──
        if (extensions && extensions.length > 0) {
            const extNames = extensions.map(e => e.name);
            this.addSection(sectionsEl, 'puzzle', 'Extensions', extNames);
        }

        // ── 其他分组（prompts、skills 等） ──
        if (cmdResp?.success && cmdResp.data?.commands) {
            const cmds: any[] = cmdResp.data.commands;
            const groups = groupCommandsBySource<{ name: string }>(cmds, { exclude: ['extension'] });

            // source → 图标 / 标签（WelcomePage 用英文标签 + 图标）
            const meta: Record<string, { icon: string; label: string }> = {
                prompt: { icon: 'file-plus', label: 'Prompts' },
                skill: { icon: 'sparkles', label: 'Skills' },
            };
            for (const { key, items } of groups) {
                const m = meta[key] || { icon: 'terminal', label: key };
                this.addSection(sectionsEl, m.icon, m.label, items.map(i => i.name));
            }
        }
    }

    // ── 读取上下文文件 ──────────────────────────
    private async readContextFiles(): Promise<string[]> {
        try {
            const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
            const agentDir = path.join(vaultPath, '.pi', 'agent');
            const files = await fsPromises.readdir(agentDir);
            return files
                .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
                .sort();
        } catch {
            return [];
        }
    }

    // ── 添加区块 ────────────────────────────────
    // 每组最多显示 3 项，超出用「+N more」省略
    private addSection(
        parent: Element, icon: string, title: string, items: string[],
    ): void {
        if (items.length === 0) return;

        const section = parent.createDiv({ cls: 'pi-welcome-section' });
        const titleRow = section.createDiv({ cls: 'pi-welcome-section-title' });
        const iconEl = titleRow.createSpan({ cls: 'pi-welcome-section-icon' });
        setIcon(iconEl, icon);
        titleRow.createSpan({ cls: 'pi-welcome-section-label', text: title });
        const count = titleRow.createSpan({ cls: 'pi-welcome-section-count', text: String(items.length) });

        const list = section.createEl('ul', { cls: 'pi-welcome-list' });
        const shown = items.slice(0, 3);
        for (const item of shown) {
            list.createEl('li', { cls: 'pi-welcome-list-item', text: item });
        }
        if (items.length > 3) {
            const more = list.createEl('li', { cls: 'pi-welcome-list-more' });
            more.setText(`+${items.length - 3} more`);
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
