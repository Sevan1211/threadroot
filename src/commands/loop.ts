import { finishLoop, nextLoop, reportLoop, runLoop, startLoop, type LoopRisk, type LoopStatus } from "../core/loop.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type LoopStartOptions = JsonCliOptions & {
  agent?: string;
  time?: string;
  maxIterations?: string;
  risk?: LoopRisk;
};

export type LoopNextOptions = JsonCliOptions;
export type LoopReportOptions = JsonCliOptions;
export type LoopFinishOptions = JsonCliOptions & {
  status?: LoopStatus;
};
export type LoopRunOptions = JsonCliOptions & {
  iterations?: string;
  agentCommand?: string;
  agentArg?: string[];
  agentAdapter?: "codex" | "claude" | "custom";
  timeout?: string;
  require?: string[];
  verifyTimeout?: string;
  noWriteCandidates?: boolean;
  noAutoApply?: boolean;
};

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseMinutes(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.trim().match(/^(\d+)(m|h)?$/i);
  if (!match) {
    return parsePositiveInt(value);
  }
  const amount = Number.parseInt(match[1]!, 10);
  return match[2]?.toLowerCase() === "h" ? amount * 60 : amount;
}

export async function runLoopStart(repoRoot: string, goal: string, options: LoopStartOptions = {}): Promise<void> {
  const session = await startLoop(repoRoot, goal, {
    agent: options.agent,
    timeMinutes: parseMinutes(options.time),
    maxIterations: parsePositiveInt(options.maxIterations),
    risk: options.risk,
  });
  if (options.json) {
    printJson(session);
    return;
  }
  console.log(`Started loop ${session.sessionId}`);
  console.log(`goal: ${session.goal}`);
  console.log("Run `threadroot loop next` to generate the first iteration prompt.");
}

export async function runLoopNext(repoRoot: string, options: LoopNextOptions = {}): Promise<void> {
  const result = await nextLoop(repoRoot);
  if (options.json) {
    printJson(result);
    return;
  }
  console.log(result.prompt);
}

export async function runLoopReport(repoRoot: string, options: LoopReportOptions = {}): Promise<void> {
  const report = await reportLoop(repoRoot);
  if (options.json) {
    printJson(report);
    return;
  }
  if (!report.session) {
    console.log("No loop session is active.");
    return;
  }
  console.log(`${report.session.sessionId}  ${report.session.status}`);
  console.log(`goal: ${report.session.goal}`);
  console.log(`iterations: ${report.session.iteration}/${report.session.maxIterations}`);
  if (report.latestTrace) {
    console.log(`latest trace: ${report.latestTrace.runId} (${report.latestTrace.status})`);
  }
  if (report.traceEval) {
    console.log(`real-run Recall@5: ${report.traceEval.summary.realRunRecallAt5.toFixed(3)}`);
  }
  if (report.improvements) {
    console.log(`improvement candidates: ${report.improvements.summary.candidates}`);
  }
}

export async function runLoopFinish(repoRoot: string, options: LoopFinishOptions = {}): Promise<void> {
  const status = options.status ?? "finished";
  if (status === "active") {
    throw new Error("Loop finish status cannot be `active`.");
  }
  const session = await finishLoop(repoRoot, status);
  if (options.json) {
    printJson(session);
    return;
  }
  console.log(`Finished loop ${session.sessionId}: ${session.status}`);
}

export async function runLoopRun(repoRoot: string, options: LoopRunOptions = {}): Promise<void> {
  const report = await runLoop(repoRoot, {
    iterations: parsePositiveInt(options.iterations),
    agentCommand: options.agentCommand,
    agentArgs: options.agentArg,
    agentAdapter: options.agentAdapter,
    timeoutMs: parsePositiveInt(options.timeout),
    requiredCommands: options.require,
    verificationTimeoutMs: parsePositiveInt(options.verifyTimeout),
    writeCandidates: !options.noWriteCandidates,
    autoApply: !options.noAutoApply,
  });
  if (options.json) {
    printJson(report);
    return;
  }
  console.log(`loop run: ${report.iterations.length} iteration(s), stopped: ${report.stoppedReason}`);
  for (const iteration of report.iterations) {
    console.log(
      `- iteration ${iteration.iteration}: ${iteration.provider.ok ? "ok" : "failed"} exit ${iteration.provider.exitCode ?? "unknown"} output ${iteration.provider.outputPath}`,
    );
    for (const verification of iteration.verification) {
      console.log(`  verification ${verification.ok ? "ok" : "failed"}: ${verification.command} output ${verification.outputPath}`);
    }
    if (iteration.appliedImprovements) {
      console.log(`  auto-safe improvements applied: ${iteration.appliedImprovements.summary.applied}`);
    }
  }
  if (report.finalReportPath) {
    console.log(`final report: ${report.finalReportPath}`);
  }
}
