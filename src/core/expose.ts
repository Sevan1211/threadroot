import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AGENT_PROVIDERS,
  type AgentProvider,
  type AgentProviderId,
  parseAgentProviderList,
} from "./agent-providers.js";
import { THREADROOT_MANAGED_MARKER, THREADROOT_SKILL_NAME, threadrootSkillContent } from "./threadroot-skill.js";

export type ExposeMode = "write" | "dry-run" | "check" | "undo";

export type ExposeOptions = {
  agents?: string;
  mode?: ExposeMode;
  force?: boolean;
};

export type ExposeStatus = "create" | "update" | "unchanged" | "present" | "missing" | "removed" | "skipped";

export type ExposeEntry = {
  agent: AgentProviderId;
  label: string;
  path: string;
  status: ExposeStatus;
  message?: string;
};

export type ExposeResult = {
  entries: ExposeEntry[];
};

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

function projectSkillPath(repoRoot: string, provider: AgentProvider): string {
  return path.join(repoRoot, provider.projectSkillDir, THREADROOT_SKILL_NAME, "SKILL.md");
}

function relSkillPath(provider: AgentProvider): string {
  return path.join(provider.projectSkillDir, THREADROOT_SKILL_NAME, "SKILL.md");
}

async function exposeOne(repoRoot: string, provider: AgentProvider, mode: ExposeMode, force: boolean): Promise<ExposeEntry> {
  const relativePath = relSkillPath(provider);
  const absolutePath = projectSkillPath(repoRoot, provider);
  const desired = threadrootSkillContent(provider, "project");
  const existing = await readMaybe(absolutePath);

  if (mode === "check") {
    if (existing === undefined) {
      return { agent: provider.id, label: provider.label, path: relativePath, status: "missing" };
    }
    return {
      agent: provider.id,
      label: provider.label,
      path: relativePath,
      status: existing === desired ? "unchanged" : "present",
      message: existing === desired ? undefined : "Existing project skill differs from the current Threadroot template.",
    };
  }

  if (mode === "undo") {
    if (existing === undefined) {
      return { agent: provider.id, label: provider.label, path: relativePath, status: "missing" };
    }
    if (!existing.includes(THREADROOT_MANAGED_MARKER)) {
      return {
        agent: provider.id,
        label: provider.label,
        path: relativePath,
        status: "skipped",
        message: "Existing skill is not Threadroot-managed.",
      };
    }
    await rm(path.dirname(absolutePath), { recursive: true, force: true });
    return { agent: provider.id, label: provider.label, path: relativePath, status: "removed" };
  }

  if (existing === desired) {
    return { agent: provider.id, label: provider.label, path: relativePath, status: "unchanged" };
  }

  if (existing !== undefined && !existing.includes(THREADROOT_MANAGED_MARKER) && !force) {
    return {
      agent: provider.id,
      label: provider.label,
      path: relativePath,
      status: "skipped",
      message: "Existing skill is not Threadroot-managed. Re-run with --force to replace it.",
    };
  }

  const status: ExposeStatus = existing === undefined ? "create" : "update";
  if (mode === "dry-run") {
    return { agent: provider.id, label: provider.label, path: relativePath, status };
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, desired, "utf8");
  return { agent: provider.id, label: provider.label, path: relativePath, status };
}

export async function exposeProject(repoRoot: string, options: ExposeOptions = {}): Promise<ExposeResult> {
  const providerIds = parseAgentProviderList(options.agents, ["codex"]);
  const mode = options.mode ?? "write";
  const entries: ExposeEntry[] = [];

  for (const id of providerIds) {
    entries.push(await exposeOne(repoRoot, AGENT_PROVIDERS[id], mode, options.force ?? false));
  }

  return { entries };
}

export async function hasProjectExposure(repoRoot: string, agent: AgentProviderId): Promise<boolean> {
  return fileExists(projectSkillPath(repoRoot, AGENT_PROVIDERS[agent]));
}

