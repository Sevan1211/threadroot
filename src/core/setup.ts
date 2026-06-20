import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import {
  AGENT_PROVIDERS,
  type AgentProvider,
  type AgentProviderId,
  parseAgentProviderList,
} from "./agent-providers.js";
import { hasManagedBlock, removeManagedBlock, upsertManagedBlock } from "./managed-block.js";
import { THREADROOT_MANAGED_MARKER, THREADROOT_SKILL_NAME, threadrootSkillContent } from "./threadroot-skill.js";

export type SetupMode = "write" | "dry-run" | "check" | "undo";

export type GlobalSetupOptions = {
  agents?: string;
  mode?: SetupMode;
  home?: string;
  force?: boolean;
  mcp?: boolean;
};

export type SetupStatus = "create" | "update" | "unchanged" | "present" | "missing" | "removed" | "skipped";
export type SetupKind = "skill" | "codex-agents" | "codex-mcp";

export type SetupEntry = {
  kind: SetupKind;
  agent?: AgentProviderId;
  label: string;
  path: string;
  status: SetupStatus;
  message?: string;
};

export type GlobalSetupResult = {
  entries: SetupEntry[];
};

const CODEX_AGENTS_BEGIN = "<!-- threadroot:begin global-codex -->";
const CODEX_AGENTS_END = "<!-- threadroot:end global-codex -->";
const CODEX_MCP_BEGIN = "# threadroot:begin codex-mcp";
const CODEX_MCP_END = "# threadroot:end codex-mcp";

