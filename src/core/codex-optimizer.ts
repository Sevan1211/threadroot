import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { findExecutable } from "./command-lookup.js";
import { codexCommandPlan, type CodexCommandPlan } from "./codex.js";
import {
  codexThreadrootPath,
  codexThreadrootRelativePath,
  readCodexStateJson,
  writeCodexStateJson,
} from "./codex-state.js";
import { runContextEvals, type ContextEvalReport } from "./context-evals.js";
import { compressRunOutput, type OutputCompression } from "./run-brief.js";
import { executeShell, type ToolRunResult } from "./tools/execute.js";

export type CodexOptimizerMode = "cheap" | "balanced" | "deep";
export type MemoryProfile = "standard" | "conservative" | "tiny";

export type ContextBudget = {
  targetTokens: number;
  hardCapTokens: number;
  sections: {
    instructions: number;
    files: number;
    tests: number;
    verification: number;
    priorLessons: number;
  };
  promptTokens: number;
  withinBudget: boolean;
};

export type PrepBrief = {
  schemaVersion: 1;
  id: string;
  task: string;
  mode: CodexOptimizerMode;
  memory: {
    profile: MemoryProfile;
    maxFiles: number;
    maxScannedFiles: number;
    maxScannedBytesPerFile: number;
    maxVerificationOutputChars: number;
  };
  createdAt: string;
  budget: ContextBudget;
  packetTokenEstimate: number;
  promptTokenEstimate: number;
  firstReads: string[];
  likelyTests: string[];
  verificationCommands: string[];
  files: Array<{
    path: string;
    score: number;
    reasons: string[];
    symbols: string[];
  }>;
  tests: Array<{
    path: string;
    score: number;
    reasons: string[];
  }>;
  warnings: string[];
  prompt: string;
  paths: {
    brief: string;
    prompt: string;
  };
};

export type PrepOptions = {
  mode?: CodexOptimizerMode;
  memoryProfile?: MemoryProfile;
  budgetTokens?: number;
  hardCapTokens?: number;
  maxFiles?: number;
  forceIndex?: boolean;
  requiredCommands?: string[];
};

export type TokenLedger = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  uncachedInputTokens: number;
  toolOutputTokens: number;
  commandExecutions: number;
  fileChanges: number;
  mcpCalls: number;
  webSearches: number;
  planUpdates: number;
  events: number;
};

export type CodexVerificationResult = {
  command: string;
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  rawOutputPath: string;
  compactOutputPath: string;
  summary: string;
  compression: OutputCompression;
};

export type CodexRunAttempt = {
  attempt: number;
  promptPath: string;
  codex: {
    runner: CodexCommandPlan["runner"];
    command: string;
    args: string[];
    exitCode: number | null;
    ok: boolean;
    timedOut: boolean;
    durationMs: number;
    rawOutputPath: string;
    compactOutputPath: string;
    summary: string;
    compression: OutputCompression;
    outputStrategy: "streamed" | "buffered";
    rawOutputBytes: number;
    compactSampleTruncated: boolean;
  };
  ledger: TokenLedger;
  evidence: CodexRunEvidence;
  verification: CodexVerificationResult[];
};

export type CodexRunEvidence = {
  readFiles: string[];
  editedFiles: string[];
  commands: string[];
  mcpTools: string[];
  generatedOrCachePaths: string[];
};

export type ContextPrecisionMetrics = {
  suggestedFiles: string[];
  readFiles: string[];
  editedFiles: string[];
  suggestedReadHits: number;
  suggestedEditHits: number;
  missedReadFiles: string[];
  missedEditedFiles: string[];
  irrelevantReadRatio: number;
  generatedLeakage: string[];
};

export type CodexRunScore = {
  schemaVersion: 1;
  runId: string;
  task: string;
  mode: CodexOptimizerMode;
  status: "passed" | "failed" | "blocked";
  attempts: number;
  tokenLedger: TokenLedger;
  tokensToGreen: number | null;
  verification: {
    passed: boolean;
    commands: string[];
    failedCommands: string[];
  };
  resources: {
    memoryProfile: MemoryProfile;
    codexRawOutputBytes: number;
    streamedOutput: boolean;
    compactSamplesTruncated: number;
  };
  contextPrecision: ContextPrecisionMetrics;
  recommendations: string[];
  paths: {
    run: string;
    score: string;
  };
};

export type CodexRunReport = {
  schemaVersion: 1;
  runId: string;
  task: string;
  mode: CodexOptimizerMode;
  startedAt: string;
  endedAt: string;
  prep: PrepBrief;
  attempts: CodexRunAttempt[];
  score: CodexRunScore;
  paths: {
    run: string;
    score: string;
  };
};

export type CodexRunOptions = PrepOptions & {
  codexBin?: string;
  ephemeral?: boolean;
  timeoutMs?: number;
  verificationTimeoutMs?: number;
  dryRun?: boolean;
};

export type TuneProposal = {
  type: "routing-hint" | "agents-md" | "skill" | "verification";
  priority: "low" | "medium" | "high";
  title: string;
  evidence: string[];
  suggestedChange: string;
  autoApplied: boolean;
};

export type TuneReport = {
  schemaVersion: 1;
  createdAt: string;
  sourceScore?: CodexRunScore;
  proposals: TuneProposal[];
  routingHintsPath: string;
  reportPath: string;
};

export type CodexEvalReport = {
  schemaVersion: 1;
  createdAt: string;
  baseline: ContextEvalReport;
  optimizer: {
    cases: number;
    averagePrepPromptTokens: number;
    averageLegacyPacketTokens: number;
    estimatedTokenReduction: number;
    estimatedTokenReductionRatio: number;
  };
  cases: Array<{
    id: string;
    task: string;
    legacyPacketTokens: number;
    prepPromptTokens: number;
    reduction: number;
    firstReads: string[];
  }>;
};

const MAX_PROMPT_FAILURE_CHARS = 3_000;
const MAX_JSONL_EVENT_CHARS = 512_000;
const STREAM_SAMPLE_HEAD_CHARS = 8_000;
const STREAM_SAMPLE_TAIL_CHARS = 64_000;

type MemoryProfileConfig = {
  targetTokens: number;
  hardCapTokens: number;
  maxFiles: number;
  maxIndexFiles: number;
  maxScannedBytes: number;
  verificationOutputChars: number;
};

const MEMORY_PROFILES: Record<MemoryProfile, MemoryProfileConfig> = {
  standard: {
    targetTokens: 2_500,
    hardCapTokens: 3_000,
    maxFiles: 6,
    maxIndexFiles: 4_000,
    maxScannedBytes: 200_000,
    verificationOutputChars: 1_000_000,
  },
  conservative: {
    targetTokens: 1_800,
    hardCapTokens: 2_200,
    maxFiles: 4,
    maxIndexFiles: 2_000,
    maxScannedBytes: 120_000,
    verificationOutputChars: 250_000,
  },
  tiny: {
    targetTokens: 1_200,
    hardCapTokens: 1_600,
    maxFiles: 3,
    maxIndexFiles: 1_000,
    maxScannedBytes: 64_000,
    verificationOutputChars: 100_000,
  },
};

