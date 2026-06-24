import { codexDoctor, codexStatus, installCodex, type CodexInstallMode } from "../core/codex.js";
import { runCodexOptimizer, type CodexOptimizerMode, type MemoryProfile } from "../core/codex-optimizer.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type CodexInstallOptions = JsonCliOptions & {
  dryRun?: boolean;
  check?: boolean;
  undo?: boolean;
  status?: boolean;
  refreshSkill?: boolean;
};

export type CodexStatusOptions = JsonCliOptions;

export type CodexDoctorOptions = JsonCliOptions & {
  timeout?: string;
};

export type CodexRunCliOptions = JsonCliOptions & {
  mode?: string;
  memory?: string;
  codexBin?: string;
  timeout?: string;
  verifyTimeout?: string;
  require?: string[];
  budget?: string;
  hardCap?: string;
  maxFiles?: string;
  forceIndex?: boolean;
  dryRun?: boolean;
  ephemeral?: boolean;
};

function modeFromOptions(options: CodexInstallOptions): CodexInstallMode {
  if (options.undo) return "undo";
  if (options.check) return "check";
  if (options.status) return "status";
  if (options.dryRun) return "plan";
  return "write";
}

function parsePositiveInteger(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function parseMode(value: string | undefined): CodexOptimizerMode | undefined {
  if (value === undefined) return undefined;
  if (value === "cheap" || value === "balanced" || value === "deep") {
    return value;
  }
  throw new Error("--mode must be cheap, balanced, or deep.");
}

function parseMemoryProfile(value: string | undefined): MemoryProfile | undefined {
  if (value === undefined) return undefined;
  if (value === "standard" || value === "conservative" || value === "tiny") {
    return value;
  }
  throw new Error("--memory must be standard, conservative, or tiny.");
}

export async function runCodexInstall(repoRoot: string, options: CodexInstallOptions = {}): Promise<void> {
  const report = await installCodex(repoRoot, {
    mode: modeFromOptions(options),
    refreshSkill: options.refreshSkill,
  });

  if (options.json) {
    printJson(report);
    return;
  }

  console.log(`Threadroot Codex install: ${report.status}`);
  console.log(`receipt: ${report.receiptPath}`);
  if (report.skillPath) {
    console.log(`skill: ${report.skillPath}`);
  }
  if (report.setupCommands.length > 0) {
    console.log("setup:");
    for (const command of report.setupCommands) {
      console.log(`- ${command}`);
    }
  }
  for (const note of report.notes) {
    console.log(`note: ${note}`);
  }
}

export async function runCodexStatus(repoRoot: string, options: CodexStatusOptions = {}): Promise<void> {
  const status = await codexStatus(repoRoot);
  if (options.json) {
    printJson({ codex: status });
    return;
  }

  console.log(`Codex: ${status.available ? "available" : "missing"}`);
  if (status.executablePath) {
    console.log(`cli: ${status.executablePath}`);
  }
  console.log(`runner: ${status.defaultPlan.command} ${status.defaultPlan.args.join(" ")}`);
  console.log(`mcp config: ${status.mcp.configPath}`);
  console.log(`mcp: ${status.mcp.configured ? "configured" : "missing"}`);
  console.log(`mcp check: ${status.mcp.checkCommand}`);
  for (const note of status.notes) {
    console.log(`note: ${note}`);
  }
}

export async function runCodexDoctor(repoRoot: string, options: CodexDoctorOptions = {}): Promise<void> {
  const timeoutMs = options.timeout ? Number.parseInt(options.timeout, 10) : undefined;
  const report = await codexDoctor(repoRoot, { timeoutMs });
  if (options.json) {
    printJson(report);
    if (report.mcp.status === "error") {
      process.exitCode = 1;
    }
    return;
  }

  console.log(`Codex: ${report.status.available ? "available" : "missing"}`);
  console.log(`MCP: ${report.mcp.status}`);
  console.log(`config: ${report.mcp.configPath}`);
  if (report.mcp.entry) {
    console.log(`server: ${report.mcp.entry.command} ${report.mcp.entry.args.join(" ")}`.trim());
  }
  for (const message of report.mcp.messages) {
    console.log(`- ${message}`);
  }
  if (report.mcp.status === "error") {
    process.exitCode = 1;
  }
}

export async function runCodexRun(repoRoot: string, task: string, options: CodexRunCliOptions = {}): Promise<void> {
  const report = await runCodexOptimizer(repoRoot, task, {
    mode: parseMode(options.mode),
    memoryProfile: parseMemoryProfile(options.memory),
    codexBin: options.codexBin,
    ephemeral: options.ephemeral,
    timeoutMs: parsePositiveInteger(options.timeout, "--timeout"),
    verificationTimeoutMs: parsePositiveInteger(options.verifyTimeout, "--verify-timeout"),
    requiredCommands: options.require,
    budgetTokens: parsePositiveInteger(options.budget, "--budget"),
    hardCapTokens: parsePositiveInteger(options.hardCap, "--hard-cap"),
    maxFiles: parsePositiveInteger(options.maxFiles, "--max-files"),
    forceIndex: options.forceIndex,
    dryRun: options.dryRun,
  });

  if (options.json) {
    printJson(report);
    if (report.score.status === "failed") {
      process.exitCode = 1;
    }
    return;
  }

  console.log(`codex run: ${report.score.status}`);
  console.log(`run: ${report.paths.run}`);
  console.log(`score: ${report.paths.score}`);
  console.log(`memory: ${report.prep.memory.profile}`);
  console.log(`attempts: ${report.score.attempts}`);
  console.log(`tokens-to-green: ${report.score.tokensToGreen ?? "n/a"}`);
  console.log(`verification: ${report.score.verification.passed ? "passed" : "failed"}`);
  if (report.score.recommendations.length > 0) {
    console.log("recommendations:");
    for (const recommendation of report.score.recommendations) {
      console.log(`- ${recommendation}`);
    }
  }
  if (report.score.status === "failed") {
    process.exitCode = 1;
  }
}