async function readMaybe(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function displayPath(home: string, filePath: string): string {
  const relative = path.relative(home, filePath);
  return relative && !relative.startsWith("..") ? path.join("~", relative) : filePath;
}

function globalSkillPath(home: string, provider: AgentProvider): string {
  return path.join(home, provider.globalSkillDir, THREADROOT_SKILL_NAME, "SKILL.md");
}

function codexAgentsPath(home: string): string {
  return path.join(home, ".codex", "AGENTS.md");
}

function codexConfigPath(home: string): string {
  return path.join(home, ".codex", "config.toml");
}

function codexAgentsBlock(): string {
  return [
    CODEX_AGENTS_BEGIN,
    "## Threadroot",
    "",
    "When a repository contains `.threadroot/`, treat it as the source of truth for agent harness context.",
    "Before coding, prefer `threadroot doctor` and `threadroot context \"<task>\"` over broad, unfocused file reads.",
    "Do not create provider-specific project files unless the user asks; use `threadroot expose <agent>` for that.",
    CODEX_AGENTS_END,
    "",
  ].join("\n");
}

function codexMcpBlock(): string {
  return [
    CODEX_MCP_BEGIN,
    "[mcp_servers.threadroot]",
    'command = "threadroot"',
    'args = ["mcp"]',
    CODEX_MCP_END,
    "",
  ].join("\n");
}

async function setupGlobalSkill(home: string, provider: AgentProvider, mode: SetupMode, force: boolean): Promise<SetupEntry> {
  const filePath = globalSkillPath(home, provider);
  const shown = displayPath(home, filePath);
  const desired = threadrootSkillContent(provider, "global");
  const existing = await readMaybe(filePath);

  if (mode === "check") {
    if (existing === undefined) {
      return { kind: "skill", agent: provider.id, label: provider.label, path: shown, status: "missing" };
    }
    return {
      kind: "skill",
      agent: provider.id,
      label: provider.label,
      path: shown,
      status: existing === desired ? "unchanged" : "present",
      message: existing === desired ? undefined : "Existing global skill differs from the current Threadroot template.",
    };
  }

  if (mode === "undo") {
    if (existing === undefined) {
      return { kind: "skill", agent: provider.id, label: provider.label, path: shown, status: "missing" };
    }
    if (!existing.includes(THREADROOT_MANAGED_MARKER)) {
      return {
        kind: "skill",
        agent: provider.id,
        label: provider.label,
        path: shown,
        status: "skipped",
        message: "Existing skill is not Threadroot-managed.",
      };
    }
    await rm(path.dirname(filePath), { recursive: true, force: true });
    return { kind: "skill", agent: provider.id, label: provider.label, path: shown, status: "removed" };
  }

  if (existing === desired) {
    return { kind: "skill", agent: provider.id, label: provider.label, path: shown, status: "unchanged" };
  }

  if (existing !== undefined && !existing.includes(THREADROOT_MANAGED_MARKER) && !force) {
    return {
      kind: "skill",
      agent: provider.id,
      label: provider.label,
      path: shown,
      status: "skipped",
      message: "Existing skill is not Threadroot-managed. Re-run with --force to replace it.",
    };
  }

  const status: SetupStatus = existing === undefined ? "create" : "update";
  if (mode === "dry-run") {
    return { kind: "skill", agent: provider.id, label: provider.label, path: shown, status };
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, desired, "utf8");
  return { kind: "skill", agent: provider.id, label: provider.label, path: shown, status };
}

async function setupCodexAgents(home: string, mode: SetupMode): Promise<SetupEntry> {
  const filePath = codexAgentsPath(home);
  const shown = displayPath(home, filePath);
  const existing = (await readMaybe(filePath)) ?? "";
  const desired = upsertManagedBlock(existing, codexAgentsBlock(), CODEX_AGENTS_BEGIN, CODEX_AGENTS_END);

  if (mode === "check") {
    return {
      kind: "codex-agents",
      agent: "codex",
      label: "Codex global AGENTS.md",
      path: shown,
      status: hasManagedBlock(existing, CODEX_AGENTS_BEGIN, CODEX_AGENTS_END) ? "present" : "missing",
    };
  }

  if (mode === "undo") {
    if (!hasManagedBlock(existing, CODEX_AGENTS_BEGIN, CODEX_AGENTS_END)) {
      return { kind: "codex-agents", agent: "codex", label: "Codex global AGENTS.md", path: shown, status: "missing" };
    }
    await writeFile(filePath, removeManagedBlock(existing, CODEX_AGENTS_BEGIN, CODEX_AGENTS_END), "utf8");
    return { kind: "codex-agents", agent: "codex", label: "Codex global AGENTS.md", path: shown, status: "removed" };
  }

  if (existing === desired) {
    return { kind: "codex-agents", agent: "codex", label: "Codex global AGENTS.md", path: shown, status: "unchanged" };
  }

  const status: SetupStatus = existing.trim() ? "update" : "create";
  if (mode === "dry-run") {
    return { kind: "codex-agents", agent: "codex", label: "Codex global AGENTS.md", path: shown, status };
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, desired, "utf8");
  return { kind: "codex-agents", agent: "codex", label: "Codex global AGENTS.md", path: shown, status };
}

async function setupCodexMcp(home: string, mode: SetupMode): Promise<SetupEntry> {
  const filePath = codexConfigPath(home);
  const shown = displayPath(home, filePath);
  const existing = (await readMaybe(filePath)) ?? "";

  if (existing.includes("[mcp_servers.threadroot]") && !hasManagedBlock(existing, CODEX_MCP_BEGIN, CODEX_MCP_END)) {
    return {
      kind: "codex-mcp",
      agent: "codex",
      label: "Codex MCP config",
      path: shown,
      status: "skipped",
      message: "Existing unmanaged [mcp_servers.threadroot] table found. Leaving it untouched.",
    };
  }

  const desired = upsertManagedBlock(existing, codexMcpBlock(), CODEX_MCP_BEGIN, CODEX_MCP_END);

  if (mode === "check") {
    return {
      kind: "codex-mcp",
      agent: "codex",
      label: "Codex MCP config",
      path: shown,
      status: hasManagedBlock(existing, CODEX_MCP_BEGIN, CODEX_MCP_END) ? "present" : "missing",
    };
  }

  if (mode === "undo") {
    if (!hasManagedBlock(existing, CODEX_MCP_BEGIN, CODEX_MCP_END)) {
      return { kind: "codex-mcp", agent: "codex", label: "Codex MCP config", path: shown, status: "missing" };
    }
    await writeFile(filePath, removeManagedBlock(existing, CODEX_MCP_BEGIN, CODEX_MCP_END), "utf8");
    return { kind: "codex-mcp", agent: "codex", label: "Codex MCP config", path: shown, status: "removed" };
  }

  if (existing === desired) {
    return { kind: "codex-mcp", agent: "codex", label: "Codex MCP config", path: shown, status: "unchanged" };
  }

  const status: SetupStatus = existing.trim() ? "update" : "create";
  if (mode === "dry-run") {
    return { kind: "codex-mcp", agent: "codex", label: "Codex MCP config", path: shown, status };
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, desired, "utf8");
  return { kind: "codex-mcp", agent: "codex", label: "Codex MCP config", path: shown, status };
}

export async function setupGlobal(options: GlobalSetupOptions = {}): Promise<GlobalSetupResult> {
  const home = options.home ?? homedir();
  const mode = options.mode ?? "write";
  const providerIds = parseAgentProviderList(options.agents, "all");
  const entries: SetupEntry[] = [];

  for (const id of providerIds) {
    entries.push(await setupGlobalSkill(home, AGENT_PROVIDERS[id], mode, options.force ?? false));
  }

  if (providerIds.includes("codex")) {
    entries.push(await setupCodexAgents(home, mode));
    if (options.mcp) {
      entries.push(await setupCodexMcp(home, mode));
    }
  }

  return { entries };
}

export async function hasGlobalThreadrootSkill(home: string | undefined, agent: AgentProviderId): Promise<boolean> {
  return fileExists(globalSkillPath(home ?? homedir(), AGENT_PROVIDERS[agent]));
}
