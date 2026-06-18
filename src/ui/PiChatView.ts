// 导入 Obsidian 的 ItemView 基类
// ItemView: 可以在 Obsidian 工作区中创建自定义面板
// WorkspaceLeaf: 每个视图都挂在一个"叶子"上
import { ItemView, WorkspaceLeaf } from 'obsidian';

// 视图的唯一标识符，用来注册和查找这个视图
export const PI_CHAT_VIEW_TYPE = 'pi-chat-view';

export class PiChatView extends ItemView {
    // 消息列表容器，后续添加消息时要用
    messagesEl!: HTMLDivElement;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    // Obsidian 用这个标识符来识别视图类型
    getViewType(): string {
        return PI_CHAT_VIEW_TYPE;
    }

    // 面板标题，显示在标签栏上
    getDisplayText(): string {
        return 'Pi Chat';
    }

    // 面板被打开时调用，在这里构建 UI
    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        // ── 整个面板用一个容器包裹 ────────────
        const container = contentEl.createDiv({ cls: 'pi-chat-container' });

        // ── 消息列表区域（可滚动） ────────────
        const messagesEl = container.createDiv({ cls: 'pi-chat-messages' });
        messagesEl.createEl('p', {
            text: '开始和 Pi 对话吧！',
            cls: 'pi-chat-welcome',
        });

        // ── 底部输入框 ────────────────────────
        // 只保留 textarea，去掉发送按钮
        const textarea = container.createEl('textarea', {
            cls: 'pi-chat-input',
            placeholder: '输入消息... (Enter 发送, Shift+Enter 换行)',
        });

        // Enter 发送消息，Shift+Enter 换行
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const msg = textarea.value.trim();
                if (!msg) return;
                console.log('send:', msg);
                textarea.value = '';
            }
        });

        // 把元素存到字段上，方便其他地方引用
        this.messagesEl = messagesEl;
    }

    // 面板被关闭时调用，清理资源
    async onClose(): Promise<void> {
        // 暂时什么都不做
    }
}
