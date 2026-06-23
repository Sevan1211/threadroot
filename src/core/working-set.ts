import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { assembleContext, type HarnessContext } from "./harness/context.js";
import { readRepoIndex, scoreIndexCandidates } from "./repo-index.js";
import { repoMapStatus, searchRepo, type RepoSearchMatch } from "./repo-map.js";
import { walkRepo } from "./scan/walk.js";

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

const TASK_STOPWORDS = new Set([
  "about",
  "actually",
  "after",
  "again",
  "also",
  "because",
  "before",
  "being",
  "better",
  "could",
  "does",
  "doing",
  "done",
  "fix",
  "from",
  "have",
  "into",
  "just",
  "make",
  "more",
  "need",
  "needs",
  "only",
  "really",
  "should",
  "than",
  "that",
  "this",
  "what",
  "when",
  "where",
  "with",
  "would",
]);

const LOW_SIGNAL_PATH_TERMS = new Set(["core", "docs", "file", "files", "src", "test", "tests"]);
const DOC_TASK_TERMS = new Set(["changelog", "doc", "docs", "documentation", "readme", "release", "security"]);
const IMPLEMENTATION_TASK_RE = /\b(add|build|change|debug|fix|implement|improve|refactor|repair|route|test|wire)\b/i;

const THREADROOT_VALUE_TERMS = new Set([
  "accuracy",
  "agent",
  "agents",
  "context",
  "cost",
  "mcp",
  "output",
  "outputs",
  "performance",
  "product",
  "packet",
  "router",
  "skill",
  "skills",
  "token",
  "tokens",
  "useful",
  "valuable",
  "working",
  "working-set",
]);

const THREADROOT_VALUE_HINTS: Array<{ path: string; score: number; reason: string }> = [
  { path: "src/core/task-packet.ts", score: 20, reason: "Threadroot task-packet compiler" },
  { path: "src/commands/task.ts", score: 16, reason: "Threadroot task CLI surface" },
  { path: "src/core/working-set.ts", score: 14, reason: "Threadroot context candidate engine" },
  { path: "src/mcp/server.ts", score: 12, reason: "Threadroot MCP context surface" },
  { path: "src/core/harness/context.ts", score: 10, reason: "Threadroot context assembly surface" },
  { path: "test/mcp-server.test.ts", score: 8, reason: "Threadroot context-routing tests" },
  { path: "test/cli-smoke.test.ts", score: 7, reason: "Threadroot first-run workflow tests" },
  { path: "README.md", score: 5, reason: "Threadroot product promise" },
  { path: "docs/threadroot-foundation-plan.md", score: 4, reason: "Threadroot product plan" },
];

