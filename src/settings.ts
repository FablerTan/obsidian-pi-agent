// 设置接口、默认值和设置页面
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import PiChatPlugin from './main';
import { detectPiPath } from './utils/detect-pi';
import { readCompactionSettings, writeCompactionSettings, readResourcePaths, writeResourcePaths, PiCompactionSettings } from './utils/pi-settings';

export interface PiChatSettings {
	piPath: string;
	autoCompaction: boolean;
	compactionMode: 'token' | 'percent';
	compactionPercent: number;
	skillPaths: string;
	promptPaths: string;
	extensionPaths: string;
}

export const DEFAULT_SETTINGS: PiChatSettings = {
	piPath: '/opt/homebrew/bin/pi',
	autoCompaction: true,
	compactionMode: 'token',
	compactionPercent: 80,
	skillPaths: '',
	promptPaths: '',
	extensionPaths: '',
};

export class PiChatSettingTab extends PluginSettingTab {
	plugin: PiChatPlugin;

	constructor(app: App, plugin: PiChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// 项目根目录（空表示尚未初始化）
	private projectPath = '';

	// 压缩阈值（每次 display 时重新读取）
	private compactionThresholds: PiCompactionSettings = { reserveTokens: 16384, keepRecentTokens: 20000 };

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// 获取项目根目录
		if (!this.projectPath) {
			const adapter = this.app.vault.adapter;
			if ('getBasePath' in adapter) {
				this.projectPath = (adapter as any).getBasePath();
			}
		}

		// 重新读取压缩阈值
		this.compactionThresholds = readCompactionSettings(this.projectPath);

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

		// ── 资源路径 ──
		containerEl.createEl('h3', { text: '资源路径' });
		containerEl.createEl('p', {
			text: '配置自定义的技能、模板和扩展路径。路径相对于 ~/.pi/agent，支持绝对路径和 ~。多个路径用逗号分隔。',
			cls: 'pi-settings-desc',
		});

		if (!this.projectPath) {
			containerEl.createEl('p', { text: '无法获取项目路径，资源路径设置不可用', cls: 'pi-settings-desc' });
		} else {
			new Setting(containerEl)
				.setName('技能路径 (skills)')
				.addText((text) =>
					text
						.setPlaceholder('.pi/skills')
						.setValue(this.plugin.settings.skillPaths)
						.onChange(async (value) => {
							this.plugin.settings.skillPaths = value;
							await this.plugin.saveSettings();
							this.saveResourcePaths();
						}),
				);

			new Setting(containerEl)
				.setName('模板路径 (prompts)')
				.addText((text) =>
					text
						.setPlaceholder('.pi/prompts')
						.setValue(this.plugin.settings.promptPaths)
						.onChange(async (value) => {
							this.plugin.settings.promptPaths = value;
							await this.plugin.saveSettings();
							this.saveResourcePaths();
						}),
				);

			new Setting(containerEl)
				.setName('扩展路径 (extensions)')
				.addText((text) =>
					text
						.setPlaceholder('.pi/extensions')
						.setValue(this.plugin.settings.extensionPaths)
						.onChange(async (value) => {
							this.plugin.settings.extensionPaths = value;
							await this.plugin.saveSettings();
							this.saveResourcePaths();
						}),
				);
		}

		// ── 保存按钮 ──
		new Setting(containerEl)
			.setName('写入设置文件')
			.setDesc('将当前设置写入项目 .pi/settings.json。')
			.addButton((btn) =>
				btn
					.setButtonText('保存')
					.setCta()
					.onClick(() => {
						this.saveCompactionThresholds();
						this.saveResourcePaths();
						new Notice('已写入 ' + (this.projectPath || '') + '/.pi/settings.json');
					}),
			);

		// ── 自动压缩开关 + 阈值 ──
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
								writeCompactionSettings(this.compactionThresholds, this.projectPath);
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
							writeCompactionSettings(this.compactionThresholds, this.projectPath);
						}),
					);
		}
	}

	// ── 写入资源路径到项目 .pi/settings.json ──
	private saveResourcePaths(): void {
		if (!this.projectPath) return;
		// 用户填的是项目根目录相对路径，但 .pi/settings.json 中的路径
		// 相对于 .pi/ 目录解析，所以前面加 ../ 修正
		const toPiRelative = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean).map(p => `../${p}`);
		writeResourcePaths(this.projectPath, {
			skills: toPiRelative(this.plugin.settings.skillPaths),
			prompts: toPiRelative(this.plugin.settings.promptPaths),
			extensions: toPiRelative(this.plugin.settings.extensionPaths),
		});
	}

	// ── 按当前模式计算并写入项目 .pi/settings.json ──
	private saveCompactionThresholds(): void {
		const s = this.plugin.settings;
		if (s.compactionMode === 'percent') {
			const defaultWindow = 200000;
			const pct = s.compactionPercent / 100;
			this.compactionThresholds.reserveTokens = Math.round(defaultWindow * (1 - pct));
		}
		writeCompactionSettings(this.compactionThresholds, this.projectPath);
	}
}
