import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { mcpEntryForCurrentProcess } from "./mcp-check.js";
import { writeProjectMcpConfigs } from "./mcp-config.js";
import { projectHarnessDir } from "./harness/paths.js";

export const CONNECT_AGENTS = [
  "codex",
  "claude",
  "cursor",
  "vscode",
  "copilot",
  "gemini",
  "windsurf",
  "opencode",
  "antigravity",
] as const;

export type ConnectAgent = (typeof CONNECT_AGENTS)[number];

export type ConnectMode = "plan" | "write" | "check" | "undo" | "status";

export type ConnectOptions = {
  agents?: string;
  projectFiles?: boolean;
  mode?: ConnectMode;
};

export type ConnectReceipt = {
  agent: ConnectAgent;
  projectRoot: string;
  createdAt: string;
  projectFiles: boolean;
  mcp: {
    command: string;
    args: string[];
  };
  setupCommands: string[];
  notes: string[];
};

export type ConnectAgentResult = {
  agent: ConnectAgent;
  status: "planned" | "written" | "checked" | "removed" | "missing";
  receiptPath: string;
  setupCommands: string[];
  notes: string[];
  projectFiles: string[];
};

export type ConnectReport = {
  mode: ConnectMode;
  projectFiles: boolean;
  agents: ConnectAgentResult[];
};

export function parseConnectAgents(value: string | undefined): ConnectAgent[] {
  if (!value || value.trim() === "") {
    return ["codex"];
  }
  const parsed: ConnectAgent[] = [];
  for (const raw of value.split(",")) {
    const key = raw.trim().toLowerCase();
    if (!key) {
      continue;
    }
    if (key === "all") {
      return [...CONNECT_AGENTS];
    }
    const normalized = key === "vs-code" ? "vscode" : key;
    if (!CONNECT_AGENTS.includes(normalized as ConnectAgent)) {
      throw new Error(`Unsupported provider: ${raw}. Supported: ${CONNECT_AGENTS.join(", ")}, all.`);
    }
    parsed.push(normalized as ConnectAgent);
  }
  return [...new Set(parsed)];
}

function receiptPath(repoRoot: string, agent: ConnectAgent): string {
  return path.join(projectHarnessDir(repoRoot), "providers", agent, "connection.json");
}

function serverEntry(): { command: string; args: string[] } {
  return mcpEntryForCurrentProcess();
}

function setupCommands(agent: ConnectAgent): string[] {
  const command = "threadroot";
  const json = JSON.stringify({ name: "threadroot", command, args: ["mcp"] });
  switch (agent) {
    case "codex":
      return ["codex mcp add threadroot -- threadroot mcp"];
    case "claude":
      return ["claude mcp add threadroot --scope local -- threadroot mcp"];
    case "vscode":
    case "copilot":
      return [`code --add-mcp '${json}'`];
    case "gemini":
      return ['Add {"mcpServers":{"threadroot":{"command":"threadroot","args":["mcp"]}}} to your Gemini CLI user settings.json.'];
    case "cursor":
      return ["Add a user/global MCP server named threadroot with command `threadroot` and args `[\"mcp\"]` in Cursor MCP settings."];
    case "windsurf":
      return ["Add a user/global MCP server named threadroot with command `threadroot` and args `[\"mcp\"]` in Windsurf MCP settings."];
    case "opencode":
      return ["Add a user/global MCP server named threadroot with command `threadroot` and args `[\"mcp\"]` in OpenCode MCP settings."];
    case "antigravity":
      return ["Add a user/global MCP server named threadroot with command `threadroot` and args `[\"mcp\"]` in Antigravity MCP settings."];
  }
}

function notes(agent: ConnectAgent, projectFiles: boolean): string[] {
  const base = [
    "Default Threadroot connect avoids visible provider files in the project.",
    "Reload or start a new agent session after adding MCP config.",
  ];
  if (projectFiles) {
    base.push("Project-file mode may create visible provider MCP config. Use only when that is intentional.");
  }
  if (agent === "copilot") {
    base.push("Copilot MCP setup is through VS Code-compatible MCP configuration.");
  }
  return base;
}

async function readReceipt(repoRoot: string, agent: ConnectAgent): Promise<ConnectReceipt | undefined> {
  try {
    return JSON.parse(await readFile(receiptPath(repoRoot, agent), "utf8")) as ConnectReceipt;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function writeReceipt(repoRoot: string, agent: ConnectAgent, projectFiles: boolean): Promise<ConnectReceipt> {
  const receipt: ConnectReceipt = {
    agent,
    projectRoot: repoRoot,
    createdAt: new Date().toISOString(),
    projectFiles,
    mcp: serverEntry(),
    setupCommands: setupCommands(agent),
    notes: notes(agent, projectFiles),
  };
  const filePath = receiptPath(repoRoot, agent);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

async function writeProjectFiles(repoRoot: string, agents: ConnectAgent[]): Promise<string[]> {
  const projectAgents = agents
    .map((agent) => (agent === "vscode" ? "copilot" : agent))
    .filter((agent): agent is "claude" | "cursor" | "copilot" => agent === "claude" || agent === "cursor" || agent === "copilot");
  if (projectAgents.length === 0) {
    return [];
  }
  const result = await writeProjectMcpConfigs({
    repoRoot,
    entry: mcpEntryForCurrentProcess(),
    agents: [...new Set(projectAgents)],
  });
  return result.written;
}

export async function connectProviders(repoRoot: string, options: ConnectOptions = {}): Promise<ConnectReport> {
  const agents = parseConnectAgents(options.agents);
  const mode = options.mode ?? "write";
  const projectFiles = options.projectFiles === true;
  const projectWritten = mode === "write" && projectFiles ? await writeProjectFiles(repoRoot, agents) : [];
  const results: ConnectAgentResult[] = [];

  for (const agent of agents) {
    const filePath = receiptPath(repoRoot, agent);
    if (mode === "undo") {
      await rm(path.dirname(filePath), { recursive: true, force: true });
      results.push({
        agent,
        status: "removed",
        receiptPath: filePath,
        setupCommands: [],
        notes: ["Removed Threadroot provider receipt. External provider config, if any, must be removed in that provider."],
        projectFiles: [],
      });
      continue;
    }

    const existing = await readReceipt(repoRoot, agent);
    if (mode === "check" || mode === "status") {
      results.push({
        agent,
        status: existing ? "checked" : "missing",
        receiptPath: filePath,
        setupCommands: existing?.setupCommands ?? setupCommands(agent),
        notes: existing?.notes ?? notes(agent, projectFiles),
        projectFiles: [],
      });
      continue;
    }

    if (mode === "plan") {
      results.push({
        agent,
        status: "planned",
        receiptPath: filePath,
        setupCommands: setupCommands(agent),
        notes: notes(agent, projectFiles),
        projectFiles: [],
      });
      continue;
    }

    const receipt = await writeReceipt(repoRoot, agent, projectFiles);
    results.push({
      agent,
      status: "written",
      receiptPath: filePath,
      setupCommands: receipt.setupCommands,
      notes: receipt.notes,
      projectFiles: projectWritten,
    });
  }

  return { mode, projectFiles, agents: results };
}
