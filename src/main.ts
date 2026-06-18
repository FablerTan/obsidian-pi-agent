import {
	Editor,
	MarkdownView,
	MarkdownFileInfo,
	Modal,
	Notice,
	Plugin,
	addIcon,
	FileSystemAdapter,
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	MyPluginSettings,
	SampleSettingTab,
} from './settings';
import { PiChatView, PI_CHAT_VIEW_TYPE } from './ui/PiChatView';
import { PiRpcClient } from './pi/rpc-client';

// Remember to rename these classes and interfaces!

export default class MyPlugin extends Plugin {
	settings!: MyPluginSettings;

	// pi RPC 客户端
	piClient!: PiRpcClient;

	async onload() {
		await this.loadSettings();

		// 注册 pi 自定义图标（从 pi.dev 官网获取的 SVG）
		// 后续在聊天面板顶部显示
		addIcon('pi-logo', `<svg viewBox="0 0 800 800">
			<path fill="currentColor" fill-rule="evenodd" d="M165.29 165.29 H517.36 V400 H400 V517.36 H282.65 V634.72 H165.29 Z M282.65 282.65 V400 H400 V282.65 Z"/>
			<path fill="currentColor" d="M517.36 400 H634.72 V634.72 H517.36 Z"/>
		</svg>`);

		// 启动 pi RPC 客户端（后台连接 pi 进程）
		this.piClient = new PiRpcClient();
		// 获取 vault 根目录的实际路径，传给 pi 作为工作目录
		const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
		this.piClient.start(vaultPath).catch((err) => {
			new Notice('Pi 启动失败: ' + err.message);
		});

		// 注册聊天面板视图，把 piClient 传进去
		this.registerView(
			PI_CHAT_VIEW_TYPE,
			(leaf) => new PiChatView(leaf, this.piClient),
		);

		// 在左侧栏添加图标，点击打开聊天面板
		this.addRibbonIcon('message-square', 'Open Pi Chat', () => {
			this.activatePiChatView();
		});

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status bar text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-modal-simple',
			name: 'Open modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			},
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'replace-selected',
			name: 'Replace selected content',
			editorCallback: (
				editor: Editor,
				_ctx: MarkdownView | MarkdownFileInfo,
			) => {
				editor.replaceSelection('Sample editor command');
			},
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-modal-complex',
			name: 'Open modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
				return false;
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(activeDocument, 'click', (_evt: MouseEvent) => {
			new Notice('Click');
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(
			window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000),
		);
	}

	onunload() {
		// 关闭所有打开的聊天面板
		this.app.workspace.detachLeavesOfType(PI_CHAT_VIEW_TYPE);

		// 停止 pi 子进程
		this.piClient?.stop();
	}

	// 打开聊天面板（如果已打开就切换到它）
	activatePiChatView(): void {
		const { workspace } = this.app;

		// 查找是否已经有打开的面板
		let leaf = workspace.getLeavesOfType(PI_CHAT_VIEW_TYPE).first();

		if (!leaf) {
			// 没有就创建一个新的，放在右侧栏
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				rightLeaf.setViewState({ type: PI_CHAT_VIEW_TYPE });
			}
			leaf = rightLeaf ?? undefined;
		}

		// 把焦点切换到该面板
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MyPluginSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
