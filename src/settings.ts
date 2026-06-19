// 设置接口、默认值和设置页面
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import PiChatPlugin from './main';
import { detectPiPath } from './utils/detect-pi';

export interface PiChatSettings {
	piPath: string;
	autoCompaction: boolean;
}

export const DEFAULT_SETTINGS: PiChatSettings = {
	piPath: '/opt/homebrew/bin/pi',
	autoCompaction: true,
};

export class PiChatSettingTab extends PluginSettingTab {
	plugin: PiChatPlugin;

	constructor(app: App, plugin: PiChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Pi Agent 设置' });

		new Setting(containerEl)
			.setName('Pi 可执行文件路径')
			.setDesc('pi 命令的完整路径。修改后会自动重启 pi 进程。')
			.addText((text) =>
				text
					.setPlaceholder('/opt/homebrew/bin/pi')
					.setValue(this.plugin.settings.piPath)
					.onChange(async (value) => {
						this.plugin.settings.piPath = value || '/opt/homebrew/bin/pi';
						await this.plugin.saveSettings();
						this.plugin.updatePiPath();
					}),
			)
			.addExtraButton((btn) =>
				btn
					.setIcon('search')
					.setTooltip('自动检测')
					.onClick(async () => {
						const found = detectPiPath();
						if (found) {
							this.plugin.settings.piPath = found;
							await this.plugin.saveSettings();
							this.plugin.updatePiPath();
							this.display(); // 刷新 UI 显示新值
							new Notice(`已检测到 pi: ${found}`);
						} else {
							new Notice('未找到 pi，请手动输入路径');
						}
					}),
			);

		new Setting(containerEl)
			.setName('自动压缩')
			.setDesc('上下文接近上限时自动压缩，释放 token 空间。')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoCompaction)
					.onChange(async (value) => {
						this.plugin.settings.autoCompaction = value;
						await this.plugin.saveSettings();
						this.plugin.applyAutoCompaction();
					}),
			);
	}
}
