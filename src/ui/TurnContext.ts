// 当前回合的渲染上下文（流式专用）
// 一次 AI 回合（agent_start → agent_end）的薄适配器：
//   持有一个 AssistantMessageView，把流式 delta 委托给它，
//   并在内容到达时耦合 hideLoading（回放路径无需此行为）。
//
// 回合结束整体丢弃；下一回合重新创建。
import type { App } from 'obsidian';
import type { PiChatView } from './PiChatView';
import { AssistantMessageView } from './AssistantMessageView';
import type { Content, ContentBlock } from '../pi/types';

export class TurnContext {
    // 本回合的助手消息视图（lazy 创建，防御事件早于 agent_start）
    private messageView: AssistantMessageView | null = null;

    constructor(
        private messagesEl: HTMLElement,
        private app: App,
        private view: PiChatView,
    ) {}

    // ── 获取或创建本回合的助手消息视图 ─────────
    private getOrCreateView(): AssistantMessageView {
        if (!this.messageView) {
            this.messageView = new AssistantMessageView(
                this.messagesEl,
                this.app,
                this.view,
                { onActivity: () => this.view.hideLoading() },
            );
        }
        return this.messageView;
    }

    // ── 流式文本 ──────────────────────────────
    appendText(delta: string): void {
        this.getOrCreateView().appendText(delta);
    }

    ensureTextContainer(): void {
        this.getOrCreateView().ensureTextContainer();
    }

    // ── 思考链 ────────────────────────────────
    startThinking(): void { this.getOrCreateView().startThinking(); }
    appendThinking(delta: string): void { this.getOrCreateView().appendThinking(delta); }
    endThinking(): void { this.getOrCreateView().endThinking(); }

    // ── 工具调用 ──────────────────────────────
    addToolCall(toolCallId: string, toolName: string, args: Record<string, unknown>): void {
        this.getOrCreateView().addToolCall(toolCallId, toolName, args);
    }

    updateToolCall(toolCallId: string, partialContent: Content | ContentBlock[] | null | undefined): void {
        this.getOrCreateView().updateToolCall(toolCallId, partialContent);
    }

    endToolCall(toolCallId: string, result: { content: ContentBlock[]; details?: unknown }, isError: boolean): void {
        this.getOrCreateView().endToolCall(toolCallId, result, isError);
    }
}