function memoryProfileConfig(profile: MemoryProfile | undefined): { profile: MemoryProfile; config: MemoryProfileConfig } {
  const resolved = profile ?? "conservative";
  return { profile: resolved, config: MEMORY_PROFILES[resolved] };
}

type PrepPacketFile = {
  path: string;
  score: number;
  reasons: string[];
  symbols: Array<{ name: string; kind: string }>;
};

type PrepPacketCommand = {
  command: string;
  risk: "low" | "medium" | "high";
};

type PrepPacket = {
  tokenEstimate: number;
  nextReads: string[];
  files: PrepPacketFile[];
  tests: PrepPacketFile[];
  commands: PrepPacketCommand[];
  warnings: string[];
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "codex-run"
  );
}

function nowId(task: string): { id: string; at: string } {
  const at = new Date().toISOString();
  return { id: `${at.replace(/[:.]/g, "-")}-${slug(task)}`, at };
}

function compactFile(file: PrepPacketFile): PrepBrief["files"][number] {
  return {
    path: file.path,
    score: file.score,
    reasons: file.reasons.slice(0, 3),
    symbols: file.symbols.map((symbol) => symbol.name).slice(0, 6),
  };
}

function compactTest(file: PrepPacketFile): PrepBrief["tests"][number] {
  return {
    path: file.path,
    score: file.score,
    reasons: file.reasons.slice(0, 2),
  };
}

async function readPackageJson(repoRoot: string): Promise<{ packageManager?: string; scripts?: Record<string, string> }> {
  try {
    return JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as {
      packageManager?: string;
      scripts?: Record<string, string>;
    };
  } catch {
    return {};
  }
}

function tokenizeTask(task: string): string[] {
  return [
    ...new Set(
      task
        .toLowerCase()
        .split(/[^a-z0-9_/-]+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !["the", "and", "for", "with", "from", "this", "that", "into"].includes(term)),
    ),
  ].slice(0, 16);
}

function shouldSkipDir(name: string): boolean {
  return [
    ".git",
    ".hg",
    ".svn",
    ".threadroot",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    ".nuxt",
    ".turbo",
    ".cache",
    "target",
    "vendor",
  ].includes(name);
}

function isLikelyTextFile(repoPath: string): boolean {
  if (/(^|\/)(?:package\.json|tsconfig\.json|vite\.config\.[cm]?[tj]s|vitest\.config\.[cm]?[tj]s|AGENTS\.md|README\.md)$/u.test(repoPath)) {
    return true;
  }
  return /\.(?:[cm]?[tj]sx?|json|md|mdx|yaml|yml|toml|rs|py|go|java|kt|rb|php|css|scss|html|vue|svelte|sh)$/u.test(repoPath);
}

function isTestPath(repoPath: string): boolean {
  return /(^|\/)(?:test|tests|__tests__|spec)\//u.test(repoPath) || /\.(?:test|spec)\.[cm]?[tj]sx?$/u.test(repoPath);
}

async function listRepoFiles(repoRoot: string, maxIndexFiles: number): Promise<string[]> {
  const results: string[] = [];
  async function walk(relativeDir: string): Promise<void> {
    const dir = path.join(repoRoot, relativeDir);
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (results.length >= maxIndexFiles) return;
      const repoPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name) && !repoPath.startsWith(".codex/threadroot")) {
          await walk(repoPath);
        }
        continue;
      }
      if (entry.isFile() && isLikelyTextFile(repoPath)) {
        results.push(repoPath);
      }
    }
  }
  await walk("");
  return results.sort();
}

async function readRepoText(repoRoot: string, repoPath: string, maxScannedBytes: number): Promise<string> {
  const fullPath = path.join(repoRoot, repoPath);
  const text = await readFile(fullPath, "utf8").catch(() => "");
  return text.length > maxScannedBytes ? text.slice(0, maxScannedBytes) : text;
}

function countOccurrences(text: string, term: string): number {
  if (!term) return 0;
  let count = 0;
  let index = text.indexOf(term);
  while (index !== -1 && count < 20) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }
  return count;
}

function extractSymbols(repoPath: string, text: string): PrepPacketFile["symbols"] {
  const symbols: PrepPacketFile["symbols"] = [];
  const addMatches = (kind: string, pattern: RegExp): void => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) && symbols.length < 8) {
      const name = match.groups?.name ?? match[1];
      if (name && !symbols.some((symbol) => symbol.name === name)) {
        symbols.push({ name, kind });
      }
    }
  };

  if (/\.(?:[cm]?[tj]sx?|vue|svelte)$/u.test(repoPath)) {
    addMatches("function", /\b(?:export\s+)?(?:async\s+)?function\s+(?<name>[A-Za-z_$][\w$]*)/gu);
    addMatches("class", /\b(?:export\s+)?class\s+(?<name>[A-Za-z_$][\w$]*)/gu);
    addMatches("declaration", /\b(?:export\s+)?(?:const|let|var|type|interface)\s+(?<name>[A-Za-z_$][\w$]*)/gu);
  } else if (/\.py$/u.test(repoPath)) {
    addMatches("function", /^\s*def\s+(?<name>[A-Za-z_][\w]*)/gmu);
    addMatches("class", /^\s*class\s+(?<name>[A-Za-z_][\w]*)/gmu);
  } else if (/\.rs$/u.test(repoPath)) {
    addMatches("function", /\b(?:pub\s+)?fn\s+(?<name>[A-Za-z_][\w]*)/gu);
    addMatches("struct", /\b(?:pub\s+)?(?:struct|enum|trait)\s+(?<name>[A-Za-z_][\w]*)/gu);
  }
  return symbols;
}

function scoreRepoFile(repoPath: string, text: string, terms: string[]): PrepPacketFile {
  const lowerPath = repoPath.toLowerCase();
  const lowerText = text.toLowerCase();
  const pathHits = terms.filter((term) => lowerPath.includes(term));
  const contentHits = terms
    .map((term) => ({ term, count: countOccurrences(lowerText, term) }))
    .filter((entry) => entry.count > 0);
  const symbolHits = extractSymbols(repoPath, text).filter((symbol) =>
    terms.some((term) => symbol.name.toLowerCase().includes(term)),
  );
  const isTest = isTestPath(repoPath);
  const score =
    pathHits.length * 12 +
    contentHits.reduce((sum, entry) => sum + Math.min(entry.count, 8), 0) +
    symbolHits.length * 8 +
    (isTest ? 2 : 0);
  const reasons = [
    pathHits.length > 0 ? `path matches ${pathHits.join(", ")}` : undefined,
    contentHits.length > 0
      ? `content mentions ${contentHits
          .slice(0, 4)
          .map((entry) => `${entry.term} x${entry.count}`)
          .join(", ")}`
      : undefined,
    symbolHits.length > 0 ? `symbols match ${symbolHits.map((symbol) => symbol.name).slice(0, 4).join(", ")}` : undefined,
    isTest ? "test or spec file" : undefined,
  ].filter((reason): reason is string => Boolean(reason));
  return {
    path: repoPath,
    score,
    reasons: reasons.length > 0 ? reasons : ["nearby text file"],
    symbols: extractSymbols(repoPath, text),
  };
}

