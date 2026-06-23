import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { findExecutable } from "./command-lookup.js";
import { improveLatest, type ApplyImprovementReport, type ImprovementReport } from "./improve.js";
import { projectHarnessDir } from "./harness/paths.js";
import { providerCommandPlan, providerTraceEvents, type ProviderCommandPlan } from "./provider-adapters.js";
import { compressRunOutput, type OutputCompression } from "./run-brief.js";
import { runTraceEvals, type TraceEvalReport } from "./trace-evals.js";
import { activeTrace, appendTraceEventIfActive, finishTrace, latestTrace, startTrace, type TraceReceipt } from "./trace.js";
import { executeShell } from "./tools/execute.js";

export type LoopRisk = "low" | "medium" | "high";
export type LoopStatus = "active" | "finished" | "cancelled";

export type LoopSession = {
  schemaVersion: 1;
  sessionId: string;
  goal: string;
  agent: string;
  risk: LoopRisk;
  startedAt: string;
  deadlineAt?: string;
  maxIterations: number;
  iteration: number;
  status: LoopStatus;
  prompts: Array<{
    iteration: number;
    traceRunId: string;
    createdAt: string;
    prompt: string;
  }>;
};

export type StartLoopOptions = {
  agent?: string;
  timeMinutes?: number;
  maxIterations?: number;
  risk?: LoopRisk;
};

export type LoopNext = {
  session: LoopSession;
  trace: TraceReceipt;
  prompt: string;
};

export type LoopReport = {
  session?: LoopSession;
  latestTrace?: TraceReceipt;
  traceEval?: TraceEvalReport;
  improvements?: ImprovementReport;
};

export type LoopRunOptions = {
  iterations?: number;
  agentCommand?: string;
  agentArgs?: string[];
  agentAdapter?: ProviderCommandPlan["adapter"];
  timeoutMs?: number;
  requiredCommands?: string[];
  verificationTimeoutMs?: number;
  writeCandidates?: boolean;
  autoApply?: boolean;
};

export type LoopVerificationResult = {
  command: string;
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  outputPath: string;
  compactOutputPath: string;
  summary: string;
  compression: OutputCompression;
};

export type LoopRunIteration = {
  iteration: number;
  traceRunId: string;
  provider: {
    adapter: ProviderCommandPlan["adapter"];
    command: string;
    args: string[];
    exitCode: number | null;
    ok: boolean;
    timedOut: boolean;
    durationMs: number;
    outputPath: string;
    compactOutputPath: string;
    summary: string;
    compression: OutputCompression;
    eventsCaptured: number;
  };
  verification: LoopVerificationResult[];
  traceEval: TraceEvalReport;
  improvements: ImprovementReport;
  appliedImprovements?: ApplyImprovementReport;
};

export type LoopRunReport = {
  session: LoopSession;
  iterations: LoopRunIteration[];
  stoppedReason: "iteration-budget" | "time-budget" | "provider-failed" | "verification-failed" | "completed";
  reportPath?: string;
  finalReportPath?: string;
};

function sessionsRoot(repoRoot: string): string {
  return path.join(projectHarnessDir(repoRoot), "sessions");
}

function sessionDir(repoRoot: string, sessionId: string): string {
  return path.join(sessionsRoot(repoRoot), sessionId);
}

function sessionPath(repoRoot: string, sessionId: string): string {
  return path.join(sessionDir(repoRoot, sessionId), "session.json");
}

function currentSessionPath(repoRoot: string): string {
  return path.join(projectHarnessDir(repoRoot), "state", "current-loop.json");
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56) || "loop"
  );
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeSession(repoRoot: string, session: LoopSession): Promise<void> {
  await writeJson(sessionPath(repoRoot, session.sessionId), session);
  await writeJson(currentSessionPath(repoRoot), { sessionId: session.sessionId });
}

