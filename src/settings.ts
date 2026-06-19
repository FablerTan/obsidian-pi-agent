// 设置接口、默认值和设置页面
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import PiChatPlugin from './main';
import { detectPiPath } from './utils/detect-pi';
import { readCompactionSettings, writeCompactionSettings } from './utils/pi-settings';

export interface PiChatSettings {
	piPath: string;
	autoCompaction: boolean;
	compactionMode: 'token' | 'percent';
	compactionPercent: number;
}

export const DEFAULT_SETTINGS: PiChatSettings = {
	piPath: '/opt/homebrew/bin/pi',
	autoCompaction: true,
	compactionMode: 'token',
	compactionPercent: 80,
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

		// ── 自动压缩开关 + 阈值 ──
		const compactionSetting = new Setting(containerEl)
			.setName('自动压缩')
			.setDesc('上下文接近上限时自动压缩，释放 token 空间。')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoCompaction)
					.onChange(async (value) => {
						this.plugin.settings.autoCompaction = value;
						await this.plugin.saveSettings();
						this.plugin.applyAutoCompaction();
						this.display(); // 刷新显示/隐藏阈值区域
					}),
			);

		// 只有开启自动压缩时才显示阈值设置
		if (this.plugin.settings.autoCompaction) {
			containerEl.createEl('h3', { text: '压缩阈值' });

			// ── 触发方式切换 ──
			new Setting(containerEl)
				.setName('触发方式')
				.setDesc('选择使用固定 Token 数还是上下文百分比触发压缩。')
				.addDropdown((dropdown) =>
					dropdown
						.addOption('token', 'Token 数')
						.addOption('percent', '百分比')
						.setValue(this.plugin.settings.compactionMode)
						.onChange(async (value) => {
							this.plugin.settings.compactionMode = value as 'token' | 'percent';
							await this.plugin.saveSettings();
							this.saveCompactionThresholds();
							this.display();
						}),
				);

			if (this.plugin.settings.compactionMode === 'token') {
				// Token 模式
				new Setting(containerEl)
					.setName('预留 Token (reserveTokens)')
					.setDesc('为 LLM 回复预留的 token 数。上下文窗口 − 预留值 = 触发压缩的阈值。默认 16384。')
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
			} else {
				// 百分比模式
				new Setting(containerEl)
					.setName('触发百分比')
					.setDesc('上下文用到百分之多少时触发压缩。例如 80% = 上下文用到 80% 时开始压缩。')
					.addSlider((slider) =>
						slider
							.setLimits(10, 95, 5)
							.setValue(this.plugin.settings.compactionPercent)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.compactionPercent = value;
								await this.plugin.saveSettings();
								this.saveCompactionThresholds();
							}),
					);
			}

			// 两种模式都显示保留 Token
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

	// ── 按当前模式计算并写入 pi 的 settings.json ──
	private saveCompactionThresholds(): void {
		const s = this.plugin.settings;
		if (s.compactionMode === 'percent') {
			// 百分比 → 推算 reserveTokens（按默认 200K 上下文窗口估算）
			const defaultWindow = 200000;
			const pct = s.compactionPercent / 100;
			// trigger: contextTokens > contextWindow - reserveTokens
			// want: contextTokens = contextWindow * pct
			// => contextWindow * pct > contextWindow - reserveTokens
			// => reserveTokens > contextWindow * (1 - pct)
			this.compactionThresholds.reserveTokens = Math.round(defaultWindow * (1 - pct));
		}
		writeCompactionSettings(this.compactionThresholds);
	}
}
