// 单条助手消息视图 — 流式与历史回放共用的渲染原语
//
// 一条助手消息气泡（.pi-chat-msg-assistant）内含：
//   文本块（Markdown）、思考块（ThinkingBlock）、工具调用卡片（ToolCallMsg）
//
// 两种使用方式共享同一套底层渲染，保证 DOM 结构一致：
//   流式：appendText / startThinking / appendThinking / endThinking /
//         addToolCall / updateToolCall / endToolCall（增量 delta）
//   回放：renderFinal(message) 一次性渲染完整消息 +
//         applyToolResult 填入后续 toolResult 消息
//
// text → thinking → toolCall 的块顺序在 renderFinal 中严格保留：
//   连续 text 块合并为一次 Markdown 渲染，遇到 thinking/toolCall 先 flush 待写文本。
import type { App, Component } from 'obsidian';
import { MarkdownMsg } from './MarkdownMsg';
import { ToolCallMsg } from './ToolCallMsg';
import { ThinkingBlock } from './ThinkingBlock';
import {
    extractText,
    type AssistantMessage,
    type Content,
    type ContentBlock,
} from '../pi/types';

export interface AssistantMessageViewOpts {
    /** 任何内容到达时回调（流式用于隐藏加载动画）；回放不传 */
    onActivity?: () => void;
    /** 工具调用创建时回调（回放用于记录 toolCallId → view 映射，
     *  以便后续 toolResult 消息路由回正确的 view） */
    onToolCall?: (toolCallId: string) => void;
}

export class AssistantMessageView {
    // 本条消息的气泡容器
    private el: HTMLElement;

    // 当前正在流式输出的 markdown（文本块之间复用，遇 thinking/toolCall 重置）
    private markdown: MarkdownMsg | null = null;

    // 当前思考块
    private thinkingBlock: ThinkingBlock | null = null;

    // 本条消息内的工具调用卡片（toolCallId -> ToolCallMsg）
    private toolCalls = new Map<string, ToolCallMsg>();

    constructor(
        private messagesEl: HTMLElement,
        private app: App,
        private component: Component,
        private opts: AssistantMessageViewOpts = {},
    ) {
        this.el = messagesEl.createDiv({ cls: 'pi-chat-msg-assistant' });
    }

    get element(): HTMLElement { return this.el; }

    // ══════════════════════════════════════════════
    //  流式：文本
    // ══════════════════════════════════════════════

    appendText(delta: string): void {
        this.opts.onActivity?.();
        this.ensureTextContainer();
        this.markdown!.append(delta);
        this.scrollDown();
    }

    // 确保 Markdown 文本容器已初始化（text_start / 回放文本块前调用）
    ensureTextContainer(): void {
        if (!this.markdown) {
            const textEl = this.el.createDiv({ cls: 'pi-chat-msg-assistant-text' });
            this.markdown = new MarkdownMsg(this.app, textEl, this.component);
        }
    }

    // ══════════════════════════════════════════════
    //  流式：思考链
    // ══════════════════════════════════════════════

    startThinking(): void {
        this.opts.onActivity?.();
        this.markdown = null;  // 后续文字另起 textEl
        this.thinkingBlock = new ThinkingBlock(this.el);
    }

    appendThinking(delta: string): void {
        if (!this.thinkingBlock) return;
        this.thinkingBlock.append(delta);
        this.thinkingBlock.expand();
        this.scrollDown();
    }

    endThinking(): void {
        if (!this.thinkingBlock) return;
        this.thinkingBlock.finish();
        this.thinkingBlock = null;
    }

    // ══════════════════════════════════════════════
    //  工具调用（流式 + 回放共用）
    // ══════════════════════════════════════════════

    addToolCall(toolCallId: string, toolName: string, args: Record<string, unknown>): void {
        this.opts.onActivity?.();
        this.markdown = null;  // 工具卡片与文本分开
        const wrapper = this.el.createDiv({ cls: 'pi-chat-tool-wrapper' });
        const card = new ToolCallMsg(wrapper, toolName, args);
        this.toolCalls.set(toolCallId, card);
        this.opts.onToolCall?.(toolCallId);
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

    endToolCall(toolCallId: string, result: unknown, isError: boolean): void {
        const card = this.toolCalls.get(toolCallId);
        if (card) {
            card.setResult(result, isError);
            this.toolCalls.delete(toolCallId);
            this.scrollDown();
        }
    }

    // ══════════════════════════════════════════════
    //  回放：从完整 AssistantMessage 一次性渲染
    // ══════════════════════════════════════════════

    renderFinal(message: AssistantMessage): void {
        const content = Array.isArray(message.content) ? message.content : [];
        const pendingText: string[] = [];

        // flush 连续 text 块为一次 Markdown 渲染
        const flushText = () => {
            if (pendingText.length === 0) return;
            this.ensureTextContainer();
            this.markdown!.append(pendingText.join('\n'));
            pendingText.length = 0;
        };

        for (const block of content) {
            if (block.type === 'text') {
                pendingText.push(block.text || '');
            } else if (block.type === 'thinking') {
                flushText();
                this.startThinking();
                this.appendThinking(block.thinking || '');
                this.endThinking();
            } else if (block.type === 'toolCall') {
                flushText();
                this.addToolCall(block.id, block.name, block.arguments);
            }
        }
        flushText();
        this.scrollDown();
    }

    // ── 回放：填入 toolResult 消息 ──────────────
    // 与 endToolCall 同语义（setResult + 移除追踪）
    applyToolResult(toolCallId: string, result: unknown, isError: boolean): void {
        this.endToolCall(toolCallId, result, isError);
    }

    // ── 是否有实际内容（用于回放时跳过空消息） ──
    hasContent(): boolean {
        return this.markdown !== null
            || this.thinkingBlock !== null
            || this.toolCalls.size > 0
            || this.el.querySelector('.pi-chat-msg-assistant-text, .pi-thinking-block, .pi-chat-tool-wrapper') !== null;
    }

    // ── 滚动到底部 ────────────────────────────
    private scrollDown(): void {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
}