async function currentSessionId(repoRoot: string): Promise<string | undefined> {
  try {
    return (await readJson<{ sessionId?: string }>(currentSessionPath(repoRoot))).sessionId;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function readLoopSession(repoRoot: string, sessionId: string): Promise<LoopSession> {
  return readJson<LoopSession>(sessionPath(repoRoot, sessionId));
}

export async function currentLoopSession(repoRoot: string): Promise<LoopSession | undefined> {
  const sessionId = await currentSessionId(repoRoot);
  return sessionId ? readLoopSession(repoRoot, sessionId) : undefined;
}

export async function startLoop(repoRoot: string, goal: string, options: StartLoopOptions = {}): Promise<LoopSession> {
  const startedAt = new Date().toISOString();
  const deadlineAt =
    options.timeMinutes && options.timeMinutes > 0
      ? new Date(Date.now() + options.timeMinutes * 60_000).toISOString()
      : undefined;
  const session: LoopSession = {
    schemaVersion: 1,
    sessionId: `${startedAt.replace(/[:.]/g, "-")}-${slug(goal)}`,
    goal,
    agent: options.agent ?? "codex",
    risk: options.risk ?? "low",
    startedAt,
    deadlineAt,
    maxIterations: options.maxIterations ?? 6,
    iteration: 0,
    status: "active",
    prompts: [],
  };
  await writeSession(repoRoot, session);
  return session;
}

function timeRemaining(session: LoopSession): string {
  if (!session.deadlineAt) {
    return "not set";
  }
  const ms = Date.parse(session.deadlineAt) - Date.now();
  if (ms <= 0) {
    return "expired";
  }
  return `${Math.ceil(ms / 60_000)} minute(s)`;
}

function generatePrompt(session: LoopSession, trace: TraceReceipt, previous?: TraceReceipt): string {
  const nextReads = trace.taskPacket.nextReads.slice(0, 8);
  const commands = trace.taskPacket.commands.slice(0, 8);
  const skills = trace.taskPacket.recommendedSkills.slice(0, 6);
  return [
    `You are iteration ${session.iteration + 1} of a Threadroot loop session.`,
    "",
    `Goal: ${session.goal}`,
    `Agent: ${session.agent}`,
    `Risk budget: ${session.risk}`,
    `Time remaining: ${timeRemaining(session)}`,
    `Iteration budget: ${session.iteration + 1}/${session.maxIterations}`,
    "",
    previous
      ? `Previous trace: ${previous.runId} ended ${previous.status} with ${previous.events.length} event(s).`
      : "Previous trace: none in this session.",
    "",
    "Start with the Threadroot task packet for this iteration.",
    `Trace run: ${trace.runId}`,
    nextReads.length > 0 ? `Read first: ${nextReads.join(", ")}` : "Read first: use targeted repo_search before broad exploration.",
    commands.length > 0 ? `Likely tools: ${commands.join(", ")}` : "Likely tools: choose the smallest relevant local check.",
    skills.length > 0 ? `Relevant skills: ${skills.join(", ")}` : "Relevant skills: none strongly matched.",
    "",
    "Do one focused improvement. Record important reads/edits with trace events when your client does not do it automatically.",
    "Run the narrowest meaningful checks, then finish the trace with passed, failed, partial, or blocked.",
    "Run `threadroot improve latest` after the trace; it applies only guarded local routing/eval/skill lessons automatically. Do not promote memory, new tools, connections, or higher-risk changes without policy/user approval.",
  ].join("\n");
}

function promptWithVerification(prompt: string, requiredCommands: string[]): string {
  if (requiredCommands.length === 0) {
    return prompt;
  }
  return [
    prompt,
    "",
    "Required verification commands for this automated loop iteration:",
    ...requiredCommands.map((command) => `- ${command}`),
    "",
    "Threadroot will run these commands after the provider step and use their results to determine the trace status.",
  ].join("\n");
}

async function writeOutputArtifacts(outputPath: string, output: string): Promise<{
  outputPath: string;
  compactOutputPath: string;
  summary: string;
  compression: OutputCompression;
}> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
  const compact = compressRunOutput(output);
  const compactOutputPath = outputPath.replace(/\.log$/i, ".brief.md");
  await writeFile(compactOutputPath, compact.text, "utf8");
  return {
    outputPath,
    compactOutputPath,
    summary:
      compact.compression.estimatedTokensSaved > 0
        ? `Compact output saved about ${compact.compression.estimatedTokensSaved} token(s).`
        : "Compact output preserved the full signal.",
    compression: compact.compression,
  };
}

export async function nextLoop(repoRoot: string): Promise<LoopNext> {
  const session = await currentLoopSession(repoRoot);
  if (!session || session.status !== "active") {
    throw new Error("No active loop session. Start one with `threadroot loop start \"<goal>\"`.");
  }
  if (session.iteration >= session.maxIterations) {
    throw new Error("Loop iteration budget is exhausted. Finish the loop or start a new session.");
  }
  if (session.deadlineAt && Date.now() >= Date.parse(session.deadlineAt)) {
    throw new Error("Loop time budget is exhausted. Finish the loop or start a new session.");
  }
  const previous = await latestTrace(repoRoot);
  const trace = await startTrace(repoRoot, `Loop iteration ${session.iteration + 1}: ${session.goal}`, {
    agent: session.agent,
    maxFiles: 8,
  });
  const prompt = generatePrompt(session, trace, previous);
  const updated: LoopSession = {
    ...session,
    iteration: session.iteration + 1,
    prompts: [...session.prompts, { iteration: session.iteration + 1, traceRunId: trace.runId, createdAt: new Date().toISOString(), prompt }],
  };
  await writeSession(repoRoot, updated);
  await writeFile(path.join(sessionDir(repoRoot, updated.sessionId), `prompt-${updated.iteration}.md`), `${prompt}\n`, "utf8");
  return { session: updated, trace, prompt };
}

export async function reportLoop(repoRoot: string): Promise<LoopReport> {
  const session = await currentLoopSession(repoRoot);
  const trace = await latestTrace(repoRoot);
  return {
    session,
    latestTrace: trace,
    traceEval: trace ? await runTraceEvals(repoRoot, { latest: true }) : undefined,
    improvements: trace ? await improveLatest(repoRoot) : undefined,
  };
}

export async function finishLoop(repoRoot: string, status: Exclude<LoopStatus, "active"> = "finished"): Promise<LoopSession> {
  const session = await currentLoopSession(repoRoot);
  if (!session) {
    throw new Error("No active loop session.");
  }
  const updated = { ...session, status };
  await writeSession(repoRoot, updated);
  await rm(currentSessionPath(repoRoot), { force: true });
  return updated;
}

async function runProviderPrompt(input: {
  repoRoot: string;
  session: LoopSession;
  iteration: number;
  prompt: string;
  plan: ProviderCommandPlan;
  timeoutMs: number;
}): Promise<LoopRunIteration["provider"]> {
  const started = Date.now();
  const outputPath = path.join(sessionDir(input.repoRoot, input.session.sessionId), `agent-output-${input.iteration}.log`);
  const resolvedCommand = await findExecutable(input.plan.command);
  if (!resolvedCommand) {
    const artifacts = await writeOutputArtifacts(
      outputPath,
      `[threadroot] Provider command is not executable or not on PATH: ${input.plan.command}\n`,
    );
    return {
      adapter: input.plan.adapter,
      command: input.plan.command,
      args: input.plan.args,
      exitCode: null,
      ok: false,
      timedOut: false,
      durationMs: Date.now() - started,
      ...artifacts,
      eventsCaptured: 0,
    };
  }
  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, input.plan.args, {
      cwd: input.repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let forceTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      terminateChild(child);
      forceTimer = setTimeout(async () => {
        if (settled) return;
        settled = true;
        const artifacts = await writeOutputArtifacts(
          outputPath,
          [stdout, stderr, `[threadroot] Provider command timed out after ${input.timeoutMs}ms.`].filter(Boolean).join("\n"),
        );
        resolve({
          adapter: input.plan.adapter,
          command: resolvedCommand,
          args: input.plan.args,
          exitCode: null,
          ok: false,
          timedOut,
          durationMs: Date.now() - started,
          ...artifacts,
          eventsCaptured: 0,
        });
      }, 5_000);
    }, input.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", async (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      try {
        const artifacts = await writeOutputArtifacts(
          outputPath,
          [stdout, stderr, `[threadroot] Failed to start provider command ${resolvedCommand}: ${error.message}`].filter(Boolean).join("\n"),
        );
        resolve({
          adapter: input.plan.adapter,
          command: resolvedCommand,
          args: input.plan.args,
          exitCode: null,
          ok: false,
          timedOut,
          durationMs: Date.now() - started,
          ...artifacts,
          eventsCaptured: 0,
        });
      } catch (writeError) {
        reject(writeError);
      }
    });
    child.on("close", async (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      const artifacts = await writeOutputArtifacts(
        outputPath,
        [stdout, stderr, timedOut ? `[threadroot] Provider command timed out after ${input.timeoutMs}ms.` : undefined]
          .filter(Boolean)
          .join("\n"),
      );
      resolve({
        adapter: input.plan.adapter,
        command: resolvedCommand,
        args: input.plan.args,
        exitCode,
        ok: exitCode === 0,
        timedOut,
        durationMs: Date.now() - started,
        ...artifacts,
        eventsCaptured: 0,
      });
    });
    if (input.plan.promptViaStdin) {
      child.stdin.end(input.prompt);
    } else {
      child.stdin.end();
    }
  });
}