async function assemblePrepPacket(
  repoRoot: string,
  task: string,
  options: PrepOptions,
  memory: MemoryProfileConfig,
): Promise<PrepPacket> {
  const terms = tokenizeTask(task);
  const files = await listRepoFiles(repoRoot, memory.maxIndexFiles);
  const candidates: PrepPacketFile[] = [];
  for (const repoPath of files) {
    const text = await readRepoText(repoRoot, repoPath, memory.maxScannedBytes);
    candidates.push(scoreRepoFile(repoPath, text, terms));
  }
  const ranked = candidates.filter((file) => file.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const fallback = ranked.length > 0 ? ranked : candidates.filter((file) => !isTestPath(file.path)).slice(0, options.maxFiles ?? memory.maxFiles);
  const maxFiles = options.maxFiles ?? memory.maxFiles;
  const primaryFiles = fallback.filter((file) => !isTestPath(file.path)).slice(0, maxFiles);
  const tests = candidates
    .filter((file) => isTestPath(file.path) && (file.score > 0 || primaryFiles.some((primary) => file.path.includes(path.basename(primary.path).split(".")[0] ?? ""))))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 4);
  const packageJson = await readPackageJson(repoRoot);
  const runner = packageRunner(packageJson.packageManager);
  const commands: PrepPacketCommand[] = Object.keys(packageJson.scripts ?? {})
    .filter((name) => ["typecheck", "lint", "test", "build"].includes(name))
    .map((name) => ({ command: runner === "npm run" ? `npm run ${name}` : `${runner} ${name}`, risk: "low" }));
  const packet: PrepPacket = {
    tokenEstimate: 0,
    nextReads: [...new Set([...primaryFiles.map((file) => file.path), ...tests.map((file) => file.path)])].slice(0, 8),
    files: primaryFiles,
    tests,
    commands,
    warnings:
      files.length >= memory.maxIndexFiles
        ? [`Preflight scanned the first ${memory.maxIndexFiles} files only; narrow task terms or add ignores for very large repos.`]
        : [],
  };
  const indexSnapshot = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    fileCount: files.length,
    terms,
    topFiles: primaryFiles.map((file) => ({ path: file.path, score: file.score, reasons: file.reasons })),
    topTests: tests.map((file) => ({ path: file.path, score: file.score, reasons: file.reasons })),
  };
  await writeCodexStateJson(repoRoot, ["index", "latest.json"], indexSnapshot);
  packet.tokenEstimate = estimateTokens(JSON.stringify(packet));
  return packet;
}

function packageRunner(packageManager: string | undefined): string {
  if (packageManager?.startsWith("pnpm@")) return "pnpm";
  if (packageManager?.startsWith("yarn@")) return "yarn";
  if (packageManager?.startsWith("bun@")) return "bun";
  return "npm run";
}

async function inferVerificationCommands(
  repoRoot: string,
  packet: PrepPacket,
  requiredCommands: string[] | undefined,
): Promise<string[]> {
  if (requiredCommands && requiredCommands.length > 0) {
    return requiredCommands;
  }
  const packageJson = await readPackageJson(repoRoot);
  const scripts = packageJson.scripts ?? {};
  const runner = packageRunner(packageJson.packageManager);
  const commandFor = (name: string): string => (runner === "npm run" ? `npm run ${name}` : `${runner} ${name}`);

  const inferred: string[] = [];
  for (const name of ["typecheck", "lint", "test"]) {
    if (scripts[name]) {
      inferred.push(commandFor(name));
    }
    if (inferred.length >= 2) {
      break;
    }
  }
  if (inferred.length === 0) {
    inferred.push(...packet.commands.filter((command) => command.risk === "low").map((command) => command.command).slice(0, 1));
  }
  return [...new Set(inferred)].slice(0, 2);
}

function buildPrompt(input: {
  task: string;
  mode: CodexOptimizerMode;
  firstReads: string[];
  tests: string[];
  files: PrepBrief["files"];
  warnings: string[];
  verificationCommands: string[];
}): string {
  const sections = [
    "You are Codex working from a Threadroot preflight brief.",
    "",
    `Goal: ${input.task}`,
    "",
    "Context discipline:",
    "- Read the listed files first before broad search.",
    "- Keep the task small; avoid unrelated refactors.",
    "- Prefer the narrowest edit that satisfies the goal.",
    "- Treat generated, cache, build, and dependency files as low-signal unless the task explicitly targets them.",
    "",
    input.firstReads.length > 0 ? `Read first:\n${input.firstReads.map((file) => `- ${file}`).join("\n")}` : "Read first: use targeted search.",
    "",
    input.files.length > 0
      ? `Why these files:\n${input.files
          .slice(0, 6)
          .map((file) => `- ${file.path}: ${file.reasons.join("; ")}${file.symbols.length > 0 ? `; symbols ${file.symbols.join(", ")}` : ""}`)
          .join("\n")}`
      : "",
    input.tests.length > 0 ? `Likely tests:\n${input.tests.map((file) => `- ${file}`).join("\n")}` : "",
    input.verificationCommands.length > 0
      ? `Definition of done:\n${input.verificationCommands.map((command) => `- ${command}`).join("\n")}`
      : "Definition of done: make the smallest meaningful verification pass, or explain why verification is blocked.",
    input.warnings.length > 0 ? `Warnings:\n${input.warnings.map((warning) => `- ${warning}`).join("\n")}` : "",
  ].filter(Boolean);

  if (input.mode === "deep") {
    sections.push(
      "",
      "Deep mode:",
      "- Use read-only subagents only when exploration can run independently.",
      "- Suggested roles: explorer for likely files, tester for verification, reviewer for final diff.",
      "- Subagents must summarize evidence with file paths and must not edit files.",
    );
  }

  return `${sections.join("\n")}\n`;
}

function budgetFor(prompt: string, packet: PrepPacket, targetTokens: number, hardCapTokens: number): ContextBudget {
  const fileTokens = estimateTokens(JSON.stringify(packet.files.map((file) => ({ path: file.path, reasons: file.reasons }))));
  const testTokens = estimateTokens(JSON.stringify(packet.tests.map((file) => ({ path: file.path, reasons: file.reasons }))));
  const verificationTokens = estimateTokens(JSON.stringify(packet.commands.map((command) => command.command)));
  const promptTokens = estimateTokens(prompt);
  return {
    targetTokens,
    hardCapTokens,
    sections: {
      instructions: Math.min(600, promptTokens),
      files: fileTokens,
      tests: testTokens,
      verification: verificationTokens,
      priorLessons: 0,
    },
    promptTokens,
    withinBudget: promptTokens <= hardCapTokens,
  };
}

