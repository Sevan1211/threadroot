import { readdir } from "node:fs/promises";
import path from "node:path";

import { projectHarnessDir } from "./harness/paths.js";
import { isRepoWorkTracePath, latestTrace, readTrace, type TraceReceipt } from "./trace.js";

export type TraceEvalCase = {
  runId: string;
  task: string;
  status: TraceReceipt["status"];
  neededFiles: string[];
  rankedFiles: string[];
  recallAt5: number;
  precisionAt5: number;
  mrr: number;
  toolRunCount: number;
  failedToolRunCount: number;
};

export type TraceEvalReport = {
  cases: TraceEvalCase[];
  summary: {
    cases: number;
    realRunRecallAt5: number;
    realRunPrecisionAt5: number;
    realRunMrr: number;
    totalToolRuns: number;
    failedToolRuns: number;
  };
};

function traceRoot(repoRoot: string): string {
  return path.join(projectHarnessDir(repoRoot), "traces");
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function recallAtK(actual: string[], expected: string[], k: number): number {
  if (expected.length === 0) {
    return 1;
  }
  const top = new Set(actual.slice(0, k));
  return expected.filter((file) => top.has(file)).length / expected.length;
}

function precisionAtK(actual: string[], expected: string[], k: number): number {
  const top = actual.slice(0, k);
  if (top.length === 0) {
    return 0;
  }
  const expectedSet = new Set(expected);
  return top.filter((file) => expectedSet.has(file)).length / top.length;
}

function reciprocalRank(actual: string[], expected: string[]): number {
  const expectedSet = new Set(expected);
  const index = actual.findIndex((file) => expectedSet.has(file));
  return index === -1 ? 0 : 1 / (index + 1);
}

function neededFiles(trace: TraceReceipt): string[] {
  const files = trace.events
    .filter((event) => event.type === "read_file" || event.type === "edit_file")
    .map((event) => event.path)
    .filter(isRepoWorkTracePath);
  return [...new Set(files)];
}

function evaluateTrace(trace: TraceReceipt): TraceEvalCase {
  const needed = neededFiles(trace);
  const ranked = [...trace.taskPacket.rankedFiles, ...trace.taskPacket.tests];
  const toolRuns = trace.events.filter((event) => event.type === "run_tool");
  return {
    runId: trace.runId,
    task: trace.task,
    status: trace.status,
    neededFiles: needed,
    rankedFiles: ranked.slice(0, 10),
    recallAt5: recallAtK(ranked, needed, 5),
    precisionAt5: precisionAtK(ranked, needed, 5),
    mrr: reciprocalRank(ranked, needed),
    toolRunCount: toolRuns.length,
    failedToolRunCount: toolRuns.filter((event) => event.ok === false).length,
  };
}

async function listTraceIds(repoRoot: string): Promise<string[]> {
  return (await readdir(traceRoot(repoRoot)).catch(() => [])).sort();
}

export async function runTraceEvals(repoRoot: string, options: { latest?: boolean } = {}): Promise<TraceEvalReport> {
  const traces = options.latest
    ? [await latestTrace(repoRoot)].filter((entry): entry is TraceReceipt => Boolean(entry))
    : await Promise.all((await listTraceIds(repoRoot)).map((runId) => readTrace(repoRoot, runId)));
  const cases = traces.map(evaluateTrace);
  return {
    cases,
    summary: {
      cases: cases.length,
      realRunRecallAt5: average(cases.map((entry) => entry.recallAt5)),
      realRunPrecisionAt5: average(cases.map((entry) => entry.precisionAt5)),
      realRunMrr: average(cases.map((entry) => entry.mrr)),
      totalToolRuns: cases.reduce((sum, entry) => sum + entry.toolRunCount, 0),
      failedToolRuns: cases.reduce((sum, entry) => sum + entry.failedToolRunCount, 0),
    },
  };
}
