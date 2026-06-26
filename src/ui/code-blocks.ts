// 代码块增强工具
// 为 Markdown 渲染出的 <pre> 代码块加右上角语言标签（点击复制代码）。
// 流式渲染（MarkdownMsg）和历史回放（HistoryPanel）共用同一份实现。
import { Notice } from 'obsidian';

/**
 * 增强容器内所有未增强的代码块：
 *   - 提取 language-xxx 类名作为语言标签
 *   - 右上角加语言标签，点击复制代码内容
 *   - 已增强的（带 data-enhanced）跳过，避免重复
 */
export function enhanceCodeBlocks(container: HTMLElement): void {
    container.querySelectorAll('pre').forEach((pre) => {
        const code = pre.querySelector('code');
        if (!code || pre.hasAttribute('data-enhanced')) return;
        pre.setAttribute('data-enhanced', 'true');

        // 提取语言名
        const classNames = code.className || '';
        const langMatch = classNames.match(/language-(\w+)/);
        const lang = langMatch ? langMatch[1] || '' : 'code';

        // 右上角语言标签，点击复制整个代码块
        const label = activeDocument.createElement('span');
        label.className = 'pi-chat-code-lang';
        label.textContent = lang;
        label.title = '点击复制代码';
        label.addEventListener('click', () => {
            const codeText = code.textContent || '';
            void navigator.clipboard.writeText(codeText).then(() => {
                label.textContent = '已复制 ✓';
                window.setTimeout(() => { label.textContent = lang; }, 2000);
            }).catch(() => {
                new Notice('复制失败');
            });
        });
        pre.appendChild(label);
    });
}