async function writePrepBrief(repoRoot: string, brief: PrepBrief): Promise<PrepBrief> {
  await writeCodexStateJson(repoRoot, ["briefs", `${brief.id}.json`], brief);
  await writeCodexStateJson(repoRoot, ["briefs", "latest.json"], brief);
  const promptPath = codexThreadrootPath(repoRoot, "briefs", `${brief.id}.prompt.md`);
  await mkdir(path.dirname(promptPath), { recursive: true });
  await writeFile(promptPath, brief.prompt, "utf8");
  return brief;
}

export async function createPrepBrief(repoRoot: string, task: string, options: PrepOptions = {}): Promise<PrepBrief> {
  const mode = options.mode ?? "cheap";
  const memory = memoryProfileConfig(options.memoryProfile);
  const targetTokens = options.budgetTokens ?? memory.config.targetTokens;
  const hardCapTokens = options.hardCapTokens ?? memory.config.hardCapTokens;
  const maxFiles = options.maxFiles ?? memory.config.maxFiles;
  const packet = await assemblePrepPacket(repoRoot, task, { ...options, budgetTokens: targetTokens, hardCapTokens, maxFiles }, memory.config);
  const verificationCommands = await inferVerificationCommands(repoRoot, packet, options.requiredCommands);
  const firstReads = packet.nextReads.slice(0, 6);
  const files = packet.files.slice(0, 6).map(compactFile);
  const tests = packet.tests.slice(0, 4).map(compactTest);
  const prompt = buildPrompt({
    task,
    mode,
    firstReads,
    files,
    tests: tests.map((test) => test.path),
    warnings: packet.warnings.slice(0, 6),
    verificationCommands,
  });
  const budget = budgetFor(prompt, packet, targetTokens, hardCapTokens);
  if (!budget.withinBudget) {
    throw new Error(`Prep prompt is ${budget.promptTokens} token(s), above hard cap ${hardCapTokens}. Lower --max-files or --budget.`);
  }
  const { id, at } = nowId(task);
  return writePrepBrief(repoRoot, {
    schemaVersion: 1,
    id,
    task,
    mode,
    memory: {
      profile: memory.profile,
      maxFiles,
      maxScannedFiles: memory.config.maxIndexFiles,
      maxScannedBytesPerFile: memory.config.maxScannedBytes,
      maxVerificationOutputChars: memory.config.verificationOutputChars,
    },
    createdAt: at,
    budget,
    packetTokenEstimate: packet.tokenEstimate,
    promptTokenEstimate: estimateTokens(prompt),
    firstReads,
    likelyTests: tests.map((test) => test.path),
    verificationCommands,
    files,
    tests,
    warnings: packet.warnings,
    prompt,
    paths: {
      brief: codexThreadrootRelativePath("briefs", `${id}.json`),
      prompt: codexThreadrootRelativePath("briefs", `${id}.prompt.md`),
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function walkRecords(value: unknown, visit: (record: Record<string, unknown>) => void): void {
  const record = asRecord(value);
  if (!record) return;
  visit(record);
  for (const nested of Object.values(record)) {
    if (Array.isArray(nested)) {
      for (const entry of nested) {
        walkRecords(entry, visit);
      }
    } else {
      walkRecords(nested, visit);
    }
  }
}

function stringField(value: unknown, keys: string[]): string | undefined {
  let found: string | undefined;
  walkRecords(value, (record) => {
    if (found) return;
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) {
        found = candidate;
        return;
      }
    }
  });
  return found;
}

function numberField(value: unknown, keys: string[]): number | undefined {
  let found: number | undefined;
  walkRecords(value, (record) => {
    if (found !== undefined) return;
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        found = candidate;
        return;
      }
    }
  });
  return found;
}

function allStrings(value: unknown): string[] {
  const strings: string[] = [];
  walkRecords(value, (record) => {
    for (const candidate of Object.values(record)) {
      if (typeof candidate === "string") {
        strings.push(candidate);
      }
    }
  });
  return strings;
}

export function parseCodexJsonl(output: string): unknown[] {
  const events: unknown[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.startsWith("{")) {
      continue;
    }
    try {
      events.push(JSON.parse(line) as unknown);
    } catch {
      // Preserve the raw log; ignore non-event diagnostic lines here.
    }
  }
  return events;
}

function eventType(event: unknown): string {
  return [stringField(event, ["type", "event_type", "kind"]), stringField(asRecord(event)?.item, ["type", "kind"])]
    .filter(Boolean)
    .join(":")
    .toLowerCase();
}

function normalizeRepoPath(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("://")) {
    return undefined;
  }
  return normalized.replace(/^\.\//, "");
}

function isGeneratedOrCachePath(value: string): boolean {
  return /^(?:\.codex\/threadroot|\.threadroot|dist|coverage|node_modules|\.git|tmp|\.tmp)\b/u.test(value);
}

function emptyLedger(): TokenLedger {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    uncachedInputTokens: 0,
    toolOutputTokens: 0,
    commandExecutions: 0,
    fileChanges: 0,
    mcpCalls: 0,
    webSearches: 0,
    planUpdates: 0,
    events: 0,
  };
}

function addLedger(left: TokenLedger, right: TokenLedger): TokenLedger {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningOutputTokens: left.reasoningOutputTokens + right.reasoningOutputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
    toolOutputTokens: left.toolOutputTokens + right.toolOutputTokens,
    commandExecutions: left.commandExecutions + right.commandExecutions,
    fileChanges: left.fileChanges + right.fileChanges,
    mcpCalls: left.mcpCalls + right.mcpCalls,
    webSearches: left.webSearches + right.webSearches,
    planUpdates: left.planUpdates + right.planUpdates,
    events: left.events + right.events,
  };
}

type EvidenceAccumulator = {
  readFiles: Set<string>;
  editedFiles: Set<string>;
  commands: Set<string>;
  mcpTools: Set<string>;
};

function applyEventToLedger(ledger: TokenLedger, event: unknown): void {
  ledger.events += 1;
  const type = eventType(event);
  const inputTokens = numberField(event, ["input_tokens", "inputTokens"]) ?? 0;
  const cachedInputTokens = numberField(event, ["cached_input_tokens", "cachedInputTokens"]) ?? 0;
  const outputTokens = numberField(event, ["output_tokens", "outputTokens"]) ?? 0;
  const reasoningOutputTokens = numberField(event, ["reasoning_output_tokens", "reasoningOutputTokens"]) ?? 0;
  ledger.inputTokens += inputTokens;
  ledger.cachedInputTokens += cachedInputTokens;
  ledger.outputTokens += outputTokens;
  ledger.reasoningOutputTokens += reasoningOutputTokens;
  if (type.includes("command_execution")) ledger.commandExecutions += 1;
  if (type.includes("file_change") || type.includes("patch") || type.includes("edit") || type.includes("write")) ledger.fileChanges += 1;
  if (type.includes("mcp")) ledger.mcpCalls += 1;
  if (type.includes("web_search")) ledger.webSearches += 1;
  if (type.includes("plan")) ledger.planUpdates += 1;
  if (type.includes("command") || type.includes("tool")) {
    ledger.toolOutputTokens += estimateTokens(allStrings(event).join("\n"));
  }
}

