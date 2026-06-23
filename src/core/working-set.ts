import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { assembleContext, type HarnessContext } from "./harness/context.js";
import { repoMapStatus, searchRepo, type RepoSearchMatch } from "./repo-map.js";

const execFileAsync = promisify(execFile);

export type WorkingSetFile = {
  path: string;
  score: number;
  reasons: string[];
  lines?: number[];
};

export type WorkingSetCommand = {
  name: string;
  command: string;
  reason: string;
  risk: string;
  confirm: boolean;
};

export type WorkingSetSkill = {
  name: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  risk: string;
  reviewed: boolean;
  load: boolean;
};

export type WorkingSetWarning = {
  type: "freshness" | "trust" | "permission";
  message: string;
  path?: string;
};

export type WorkingSet = {
  task: string;
  summary: string;
  files: WorkingSetFile[];
  tests: WorkingSetFile[];
  commands: WorkingSetCommand[];
  recommendedSkills: WorkingSetSkill[];
  memory: HarnessContext["memory"];
  repoMap?: HarnessContext["repoMap"];
  nextReads: string[];
  warnings: WorkingSetWarning[];
  omitted: Array<{ section: string; reason: string }>;
  tokenEstimate: number;
};

export type WorkingSetOptions = {
  budgetTokens?: number;
  maxFiles?: number;
  maxSkills?: number;
  home?: string;
};

function terms(task: string): string[] {
  return [
    ...new Set(
      task
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/)
        .filter((term) => term.length > 2),
    ),
  ];
}

function addCandidate(
  candidates: Map<string, WorkingSetFile>,
  filePath: string,
  score: number,
  reason: string,
  line?: number,
): void {
  const existing = candidates.get(filePath) ?? { path: filePath, score: 0, reasons: [] };
  existing.score += score;
  if (!existing.reasons.includes(reason)) {
    existing.reasons.push(reason);
  }
  if (line) {
    existing.lines = [...new Set([...(existing.lines ?? []), line])].sort((a, b) => a - b).slice(0, 6);
  }
  candidates.set(filePath, existing);
}

function isTestPath(filePath: string): boolean {
  const base = path.basename(filePath);
  return (
    filePath.split("/").some((part) => part === "test" || part === "tests" || part === "__tests__") ||
    base.includes(".test.") ||
    base.includes(".spec.")
  );
}

async function changedFiles(repoRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024,
    });
    return stdout
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .map((file) => file.replace(/^"|"$/g, ""))
      .filter((file) => !file.startsWith(".threadroot/"));
  } catch {
    return [];
  }
}

async function searchMatches(repoRoot: string, task: string): Promise<RepoSearchMatch[]> {
  const direct = await searchRepo(repoRoot, task, 40);
  if (direct.length > 0) {
    return direct;
  }

  const byTerm = await Promise.all(terms(task).slice(0, 6).map((term) => searchRepo(repoRoot, term, 8)));
  const seen = new Set<string>();
  const matches: RepoSearchMatch[] = [];
  for (const match of byTerm.flat()) {
    const key = `${match.path}:${match.line}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    matches.push(match);
    if (matches.length >= 40) {
      break;
    }
  }
  return matches;
}

function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

function commandReason(tool: HarnessContext["tools"][number], taskTerms: string[]): string | undefined {
  const haystack = `${tool.name} ${tool.description}`.toLowerCase();
  if (taskTerms.some((term) => haystack.includes(term))) {
    return "tool name or description matches task";
  }
  if (tool.name === "test" || tool.name.includes("test")) {
    return "validation command likely useful after code changes";
  }
  return undefined;
}

export async function assembleWorkingSet(
  repoRoot: string,
  task: string,
  options: WorkingSetOptions = {},
): Promise<WorkingSet> {
  const taskTerms = terms(task);
  const context = await assembleContext(repoRoot, task, {
    home: options.home,
    limit: options.maxSkills ?? 6,
    fallbackSkills: false,
  });
  const map = await repoMapStatus(repoRoot).catch(() => undefined);
  const candidates = new Map<string, WorkingSetFile>();

  const [matches, changed] = await Promise.all([searchMatches(repoRoot, task), changedFiles(repoRoot)]);
  for (const match of matches) {
    addCandidate(candidates, match.path, 3, "text match for task terms", match.line);
  }
  for (const file of changed) {
    addCandidate(candidates, file, 4, "changed in current worktree");
  }
  if (context.repoMap?.path) {
    addCandidate(candidates, context.repoMap.path, 1, `repo map is ${context.repoMap.status}`);
  }

  const ranked = [...candidates.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const maxFiles = options.maxFiles ?? 12;
  const files = ranked.filter((entry) => !isTestPath(entry.path)).slice(0, maxFiles);
  const tests = ranked.filter((entry) => isTestPath(entry.path)).slice(0, 8);
  const commands = context.tools
    .map((tool) => ({ tool, reason: commandReason(tool, taskTerms) }))
    .filter((entry): entry is { tool: HarnessContext["tools"][number]; reason: string } => Boolean(entry.reason))
    .slice(0, 6)
    .map(({ tool, reason }) => ({
      name: tool.name,
      command: `threadroot run ${tool.name}`,
      reason,
      risk: tool.risk,
      confirm: tool.confirm,
    }));

  const recommendedSkills = context.skills.map((skill) => {
    const confidence = skill.score >= 3 ? "high" : skill.score >= 1 ? "medium" : "low";
    return {
      name: skill.name,
      reason: skill.score > 0 ? "skill metadata matches task terms" : "fallback project skill",
      confidence,
      risk: skill.risk,
      reviewed: skill.reviewed,
      load: confidence !== "low" && skill.reviewed,
    } satisfies WorkingSetSkill;
  });

  const warnings: WorkingSetWarning[] = [];
  if (map?.status && map.status !== "current") {
    warnings.push({
      type: "freshness",
      message: `Repo map is ${map.status}; run threadroot map --write for fresher orientation.`,
      path: map.path,
    });
  }
  for (const skill of recommendedSkills) {
    if (!skill.reviewed) {
      warnings.push({ type: "trust", message: `Skill ${skill.name} is not reviewed.` });
    }
  }
  for (const command of commands) {
    if (command.confirm || command.risk !== "low") {
      warnings.push({
        type: "permission",
        message: `Command ${command.command} requires review before execution.`,
      });
    }
  }

  const workingSet: WorkingSet = {
    task,
    summary: `Task-focused working set for: ${task}`,
    files,
    tests,
    commands,
    recommendedSkills,
    memory: context.memory.slice(0, 4),
    repoMap: map,
    nextReads: files.slice(0, 5).map((entry) => entry.path),
    warnings,
    omitted: [],
    tokenEstimate: 0,
  };
  workingSet.tokenEstimate = estimateTokens(workingSet);

  if (ranked.length > files.length + tests.length) {
    workingSet.omitted.push({
      section: "files",
      reason: `Omitted ${ranked.length - files.length - tests.length} lower-ranked file candidate(s) to keep context compact.`,
    });
  }
  if (options.budgetTokens && workingSet.tokenEstimate > options.budgetTokens) {
    workingSet.omitted.push({
      section: "budget",
      reason: `Estimated ${workingSet.tokenEstimate} tokens exceeds requested budget ${options.budgetTokens}; read only nextReads first.`,
    });
  }

  return workingSet;
}
