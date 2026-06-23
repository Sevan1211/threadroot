import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { projectHarnessDir } from "./harness/paths.js";
import { hashContent } from "./hash.js";
import type { ToolRunResult } from "./tools/execute.js";

export type RunFailure = {
  path?: string;
  line?: number;
  message: string;
};

export type OutputCompression = {
  rawChars: number;
  rawLines: number;
  compactChars: number;
  compactLines: number;
  estimatedRawTokens: number;
  estimatedCompactTokens: number;
  estimatedTokensSaved: number;
  compressionRatio: number;
  pruners: string[];
  preservedSignals: number;
};

export type CompactRunOutput = {
  text: string;
  compression: OutputCompression;
};

export type RunBrief = {
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  command: string;
  summary: string;
  failures: RunFailure[];
  suggestedNextReads: string[];
  rawOutputPath: string;
  compactOutputPath: string;
  compression: OutputCompression;
};

const PATH_PATTERN = /((?:src|test|tests|app|lib|packages|docs|scripts)[\\/][^\s:()]+):(\d+)(?::\d+)?/;
const FAILURE_PATTERN = /\b(error|failed|failure|fail|exception|assertion|timeout|timed out|traceback|panic)\b/i;
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "run"
  );
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

export function parseRunFailures(output: string): RunFailure[] {
  const failures: RunFailure[] = [];
  const lines = stripAnsi(output).split(/\r?\n/);
  const seen = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const isFailure = FAILURE_PATTERN.test(trimmed) || PATH_PATTERN.test(trimmed);
    if (!isFailure) {
      continue;
    }
    const match = trimmed.match(PATH_PATTERN);
    const key = `${match?.[1] ?? ""}:${match?.[2] ?? ""}:${trimmed.slice(0, 180)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    failures.push({
      path: match?.[1]?.replace(/\\/g, "/"),
      line: match?.[2] ? Number(match[2]) : undefined,
      message: trimmed.slice(0, 320),
    });
    if (failures.length >= 12) {
      break;
    }
  }
  return failures;
}

function repeatedLineSignals(lines: string[]): string[] {
  const counts = new Map<string, number>();
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.length > 240) {
      continue;
    }
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([line, count]) => `- x${count} ${line}`);
}

function interestingTail(lines: string[]): string[] {
  const interesting = lines
    .map((line) => line.trim())
    .filter((line) => line && (FAILURE_PATTERN.test(line) || PATH_PATTERN.test(line)))
    .slice(-16);
  if (interesting.length > 0) {
    return interesting;
  }
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-16);
}

export function compressRunOutput(output: string, failures = parseRunFailures(output)): CompactRunOutput {
  const normalized = stripAnsi(output).replace(/\r\n/g, "\n").trim();
  const lines = normalized ? normalized.split("\n") : [];
  const repeated = repeatedLineSignals(lines);
  const pruners: string[] = [];
  if (repeated.length > 0) {
    pruners.push("repeated-lines");
  }
  if (failures.length > 0) {
    pruners.push("failure-signals");
  }
  if (lines.length > 30 || normalized.length > 4_000) {
    pruners.push("tail-window");
  }

  const sections = ["Threadroot compact run output"];
  if (failures.length > 0) {
    sections.push("", "Failure signals:");
    for (const failure of failures) {
      const location = failure.path ? `${failure.path}${failure.line ? `:${failure.line}` : ""}: ` : "";
      sections.push(`- ${location}${failure.message}`);
    }
  }
  if (repeated.length > 0) {
    sections.push("", "Repeated output:");
    sections.push(...repeated);
  }
  if (normalized) {
    const tail = interestingTail(lines);
    sections.push("", tail.length < lines.length ? "Relevant tail:" : "Output:");
    sections.push(...tail.map((line) => `  ${line.slice(0, 500)}`));
  } else {
    sections.push("", "Output: <empty>");
  }
  sections.push("", "Full raw output is preserved in the paired .log file.");

  const text = `${sections.join("\n")}\n`;
  const estimatedRawTokens = estimateTokens(normalized);
  const estimatedCompactTokens = estimateTokens(text);
  return {
    text,
    compression: {
      rawChars: normalized.length,
      rawLines: lines.length,
      compactChars: text.length,
      compactLines: text.split("\n").length,
      estimatedRawTokens,
      estimatedCompactTokens,
      estimatedTokensSaved: Math.max(0, estimatedRawTokens - estimatedCompactTokens),
      compressionRatio: normalized.length > 0 ? Number((text.length / normalized.length).toFixed(3)) : 1,
      pruners,
      preservedSignals: failures.length + repeated.length,
    },
  };
}

function summaryFor(result: ToolRunResult, failures: RunFailure[]): string {
  if (result.ok) {
    return `Command succeeded in ${result.durationMs}ms.`;
  }
  if (result.timedOut) {
    return `Command timed out after ${result.durationMs}ms.`;
  }
  if (failures.length > 0) {
    return `Command failed with ${failures.length} parsed failure signal(s).`;
  }
  return `Command failed with exit code ${result.exitCode ?? "unknown"}.`;
}

export async function createRunBrief(repoRoot: string, result: ToolRunResult): Promise<RunBrief> {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const id = `${now}-${slug(result.command)}-${hashContent(output).slice(0, 8)}`;
  const relativeLogPath = `.threadroot/cache/runs/${id}.log`;
  const relativeCompactPath = `.threadroot/cache/runs/${id}.brief.md`;
  const absoluteLogPath = path.join(projectHarnessDir(repoRoot), "cache", "runs", `${id}.log`);
  const absoluteCompactPath = path.join(projectHarnessDir(repoRoot), "cache", "runs", `${id}.brief.md`);
  await mkdir(path.dirname(absoluteLogPath), { recursive: true });
  await writeFile(absoluteLogPath, output, "utf8");

  const failures = parseRunFailures(output);
  const compact = compressRunOutput(output, failures);
  await writeFile(absoluteCompactPath, compact.text, "utf8");
  const suggestedNextReads = [
    ...new Set(failures.map((failure) => failure.path).filter((entry): entry is string => Boolean(entry))),
  ].slice(0, 8);
  const brief: RunBrief = {
    ok: result.ok,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    command: result.command,
    summary: summaryFor(result, failures),
    failures,
    suggestedNextReads,
    rawOutputPath: relativeLogPath,
    compactOutputPath: relativeCompactPath,
    compression: compact.compression,
  };
  await writeFile(path.join(projectHarnessDir(repoRoot), "cache", "runs", `${id}.json`), `${JSON.stringify(brief, null, 2)}\n`, "utf8");
  return brief;
}