function terminateChild(child: ChildProcessWithoutNullStreams): void {
  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.on("error", () => {
      child.kill();
    });
    return;
  }
  child.kill("SIGTERM");
}

async function captureProviderTraceEvents(repoRoot: string, provider: LoopRunIteration["provider"]): Promise<LoopRunIteration["provider"]> {
  const output = await readFile(provider.outputPath, "utf8").catch(() => "");
  const events = providerTraceEvents(
    {
      adapter: provider.adapter,
      command: provider.command,
      args: provider.args,
      promptViaStdin: true,
      outputFormat: provider.adapter === "custom" ? "text" : "jsonl",
    },
    output,
  );
  for (const event of events) {
    await appendTraceEventIfActive(repoRoot, event);
  }
  return { ...provider, eventsCaptured: events.length };
}

async function runVerificationCommands(
  repoRoot: string,
  session: LoopSession,
  iteration: number,
  commands: string[],
  timeoutMs: number,
): Promise<LoopVerificationResult[]> {
  const results: LoopVerificationResult[] = [];
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index]!;
    const result = await executeShell(command, { cwd: repoRoot, timeoutMs });
    const outputPath = path.join(sessionDir(repoRoot, session.sessionId), `verification-${iteration}-${index + 1}.log`);
    const artifacts = await writeOutputArtifacts(outputPath, [result.stdout, result.stderr].filter(Boolean).join("\n"));
    const verification: LoopVerificationResult = {
      command,
      ok: result.ok,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      ...artifacts,
    };
    await appendTraceEventIfActive(repoRoot, {
      type: "run_tool",
      tool: "verification",
      command,
      exitCode: result.exitCode,
      ok: result.ok,
      durationMs: result.durationMs,
      message: result.ok ? "Required verification passed." : "Required verification failed.",
      data: { outputPath, compactOutputPath: artifacts.compactOutputPath, compression: artifacts.compression, timedOut: result.timedOut },
    });
    results.push(verification);
  }
  return results;
}

