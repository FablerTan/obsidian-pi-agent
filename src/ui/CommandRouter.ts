// 命令路由器 — 收拢命令菜单的回调分派
// 从 PiChatView 抽离：内置命令（new/reload/history/compact/stats）的分派，
// 非内置命令回填到输入框交给用户。各命令的实际处理委托给回调（视图提供），
// router 自身不持有业务逻辑，只做分派，便于测试和扩展。
import type { CommandItem, CommandMenu } from './CommandMenu';

// 内置命令处理器集合（视图实现并注入）
export interface BuiltinHandlers {
    newSession: () => void;
    reload: () => void;
    history: () => void;
    compact: () => void;
    stats: () => void;
}

export class CommandRouter {
    constructor(
        private commandMenu: CommandMenu,
        private textarea: HTMLTextAreaElement,
        private handlers: BuiltinHandlers,
    ) {}

    // ── 命令菜单回调入口 ──────────────────────
    handle(cmd: CommandItem): void {
        switch (cmd.name) {
            case 'new':     this.handlers.newSession(); break;
            case 'reload':  this.handlers.reload(); break;
            case 'history': this.handlers.history(); break;
            case 'compact': this.handlers.compact(); break;
            case 'stats':   this.handlers.stats(); break;
            default:
                // 非内置命令：回填到输入框，用户补全参数后发送
                this.textarea.value = '/' + cmd.name + ' ';
                this.textarea.focus();
        }
    }
}
