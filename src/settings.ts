// 设置接口、默认值和设置页面
import { App, PluginSettingTab, Setting } from 'obsidian';
import PiChatPlugin from './main';

export interface PiChatSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: PiChatSettings = {
	mySetting: 'default',
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

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder('Enter your secret')
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
