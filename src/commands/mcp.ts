import { runMcpServer } from "../mcp/server.js";
import { checkCodexMcp } from "../core/mcp-check.js";
import { printJson, type JsonCliOptions } from "./json.js";

export async function runMcp(repoRoot: string): Promise<void> {
  await runMcpServer(repoRoot);
}

export type McpCheckOptions = JsonCliOptions & {
  timeout?: string;
};

export async function runMcpCheck(repoRoot: string, options: McpCheckOptions): Promise<void> {
  const timeoutMs = options.timeout ? Number.parseInt(options.timeout, 10) : undefined;
  const report = await checkCodexMcp({ repoRoot, timeoutMs });
  if (options.json) {
    printJson(report);
    if (report.status === "error") {
      process.exitCode = 1;
    }
    return;
  }

  console.log(`Threadroot MCP check: ${report.status}`);
  console.log(`config: ${report.configPath}`);
  if (report.entry) {
    console.log(`server: ${report.entry.command} ${report.entry.args.join(" ")}`.trim());
  }
  for (const message of report.messages) {
    console.log(`- ${message}`);
  }
  if (report.tools.length > 0) {
    console.log(`tools: ${report.tools.join(", ")}`);
  }

  if (report.status === "error") {
    process.exitCode = 1;
  }
}