function markdownLoopReport(report: LoopRunReport): string {
  const lines = [
    `# Threadroot Loop Report`,
    "",
    `Session: ${report.session.sessionId}`,
    `Goal: ${report.session.goal}`,
    `Status: ${report.session.status}`,
    `Stopped: ${report.stoppedReason}`,
    `Iterations: ${report.iterations.length}`,
    "",
  ];
  for (const iteration of report.iterations) {
    lines.push(`## Iteration ${iteration.iteration}`, "");
    lines.push(`Trace: ${iteration.traceRunId}`);
    lines.push(
      `Provider: ${iteration.provider.adapter} ${iteration.provider.ok ? "passed" : "failed"} exit ${iteration.provider.exitCode ?? "unknown"} (${iteration.provider.durationMs}ms)`,
    );
    lines.push(`Provider output: ${iteration.provider.outputPath}`);
    lines.push(`Provider compact output: ${iteration.provider.compactOutputPath}`);
    lines.push(
      `Provider compression: saved ~${iteration.provider.compression.estimatedTokensSaved} token(s), ratio ${iteration.provider.compression.compressionRatio}`,
    );
    lines.push(`Provider events captured: ${iteration.provider.eventsCaptured}`);
    if (iteration.verification.length > 0) {
      lines.push("", "Verification:");
      for (const check of iteration.verification) {
        lines.push(
          `- ${check.ok ? "passed" : "failed"}: ${check.command} (${check.durationMs}ms, output: ${check.outputPath}, compact: ${check.compactOutputPath}, saved ~${check.compression.estimatedTokensSaved} token(s))`,
        );
      }
    }
    lines.push(
      "",
      `Trace eval: Recall@5 ${iteration.traceEval.summary.realRunRecallAt5.toFixed(3)}, MRR ${iteration.traceEval.summary.realRunMrr.toFixed(3)}, failed tools ${iteration.traceEval.summary.failedToolRuns}`,
    );
    lines.push("", `Improvement candidates: ${iteration.improvements.summary.candidates}`);
    if (iteration.appliedImprovements) {
      lines.push(`Auto-safe improvements applied: ${iteration.appliedImprovements.summary.applied}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function writeLoopRunArtifacts(repoRoot: string, report: LoopRunReport): Promise<LoopRunReport> {
  const runReportPath = path.join(sessionDir(repoRoot, report.session.sessionId), "run-report.json");
  const finalReportPath = path.join(sessionDir(repoRoot, report.session.sessionId), "final-report.md");
  const withPaths = { ...report, reportPath: runReportPath, finalReportPath };
  await writeJson(runReportPath, withPaths);
  await writeFile(finalReportPath, markdownLoopReport(withPaths), "utf8");
  return withPaths;
}

export async function runLoop(repoRoot: string, options: LoopRunOptions = {}): Promise<LoopRunReport> {
  const session = await currentLoopSession(repoRoot);
  if (!session || session.status !== "active") {
    throw new Error("No active loop session. Start one with `threadroot loop start \"<goal>\"`.");
  }
  const iterations: LoopRunIteration[] = [];
  const requestedIterations = options.iterations ?? 1;
  const requiredCommands = options.requiredCommands ?? [];
  let stoppedReason: LoopRunReport["stoppedReason"] = "completed";
  for (let i = 0; i < requestedIterations; i += 1) {
    const current = await currentLoopSession(repoRoot);
    if (!current || current.status !== "active") {
      stoppedReason = "completed";
      break;
    }
    if (current.deadlineAt && Date.now() >= Date.parse(current.deadlineAt)) {
      stoppedReason = "time-budget";
      break;
    }
    if (current.iteration >= current.maxIterations) {
      stoppedReason = "iteration-budget";
      break;
    }
    const next = await nextLoop(repoRoot);
    const prompt = promptWithVerification(next.prompt, requiredCommands);
    const plan = providerCommandPlan({
      agent: next.session.agent,
      repoRoot,
      prompt,
      agentCommand: options.agentCommand,
      agentArgs: options.agentArgs,
      agentAdapter: options.agentAdapter,
    });
    let provider = await runProviderPrompt({
      repoRoot,
      session: next.session,
      iteration: next.session.iteration,
      prompt,
      plan,
      timeoutMs: options.timeoutMs ?? 60 * 60_000,
    });
    provider = await captureProviderTraceEvents(repoRoot, provider);
    await appendTraceEventIfActive(repoRoot, {
      type: "command",
      command: [provider.command, ...provider.args].join(" "),
      exitCode: provider.exitCode,
      ok: provider.ok,
      durationMs: provider.durationMs,
      message: provider.ok
        ? "Provider command completed."
        : provider.timedOut
          ? "Provider command timed out."
          : "Provider command failed.",
      data: {
        outputPath: provider.outputPath,
        compactOutputPath: provider.compactOutputPath,
        compression: provider.compression,
      },
    });
    const verification = provider.ok
      ? await runVerificationCommands(repoRoot, next.session, next.session.iteration, requiredCommands, options.verificationTimeoutMs ?? 120_000)
      : [];
    const verificationOk = verification.every((entry) => entry.ok);
    const active = await activeTrace(repoRoot);
    if (active?.runId === next.trace.runId) {
      await finishTrace(
        repoRoot,
        provider.ok && verificationOk ? (verification.length > 0 ? "passed" : "partial") : "failed",
        provider.ok
          ? verificationOk
            ? verification.length > 0
              ? "Provider and required verification completed."
              : "Provider run completed; pending verification and candidate review."
            : "Required verification failed."
          : "Provider command failed.",
      );
    }
    const traceEval = await runTraceEvals(repoRoot, { latest: true });
    const writeCandidates = options.writeCandidates ?? true;
    const improvements = await improveLatest(repoRoot, {
      writeCandidates,
      autoApplySafe: writeCandidates && options.autoApply !== false,
    });
    const appliedImprovements = improvements.applied;
    iterations.push({
      iteration: next.session.iteration,
      traceRunId: next.trace.runId,
      provider,
      verification,
      traceEval,
      improvements,
      appliedImprovements,
    });
    if (!provider.ok) {
      stoppedReason = "provider-failed";
      break;
    }
    if (!verificationOk) {
      stoppedReason = "verification-failed";
      break;
    }
  }
  if (iterations.length < requestedIterations && stoppedReason === "completed") {
    stoppedReason = "iteration-budget";
  }
  return writeLoopRunArtifacts(repoRoot, { session: (await currentLoopSession(repoRoot)) ?? session, iterations, stoppedReason });
}
