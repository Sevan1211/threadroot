import {
  appendTraceEvent,
  finishTrace,
  latestTrace,
  startTrace,
  type TraceEventType,
  type TraceStatus,
} from "../core/trace.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type TraceStartOptions = JsonCliOptions & {
  agent?: string;
  forceIndex?: boolean;
  budget?: string;
  maxFiles?: string;
};

export type TraceEventOptions = JsonCliOptions & {
  path?: string;
  tool?: string;
  command?: string;
  exitCode?: string;
  ok?: boolean;
  durationMs?: string;
  message?: string;
};

export type TraceFinishOptions = JsonCliOptions & {
  status?: TraceStatus;
  summary?: string;
};

export type TraceLatestOptions = JsonCliOptions;

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseExitCode(value: string | undefined): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "null") {
    return null;
  }
  return parseNumber(value) ?? undefined;
}

export async function runTraceStart(repoRoot: string, task: string, options: TraceStartOptions = {}): Promise<void> {
  const trace = await startTrace(repoRoot, task, {
    agent: options.agent,
    forceIndex: options.forceIndex,
    budgetTokens: parseNumber(options.budget),
    maxFiles: parseNumber(options.maxFiles),
  });
  if (options.json) {
    printJson(trace);
    return;
  }
  console.log(`Started trace ${trace.runId}`);
  console.log(`task: ${trace.task}`);
  console.log(`next reads: ${trace.taskPacket.nextReads.slice(0, 6).join(", ") || "none"}`);
}

export async function runTraceEvent(
  repoRoot: string,
  type: TraceEventType,
  options: TraceEventOptions = {},
): Promise<void> {
  const trace = await appendTraceEvent(repoRoot, {
    type,
    path: options.path,
    tool: options.tool,
    command: options.command,
    exitCode: parseExitCode(options.exitCode),
    ok: options.ok,
    durationMs: parseNumber(options.durationMs),
    message: options.message,
  });
  const event = trace.events.at(-1);
  if (options.json) {
    printJson({ trace, event });
    return;
  }
  console.log(`Recorded ${type} event #${event?.id ?? trace.events.length} on ${trace.runId}`);
}

export async function runTraceFinish(repoRoot: string, options: TraceFinishOptions = {}): Promise<void> {
  const status = options.status ?? "partial";
  if (status === "running") {
    throw new Error("Trace finish status cannot be `running`.");
  }
  const trace = await finishTrace(repoRoot, status, options.summary);
  if (options.json) {
    printJson(trace);
    return;
  }
  console.log(`Finished trace ${trace.runId}: ${trace.status}`);
  if (trace.outcome?.summary) {
    console.log(trace.outcome.summary);
  }
}

export async function runTraceLatest(repoRoot: string, options: TraceLatestOptions = {}): Promise<void> {
  const trace = await latestTrace(repoRoot);
  if (options.json) {
    printJson(trace ?? { trace: null });
    return;
  }
  if (!trace) {
    console.log("No trace has been recorded yet.");
    return;
  }
  console.log(`${trace.runId}  ${trace.status}  ${trace.task}`);
  console.log(`events: ${trace.events.length}`);
}
