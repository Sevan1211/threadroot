import { runMcpServer } from "../mcp/server.js";
import { mcpSetupGuide } from "../core/mcp-setup.js";
import { mcpServerEntry, writeProjectMcpConfigs } from "../core/mcp-config.js";
import { checkCodexMcp } from "../core/mcp-check.js";

export async function runMcp(repoRoot: string): Promise<void> {
  await runMcpServer(repoRoot);
}

export type McpSetupOptions = {
  agent?: string;
  write?: boolean;
};

export type McpCheckOptions = {
  timeout?: string;
};

export async function runMcpSetup(repoRoot: string, options: McpSetupOptions): Promise<void> {
  if (options.write) {
    const command = process.execPath;
    const scriptPath = process.argv[1];
    const entry = mcpServerEntry(command, scriptPath);
    const result = await writeProjectMcpConfigs({ repoRoot, entry });
    console.log("Wrote project MCP config:");
    for (const file of result.written) {
      console.log(`- ${file}`);
    }
    for (const note of result.notes) {
      console.log(`note: ${note}`);
    }
    return;
  }
  console.log(mcpSetupGuide({ repoRoot, agent: options.agent }));
}

export async function runMcpCheck(repoRoot: string, options: McpCheckOptions): Promise<void> {
  const timeoutMs = options.timeout ? Number.parseInt(options.timeout, 10) : undefined;
  const report = await checkCodexMcp({ repoRoot, timeoutMs });

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
