import { runMcpServer } from "../mcp/server.js";
import { mcpSetupGuide } from "../core/mcp-setup.js";
import { mcpServerEntry, writeProjectMcpConfigs } from "../core/mcp-config.js";

export async function runMcp(repoRoot: string): Promise<void> {
  await runMcpServer(repoRoot);
}

export type McpSetupOptions = {
  agent?: string;
  write?: boolean;
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
