import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type McpServerEntry = {
  command: string;
  args: string[];
};

type ConfigTarget = {
  agent: "copilot" | "cursor" | "claude";
  file: string;
  /** Top-level key holding the server map (VS Code uses `servers`). */
  key: "servers" | "mcpServers";
};

const TARGETS: ConfigTarget[] = [
  { agent: "copilot", file: path.join(".vscode", "mcp.json"), key: "servers" },
  { agent: "cursor", file: path.join(".cursor", "mcp.json"), key: "mcpServers" },
  { agent: "claude", file: ".mcp.json", key: "mcpServers" },
];

export type WriteMcpConfigInput = {
  repoRoot: string;
  entry: McpServerEntry;
  /** Restrict to specific agents; defaults to all project-local targets. */
  agents?: Array<ConfigTarget["agent"]>;
};

export type WriteMcpConfigResult = {
  written: string[];
  notes: string[];
};

/** Build the stdio server entry that launches `threadroot mcp` in the repo. */
export function mcpServerEntry(command: string, scriptPath?: string): McpServerEntry {
  return scriptPath ? { command, args: [scriptPath, "mcp"] } : { command, args: ["mcp"] };
}

async function mergeConfig(
  filePath: string,
  key: ConfigTarget["key"],
  entry: McpServerEntry,
): Promise<void> {
  let config: Record<string, unknown> = {};
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      config = parsed as Record<string, unknown>;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`Refusing to overwrite unparseable ${filePath}: ${(error as Error).message}`);
    }
  }

  const servers = (config[key] && typeof config[key] === "object" ? config[key] : {}) as Record<string, unknown>;
  servers.threadroot = { ...entry };
  config[key] = servers;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/**
 * Write merge-aware, project-local MCP config so each agent can launch the
 * Threadroot server. Existing keys are preserved; only the `threadroot` server
 * entry is added/updated. Codex uses a global config and is reported, not
 * written.
 */
export async function writeProjectMcpConfigs(input: WriteMcpConfigInput): Promise<WriteMcpConfigResult> {
  const agents = input.agents;
  const targets = agents ? TARGETS.filter((target) => agents.includes(target.agent)) : TARGETS;

  const written: string[] = [];
  for (const target of targets) {
    const filePath = path.join(input.repoRoot, target.file);
    await mergeConfig(filePath, target.key, input.entry);
    written.push(target.file);
  }

  return {
    written,
    notes: [
      "Codex reads ~/.codex/config.toml (global) — add a [mcp_servers.threadroot] entry manually.",
      "Reload each agent after writing config for the server to appear.",
    ],
  };
}