function finalizeLedger(ledger: TokenLedger): TokenLedger {
  ledger.uncachedInputTokens = Math.max(0, ledger.inputTokens - ledger.cachedInputTokens);
  ledger.totalTokens = ledger.inputTokens + ledger.outputTokens + ledger.reasoningOutputTokens;
  return ledger;
}

function emptyEvidenceAccumulator(): EvidenceAccumulator {
  return {
    readFiles: new Set<string>(),
    editedFiles: new Set<string>(),
    commands: new Set<string>(),
    mcpTools: new Set<string>(),
  };
}

function applyEventToEvidence(evidence: EvidenceAccumulator, event: unknown): void {
  const type = eventType(event);
  const filePath = normalizeRepoPath(stringField(event, ["path", "file_path", "filePath", "filename"]));
  if (filePath) {
    if (type.includes("read")) {
      evidence.readFiles.add(filePath);
    } else if (type.includes("file") || type.includes("edit") || type.includes("patch") || type.includes("write")) {
      evidence.editedFiles.add(filePath);
    }
  }
  const command = stringField(event, ["command", "cmd", "shell_command", "shellCommand"]);
  if (command && (type.includes("command") || type.includes("exec") || type.includes("bash") || type.includes("shell"))) {
    evidence.commands.add(command);
  }
  const tool = stringField(event, ["tool", "tool_name", "name"]);
  if (tool && type.includes("mcp")) {
    evidence.mcpTools.add(tool);
  }
}

function finalizeEvidence(evidence: EvidenceAccumulator): CodexRunEvidence {
  const generatedOrCachePaths = [...evidence.readFiles, ...evidence.editedFiles].filter(isGeneratedOrCachePath);
  return {
    readFiles: [...evidence.readFiles].sort(),
    editedFiles: [...evidence.editedFiles].sort(),
    commands: [...evidence.commands].sort(),
    mcpTools: [...evidence.mcpTools].sort(),
    generatedOrCachePaths: [...new Set(generatedOrCachePaths)].sort(),
  };
}

function createJsonlMetricsAccumulator(): {
  add: (chunk: string) => void;
  finish: () => { ledger: TokenLedger; evidence: CodexRunEvidence };
} {
  const ledger = emptyLedger();
  const evidence = emptyEvidenceAccumulator();
  let buffered = "";
  let droppingOversizedLine = false;
  let droppedLineChars = 0;

  const consumeLine = (rawLine: string): void => {
    const line = rawLine.trim();
    if (!line || !line.startsWith("{")) return;
    try {
      const event = JSON.parse(line) as unknown;
      applyEventToLedger(ledger, event);
      applyEventToEvidence(evidence, event);
    } catch {
      // Raw output is still written to disk; non-JSON diagnostics are ignored for metrics.
    }
  };

  const consumeOversizedLine = (): void => {
    ledger.events += 1;
    ledger.toolOutputTokens += Math.ceil(droppedLineChars / 4);
    droppingOversizedLine = false;
    droppedLineChars = 0;
  };

  return {
    add: (chunk) => {
      let offset = 0;
      while (offset < chunk.length) {
        const newlineIndex = chunk.indexOf("\n", offset);
        const hasNewline = newlineIndex !== -1;
        const rawSegment = hasNewline ? chunk.slice(offset, newlineIndex) : chunk.slice(offset);
        const segment = rawSegment.endsWith("\r") ? rawSegment.slice(0, -1) : rawSegment;
        if (droppingOversizedLine) {
          droppedLineChars += segment.length;
          if (hasNewline) {
            consumeOversizedLine();
          }
        } else if (buffered.length + segment.length > MAX_JSONL_EVENT_CHARS) {
          droppedLineChars = buffered.length + segment.length;
          buffered = "";
          droppingOversizedLine = true;
          if (hasNewline) {
            consumeOversizedLine();
          }
        } else {
          buffered += segment;
          if (hasNewline) {
            consumeLine(buffered);
            buffered = "";
          }
        }
        offset = hasNewline ? newlineIndex + 1 : chunk.length;
      }
    },
    finish: () => {
      if (droppingOversizedLine) {
        consumeOversizedLine();
      } else {
        consumeLine(buffered);
      }
      buffered = "";
      return {
        ledger: finalizeLedger(ledger),
        evidence: finalizeEvidence(evidence),
      };
    },
  };
}

export function codexTokenLedgerFromJsonl(output: string): TokenLedger {
  const metrics = createJsonlMetricsAccumulator();
  metrics.add(output);
  return metrics.finish().ledger;
}

export function codexRunEvidenceFromJsonl(output: string): CodexRunEvidence {
  const metrics = createJsonlMetricsAccumulator();
  metrics.add(output);
  return metrics.finish().evidence;
}

async function writeOutputPair(basePath: string, output: string): Promise<{
  rawOutputPath: string;
  compactOutputPath: string;
  summary: string;
  compression: OutputCompression;
}> {
  await mkdir(path.dirname(basePath), { recursive: true });
  const rawOutputPath = `${basePath}.log`;
  const compactOutputPath = `${basePath}.brief.md`;
  await writeFile(rawOutputPath, output, "utf8");
  const compact = compressRunOutput(output);
  await writeFile(compactOutputPath, compact.text, "utf8");
  return {
    rawOutputPath,
    compactOutputPath,
    summary:
      compact.compression.estimatedTokensSaved > 0
        ? `Compact output saved about ${compact.compression.estimatedTokensSaved} token(s).`
        : "Compact output preserved the full signal.",
    compression: compact.compression,
  };
}

type StreamSample = {
  add: (chunk: string) => void;
  finish: () => { text: string; bytes: number; truncated: boolean };
};

function createStreamSample(headLimit = STREAM_SAMPLE_HEAD_CHARS, tailLimit = STREAM_SAMPLE_TAIL_CHARS): StreamSample {
  let head = "";
  let tail = "";
  let bytes = 0;
  let truncated = false;
  return {
    add: (chunk) => {
      bytes += Buffer.byteLength(chunk);
      let remaining = chunk;
      if (head.length < headLimit) {
        const headRoom = headLimit - head.length;
        head += remaining.slice(0, headRoom);
        remaining = remaining.slice(headRoom);
      }
      if (remaining.length > 0) {
        truncated = true;
        tail = `${tail}${remaining}`.slice(-tailLimit);
      }
    },
    finish: () => ({
      text: truncated
        ? [
            head,
            "",
            "[threadroot: compact sample omitted the middle of a streamed Codex log; full output is in the raw log.]",
            "",
            tail,
          ].join("\n")
        : head,
      bytes,
      truncated,
    }),
  };
}

