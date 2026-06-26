// 当前回合的渲染上下文
// 封装一次 AI 回合（agent_start → agent_end）中累积的 DOM 元素与操作：
//   助手消息气泡、流式 Markdown、思考块、工具调用卡片
//
// 回合结束时整体丢弃，下一回合重新创建。
// 关键：每回合独立新建气泡，不再从 DOM 兜底复用旧气泡，
// 修复 known-issues 中「agent_end 后 getOrCreateAssistantEl 复用旧气泡」bug。
import type { App } from 'obsidian';
import { MarkdownMsg } from './MarkdownMsg';
import { ToolCallMsg } from './ToolCallMsg';
import { ThinkingBlock } from './ThinkingBlock';
import type { PiChatView } from './PiChatView';
import { extractText, type Content, type ContentBlock } from '../pi/types';

export class TurnContext {
    // 本回合的助手消息气泡（文字 + 工具卡片都在这个容器里）
    private assistantEl: HTMLElement | null = null;

    // 当前正在流式输出的 markdown 消息（没有时为空）
    private markdown: MarkdownMsg | null = null;

    // 当前思考块（AI 推理过程）
    private thinkingBlock: ThinkingBlock | null = null;

    // 追踪正在执行的工具调用（toolCallId -> ToolCallMsg）
    private toolCalls = new Map<string, ToolCallMsg>();

    constructor(
        private messagesEl: HTMLElement,
        private app: App,
        private view: PiChatView,
    ) {}

    // ── 获取或创建本回合的助手消息气泡 ─────────
    // 每回合独立，不跨回合复用旧气泡
    getOrCreateAssistantEl(): HTMLElement {
        if (this.assistantEl && this.messagesEl.contains(this.assistantEl)) {
            return this.assistantEl;
        }
        const el = this.messagesEl.createDiv({ cls: 'pi-chat-msg-assistant' });
        this.assistantEl = el;
        return el;
    }

    // ── 追加流式文本 ──────────────────────────
    // 隐藏加载动画 + 确保 Markdown 容器 + 追加文本
    appendText(text: string): void {
        this.view.hideLoading();
        if (!this.markdown) {
            const el = this.getOrCreateAssistantEl();
            const textEl = el.createDiv({ cls: 'pi-chat-msg-assistant-text' });
            this.markdown = new MarkdownMsg(this.app, textEl, this.view);
        }
        this.markdown.append(text);
        this.scrollDown();
    }

    // ── 确保 Markdown 文本容器已初始化 ─────────
    // text_start 时调用，保证后续 text_delta 有容器可写
    ensureTextContainer(): void {
        if (!this.markdown) {
            const el = this.getOrCreateAssistantEl();
            const textEl = el.createDiv({ cls: 'pi-chat-msg-assistant-text' });
            this.markdown = new MarkdownMsg(this.app, textEl, this.view);
        }
    }

    // ── 思考链 ────────────────────────────────
    // 开始思考块：后续文字另起 textEl，不复用之前的 markdown
    startThinking(): void {
        this.view.hideLoading();
        this.markdown = null;  // 后续文字另起 textEl
        this.thinkingBlock = new ThinkingBlock(this.getOrCreateAssistantEl());
    }

    appendThinking(text: string): void {
        if (!this.thinkingBlock) return;
        this.thinkingBlock.append(text);
        this.thinkingBlock.expand();
        this.scrollDown();
    }

    endThinking(): void {
        if (!this.thinkingBlock) return;
        this.thinkingBlock.finish();
        this.thinkingBlock = null;
    }

    // ── 工具调用卡片 ──────────────────────────
    addToolCall(toolCallId: string, toolName: string, args: Record<string, unknown>): void {
        this.view.hideLoading();
        this.markdown = null;  // 工具卡片与文本分开
        const el = this.getOrCreateAssistantEl();
        const toolEl = el.createDiv({ cls: 'pi-chat-tool-wrapper' });
        const card = new ToolCallMsg(toolEl, toolName, args);
        this.toolCalls.set(toolCallId, card);
        this.scrollDown();
    }

    updateToolCall(toolCallId: string, partialContent: Content | ContentBlock[] | null | undefined): void {
        const card = this.toolCalls.get(toolCallId);
        if (card) {
            const text = extractText(partialContent);
            if (text) card.setOutput(text);
            this.scrollDown();
        }
    }

    endToolCall(toolCallId: string, result: { content: ContentBlock[]; details?: unknown }, isError: boolean): void {
        const card = this.toolCalls.get(toolCallId);
        if (card) {
            card.setResult(result, isError);
            this.toolCalls.delete(toolCallId);
            this.scrollDown();
        }
    }

    // ── 滚动到底部 ────────────────────────────
    private scrollDown(): void {
        this.view.scrollMessagesToBottom();
    }
}