const SURFACE_HINTS: Array<{ all?: string[]; any?: string[]; not?: string[]; paths: Array<{ path: string; score: number }>; reason: string }> = [
  {
    all: ["mcp"],
    any: ["resource", "resources", "task_packet", "tool", "tools", "handshake"],
    reason: "MCP implementation surface",
    paths: [
      { path: "src/mcp/server.ts", score: 28 },
      { path: "test/mcp-server.test.ts", score: 22 },
      { path: "src/core/mcp-check.ts", score: 16 },
      { path: "test/mcp-check.test.ts", score: 12 },
    ],
  },
  {
    all: ["integration"],
    reason: "integration documentation surface",
    paths: [
      { path: "INTEGRATION.md", score: 34 },
      { path: "README.md", score: 18 },
    ],
  },
  {
    all: ["security"],
    reason: "security documentation surface",
    paths: [
      { path: "SECURITY.md", score: 34 },
      { path: "README.md", score: 18 },
    ],
  },
  {
    all: ["task"],
    any: ["packet", "packets", "ranking", "symbols", "snippets"],
    reason: "task-packet implementation surface",
    paths: [
      { path: "src/core/task-packet.ts", score: 28 },
      { path: "src/commands/task.ts", score: 20 },
      { path: "src/core/working-set.ts", score: 18 },
      { path: "src/core/repo-index.ts", score: 14 },
    ],
  },
  {
    any: ["seed", "built", "builtin", "built-in"],
    reason: "built-in seed skills surface",
    paths: [
      { path: "src/core/init/seed-skills.ts", score: 34 },
      { path: "src/core/init/builtins.ts", score: 20 },
      { path: "test/skills.test.ts", score: 16 },
    ],
  },
  {
    any: ["skill", "skills", "trigger", "triggers", "routing", "trust", "ingest", "install", "scan"],
    reason: "skills routing and intake surface",
    paths: [
      { path: "src/commands/skills.ts", score: 24 },
      { path: "src/core/harness/context.ts", score: 22 },
      { path: "src/core/skills.ts", score: 20 },
      { path: "src/core/skills-install.ts", score: 18 },
      { path: "src/core/skills-scan.ts", score: 14 },
      { path: "test/skills.test.ts", score: 12 },
      { path: "test/skills-install.test.ts", score: 12 },
    ],
  },
  {
    all: ["memory"],
    reason: "memory implementation surface",
    paths: [
      { path: "src/core/harness/memory.ts", score: 28 },
      { path: "src/commands/memory.ts", score: 22 },
      { path: "test/harness-surface.test.ts", score: 12 },
    ],
  },
  {
    any: ["adapter", "adapters", "provider", "compile", "claude", "cursor", "copilot"],
    reason: "provider adapter compile surface",
    paths: [
      { path: "src/core/compile/index.ts", score: 22 },
      { path: "src/core/compile/adapters/shared.ts", score: 18 },
      { path: "src/core/compile/adapters/agents.ts", score: 16 },
      { path: "test/compile.test.ts", score: 14 },
    ],
  },
  {
    all: ["claude"],
    reason: "Claude adapter surface",
    paths: [
      { path: "src/core/compile/adapters/claude.ts", score: 30 },
      { path: "src/core/compile/adapters/shared.ts", score: 16 },
      { path: "test/compile.test.ts", score: 14 },
    ],
  },
  {
    all: ["cursor"],
    reason: "Cursor adapter surface",
    paths: [
      { path: "src/core/compile/adapters/cursor.ts", score: 30 },
      { path: "src/core/compile/adapters/shared.ts", score: 16 },
      { path: "test/compile.test.ts", score: 14 },
    ],
  },
  {
    all: ["copilot"],
    reason: "Copilot adapter surface",
    paths: [
      { path: "src/core/compile/adapters/copilot.ts", score: 30 },
      { path: "test/compile.test.ts", score: 14 },
    ],
  },
  {
    all: ["package"],
    any: ["publish", "contents", "smoke", "npm"],
    reason: "package release surface",
    paths: [
      { path: "scripts/package-smoke.mjs", score: 30 },
      { path: "package.json", score: 20 },
      { path: "test/cli-smoke.test.ts", score: 12 },
    ],
  },
  {
    all: ["frontmatter"],
    reason: "frontmatter parsing surface",
    paths: [
      { path: "src/core/harness/frontmatter.ts", score: 30 },
      { path: "src/core/harness/schema.ts", score: 18 },
      { path: "test/harness-schema.test.ts", score: 14 },
    ],
  },
  {
    all: ["json"],
    any: ["output", "print", "command"],
    reason: "JSON command output surface",
    paths: [
      { path: "src/commands/json.ts", score: 30 },
      { path: "test/cli-smoke.test.ts", score: 14 },
      { path: "src/cli.ts", score: 10 },
    ],
  },
  {
    any: ["init", "initialize", "harness", "local-only"],
    reason: "init harness surface",
    paths: [
      { path: "src/core/init/index.ts", score: 28 },
      { path: "src/commands/init.ts", score: 22 },
      { path: "test/init.test.ts", score: 14 },
    ],
  },
  {
    all: ["web"],
    any: ["fetch", "url", "provenance"],
    reason: "web fetch surface",
    paths: [
      { path: "src/core/web.ts", score: 30 },
      { path: "src/commands/web.ts", score: 20 },
      { path: "test/web.test.ts", score: 14 },
    ],
  },
  {
    any: ["tool", "tools", "brief", "failed", "failure", "runs", "summarize"],
    not: ["mcp"],
    reason: "tool execution and brief surface",
    paths: [
      { path: "src/commands/tools.ts", score: 24 },
      { path: "src/core/tools/execute.ts", score: 22 },
      { path: "src/core/run-brief.ts", score: 22 },
      { path: "test/tools.test.ts", score: 14 },
    ],
  },
];