async function writeCompactOutputFromSample(
  compactOutputPath: string,
  sampleText: string,
  truncated: boolean,
): Promise<{
  summary: string;
  compression: OutputCompression;
}> {
  const compact = compressRunOutput(sampleText);
  const text = truncated
    ? `${compact.text}\n\n[threadroot] Compact brief was generated from bounded head/tail samples. See the raw log for the full stream.\n`
    : compact.text;
  await writeFile(compactOutputPath, text, "utf8");
  return {
    summary: truncated
      ? `Raw output was streamed to disk; compact brief used a bounded sample and saved about ${compact.compression.estimatedTokensSaved} token(s).`
      : compact.compression.estimatedTokensSaved > 0
        ? `Compact output saved about ${compact.compression.estimatedTokensSaved} token(s).`
        : "Compact output preserved the full signal.",
    compression: compact.compression,
  };
}

type CodexInvocationResult = CodexRunAttempt["codex"] & {
  ledger: TokenLedger;
  evidence: CodexRunEvidence;
};

async function invokeCodex(input: {
  repoRoot: string;
  runId: string;
  attempt: number;
  prompt: string;
  codexBin?: string;
  ephemeral?: boolean;
  timeoutMs: number;
}): Promise<CodexInvocationResult> {
  const started = Date.now();
  const plan = codexCommandPlan({ repoRoot: input.repoRoot, codexBin: input.codexBin, ephemeral: input.ephemeral });
  const command = await findExecutable(plan.command);
  const basePath = codexThreadrootPath(input.repoRoot, "runs", input.runId, `codex-attempt-${input.attempt}`);
  if (!command) {
    const artifacts = await writeOutputPair(basePath, `[threadroot] Codex command not found: ${plan.command}\n`);
    return {
      runner: plan.runner,
      command: plan.command,
      args: plan.args,
      exitCode: null,
      ok: false,
      timedOut: false,
      durationMs: Date.now() - started,
      outputStrategy: "buffered",
      rawOutputBytes: Buffer.byteLength(`[threadroot] Codex command not found: ${plan.command}\n`),
      compactSampleTruncated: false,
      ledger: emptyLedger(),
      evidence: finalizeEvidence(emptyEvidenceAccumulator()),
      ...artifacts,
    };
  }

  return new Promise((resolve, reject) => {
    void mkdir(path.dirname(basePath), { recursive: true })
      .then(() => {
        const rawOutputPath = `${basePath}.log`;
        const compactOutputPath = `${basePath}.brief.md`;
        const rawStream = createWriteStream(rawOutputPath, { encoding: "utf8" });
        const metrics = createJsonlMetricsAccumulator();
        const sample = createStreamSample();
        const writeChunk = (
          chunk: string,
          streamName: "stdout" | "stderr",
          source: ReturnType<typeof spawn>["stdout"] | ReturnType<typeof spawn>["stderr"],
        ): void => {
          const text = streamName === "stderr" ? `[stderr] ${chunk}` : chunk;
          sample.add(text);
          if (streamName === "stdout") {
            metrics.add(chunk);
          }
          if (!rawStream.write(text)) {
            source?.pause();
            rawStream.once("drain", () => source?.resume());
          }
        };

    const child = spawn(command, plan.args, {
      cwd: input.repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_500).unref();
    }, input.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      writeChunk(chunk, "stdout", child.stdout);
    });
    child.stderr.on("data", (chunk: string) => {
      writeChunk(chunk, "stderr", child.stderr);
    });
    child.on("error", async (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const failure = `[threadroot] Failed to start ${command}: ${error.message}\n`;
        rawStream.write(failure);
        rawStream.end();
        await once(rawStream, "finish");
        sample.add(failure);
        const compact = await writeCompactOutputFromSample(compactOutputPath, sample.finish().text, false);
        resolve({
          runner: plan.runner,
          command,
          args: plan.args,
          exitCode: null,
          ok: false,
          timedOut,
          durationMs: Date.now() - started,
          rawOutputPath,
          compactOutputPath,
          outputStrategy: "streamed",
          rawOutputBytes: Buffer.byteLength(failure),
          compactSampleTruncated: false,
          ledger: emptyLedger(),
          evidence: finalizeEvidence(emptyEvidenceAccumulator()),
          ...compact,
        });
      } catch (writeError) {
        reject(writeError);
      }
    });
    child.on("close", async (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (timedOut) {
          const timeoutMessage = `\n[threadroot] Codex command timed out after ${input.timeoutMs}ms.\n`;
          sample.add(timeoutMessage);
          rawStream.write(timeoutMessage);
        }
        rawStream.end();
        await once(rawStream, "finish");
        const sampled = sample.finish();
        const compact = await writeCompactOutputFromSample(compactOutputPath, sampled.text, sampled.truncated);
        const eventMetrics = metrics.finish();
        resolve({
          runner: plan.runner,
          command,
          args: plan.args,
          exitCode,
          ok: !timedOut && exitCode === 0,
          timedOut,
          durationMs: Date.now() - started,
          rawOutputPath,
          compactOutputPath,
          outputStrategy: "streamed",
          rawOutputBytes: sampled.bytes,
          compactSampleTruncated: sampled.truncated,
          ledger: eventMetrics.ledger,
          evidence: eventMetrics.evidence,
          ...compact,
        });
      } catch (writeError) {
        reject(writeError);
      }
    });

    if (plan.promptViaStdin) {
      child.stdin.end(input.prompt);
    } else {
      child.stdin.end();
    }
      })
      .catch(reject);
  });
}

async function runVerification(
  repoRoot: string,
  runId: string,
  attempt: number,
  commands: string[],
  timeoutMs: number,
  maxOutputChars: number,
): Promise<CodexVerificationResult[]> {
  const results: CodexVerificationResult[] = [];
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index]!;
    const result: ToolRunResult = await executeShell(command, { cwd: repoRoot, timeoutMs, maxOutputChars });
    const artifacts = await writeOutputPair(
      codexThreadrootPath(repoRoot, "runs", runId, `verify-attempt-${attempt}-${index + 1}`),
      [result.stdout, result.stderr].filter(Boolean).join("\n"),
    );
    results.push({
      command,
      ok: result.ok,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      ...artifacts,
    });
  }
  return results;
}

async function readOutput(filePath: string): Promise<string> {
  return readFile(filePath, "utf8").catch(() => "");
}

function aggregateEvidence(attempts: CodexRunAttempt[]): CodexRunEvidence {
  const readFiles = new Set<string>();
  const editedFiles = new Set<string>();
  const commands = new Set<string>();
  const mcpTools = new Set<string>();
  const generatedOrCachePaths = new Set<string>();
  for (const attempt of attempts) {
    attempt.evidence.readFiles.forEach((entry) => readFiles.add(entry));
    attempt.evidence.editedFiles.forEach((entry) => editedFiles.add(entry));
    attempt.evidence.commands.forEach((entry) => commands.add(entry));
    attempt.evidence.mcpTools.forEach((entry) => mcpTools.add(entry));
    attempt.evidence.generatedOrCachePaths.forEach((entry) => generatedOrCachePaths.add(entry));
  }
  return {
    readFiles: [...readFiles].sort(),
    editedFiles: [...editedFiles].sort(),
    commands: [...commands].sort(),
    mcpTools: [...mcpTools].sort(),
    generatedOrCachePaths: [...generatedOrCachePaths].sort(),
  };
}

