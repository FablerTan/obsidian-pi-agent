import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const FILE_TOOLS = ["write", "edit"];
const MUTATING_CMDS = ["rm ", "mv ", "cp ", "mkdir ", "touch "];

// 脚本路径 = 当前扩展所在目录 + commit.sh
const __dirname = dirname(fileURLToPath(import.meta.url));
const script = join(__dirname, "commit.sh");

export default function (pi: ExtensionAPI) {
  let modified = false;

  pi.on("tool_call", async (event) => {
    if (FILE_TOOLS.includes(event.toolName)) {
      modified = true;
    }
    if (event.toolName === "bash" && event.input?.command) {
      if (MUTATING_CMDS.some((c) => (event.input.command as string).startsWith(c))) {
        modified = true;
      }
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!modified) return;
    modified = false;

    try {
      execSync("git rev-parse --git-dir", { stdio: "pipe" });
    } catch {
      return;
    }

    try {
      const status = execSync(
        "git -c core.quotePath=false status --porcelain",
        { encoding: "utf-8", stdio: "pipe" }
      ).trim();
      if (!status) return;

      // 先 add 再取 diff，确保新文件和未跟踪变更都被捕获
      execSync("git add -A", { stdio: "pipe" });

      const diff = execSync(
        "git -c core.quotePath=false diff --cached --stat",
        { encoding: "utf-8", stdio: "pipe" }
      ).trim();
      if (!diff) return;

      const output = execSync(
        `"${script}" "${diff.replace(/"/g, '\\"')}"`,
        { encoding: "utf-8", stdio: "pipe", timeout: 30000 }
      ).toString().trim();

      // 从 commit.sh 输出中提取 commit 摘要行
      const match = output.match(/git commit -m "(.+)"/);
      const summary = match ? match[1] : output;
      ctx.ui.notify(`✅ auto-commit: ${summary}`, "info");
    } catch (e) {
      ctx.ui.notify(`❌ auto-commit 失败: ${(e as Error)?.message?.slice(0, 80) || "未知错误"}`, "error");
    }
  });
}
