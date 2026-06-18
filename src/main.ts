// 插件入口：生命周期管理、注册面板、启动 pi RPC
import { Notice, Plugin, addIcon, FileSystemAdapter } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	PiChatSettings,
	PiChatSettingTab,
} from './settings';
import { PiChatView, PI_CHAT_VIEW_TYPE } from './ui/PiChatView';
import { PiRpcClient } from './pi/rpc-client';

export default class PiChatPlugin extends Plugin {
	settings!: PiChatSettings;

	// pi RPC 客户端
	piClient!: PiRpcClient;

	async onload() {
		await this.loadSettings();

		// 注册 pi 自定义图标
		addIcon('pi-logo', `<svg viewBox="0 0 800 800">
			<path fill="currentColor" fill-rule="evenodd" d="M165.29 165.29 H517.36 V400 H400 V517.36 H282.65 V634.72 H165.29 Z M282.65 282.65 V400 H400 V282.65 Z"/>
			<path fill="currentColor" d="M517.36 400 H634.72 V634.72 H517.36 Z"/>
		</svg>`);

		// 启动 pi RPC 客户端（后台连接 pi 进程）
		this.piClient = new PiRpcClient();
		const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
		this.piClient.start(vaultPath).catch((err) => {
			new Notice('Pi 启动失败: ' + err.message);
		});

		// 注册聊天面板视图
		this.registerView(
			PI_CHAT_VIEW_TYPE,
			(leaf) => new PiChatView(leaf, this.piClient),
		);

		// 左侧栏图标，点击打开聊天面板
		this.addRibbonIcon('pi-logo', 'Open Pi Agent', () => {
			this.activatePiChatView();
		});

		// 设置页面
		this.addSettingTab(new PiChatSettingTab(this.app, this));
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

		let leaf = workspace.getLeavesOfType(PI_CHAT_VIEW_TYPE).first();

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				rightLeaf.setViewState({ type: PI_CHAT_VIEW_TYPE });
			}
			leaf = rightLeaf ?? undefined;
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<PiChatSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
