// Pi RPC 协议类型定义
// 依据 https://pi.dev/docs/latest/rpc 的 RPC Mode 协议
// 将事件、命令、响应、Extension UI 请求定义为 discriminated union，
// 让消费方的 switch / if 得到 TypeScript narrowing，消除 `any` 误用。

// ══════════════════════════════════════════════
//  基础内容块
// ══════════════════════════════════════════════

export interface TextContent {
    type: 'text';
    text: string;
}

export interface ImageContent {
    type: 'image';
    data: string;        // base64
    mimeType: string;
}

export type ContentBlock = TextContent | ImageContent;

/** content 字段可能是字符串或内容块数组 */
export type Content = string | ContentBlock[];

// ══════════════════════════════════════════════
//  消息类型
// ══════════════════════════════════════════════

export interface UserMessage {
    role: 'user';
    content: Content;
    timestamp?: number;
}

export interface ThinkingContent {
    type: 'thinking';
    thinking: string;
}

export interface ToolCallContent {
    type: 'toolCall';
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

export type AssistantContentBlock = TextContent | ThinkingContent | ToolCallContent;

export interface AssistantMessage {
    role: 'assistant';
    content: AssistantContentBlock[];
    api?: string;
    provider?: string;
    model?: string;
    usage?: {
        input?: number;
        output?: number;
        cacheRead?: number;
        cacheWrite?: number;
        cost?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
    };
    stopReason?: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';
    timestamp?: number;
}

export interface ToolResultMessage {
    role: 'toolResult';
    toolCallId: string;
    toolName?: string;
    content: ContentBlock[];
    isError: boolean;
    timestamp?: number;
}

export interface BashExecutionMessage {
    role: 'bashExecution';
    command: string;
    output: string;
    exitCode: number;
    cancelled: boolean;
    truncated: boolean;
    fullOutputPath: string | null;
    timestamp?: number;
}

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage | BashExecutionMessage;

// ══════════════════════════════════════════════
//  Model
// ══════════════════════════════════════════════

export interface Model {
    id: string;
    name: string;
    api: string;
    provider: string;
    baseUrl?: string;
    reasoning?: boolean;
    input?: string[];
    contextWindow: number;
    maxTokens?: number;
    cost?: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
    };
}

// ══════════════════════════════════════════════
//  流式 delta（message_update.assistantMessageEvent）
// ══════════════════════════════════════════════

export interface AssistantMessageEventBase {
    contentIndex?: number;
    partial?: unknown;
}

export interface StartDelta extends AssistantMessageEventBase { type: 'start'; }
export interface TextStartDelta extends AssistantMessageEventBase { type: 'text_start'; }
export interface TextDelta extends AssistantMessageEventBase { type: 'text_delta'; delta: string; }
export interface TextEndDelta extends AssistantMessageEventBase { type: 'text_end'; content: string; }
export interface ThinkingStartDelta extends AssistantMessageEventBase { type: 'thinking_start'; }
export interface ThinkingDelta extends AssistantMessageEventBase { type: 'thinking_delta'; delta: string; }
export interface ThinkingEndDelta extends AssistantMessageEventBase { type: 'thinking_end'; }
export interface ToolCallStartDelta extends AssistantMessageEventBase { type: 'toolcall_start'; }
export interface ToolCallDelta extends AssistantMessageEventBase { type: 'toolcall_delta'; delta: string; }
export interface ToolCallEndDelta extends AssistantMessageEventBase { type: 'toolcall_end'; toolCall: ToolCallContent; }
export interface DoneDelta extends AssistantMessageEventBase { type: 'done'; reason: 'stop' | 'length' | 'toolUse'; }
export interface ErrorDelta extends AssistantMessageEventBase { type: 'error'; reason: 'aborted' | 'error'; }

export type AssistantMessageEvent =
    | StartDelta
    | TextStartDelta
    | TextDelta
    | TextEndDelta
    | ThinkingStartDelta
    | ThinkingDelta
    | ThinkingEndDelta
    | ToolCallStartDelta
    | ToolCallDelta
    | ToolCallEndDelta
    | DoneDelta
    | ErrorDelta;

// ══════════════════════════════════════════════
//  事件（pi → 客户端）
// ══════════════════════════════════════════════

export interface AgentStartEvent { type: 'agent_start'; }
export interface AgentEndEvent { type: 'agent_end'; messages: AgentMessage[]; }
export interface TurnStartEvent { type: 'turn_start'; }
export interface TurnEndEvent { type: 'turn_end'; message: AssistantMessage; toolResults: ToolResultMessage[]; }
export interface MessageStartEvent { type: 'message_start'; message: AgentMessage; }
export interface MessageEndEvent { type: 'message_end'; message: AgentMessage; }
export interface MessageUpdateEvent {
    type: 'message_update';
    message: AssistantMessage;
    assistantMessageEvent: AssistantMessageEvent;
}
export interface ToolExecutionStartEvent {
    type: 'tool_execution_start';
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
}
export interface ToolExecutionUpdateEvent {
    type: 'tool_execution_update';
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    partialResult: { content: ContentBlock[]; details?: unknown };
}
export interface ToolExecutionEndEvent {
    type: 'tool_execution_end';
    toolCallId: string;
    toolName: string;
    result: { content: ContentBlock[]; details?: unknown };
    isError: boolean;
}
export interface QueueUpdateEvent {
    type: 'queue_update';
    steering: string[];
    followUp: string[];
}
export interface CompactionStartEvent {
    type: 'compaction_start';
    reason: 'manual' | 'threshold' | 'overflow';
}
export interface CompactionResult {
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
    estimatedTokensAfter: number;
    details?: unknown;
}
export interface CompactionEndEvent {
    type: 'compaction_end';
    reason: 'manual' | 'threshold' | 'overflow';
    result: CompactionResult | null;
    aborted: boolean;
    willRetry: boolean;
    errorMessage?: string;
}
export interface AutoRetryStartEvent {
    type: 'auto_retry_start';
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    errorMessage: string;
}
export interface AutoRetryEndEvent {
    type: 'auto_retry_end';
    success: boolean;
    attempt: number;
    finalError?: string;
}
export interface ExtensionErrorEvent {
    type: 'extension_error';
    extensionPath: string;
    event: string;
    error: string;
}
// error 事件：pi 顶层错误（非 message_update.error 子类型）
export interface ErrorEvent {
    type: 'error';
    message?: string;
    [k: string]: unknown;
}
// extension_ui_request：见下方 ExtensionUiRequest 联合（各方法对应不同字段）

