// /reload 服务 + 命令加载 + 扩展发现
// 从 PiChatView 抽离的整片 reload 业务逻辑：
//   loadCommands / handleReload / 成功渲染 / 缓存回退 / 分组渲染
//   buildScanDirs / buildExtensionInfo（磁盘扫描 + get_commands 交叉验证）
//
// 持有 reload 对比基准状态（previousCmdNames / previousCmdList / lastRawCommands），
// 视图不再关心这些细节。
import * as os from 'os';
import * as path from 'path';
import { Notice } from 'obsidian';
import type { PiRpcClient } from '../pi/rpc-client';
import type { CommandInfo, GetCommandsData } from '../pi/types';
import type { CommandMenu } from './CommandMenu';
import type { SystemMessageRenderer } from './SystemMessageRenderer';
import { discoverExtensions, ExtensionInfo } from '../utils/extension-loader';
import { groupCommandsBySource, sourceLabel } from './command-groups';
import type { PiChatSettings } from '../settings';

// 内置命令（插件自身提供的伪命令，注入到命令菜单中）
const BUILTIN_COMMANDS = [
    { name: 'new', description: '新建会话', source: 'extension' as const },
    { name: 'reload', description: '重新加载扩展', source: 'extension' as const },
    { name: 'history', description: '历史会话', source: 'extension' as const },
    { name: 'compact', description: '压缩会话上下文', source: 'extension' as const },
    { name: 'stats', description: '查看 Token 用量统计', source: 'extension' as const },
];

// source → 中文标签 / 分组顺序 提到 command-groups.ts 共用
// （此处仅保留 BUILTIN_COMMANDS）

export class ReloadService {
    // 上一次加载的命令名集合（用于 reload 对比新增/移除）
    private previousCmdNames: Set<string> = new Set();
    // 上一次加载的完整命令数据（含 source），用于回退显示
    private previousCmdList: { name: string; source: string }[] = [];
    // 上一次 get_commands 返回的原始命令数组（含 path），用于扩展发现
    private lastRawCommands: CommandInfo[] = [];

    constructor(
        private piClient: PiRpcClient,
        private commandMenu: CommandMenu,
        private systemMsg: SystemMessageRenderer,
        private vaultPath: string,
        private settings: PiChatSettings,
    ) {}

    // ── 暴露给 WelcomePage 的扩展发现 ──────────
    getExtensionInfo(): ExtensionInfo[] {
        return discoverExtensions(this.lastRawCommands, this.buildScanDirs());
    }

    // ── 从 Pi 加载可用命令列表 ────────────────
    async loadCommands(): Promise<void> {
        try {
            const resp = await this.piClient.sendAndWait<GetCommandsData>({ type: 'get_commands' });
            if (resp?.success && resp.data?.commands) {
                const cmds = resp.data.commands;
                this.commandMenu.setCommands([...BUILTIN_COMMANDS, ...cmds]);
                this.previousCmdNames = new Set(cmds.map(c => c.name));
                this.previousCmdList = cmds.map(c => ({ name: c.name, source: c.source || 'other' }));
                this.lastRawCommands = cmds;
            }
        } catch { /* pi 还未就绪，忽略 */ }
    }

    // ── 处理 /reload ──────────────────────────
    // 返回值供调用方同步阶段状态机（phase）
    async run(): Promise<void> {
        // 在进入 async 流程前锁定对比基准（局部常量，不受后续副作用影响）
        const oldNames = this.previousCmdNames.size > 0
            ? new Set(this.previousCmdNames)
            : await this.fetchCurrentCmdNames();
        const oldCmdList = this.previousCmdList;

        new Notice('正在重载 Pi…');
        await this.piClient.restart();

        // 持续轮询直到 get_commands 成功（最长约 10 秒，每 800ms 一次）
        let cmds: CommandInfo[] | null = null;
        for (let attempt = 0; attempt < 12; attempt++) {
            if (attempt > 0) {
                await new Promise(r => window.setTimeout(r, 800));
            }
            const resp = await this.piClient.sendAndWait<GetCommandsData>({ type: 'get_commands' });
            if (resp?.success && resp.data?.commands) {
                cmds = resp.data.commands;
                break;
            }
        }
        if (cmds) {
            this.handleReloadSuccess(cmds, oldNames);
        } else {
            // 失败回退：显示缓存数据
            this.handleReloadFallback(oldCmdList, oldNames);
        }
    }

