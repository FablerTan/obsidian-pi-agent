// ── 从消息 content 中提取纯文本 ──────────────
// content 可能是字符串 "Hello" 或数组 [{ type: "text", text: "Hello" }, ...]
export function extractTextContent(content: any): string {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text || '')
            .join('\n');
    }
    return '';
}
