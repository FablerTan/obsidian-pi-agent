// 导入 Obsidian 的 ItemView 基类
// ItemView: 可以在 Obsidian 工作区中创建自定义面板
// WorkspaceLeaf: 每个视图都挂在一个"叶子"上
import { ItemView, WorkspaceLeaf } from 'obsidian';

// 视图的唯一标识符，用来注册和查找这个视图
export const PI_CHAT_VIEW_TYPE = 'pi-chat-view';

export class PiChatView extends ItemView {
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
        contentEl.setText('Pi Chat 面板已加载');
    }

    // 面板被关闭时调用，清理资源
    async onClose(): Promise<void> {
        // 暂时什么都不做
    }
}
