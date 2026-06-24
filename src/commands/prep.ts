import { createPrepBrief, type CodexOptimizerMode, type MemoryProfile } from "../core/codex-optimizer.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type PrepCliOptions = JsonCliOptions & {
  mode?: string;
  memory?: string;
  budget?: string;
  hardCap?: string;
  maxFiles?: string;
  forceIndex?: boolean;
  require?: string[];
};

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

export async function runPrep(repoRoot: string, task: string, options: PrepCliOptions = {}): Promise<void> {
  const brief = await createPrepBrief(repoRoot, task, {
    mode: parseMode(options.mode),
    memoryProfile: parseMemoryProfile(options.memory),
    budgetTokens: parsePositiveInteger(options.budget, "--budget"),
    hardCapTokens: parsePositiveInteger(options.hardCap, "--hard-cap"),
    maxFiles: parsePositiveInteger(options.maxFiles, "--max-files"),
    forceIndex: options.forceIndex,
    requiredCommands: options.require,
  });

  if (options.json) {
    printJson(brief);
    return;
  }

  console.log(`prep: ${brief.id}`);
  console.log(`mode: ${brief.mode}`);
  console.log(`memory: ${brief.memory.profile}`);
  console.log(`prompt tokens: ${brief.promptTokenEstimate}/${brief.budget.hardCapTokens}`);
  console.log(`local scan estimate tokens: ${brief.packetTokenEstimate}`);
  console.log(`brief: ${brief.paths.brief}`);
  console.log(`prompt: ${brief.paths.prompt}`);
  if (brief.firstReads.length > 0) {
    console.log("read first:");
    for (const file of brief.firstReads) {
      console.log(`- ${file}`);
    }
  }
  if (brief.verificationCommands.length > 0) {
    console.log("verify:");
    for (const command of brief.verificationCommands) {
      console.log(`- ${command}`);
    }
  }
}