function contextPrecision(prep: PrepBrief, evidence: CodexRunEvidence): ContextPrecisionMetrics {
  const suggested = new Set(prep.files.map((file) => file.path));
  const readFiles = evidence.readFiles;
  const editedFiles = evidence.editedFiles;
  const suggestedReadHits = readFiles.filter((file) => suggested.has(file)).length;
  const suggestedEditHits = editedFiles.filter((file) => suggested.has(file)).length;
  const missedReadFiles = readFiles.filter((file) => !suggested.has(file) && !isGeneratedOrCachePath(file));
  const missedEditedFiles = editedFiles.filter((file) => !suggested.has(file) && !isGeneratedOrCachePath(file));
  const irrelevantReads = readFiles.filter((file) => !suggested.has(file)).length;
  return {
    suggestedFiles: [...suggested],
    readFiles,
    editedFiles,
    suggestedReadHits,
    suggestedEditHits,
    missedReadFiles,
    missedEditedFiles,
    irrelevantReadRatio: readFiles.length === 0 ? 0 : Number((irrelevantReads / readFiles.length).toFixed(3)),
    generatedLeakage: evidence.generatedOrCachePaths,
  };
}

function scoreRecommendations(score: Omit<CodexRunScore, "recommendations">): string[] {
  const recommendations: string[] = [];
  if (score.contextPrecision.irrelevantReadRatio > 0.25) {
    recommendations.push("Tighten preflight routing: irrelevant read ratio exceeded 25%.");
  }
  if (score.contextPrecision.missedEditedFiles.length > 0) {
    recommendations.push("Add routing hints for edited files that preflight missed.");
  }
  if (score.contextPrecision.generatedLeakage.length > 0) {
    recommendations.push("Exclude generated/cache paths from Codex context unless explicitly requested.");
  }
  if (!score.verification.passed) {
    recommendations.push("Feed only compact verification failures into the next Codex retry.");
  }
  if (score.tokenLedger.toolOutputTokens > score.tokenLedger.outputTokens + score.tokenLedger.reasoningOutputTokens) {
    recommendations.push("Compress command/tool output more aggressively before follow-up turns.");
  }
  if (score.resources.compactSamplesTruncated > 0) {
    recommendations.push("Codex/tool output was large enough to truncate compact samples; prefer narrower verification or tiny memory mode.");
  }
  return recommendations;
}

async function writeScore(repoRoot: string, score: CodexRunScore): Promise<CodexRunScore> {
  await writeCodexStateJson(repoRoot, ["scores", `${score.runId}.json`], score);
  await writeCodexStateJson(repoRoot, ["scores", "latest.json"], score);
  return score;
}

function scoreRun(input: {
  runId: string;
  task: string;
  mode: CodexOptimizerMode;
  prep: PrepBrief;
  attempts: CodexRunAttempt[];
}): CodexRunScore {
  const tokenLedger = input.attempts.reduce((ledger, attempt) => addLedger(ledger, attempt.ledger), emptyLedger());
  const evidence = aggregateEvidence(input.attempts);
  const allVerification = input.attempts.flatMap((attempt) => attempt.verification);
  const finalAttempt = input.attempts.at(-1);
  const codexRawOutputBytes = input.attempts.reduce((sum, attempt) => sum + attempt.codex.rawOutputBytes, 0);
  const verificationPassed = allVerification.length > 0 && allVerification.every((entry) => entry.ok);
  const codexPassed = Boolean(finalAttempt?.codex.ok);
  const status: CodexRunScore["status"] = codexPassed && verificationPassed ? "passed" : "failed";
  const partial: Omit<CodexRunScore, "recommendations"> = {
    schemaVersion: 1,
    runId: input.runId,
    task: input.task,
    mode: input.mode,
    status,
    attempts: input.attempts.length,
    tokenLedger,
    tokensToGreen: status === "passed" ? tokenLedger.totalTokens : null,
    verification: {
      passed: verificationPassed,
      commands: allVerification.map((entry) => entry.command),
      failedCommands: allVerification.filter((entry) => !entry.ok).map((entry) => entry.command),
    },
    resources: {
      memoryProfile: input.prep.memory.profile,
      codexRawOutputBytes,
      streamedOutput: input.attempts.every((attempt) => attempt.codex.outputStrategy === "streamed"),
      compactSamplesTruncated: input.attempts.filter((attempt) => attempt.codex.compactSampleTruncated).length,
    },
    contextPrecision: contextPrecision(input.prep, evidence),
    paths: {
      run: codexThreadrootRelativePath("runs", `${input.runId}.json`),
      score: codexThreadrootRelativePath("scores", `${input.runId}.json`),
    },
  };
  return { ...partial, recommendations: scoreRecommendations(partial) };
}

