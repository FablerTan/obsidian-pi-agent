// 设置接口、默认值和设置页面
import { App, PluginSettingTab, Setting } from 'obsidian';
import PiChatPlugin from './main';

export interface PiChatSettings {
	piPath: string;
}

export const DEFAULT_SETTINGS: PiChatSettings = {
	piPath: '/opt/homebrew/bin/pi',
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
			.setDesc('pi 命令的完整路径。修改后需要重启 Obsidian 或重新加载插件。')
			.addText((text) =>
				text
					.setPlaceholder('/opt/homebrew/bin/pi')
					.setValue(this.plugin.settings.piPath)
					.onChange(async (value) => {
						this.plugin.settings.piPath = value || '/opt/homebrew/bin/pi';
						await this.plugin.saveSettings();
						this.plugin.updatePiPath();
					}),
			);
	}
}
