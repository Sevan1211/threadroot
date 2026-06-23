import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { projectHarnessDir } from "./harness/paths.js";
import { assembleTaskPacket, type TaskPacket } from "./task-packet.js";
import { THREADROOT_VERSION } from "./version.js";

export type TraceStatus = "running" | "passed" | "failed" | "partial" | "blocked" | "cancelled";

export type TraceEventType =
  | "read_file"
  | "edit_file"
  | "run_tool"
  | "tool_blocked"
  | "command"
  | "eval"
  | "improvement"
  | "note";

export type TraceEvent = {
  id: number;
  type: TraceEventType;
  at: string;
  path?: string;
  tool?: string;
  command?: string;
  exitCode?: number | null;
  ok?: boolean;
  durationMs?: number;
  message?: string;
  data?: Record<string, unknown>;
};

export type TraceTaskPacketSummary = {
  tokenEstimate: number;
  rankedFiles: string[];
  tests: string[];
  nextReads: string[];
  commands: string[];
  recommendedSkills: string[];
  warnings: string[];
};

export type TraceReceipt = {
  schemaVersion: 1;
  runId: string;
  task: string;
  agent?: string;
  threadrootVersion: string;
  startedAt: string;
  endedAt?: string;
  status: TraceStatus;
  taskPacket: TraceTaskPacketSummary;
  events: TraceEvent[];
  outcome?: {
    status: TraceStatus;
    summary?: string;
  };
};

export type StartTraceOptions = {
  agent?: string;
  forceIndex?: boolean;
  budgetTokens?: number;
  maxFiles?: number;
};

export type AppendTraceEventInput = Omit<TraceEvent, "id" | "at"> & {
  at?: string;
};

function traceRoot(repoRoot: string): string {
  return path.join(projectHarnessDir(repoRoot), "traces");
}

function traceDir(repoRoot: string, runId: string): string {
  return path.join(traceRoot(repoRoot), runId);
}

function tracePath(repoRoot: string, runId: string): string {
  return path.join(traceDir(repoRoot, runId), "trace.json");
}

function taskPacketPath(repoRoot: string, runId: string): string {
  return path.join(traceDir(repoRoot, runId), "task-packet.json");
}

function activeTracePath(repoRoot: string): string {
  return path.join(projectHarnessDir(repoRoot), "state", "active-trace.json");
}

function latestTracePath(repoRoot: string): string {
  return path.join(projectHarnessDir(repoRoot), "state", "latest-trace.json");
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56) || "trace"
  );
}

function normalizeRepoPath(value: string | undefined): string | undefined {
  return value?.replace(/\\/g, "/");
}

export function isRepoWorkTracePath(value: string | undefined): value is string {
  const normalized = normalizeRepoPath(value);
  return Boolean(normalized && !normalized.startsWith(".threadroot/"));
}

function summarizeTaskPacket(packet: TaskPacket): TraceTaskPacketSummary {
  return {
    tokenEstimate: packet.tokenEstimate,
    rankedFiles: packet.files.map((file) => file.path),
    tests: packet.tests.map((file) => file.path),
    nextReads: packet.nextReads,
    commands: packet.commands.map((command) => command.name),
    recommendedSkills: packet.recommendedSkills.map((skill) => skill.name),
    warnings: packet.warnings.map((warning) => warning.message),
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeTrace(repoRoot: string, trace: TraceReceipt): Promise<void> {
  await writeJson(tracePath(repoRoot, trace.runId), trace);
  await writeJson(latestTracePath(repoRoot), { runId: trace.runId });
}

export async function startTrace(repoRoot: string, task: string, options: StartTraceOptions = {}): Promise<TraceReceipt> {
  const packet = await assembleTaskPacket(repoRoot, task, {
    forceIndex: options.forceIndex,
    budgetTokens: options.budgetTokens,
    maxFiles: options.maxFiles,
  });
  const startedAt = new Date().toISOString();
  const runId = `${startedAt.replace(/[:.]/g, "-")}-${slug(task)}`;
  const trace: TraceReceipt = {
    schemaVersion: 1,
    runId,
    task,
    agent: options.agent,
    threadrootVersion: THREADROOT_VERSION,
    startedAt,
    status: "running",
    taskPacket: summarizeTaskPacket(packet),
    events: [],
  };
  await mkdir(traceDir(repoRoot, runId), { recursive: true });
  await writeJson(taskPacketPath(repoRoot, runId), packet);
  await writeTrace(repoRoot, trace);
  await writeJson(activeTracePath(repoRoot), { runId });
  return trace;
}

export async function readTrace(repoRoot: string, runId: string): Promise<TraceReceipt> {
  return readJson<TraceReceipt>(tracePath(repoRoot, runId));
}

async function readPointer(filePath: string): Promise<string | undefined> {
  try {
    return (await readJson<{ runId?: string }>(filePath)).runId;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function activeTrace(repoRoot: string): Promise<TraceReceipt | undefined> {
  const runId = await readPointer(activeTracePath(repoRoot));
  return runId ? readTrace(repoRoot, runId) : undefined;
}

export async function latestTrace(repoRoot: string): Promise<TraceReceipt | undefined> {
  const pointed = await readPointer(latestTracePath(repoRoot));
  if (pointed) {
    return readTrace(repoRoot, pointed);
  }
  const entries = await readdir(traceRoot(repoRoot)).catch(() => []);
  const latest = entries.sort().at(-1);
  return latest ? readTrace(repoRoot, latest) : undefined;
}

export async function appendTraceEvent(
  repoRoot: string,
  input: AppendTraceEventInput,
  options: { runId?: string } = {},
): Promise<TraceReceipt> {
  const trace = options.runId ? await readTrace(repoRoot, options.runId) : await activeTrace(repoRoot);
  if (!trace) {
    throw new Error("No active trace. Start one with `threadroot trace start \"<task>\"`.");
  }
  const event: TraceEvent = {
    ...input,
    id: trace.events.length + 1,
    at: input.at ?? new Date().toISOString(),
    path: normalizeRepoPath(input.path),
  };
  const updated = { ...trace, events: [...trace.events, event] };
  await writeTrace(repoRoot, updated);
  return updated;
}

export async function appendTraceEventIfActive(repoRoot: string, input: AppendTraceEventInput): Promise<void> {
  try {
    if (await activeTrace(repoRoot)) {
      await appendTraceEvent(repoRoot, input);
    }
  } catch {
    // Tracing must never make the primary tool action fail.
  }
}

export async function finishTrace(
  repoRoot: string,
  status: Exclude<TraceStatus, "running">,
  summary?: string,
  options: { runId?: string } = {},
): Promise<TraceReceipt> {
  const trace = options.runId ? await readTrace(repoRoot, options.runId) : await activeTrace(repoRoot);
  if (!trace) {
    throw new Error("No active trace. Start one with `threadroot trace start \"<task>\"`.");
  }
  const updated: TraceReceipt = {
    ...trace,
    endedAt: new Date().toISOString(),
    status,
    outcome: { status, summary },
  };
  await writeTrace(repoRoot, updated);
  await rm(activeTracePath(repoRoot), { force: true });
  return updated;
}