function terms(task: string): string[] {
  return [
    ...new Set(
      task
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/)
        .filter((term) => term.length > 2)
        .filter((term) => !TASK_STOPWORDS.has(term)),
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
    const candidates = stdout
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .map((file) => (file.includes(" -> ") ? file.split(" -> ").at(-1)! : file))
      .map((file) => file.replace(/^"|"$/g, ""))
      .filter((file) => !file.startsWith(".threadroot/"));
    return filterExistingRepoFiles(repoRoot, candidates);
  } catch {
    return [];
  }
}

async function isExistingFile(repoRoot: string, filePath: string): Promise<boolean> {
  try {
    return (await stat(path.join(repoRoot, filePath))).isFile();
  } catch {
    return false;
  }
}

async function filterExistingRepoFiles(repoRoot: string, files: string[]): Promise<string[]> {
  const checks = await Promise.all(
    files.map(async (file) => ({
      file,
      exists: await isExistingFile(repoRoot, file),
    })),
  );
  return checks.filter((entry) => entry.exists).map((entry) => entry.file);
}

async function repoFiles(repoRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: repoRoot,
      maxBuffer: 5 * 1024 * 1024,
    });
    const files = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((file) => !file.startsWith(".threadroot/"));
    return files.length > 0 ? (await filterExistingRepoFiles(repoRoot, files)).sort() : [];
  } catch {
    return filterExistingRepoFiles(
      repoRoot,
      (await walkRepo(repoRoot)).filter((file) => !file.startsWith(".threadroot/")),
    ).then((files) => files.sort());
  }
}