export type PiEvent =
    | AgentStartEvent
    | AgentEndEvent
    | TurnStartEvent
    | TurnEndEvent
    | MessageStartEvent
    | MessageEndEvent
    | MessageUpdateEvent
    | ToolExecutionStartEvent
    | ToolExecutionUpdateEvent
    | ToolExecutionEndEvent
    | QueueUpdateEvent
    | CompactionStartEvent
    | CompactionEndEvent
    | AutoRetryStartEvent
    | AutoRetryEndEvent
    | ExtensionErrorEvent
    | ErrorEvent
    | ExtensionUiRequest;

// ══════════════════════════════════════════════
//  响应（命令回执）
// ══════════════════════════════════════════════

export interface PiResponse<T = unknown> {
    type: 'response';
    id?: string;
    command: string;
    success: boolean;
    error?: string;
    data?: T;
}

// 几个常用响应的 data 形状
export interface GetStateData {
    model: Model | null;
    thinkingLevel: string;
    isStreaming: boolean;
    isCompacting: boolean;
    steeringMode: 'all' | 'one-at-a-time';
    followUpMode: 'all' | 'one-at-a-time';
    sessionFile: string;
    sessionId: string;
    sessionName?: string;
    autoCompactionEnabled: boolean;
    messageCount: number;
    pendingMessageCount: number;
}

export interface CommandInfo {
    name: string;
    description?: string;
    source: 'extension' | 'prompt' | 'skill' | (string & {});
    location?: 'user' | 'project' | 'path';
    path?: string;
}

export interface GetCommandsData {
    commands: CommandInfo[];
}

export interface GetAvailableModelsData {
    models: Model[];
}

export interface CycleThinkingLevelData {
    level: string;
}

export interface SwitchSessionData {
    cancelled: boolean;
}

export interface GetMessagesData {
    messages: AgentMessage[];
}

export interface NewSessionData {
    cancelled: boolean;
}

export interface SessionStatsTokens {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
}

export interface SessionStatsContextUsage {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
}

export interface GetSessionStatsData {
    sessionFile: string;
    sessionId: string;
    userMessages: number;
    assistantMessages: number;
    toolCalls: number;
    toolResults: number;
    totalMessages: number;
    tokens: SessionStatsTokens;
    cost?: number;
    contextUsage?: SessionStatsContextUsage;
}

// ══════════════════════════════════════════════
//  Extension UI 协议
// ══════════════════════════════════════════════

export type ExtensionUiMethod =
    | 'select'
    | 'confirm'
    | 'input'
    | 'editor'
    | 'notify'
    | 'setStatus'
    | 'setWidget'
    | 'setTitle'
    | 'set_editor_text';

// 对话型（需 response）
export interface SelectRequest { type: 'extension_ui_request'; id: string; method: 'select'; title?: string; options: string[]; timeout?: number; }
export interface ConfirmRequest { type: 'extension_ui_request'; id: string; method: 'confirm'; title?: string; message?: string; timeout?: number; }
export interface InputRequest { type: 'extension_ui_request'; id: string; method: 'input'; title?: string; placeholder?: string; }
export interface EditorRequest { type: 'extension_ui_request'; id: string; method: 'editor'; title?: string; prefill?: string; }
// 广播型（无需 response）
export interface NotifyRequest { type: 'extension_ui_request'; id: string; method: 'notify'; message: string; notifyType?: 'info' | 'warning' | 'error'; }
export interface SetStatusRequest { type: 'extension_ui_request'; id: string; method: 'setStatus'; statusKey: string; statusText?: string; }
export interface SetWidgetRequest { type: 'extension_ui_request'; id: string; method: 'setWidget'; widgetKey: string; widgetLines?: string[]; widgetPlacement?: 'aboveEditor' | 'belowEditor'; }
export interface SetTitleRequest { type: 'extension_ui_request'; id: string; method: 'setTitle'; title: string; }
export interface SetEditorTextRequest { type: 'extension_ui_request'; id: string; method: 'set_editor_text'; text: string; }

export type ExtensionUiRequest =
    | SelectRequest
    | ConfirmRequest
    | InputRequest
    | EditorRequest
    | NotifyRequest
    | SetStatusRequest
    | SetWidgetRequest
    | SetTitleRequest
    | SetEditorTextRequest;

// ── 辅助：从 content 提取纯文本（替代散落各处的 any 实现） ──
export function extractText(content: Content | ContentBlock[] | undefined | null): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .filter((c): c is TextContent => c?.type === 'text')
            .map((c) => c.text || '')
            .join('\n');
    }
    return '';
}
