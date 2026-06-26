// 系统消息渲染器
// 在消息流中插入一条系统通知（带图标 + 标题 + body），
// 用于压缩状态、统计、reload 结果等非对话内容。
import { setIcon } from 'obsidian';

export class SystemMessageRenderer {
    constructor(
        private messagesEl: HTMLElement,
        // 视图回调：插入系统消息前移除欢迎页（如果存在）
        private onBeforeInsert: () => void,
    ) {}

    // ── 添加一条系统消息 ──────────────────────
    // 返回创建的消息根元素，供调用方后续更新（如压缩状态变化）
    add(icon: string, title: string, bodyFn: (el: HTMLElement) => void): HTMLElement {
        this.onBeforeInsert();
        const msgEl = this.messagesEl.createDiv({ cls: 'pi-msg-system' });
        // 头部（和思考块头部样式一致）
        const header = msgEl.createDiv({ cls: 'pi-msg-system-header' });
        const iconEl = header.createSpan({ cls: 'pi-msg-system-icon' });
        setIcon(iconEl, icon);
        header.createSpan({ cls: 'pi-msg-system-title', text: title });
        // 主体（和思考块主体样式一致）
        const body = msgEl.createDiv({ cls: 'pi-msg-system-body' });
        bodyFn(body);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        return msgEl;
    }
}