async function searchMatches(repoRoot: string, taskTerms: string[]): Promise<RepoSearchMatch[]> {
  const direct = await searchRepo(repoRoot, taskTerms.join(" "), 40);
  if (direct.length > 0) {
    return direct;
  }

  const byTerm = await Promise.all(taskTerms.slice(0, 6).map((term) => searchRepo(repoRoot, term, 8)));
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

function sourcePathBoost(filePath: string): number {
  if (filePath.startsWith("src/")) {
    return 2;
  }
  if (filePath.startsWith("test/") || filePath.startsWith("tests/")) {
    return 1;
  }
  if (filePath === "README.md" || filePath.startsWith("docs/")) {
    return 1;
  }
  return 0;
}

function isLowSignalDotfile(filePath: string, taskTerms: string[]): boolean {
  if (!filePath.startsWith(".") || filePath.startsWith(".github/")) {
    return false;
  }
  const lower = filePath.toLowerCase();
  return !taskTerms.some((term) => lower.includes(term));
}

function textMatchScore(match: RepoSearchMatch, taskTerms: string[]): number {
  let score = 3 + sourcePathBoost(match.path);
  if (isLowSignalDotfile(match.path, taskTerms)) {
    score -= 2;
  }
  return Math.max(1, score);
}

function pathMatchScore(filePath: string, taskTerms: string[]): number {
  const lower = filePath.toLowerCase();
  const base = path.basename(lower);
  let score = 0;
  for (const term of taskTerms) {
    if (LOW_SIGNAL_PATH_TERMS.has(term)) {
      continue;
    }
    if (base.includes(term)) {
      score += term.length >= 5 ? 7 : 3;
    } else if (lower.includes(term)) {
      score += term.length >= 5 ? 4 : 1;
    }
  }
  return score + (score > 0 ? sourcePathBoost(filePath) : 0);
}

function addPathMatches(candidates: Map<string, WorkingSetFile>, files: string[], taskTerms: string[]): void {
  for (const file of files) {
    const score = pathMatchScore(file, taskTerms);
    if (score > 0) {
      addCandidate(candidates, file, score, "path matches task terms");
    }
  }
}

function isThreadrootValueTask(taskTerms: string[]): boolean {
  return taskTerms.includes("threadroot") && taskTerms.some((term) => THREADROOT_VALUE_TERMS.has(term));
}

function addThreadrootValueHints(candidates: Map<string, WorkingSetFile>, files: Set<string>, taskTerms: string[]): void {
  if (!isThreadrootValueTask(taskTerms)) {
    return;
  }
  for (const hint of THREADROOT_VALUE_HINTS) {
    if (files.has(hint.path)) {
      addCandidate(candidates, hint.path, hint.score, hint.reason);
    }
  }
}

function addSurfaceHints(candidates: Map<string, WorkingSetFile>, files: Set<string>, taskTerms: string[]): void {
  const termSet = new Set(taskTerms);
  for (const hint of SURFACE_HINTS) {
    const matchesAll = (hint.all ?? []).every((term) => termSet.has(term));
    const matchesAny = !hint.any || hint.any.some((term) => termSet.has(term));
    const blocked = (hint.not ?? []).some((term) => termSet.has(term));
    if (!matchesAll || !matchesAny || blocked) {
      continue;
    }
    for (const target of hint.paths) {
      if (files.has(target.path)) {
        addCandidate(candidates, target.path, target.score, hint.reason);
      }
    }
  }
}

function isDocumentationTask(taskTerms: string[]): boolean {
  return taskTerms.some((term) => DOC_TASK_TERMS.has(term));
}

function isImplementationTask(task: string, taskTerms: string[]): boolean {
  return IMPLEMENTATION_TASK_RE.test(task) || taskTerms.some((term) => ["command", "index", "mcp", "routing"].includes(term));
}

function isDocSurface(filePath: string): boolean {
  return filePath === "README.md" || filePath === "CHANGELOG.md" || filePath === "SECURITY.md" || filePath === "INTEGRATION.md" || filePath.startsWith("docs/");
}

function addTaskIntentAdjustments(candidates: Map<string, WorkingSetFile>, task: string, taskTerms: string[]): void {
  if (!isImplementationTask(task, taskTerms) || isDocumentationTask(taskTerms)) {
    return;
  }
  for (const candidate of candidates.values()) {
    if (candidate.path.startsWith("src/")) {
      addCandidate(candidates, candidate.path, 18, "implementation source surface");
    } else if (isTestPath(candidate.path)) {
      addCandidate(candidates, candidate.path, 8, "implementation test surface");
    } else if (isDocSurface(candidate.path)) {
      addCandidate(candidates, candidate.path, -18, "docs deprioritized for implementation task");
    }
  }
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

  const [matches, changed, filesInRepo] = await Promise.all([searchMatches(repoRoot, taskTerms), changedFiles(repoRoot), repoFiles(repoRoot)]);
  const index = await readRepoIndex(repoRoot).catch(() => undefined);
  const fileSet = new Set(filesInRepo);
  addPathMatches(candidates, filesInRepo, taskTerms);
  addThreadrootValueHints(candidates, fileSet, taskTerms);
  addSurfaceHints(candidates, fileSet, taskTerms);
  if (index) {
    for (const candidate of scoreIndexCandidates(index, task).slice(0, 40)) {
      if (!fileSet.has(candidate.path)) {
        continue;
      }
      addCandidate(candidates, candidate.path, Math.min(60, Math.ceil(candidate.score / 12)), "index fused rank", candidate.lines?.[0]);
      for (const signal of candidate.signals.slice(0, 4)) {
        addCandidate(candidates, candidate.path, Math.ceil(signal.score), signal.detail ? `${candidate.reasons[0]}: ${signal.detail}` : candidate.reasons[0] ?? "index match", candidate.lines?.[0]);
      }
    }
  }
  for (const match of matches) {
    if (!fileSet.has(match.path)) {
      continue;
    }
    addCandidate(candidates, match.path, textMatchScore(match, taskTerms), "text match for task terms", match.line);
  }
  const changedWeight = changed.length > 25 ? 1 : changed.length > 10 ? 2 : 4;
  for (const file of changed) {
    if (!fileSet.has(file)) {
      continue;
    }
    addCandidate(candidates, file, changedWeight, "changed in current worktree");
  }
  if (context.repoMap?.path) {
    addCandidate(candidates, context.repoMap.path, 1, `repo map is ${context.repoMap.status}`);
  }
  addTaskIntentAdjustments(candidates, task, taskTerms);

  const ranked = [...candidates.values()]
    .filter((entry) => fileSet.has(entry.path))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
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
