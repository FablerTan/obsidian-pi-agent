// /stats 服务 — 查询会话统计并渲染为系统消息
// 从 PiChatView 抽离的纯查询+渲染逻辑
import { Notice } from 'obsidian';
import type { PiRpcClient } from '../pi/rpc-client';
import type { GetSessionStatsData } from '../pi/types';
import type { SystemMessageRenderer } from './SystemMessageRenderer';

export class StatsService {
    constructor(
        private piClient: PiRpcClient,
        private systemMsg: SystemMessageRenderer,
    ) {}

    // ── 处理 /stats ────────────────────────────
    async run(): Promise<void> {
        try {
            const resp = await this.piClient.getSessionStats();
            if (!resp?.success || !resp?.data) {
                new Notice('获取统计失败');
                return;
            }
            const lines = this.formatStats(resp.data);
            this.systemMsg.add('bar-chart', '会话统计', (el) => {
                el.setText(lines.join('\n'));
            });
        } catch {
            new Notice('获取统计失败');
        }
    }

    // ── 格式化统计为多行文本 ──────────────────
    private formatStats(d: GetSessionStatsData): string[] {
        const tokens = d.tokens || {};
        const cost = d.cost;
        const ctx = d.contextUsage;

        const lines: string[] = [];
        lines.push(`消息: ${d.totalMessages} 条（用户 ${d.userMessages} / 助手 ${d.assistantMessages}）`);
        if (d.toolCalls) lines.push(`工具调用: ${d.toolCalls} 次`);
        lines.push('');
        lines.push(`输入 Token: ${(tokens.input ?? 0).toLocaleString()}`);
        lines.push(`输出 Token: ${(tokens.output ?? 0).toLocaleString()}`);
        if (tokens.cacheRead) lines.push(`缓存读取: ${tokens.cacheRead.toLocaleString()}`);
        if (tokens.cacheWrite) lines.push(`缓存写入: ${tokens.cacheWrite.toLocaleString()}`);
        lines.push(`总计 Token: ${(tokens.total ?? 0).toLocaleString()}`);
        if (cost != null) lines.push(`费用: $${cost.toFixed(4)}`);
        if (ctx) {
            const pct = ctx.percent != null ? `${ctx.percent}%` : '—';
            lines.push('');
            lines.push(`上下文: ${(ctx.tokens ?? 0).toLocaleString()} / ${ctx.contextWindow.toLocaleString()} (${pct})`);
        }
        return lines;
    }
}