async function retryPrompt(prep: PrepBrief, attempt: CodexRunAttempt): Promise<string> {
  const failedVerification = attempt.verification.filter((entry) => !entry.ok);
  const failureOutputs = await Promise.all(
    failedVerification.map(async (entry) => {
      const text = await readOutput(entry.compactOutputPath);
      return `Command: ${entry.command}\n${text.slice(0, MAX_PROMPT_FAILURE_CHARS)}`;
    }),
  );
  const codexFailure = attempt.codex.ok ? "" : (await readOutput(attempt.codex.compactOutputPath)).slice(0, MAX_PROMPT_FAILURE_CHARS);
  return [
    "Continue the same Threadroot-prepped Codex task. Use the compact failure evidence only; do not restart broad exploration.",
    "",
    `Goal: ${prep.task}`,
    "",
    prep.firstReads.length > 0 ? `Still relevant files:\n${prep.firstReads.map((file) => `- ${file}`).join("\n")}` : "",
    "",
    failedVerification.length > 0 ? `Verification failures:\n${failureOutputs.join("\n\n")}` : "",
    codexFailure ? `Codex command failure:\n${codexFailure}` : "",
    "",
    "Make the smallest fix, then stop after verification evidence is clear.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runCodexOptimizer(repoRoot: string, task: string, options: CodexRunOptions = {}): Promise<CodexRunReport> {
  const mode = options.mode ?? "cheap";
  const { id: runId, at: startedAt } = nowId(task);
  const prep = await createPrepBrief(repoRoot, task, options);
  const runDir = codexThreadrootPath(repoRoot, "runs", runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "prep-prompt.md"), prep.prompt, "utf8");

  if (options.dryRun) {
    const emptyScore = await writeScore(
      repoRoot,
      {
        schemaVersion: 1,
        runId,
        task,
        mode,
        status: "blocked",
        attempts: 0,
        tokenLedger: emptyLedger(),
        tokensToGreen: null,
        verification: { passed: false, commands: prep.verificationCommands, failedCommands: prep.verificationCommands },
        resources: {
          memoryProfile: prep.memory.profile,
          codexRawOutputBytes: 0,
          streamedOutput: true,
          compactSamplesTruncated: 0,
        },
        contextPrecision: contextPrecision(prep, {
          readFiles: [],
          editedFiles: [],
          commands: [],
          mcpTools: [],
          generatedOrCachePaths: [],
        }),
        recommendations: ["Dry run only: Codex was not invoked."],
        paths: {
          run: codexThreadrootRelativePath("runs", `${runId}.json`),
          score: codexThreadrootRelativePath("scores", `${runId}.json`),
        },
      },
    );
    const endedAt = new Date().toISOString();
    const report: CodexRunReport = {
      schemaVersion: 1,
      runId,
      task,
      mode,
      startedAt,
      endedAt,
      prep,
      attempts: [],
      score: emptyScore,
      paths: emptyScore.paths,
    };
    await writeCodexStateJson(repoRoot, ["runs", `${runId}.json`], report);
    await writeCodexStateJson(repoRoot, ["runs", "latest.json"], report);
    return report;
  }

  const attempts: CodexRunAttempt[] = [];
  const maxAttempts = mode === "cheap" ? 1 : 2;
  let prompt = prep.prompt;
  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    const promptPath = codexThreadrootPath(repoRoot, "runs", runId, `prompt-${attemptNumber}.md`);
    await writeFile(promptPath, prompt, "utf8");
    const codex = await invokeCodex({
      repoRoot,
      runId,
      attempt: attemptNumber,
      prompt,
      codexBin: options.codexBin,
      ephemeral: options.ephemeral,
      timeoutMs: options.timeoutMs ?? 60 * 60_000,
    });
    const { ledger, evidence, ...codexResult } = codex;
    const verification = codex.ok
      ? await runVerification(
          repoRoot,
          runId,
          attemptNumber,
          prep.verificationCommands,
          options.verificationTimeoutMs ?? 120_000,
          prep.memory.maxVerificationOutputChars,
        )
      : [];
    const attempt: CodexRunAttempt = {
      attempt: attemptNumber,
      promptPath,
      codex: codexResult,
      ledger,
      evidence,
      verification,
    };
    attempts.push(attempt);
    if (codex.ok && verification.length > 0 && verification.every((entry) => entry.ok)) {
      break;
    }
    if (attemptNumber < maxAttempts) {
      prompt = await retryPrompt(prep, attempt);
    }
  }

  const score = await writeScore(repoRoot, scoreRun({ runId, task, mode, prep, attempts }));
  const endedAt = new Date().toISOString();
  const report: CodexRunReport = {
    schemaVersion: 1,
    runId,
    task,
    mode,
    startedAt,
    endedAt,
    prep,
    attempts,
    score,
    paths: score.paths,
  };
  await writeCodexStateJson(repoRoot, ["runs", `${runId}.json`], report);
  await writeCodexStateJson(repoRoot, ["runs", "latest.json"], report);
  return report;
}

export async function readLatestScore(repoRoot: string): Promise<CodexRunScore | undefined> {
  return readCodexStateJson<CodexRunScore>(repoRoot, ["scores", "latest.json"]);
}

export async function tuneLatest(repoRoot: string): Promise<TuneReport> {
  const score = await readLatestScore(repoRoot);
  const proposals: TuneProposal[] = [];
  if (score) {
    for (const file of score.contextPrecision.missedReadFiles.slice(0, 5)) {
      proposals.push({
        type: "routing-hint",
        priority: "medium",
        title: `Route future similar tasks toward ${file}`,
        evidence: [`Codex read ${file}, but it was not in the preflight suggested files.`],
        suggestedChange: `Add a routing hint for ${file} when task language resembles: ${score.task}`,
        autoApplied: true,
      });
    }
    for (const file of score.contextPrecision.missedEditedFiles.slice(0, 5)) {
      proposals.push({
        type: "routing-hint",
        priority: "high",
        title: `Promote edited file ${file}`,
        evidence: [`Codex edited ${file}, but preflight did not suggest it.`],
        suggestedChange: `Increase rank for ${file} on similar tasks before Codex runs.`,
        autoApplied: true,
      });
    }
    if (score.verification.failedCommands.length > 0) {
      proposals.push({
        type: "verification",
        priority: "high",
        title: "Keep failing checks in compact follow-up context",
        evidence: score.verification.failedCommands,
        suggestedChange: "Use compact verification summaries instead of raw logs on retries.",
        autoApplied: true,
      });
    }
    if (score.contextPrecision.generatedLeakage.length > 0) {
      proposals.push({
        type: "agents-md",
        priority: "medium",
        title: "Document generated/cache path avoidance",
        evidence: score.contextPrecision.generatedLeakage,
        suggestedChange: "Consider adding a short AGENTS.md note to avoid generated/cache paths unless explicitly requested.",
        autoApplied: false,
      });
    }
  }

  const createdAt = new Date().toISOString();
  const routingHints = {
    schemaVersion: 1,
    updatedAt: createdAt,
    hints: proposals
      .filter((proposal) => proposal.type === "routing-hint")
      .map((proposal) => ({ title: proposal.title, evidence: proposal.evidence, suggestedChange: proposal.suggestedChange })),
  };
  const routingHintsPath = await writeCodexStateJson(repoRoot, ["tuning", "routing-hints.json"], routingHints);
  const reportPath = codexThreadrootPath(repoRoot, "tuning", "latest.json");
  const report: TuneReport = {
    schemaVersion: 1,
    createdAt,
    sourceScore: score,
    proposals,
    routingHintsPath,
    reportPath,
  };
  await writeCodexStateJson(repoRoot, ["tuning", "latest.json"], report);
  return report;
}

export async function runCodexOptimizerEval(repoRoot: string): Promise<CodexEvalReport> {
  const baseline = await runContextEvals(repoRoot);
  const cases = [];
  for (const entry of baseline.cases) {
    const prep = await createPrepBrief(repoRoot, entry.task, { memoryProfile: "conservative" });
    cases.push({
      id: entry.id,
      task: entry.task,
      legacyPacketTokens: entry.tokenEstimate,
      prepPromptTokens: prep.promptTokenEstimate,
      reduction: Math.max(0, entry.tokenEstimate - prep.promptTokenEstimate),
      firstReads: prep.firstReads,
    });
  }
  const averageLegacyPacketTokens =
    cases.length === 0 ? 0 : cases.reduce((sum, entry) => sum + entry.legacyPacketTokens, 0) / cases.length;
  const averagePrepPromptTokens = cases.length === 0 ? 0 : cases.reduce((sum, entry) => sum + entry.prepPromptTokens, 0) / cases.length;
  const estimatedTokenReduction = Math.max(0, averageLegacyPacketTokens - averagePrepPromptTokens);
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    baseline,
    optimizer: {
      cases: cases.length,
      averagePrepPromptTokens,
      averageLegacyPacketTokens,
      estimatedTokenReduction,
      estimatedTokenReductionRatio:
        averageLegacyPacketTokens === 0 ? 0 : Number((estimatedTokenReduction / averageLegacyPacketTokens).toFixed(3)),
    },
    cases,
  };
}
