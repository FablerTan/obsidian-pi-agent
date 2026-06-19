// 设置接口、默认值和设置页面
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import PiChatPlugin from './main';
import { detectPiPath } from './utils/detect-pi';
import { readCompactionSettings, writeCompactionSettings } from './utils/pi-settings';

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

	// 当前显示的值（从 pi settings.json 读取，不存插件设置）
	private compactionThresholds = readCompactionSettings();

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Pi Agent 设置' });

		// ── Pi 路径 ──
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
							this.display();
							new Notice(`已检测到 pi: ${found}`);
						} else {
							new Notice('未找到 pi，请手动输入路径');
						}
					}),
			);

		// ── 自动压缩开关 ──
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

		// ── 压缩阈值（直接写入 pi 的 settings.json） ──
		containerEl.createEl('h3', { text: '压缩阈值' });

		new Setting(containerEl)
			.setName('预留 Token (reserveTokens)')
			.setDesc('为 LLM 回复预留的 token 数。上下文窗口 - 预留值 = 触发压缩的阈值。默认 16384。')
			.addText((text) =>
				text
					.setPlaceholder('16384')
					.setValue(String(this.compactionThresholds.reserveTokens))
					.onChange((value) => {
						const num = parseInt(value, 10);
						if (isNaN(num) || num < 0) return;
						this.compactionThresholds.reserveTokens = num;
						writeCompactionSettings(this.compactionThresholds);
					}),
			);

		new Setting(containerEl)
			.setName('保留 Token (keepRecentTokens)')
			.setDesc('压缩时保留的最近 token 数，不参与摘要。默认 20000。')
			.addText((text) =>
				text
					.setPlaceholder('20000')
					.setValue(String(this.compactionThresholds.keepRecentTokens))
					.onChange((value) => {
						const num = parseInt(value, 10);
						if (isNaN(num) || num < 0) return;
						this.compactionThresholds.keepRecentTokens = num;
						writeCompactionSettings(this.compactionThresholds);
					}),
			);
	}
}