    // ── /reload 成功：渲染命令列表 + 对比新增/移除 ──
    private handleReloadSuccess(cmds: CommandInfo[], oldNames: Set<string>): void {
        this.commandMenu.setCommands([...BUILTIN_COMMANDS, ...cmds]);

        // 扩展发现（磁盘扫描 + commands 交叉引用）
        const extInfo = this.getExtensionInfo();

        // 按 source 分组（排除 extension，扩展用磁盘扫描结果展示）
        const groups = groupCommandsBySource<CommandInfo>(cmds, { exclude: ['extension'] });
        const newNames = new Set(cmds.map(c => c.name));
        const removedNames = new Set<string>();
        for (const old of oldNames) {
            if (!newNames.has(old)) removedNames.add(old);
        }

        this.systemMsg.add('refresh-cw', 'Pi 已重载', (el) => {
            // ── 扩展：用磁盘扫描结果展示（含无命令的扩展） ──
            if (extInfo.length > 0) {
                const extSection = el.createDiv({ cls: 'pi-reload-section' });
                extSection.createSpan({ cls: 'pi-reload-label', text: '扩展' });
                extSection.createSpan({ cls: 'pi-reload-count', text: String(extInfo.length) });
                const itemsWrap = el.createDiv({ cls: 'pi-reload-items' });
                for (const e of extInfo) {
                    const itemEl = itemsWrap.createSpan({ cls: 'pi-reload-item' });
                    itemEl.setText(e.name);
                    if (!e.confirmed) itemEl.addClass('pi-reload-item-unconfirmed');
                }
            }

            // ── 其他分组（prompts、skills 等） ──
            for (const { key, items } of groups) {
                this.renderReloadGroup(el, sourceLabel(key), items, oldNames, removedNames);
            }
            if (removedNames.size > 0) {
                const section = el.createDiv({ cls: 'pi-reload-section pi-reload-section-removed' });
                section.createSpan({ cls: 'pi-reload-label', text: '已移除' });
                section.createSpan({ cls: 'pi-reload-count', text: String(removedNames.size) });
                const itemsWrap = el.createDiv({ cls: 'pi-reload-items' });
                for (const n of removedNames) {
                    const itemEl = itemsWrap.createSpan({ cls: 'pi-reload-item pi-reload-item-removed' });
                    itemEl.setText(n);
                }
            }
            if (removedNames.size === 0 && ![...newNames].some(n => !oldNames.has(n))) {
                el.createDiv({ cls: 'pi-reload-note', text: '无变化' });
            }
        });

        // 保存新数据供下次对比
        this.previousCmdNames = new Set(cmds.map(c => c.name));
        this.previousCmdList = cmds.map(c => ({ name: c.name, source: c.source || 'other' }));
        this.lastRawCommands = cmds;
    }

    // ── /reload 失败回退：显示缓存数据 ──
    private handleReloadFallback(
        oldCmdList: { name: string; source: string }[],
        oldNames: Set<string>,
    ): void {
        if (oldCmdList.length > 0) {
            this.systemMsg.add('refresh-cw', 'Pi 已重载（命令列表未更新）', (el) => {
                this.renderReloadFromCache(el, oldCmdList, oldNames);
            });
        } else {
            this.systemMsg.add('refresh-cw', 'Pi 已重载', (el) => {
                el.createDiv({ cls: 'pi-reload-note', text: '未能获取命令列表，请检查 pi 是否正常运行' });
            });
        }
    }

    // ── 从当前 pi 进程获取命令列表作为对比基准 ──
    private async fetchCurrentCmdNames(): Promise<Set<string>> {
        try {
            const resp = await this.piClient.sendAndWait<GetCommandsData>({ type: 'get_commands' });
            if (resp?.success && resp.data?.commands) {
                return new Set(resp.data.commands.map(c => c.name));
            }
        } catch { }
        return new Set<string>();
    }

    // ── 用缓存数据渲染 reload 消息（get_commands 失败时回退） ──
    private renderReloadFromCache(
        el: HTMLElement,
        cmds: { name: string; source: string }[],
        oldNames: Set<string>,
    ): void {
        const groups = groupCommandsBySource<{ name: string; source: string }>(cmds as CommandInfo[], {});
        const emptyRemoved = new Set<string>();
        for (const { key, items } of groups) {
            this.renderReloadGroup(el, sourceLabel(key), items, oldNames, emptyRemoved);
        }
        el.createDiv({ cls: 'pi-reload-note', text: '↑ 命令列表未刷新，显示上次加载的内容' });
    }

    // ── 渲染 reload 分组 ──────────────────────
    private renderReloadGroup(
        el: HTMLElement,
        label: string,
        items: { name: string }[],
        oldNames: Set<string>,
        removedNames: Set<string>,
    ): void {
        const section = el.createDiv({ cls: 'pi-reload-section' });
        section.createSpan({ cls: 'pi-reload-label', text: label });
        section.createSpan({ cls: 'pi-reload-count', text: String(items.length) });
        const itemsWrap = el.createDiv({ cls: 'pi-reload-items' });
        for (const item of items) {
            const isNew = !oldNames.has(item.name);
            const isRemoved = removedNames.has(item.name);
            const itemEl = itemsWrap.createSpan({ cls: 'pi-reload-item' });
            itemEl.setText(item.name);
            if (isNew) {
                itemEl.addClass('pi-reload-item-new');
                removedNames.delete(item.name);
            }
            if (isRemoved) {
                itemEl.addClass('pi-reload-item-removed');
            }
        }
    }

    // ── 构建扩展扫描目录列表 ──
    // 匹配 pi 的扩展搜索目录：全局 ~/.pi/agent/extensions + 项目 .pi/extensions + 配置路径
    private buildScanDirs(): string[] {
        const dirs: string[] = [
            path.join(os.homedir(), '.pi', 'agent', 'extensions'),   // 全局
            path.join(this.vaultPath, '.pi', 'extensions'),           // 项目默认
        ];
        const extra = this.settings.extensionPaths;
        if (extra) {
            for (const p of extra.split(',')) {
                const trimmed = p.trim();
                if (trimmed) dirs.push(path.resolve(this.vaultPath, trimmed));
            }
        }
        return dirs;
    }
}
