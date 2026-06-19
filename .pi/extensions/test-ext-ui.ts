/**
 * Extension UI 协议测试扩展
 *
 * 覆盖全部 9 个 Extension UI 方法：
 *   select, confirm, input, editor,
 *   notify, setStatus, setWidget, setTitle, set_editor_text
 *
 * 用法：
 *   1. 把此文件放到 ~/.pi/agent/extensions/ 或 .pi/extensions/
 *   2. 重启 pi 或执行 /reload
 *   3. 在聊天中输入 /test-ui 触发全部弹窗测试
 *
 * 单个方法也可以单独测试：
 *   /test-select   /test-confirm   /test-input
 *   /test-editor   /test-prefill
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let turnCount = 0;

	// ═══════════════════════════════════════════════
	//  Session 生命周期 —— 广播型方法演示
	// ═══════════════════════════════════════════════

	pi.on("session_start", async (event, ctx) => {
		// setTitle: 设置窗口标题
		ctx.ui.setTitle(event.reason === "new"
			? "Pi — 测试 Extension UI（新会话）"
			: "Pi — 测试 Extension UI");

		// setWidget: 在输入框上方显示一个部件
		ctx.ui.setWidget("test-ext-ui", [
			"--- Extension UI 测试扩展已加载 ---",
			"输入 /test-ui 开始测试全部弹窗",
			"输入 /test-select  /test-confirm  /test-input  /test-editor  /test-prefill 单独测试",
		]);

		// setStatus: 设置状态栏文字
		ctx.ui.setStatus("test-ext-ui", "就绪");
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		// 清理部件和状态
		ctx.ui.setWidget("test-ext-ui", undefined as any);
		ctx.ui.setStatus("test-ext-ui", undefined as any);
	});

	// ═══════════════════════════════════════════════
	//  Turn 周期 —— setStatus 更新
	// ═══════════════════════════════════════════════

	pi.on("turn_start", async (_event, ctx) => {
		turnCount++;
		ctx.ui.setStatus("test-ext-ui", `第 ${turnCount} 轮进行中…`);
	});

	pi.on("turn_end", async (_event, ctx) => {
		ctx.ui.setStatus("test-ext-ui", `第 ${turnCount} 轮完成`);
	});

	// ═══════════════════════════════════════════════
	//  tool_call —— select 演示
	//  当 LLM 调用 bash 执行危险命令时，弹出选择确认
	// ═══════════════════════════════════════════════

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;

		const command = (event.input as any).command as string;
		const isDangerous = /\brm\s+(-rf?|--recursive)/i.test(command)
			|| /\bsudo\b/i.test(command);

		if (!isDangerous) return;

		if (!ctx.hasUI) {
			return { block: true, reason: "危险命令已被拦截（无 UI）" };
		}

		// select: 弹出选项列表
		const choice = await ctx.ui.select(
			`检测到危险命令:\n${command}\n\n请选择操作`,
			["允许执行", "拦截"],
		);

		if (choice !== "允许执行") {
			// notify: 发送通知（warning 类型）
			ctx.ui.notify("命令已被用户拦截", "warning");
			return { block: true, reason: "用户拦截" };
		}

		// notify: 发送通知（info 类型）
		ctx.ui.notify("命令已放行", "info");
		return;
	});

	// ═══════════════════════════════════════════════
	//  session_before_switch —— confirm 演示
	//  新建会话前弹出确认
	// ═══════════════════════════════════════════════

	pi.on("session_before_switch", async (event, ctx) => {
		if (event.reason !== "new") return;
		if (!ctx.hasUI) return;

		// confirm: 弹出确认弹窗
		const confirmed = await ctx.ui.confirm(
			"确认新会话",
			"当前会话的消息将会被清空，是否继续？",
		);

		if (!confirmed) {
			ctx.ui.notify("已取消新建会话", "info");
			return { cancel: true };
		}
	});

	// ═══════════════════════════════════════════════
	//  /reload 时 —— notify 演示
	// ═══════════════════════════════════════════════

	pi.on("resources_discover", async (event, ctx) => {
		if (event.reason === "reload") {
			// notify: 通知类型
			ctx.ui.notify("扩展已热重载", "info");
		}
	});

	// ═══════════════════════════════════════════════
	//  注册命令：逐个测试各方法
	// ═══════════════════════════════════════════════

	// ── 全流程测试 ────────────────────────────
	pi.registerCommand("test-ui", {
		description: "依次测试全部 Extension UI 弹窗（select → confirm → input → editor）",
		handler: async (_args, ctx) => {
			ctx.ui.notify("开始测试 Extension UI 协议…", "info");

			// 1. select
			const color = await ctx.ui.select(
				"【1/4】选择一个颜色",
				["红色", "绿色", "蓝色", "黄色"],
			);
			ctx.ui.notify(
				color ? `你选择了: ${color}` : "选择已取消",
				color ? "info" : "warning",
			);

			// 2. confirm
			const confirmed = await ctx.ui.confirm(
				"【2/4】确认弹窗",
				"这是确认弹窗测试，是否继续？",
			);
			ctx.ui.notify(
				confirmed ? "用户确认" : "用户取消",
				confirmed ? "info" : "warning",
			);

			if (!confirmed) {
				ctx.ui.notify("测试已中止", "warning");
				return;
			}

			// 3. input
			const name = await ctx.ui.input(
				"【3/4】输入你的名字",
				"在这里输入…",
			);
			ctx.ui.notify(
				name ? `你好, ${name}!` : "输入已取消",
				name ? "info" : "warning",
			);

			// 4. editor
			const text = await ctx.ui.editor(
				"【4/4】编辑一段文字",
				"这是默认内容\n可以修改后提交\n或按 Esc 取消",
			);
			if (text) {
				ctx.ui.notify(
					`编辑完成（${text.split("\n").length} 行, ${text.length} 字）`,
					"info",
				);
				// set_editor_text: 把编辑结果填入输入框
				ctx.ui.setEditorText(text);
				ctx.ui.notify("编辑结果已填入输入框", "info");
			} else {
				ctx.ui.notify("编辑已取消", "warning");
			}

			ctx.ui.notify("全部测试完成 ✅", "info");
		},
	});

	// ── /test-select ─────────────────────────
	pi.registerCommand("test-select", {
		description: "测试 select 弹窗（选项列表）",
		handler: async (_args, ctx) => {
			const frameworks = await ctx.ui.select(
				"选择你喜欢的框架",
				["React", "Vue", "Svelte", "Solid", "Qwik"],
			);
			ctx.ui.notify(
				frameworks ? `你选择了: ${frameworks}` : "已取消",
				frameworks ? "info" : "warning",
			);
		},
	});

	// ── /test-confirm ───────────────────────
	pi.registerCommand("test-confirm", {
		description: "测试 confirm 弹窗（确认/取消）",
		handler: async (_args, ctx) => {
			const ok = await ctx.ui.confirm(
				"测试确认",
				"确定要执行此操作吗？",
			);
			ctx.ui.notify(
				ok ? "用户确认 ✅" : "用户取消 ❌",
				ok ? "info" : "warning",
			);
		},
	});

	// ── /test-input ─────────────────────────
	pi.registerCommand("test-input", {
		description: "测试 input 弹窗（单行输入）",
		handler: async (_args, ctx) => {
			const value = await ctx.ui.input(
				"请输入一段文字",
				"在此输入…",
			);
			if (value) {
				ctx.ui.notify(`你输入了: "${value}"`, "info");
				// 把输入结果填入输入框
				ctx.ui.setEditorText(value);
			} else {
				ctx.ui.notify("输入已取消", "warning");
			}
		},
	});

	// ── /test-editor ────────────────────────
	pi.registerCommand("test-editor", {
		description: "测试 editor 弹窗（多行编辑）",
		handler: async (_args, ctx) => {
			const text = await ctx.ui.editor(
				"编辑多行文本",
				"第 1 行\n第 2 行\n第 3 行",
			);
			ctx.ui.notify(
				text
					? `编辑完成（共 ${text.split("\n").length} 行）`
					: "编辑已取消",
				text ? "info" : "warning",
			);
		},
	});

	// ── /test-prefill ───────────────────────
	pi.registerCommand("test-prefill", {
		description: "测试 setEditorText（预设输入框文本）",
		handler: async (_args, ctx) => {
			ctx.ui.setEditorText(
				"这是由 test-ext-ui 扩展填入的预设文本。\n你可以直接按 Enter 发送，或修改后再发送。",
			);
			ctx.ui.notify("输入框已预设文本", "info");
		},
	});

	// ── /test-notify ────────────────────────
	pi.registerCommand("test-notify", {
		description: "测试三种通知类型（info / warning / error）",
		handler: async (_args, ctx) => {
			ctx.ui.notify("这是一条 info 通知", "info");
			await sleep(600);
			ctx.ui.notify("这是一条 warning 通知 ⚠️", "warning");
			await sleep(600);
			ctx.ui.notify("这是一条 error 通知 ❌", "error");
		},
	});

	// ── /test-status ────────────────────────
	pi.registerCommand("test-status", {
		description: "测试 setStatus（设置/清除状态栏）",
		handler: async (_args, ctx) => {
			ctx.ui.setStatus("test-ext-status", "状态一: 运行中…");
			await sleep(1000);
			ctx.ui.setStatus("test-ext-status", "状态一: 完成");
			ctx.ui.setStatus("test-ext-extra", "状态二: 额外信息");
			await sleep(1500);
			ctx.ui.setStatus("test-ext-extra", undefined as any);
			ctx.ui.notify("状态栏已更新", "info");
		},
	});

	// ── /test-widget ────────────────────────
	pi.registerCommand("test-widget", {
		description: "测试 setWidget（设置/清除部件）",
		handler: async (_args, ctx) => {
			ctx.ui.setWidget("test-widget-above", [
				"📊 实时数据面板",
				"CPU: 45%   内存: 62%   磁盘: 78%",
			]);
			await sleep(2000);
			ctx.ui.setWidget("test-widget-above", undefined as any);
			ctx.ui.notify("部件已清除", "info");
		},
	});

	// ── /test-title ─────────────────────────
	pi.registerCommand("test-title", {
		description: "测试 setTitle（设置窗口标题）",
		handler: async (_args, ctx) => {
			ctx.ui.setTitle("Pi — 自定义标题测试");
			ctx.ui.notify("标题已修改", "info");
		},
	});
}

// ── 工具函数 ────────────────────────────────
function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
