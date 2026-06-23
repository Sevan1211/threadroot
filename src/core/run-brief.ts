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

export type RunBrief = {
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  command: string;
  summary: string;
  failures: RunFailure[];
  suggestedNextReads: string[];
  rawOutputPath: string;
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "run";
}

function parseFailures(output: string): RunFailure[] {
  const failures: RunFailure[] = [];
  const lines = output.split("\n");
  const pathPattern = /((?:src|test|tests|app|lib|packages|docs|scripts)\/[^\s:()]+):(\d+)(?::\d+)?/;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const isFailure =
      /\b(error|failed|failure|fail|exception|assertion|timeout|timed out)\b/i.test(trimmed) ||
      pathPattern.test(trimmed);
    if (!isFailure) {
      continue;
    }
    const match = trimmed.match(pathPattern);
    failures.push({
      path: match?.[1],
      line: match?.[2] ? Number(match[2]) : undefined,
      message: trimmed.slice(0, 320),
    });
    if (failures.length >= 12) {
      break;
    }
  }
  return failures;
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
  const absoluteLogPath = path.join(projectHarnessDir(repoRoot), "cache", "runs", `${id}.log`);
  await mkdir(path.dirname(absoluteLogPath), { recursive: true });
  await writeFile(absoluteLogPath, output, "utf8");

  const failures = parseFailures(output);
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
  };
  await writeFile(path.join(projectHarnessDir(repoRoot), "cache", "runs", `${id}.json`), JSON.stringify(brief, null, 2), "utf8");
  return brief;
}
