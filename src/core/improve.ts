import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { projectHarnessDir } from "./harness/paths.js";
import { hashContent } from "./hash.js";
import { runTraceEvals } from "./trace-evals.js";
import { isRepoWorkTracePath, latestTrace, readTrace, type TraceReceipt } from "./trace.js";
import { updateTraceLessonsSkill, upsertTraceRoutingHint, writeTraceRoutingEvalCase } from "./trace-routing.js";

export type ImprovementCandidateType = "memory" | "skill" | "tool" | "eval" | "prompt";
export type ImprovementCandidatePriority = "p0" | "p1" | "p2";

export type ImprovementCandidate = {
  id: string;
  type: ImprovementCandidateType;
  priority: ImprovementCandidatePriority;
  score: number;
  title: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  proposedChange: string;
  acceptanceCriteria: string[];
  evidence: string[];
  promotion: {
    ready: boolean;
    requiredChecks: string[];
    blockedReasons: string[];
  };
  status: "pending";
  traceRunId: string;
  createdAt: string;
};

export type ImprovementReport = {
  trace?: Pick<TraceReceipt, "runId" | "task" | "status">;
  candidates: ImprovementCandidate[];
  written: string[];
  applied?: ApplyImprovementReport;
  summary: {
    candidates: number;
    byType: Record<ImprovementCandidateType, number>;
    byPriority: Record<ImprovementCandidatePriority, number>;
  };
};

export type AppliedImprovement = {
  id: string;
  type: ImprovementCandidateType;
  title: string;
  status: "applied" | "skipped";
  reason?: string;
  artifacts: string[];
};

export type ApplyImprovementReport = {
  applied: AppliedImprovement[];
  skipped: AppliedImprovement[];
  summary: {
    considered: number;
    applied: number;
    skipped: number;
    autoSafe: boolean;
    dryRun: boolean;
  };
};

export type ImproveLatestOptions = {
  writeCandidates?: boolean;
  autoApplySafe?: boolean;
  dryRun?: boolean;
};

type CandidateOptions = {
  confidence?: ImprovementCandidate["confidence"];
  acceptanceCriteria?: string[];
  requiredChecks?: string[];
  blockedReasons?: string[];
};

const PROMOTABLE_TRACE_STATUSES = new Set<TraceReceipt["status"]>(["passed", "partial"]);
const MAX_AUTO_SAFE_ROUTING_FILES = 8;
const MAX_TRACE_ROUTING_EVAL_FILES = 5;

function pendingDir(repoRoot: string): string {
  return path.join(projectHarnessDir(repoRoot), "improvements", "pending");
}

function appliedDir(repoRoot: string): string {
  return path.join(projectHarnessDir(repoRoot), "improvements", "applied");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "candidate";
}

function confidenceScore(confidence: ImprovementCandidate["confidence"]): number {
  if (confidence === "high") return 30;
  if (confidence === "medium") return 18;
  return 6;
}

function typeScore(type: ImprovementCandidateType): number {
  if (type === "eval") return 34;
  if (type === "tool") return 26;
  if (type === "prompt") return 22;
  if (type === "skill") return 18;
  return 8;
}

function priorityFor(score: number): ImprovementCandidatePriority {
  if (score >= 70) return "p0";
  if (score >= 45) return "p1";
  return "p2";
}

function defaultAcceptanceCriteria(type: ImprovementCandidateType): string[] {
  if (type === "eval") {
    return [
      "Add or update a deterministic eval case that captures the trace evidence.",
      "Run `threadroot eval context --json` or `threadroot eval traces --latest --json` and preserve or improve the gated metric.",
    ];
  }
  if (type === "tool") {
    return [
      "Create or narrow the tool wrapper without embedding secrets or broad mutation commands.",
      "Run `threadroot tools check --json` and `threadroot doctor --json`.",
    ];
  }
  if (type === "prompt") {
    return [
      "Update loop or provider prompt text only where trace evidence shows repeated value.",
      "Run the narrow loop/provider tests that cover the changed prompt surface.",
    ];
  }
  if (type === "skill") {
    return [
      "Keep the skill narrow, procedural, and triggered only by matching tasks.",
      "Run `threadroot skills validate --json` and add a trigger/routing eval when practical.",
    ];
  }
  return [
    "Corroborate the fact across multiple successful traces before writing durable memory.",
    "Prefer an eval or skill update when the evidence is task-specific rather than stable project truth.",
  ];
}

function defaultRequiredChecks(type: ImprovementCandidateType): string[] {
  if (type === "eval") return ["threadroot eval context --json", "threadroot eval traces --latest --json"];
  if (type === "tool") return ["threadroot tools check --json", "threadroot doctor --json"];
  if (type === "skill") return ["threadroot skills validate --json", "threadroot doctor --json"];
  return ["threadroot doctor --json"];
}

function defaultBlockedReasons(type: ImprovementCandidateType): string[] {
  if (type === "memory") {
    return ["Needs repeated corroborating traces before durable memory promotion."];
  }
  if (type === "skill") {
    return ["Needs a focused trigger eval or deterministic acceptance check before promotion."];
  }
  return [];
}

function candidate(
  trace: TraceReceipt,
  type: ImprovementCandidateType,
  title: string,
  rationale: string,
  proposedChange: string,
  evidence: string[],
  options: CandidateOptions = {},
): ImprovementCandidate {
  const createdAt = new Date().toISOString();
  const confidence = options.confidence ?? "medium";
  const blockedReasons = options.blockedReasons ?? defaultBlockedReasons(type);
  const requiredChecks = options.requiredChecks ?? defaultRequiredChecks(type);
  const acceptanceCriteria = options.acceptanceCriteria ?? defaultAcceptanceCriteria(type);
  const score =
    confidenceScore(confidence) +
    typeScore(type) +
    Math.min(16, evidence.length * 4) +
    (blockedReasons.length === 0 ? 8 : 0);
  const id = `${type}-${slug(title)}-${hashContent(`${trace.runId}:${type}:${title}:${proposedChange}`).slice(0, 8)}`;
  return {
    id,
    type,
    priority: priorityFor(score),
    score,
    title,
    rationale,
    confidence,
    proposedChange,
    acceptanceCriteria,
    evidence,
    promotion: {
      ready: blockedReasons.length === 0,
      requiredChecks,
      blockedReasons,
    },
    status: "pending",
    traceRunId: trace.runId,
    createdAt,
  };
}

function byType(candidates: ImprovementCandidate[]): Record<ImprovementCandidateType, number> {
  return {
    memory: candidates.filter((entry) => entry.type === "memory").length,
    skill: candidates.filter((entry) => entry.type === "skill").length,
    tool: candidates.filter((entry) => entry.type === "tool").length,
    eval: candidates.filter((entry) => entry.type === "eval").length,
    prompt: candidates.filter((entry) => entry.type === "prompt").length,
  };
}

function byPriority(candidates: ImprovementCandidate[]): Record<ImprovementCandidatePriority, number> {
  return {
    p0: candidates.filter((entry) => entry.priority === "p0").length,
    p1: candidates.filter((entry) => entry.priority === "p1").length,
    p2: candidates.filter((entry) => entry.priority === "p2").length,
  };
}

function neededFiles(trace: TraceReceipt): string[] {
  return [
    ...new Set(
      trace.events
        .filter((event) => event.type === "read_file" || event.type === "edit_file")
        .map((event) => event.path)
        .filter(isRepoWorkTracePath),
    ),
  ];
}

function isTestPath(filePath: string): boolean {
  const base = path.basename(filePath);
  return (
    filePath.split("/").some((part) => part === "test" || part === "tests" || part === "__tests__") ||
    base.includes(".test.") ||
    base.includes(".spec.")
  );
}

function primaryRoutingFiles(files: string[]): string[] {
  const source = files.filter((file) => file.startsWith("src/") && !isTestPath(file));
  const tests = files.filter(isTestPath);
  const other = files.filter((file) => !source.includes(file) && !tests.includes(file));
  return [...new Set([...source, ...tests, ...other])].slice(0, MAX_TRACE_ROUTING_EVAL_FILES);
}

function traceStatusBlockedReasons(trace: TraceReceipt): string[] {
  return PROMOTABLE_TRACE_STATUSES.has(trace.status)
    ? []
    : [`Trace status is ${trace.status}; auto-safe promotion requires a finished passed or partial trace.`];
}

function isSuccessfulValidationToolEvent(event: TraceReceipt["events"][number]): boolean {
  const infrastructureTools = new Set([
    "task_packet",
    "trace_context",
    "trace_event",
    "eval_traces",
    "improve_latest",
    "improve_apply",
    "loop_start",
    "loop_next",
    "loop_report",
    "loop_finish",
  ]);
  return event.type === "run_tool" && event.ok === true && Boolean(event.command) && !infrastructureTools.has(event.tool ?? "");
}

function successfulValidationTools(trace: TraceReceipt): string[] {
  return [
    ...new Set(
      trace.events
        .filter(isSuccessfulValidationToolEvent)
        .map((event) => event.tool)
        .filter((entry): entry is string => Boolean(entry)),
    ),
  ].sort();
}

function pendingCandidatePath(repoRoot: string, candidate: ImprovementCandidate): string {
  return path.join(pendingDir(repoRoot), `${candidate.id}.json`);
}

function appliedCandidatePath(repoRoot: string, candidate: ImprovementCandidate): string {
  return path.join(appliedDir(repoRoot), `${candidate.id}.json`);
}

function safeAutoApplyKind(candidate: ImprovementCandidate): "routing-eval" | "validation-skill" | undefined {
  if (
    candidate.type === "eval" &&
    candidate.title === "Promote trace into a routing eval" &&
    candidate.promotion.ready
  ) {
    return "routing-eval";
  }
  if (
    candidate.type === "prompt" &&
    candidate.title === "Carry forward successful validation tools" &&
    candidate.promotion.ready
  ) {
    return "validation-skill";
  }
  return undefined;
}

function isImprovementCandidate(value: unknown): value is ImprovementCandidate {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as ImprovementCandidate;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.traceRunId === "string" &&
    candidate.status === "pending" &&
    Boolean(candidate.promotion)
  );
}

async function readPendingCandidates(repoRoot: string): Promise<ImprovementCandidate[]> {
  let entries: string[];
  try {
    entries = await readdir(pendingDir(repoRoot));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const candidates: ImprovementCandidate[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".json")).sort()) {
    const parsed = JSON.parse(await readFile(path.join(pendingDir(repoRoot), entry), "utf8")) as unknown;
    if (isImprovementCandidate(parsed)) {
      candidates.push(parsed);
    }
  }
  return candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

async function archiveAppliedCandidate(
  repoRoot: string,
  candidate: ImprovementCandidate,
  applied: AppliedImprovement,
): Promise<string> {
  const filePath = appliedCandidatePath(repoRoot, candidate);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        ...candidate,
        status: "applied",
        appliedAt: new Date().toISOString(),
        appliedResult: applied,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await rm(pendingCandidatePath(repoRoot, candidate), { force: true });
  return filePath;
}

async function applySafeCandidate(
  repoRoot: string,
  candidate: ImprovementCandidate,
  dryRun: boolean,
): Promise<AppliedImprovement> {
  const kind = safeAutoApplyKind(candidate);
  if (!kind) {
    return {
      id: candidate.id,
      type: candidate.type,
      title: candidate.title,
      status: "skipped",
      reason: candidate.promotion.ready
        ? "Candidate type/title is not part of the auto-safe promotion set."
        : candidate.promotion.blockedReasons.join("; "),
      artifacts: [],
    };
  }

  const trace = await readTrace(repoRoot, candidate.traceRunId).catch(() => undefined);
  if (!trace) {
    return {
      id: candidate.id,
      type: candidate.type,
      title: candidate.title,
      status: "skipped",
      reason: "Source trace is missing.",
      artifacts: [],
    };
  }
  const statusBlockedReasons = traceStatusBlockedReasons(trace);
  if (statusBlockedReasons.length > 0) {
    return {
      id: candidate.id,
      type: candidate.type,
      title: candidate.title,
      status: "skipped",
      reason: statusBlockedReasons.join("; "),
      artifacts: [],
    };
  }

  const files = neededFiles(trace);
  const validationTools = successfulValidationTools(trace);
  if (kind === "routing-eval" && files.length === 0) {
    return {
      id: candidate.id,
      type: candidate.type,
      title: candidate.title,
      status: "skipped",
      reason: "Source trace did not record read/edit files.",
      artifacts: [],
    };
  }
  if (kind === "routing-eval" && files.length > MAX_AUTO_SAFE_ROUTING_FILES) {
    return {
      id: candidate.id,
      type: candidate.type,
      title: candidate.title,
      status: "skipped",
      reason: `Trace touched ${files.length} files; auto-safe routing promotion is capped at ${MAX_AUTO_SAFE_ROUTING_FILES} files to avoid noisy broad-task lessons.`,
      artifacts: [],
    };
  }
  if (kind === "validation-skill" && validationTools.length === 0) {
    return {
      id: candidate.id,
      type: candidate.type,
      title: candidate.title,
      status: "skipped",
      reason: "Source trace did not record successful validation tools.",
      artifacts: [],
    };
  }

  if (dryRun) {
    return {
      id: candidate.id,
      type: candidate.type,
      title: candidate.title,
      status: "applied",
      reason: "dry-run",
      artifacts: [],
    };
  }

  const artifacts: string[] = [];
  const evidence = [
    ...candidate.evidence,
    files.length > 0 ? `needed files: ${files.join(", ")}` : "",
    validationTools.length > 0 ? `validation tools: ${validationTools.join(", ")}` : "",
  ].filter(Boolean);
  const hintFiles = kind === "routing-eval" ? files : primaryRoutingFiles(files);
  const { hint, path: hintPath } = await upsertTraceRoutingHint(repoRoot, {
    task: trace.task,
    expectedFiles: hintFiles,
    validationTools,
    sourceTraceRunId: trace.runId,
    evidence,
    confidence: candidate.confidence,
  });
  artifacts.push(hintPath);
  if (kind === "routing-eval") {
    const evalPath = await writeTraceRoutingEvalCase(repoRoot, {
      id: hint.id,
      task: trace.task,
      expectedFiles: primaryRoutingFiles(files),
      sourceTraceRunIds: hint.sourceTraceRunIds,
    });
    if (evalPath) {
      artifacts.push(evalPath);
    }
  }
  artifacts.push(await updateTraceLessonsSkill(repoRoot));
  const applied: AppliedImprovement = {
    id: candidate.id,
    type: candidate.type,
    title: candidate.title,
    status: "applied",
    artifacts,
  };
  artifacts.push(await archiveAppliedCandidate(repoRoot, candidate, applied));
  return { ...applied, artifacts };
}

function createCandidates(trace: TraceReceipt, realRunRecallAt5: number): ImprovementCandidate[] {
  const candidates: ImprovementCandidate[] = [];
  const needed = neededFiles(trace);
  const topFive = new Set([...trace.taskPacket.rankedFiles, ...trace.taskPacket.tests].slice(0, 5));
  const missed = needed.filter((file) => !topFive.has(file));
  const failedTools = trace.events.filter((event) => event.type === "run_tool" && event.ok === false);
  const successfulTools = trace.events.filter(isSuccessfulValidationToolEvent);

  if (missed.length > 0) {
    const routingBlockedReasons = [
      ...traceStatusBlockedReasons(trace),
      ...(needed.length > MAX_AUTO_SAFE_ROUTING_FILES
        ? [
            `Trace touched ${needed.length} files; auto-safe routing promotion is capped at ${MAX_AUTO_SAFE_ROUTING_FILES} files to avoid noisy broad-task lessons.`,
          ]
        : []),
    ];
    const primaryFiles = primaryRoutingFiles(needed);
    candidates.push(
      candidate(
        trace,
        "eval",
        "Promote trace into a routing eval",
        "The agent needed files that were not in the starting top-five context.",
        `Add a trace-derived eval case for task \`${trace.task}\` with primary expected files: ${primaryFiles.join(", ")}.`,
        [`missed top-five files: ${missed.join(", ")}`, `real-run Recall@5: ${realRunRecallAt5.toFixed(3)}`],
        {
          confidence: "high",
          acceptanceCriteria: [
            "Promote this trace into a deterministic context-routing eval with the observed needed files.",
            "Improve the route until the expected files are no longer mostly outside the starting top five.",
            "Run `threadroot eval context --json` and `threadroot eval traces --latest --json`.",
          ],
          blockedReasons: routingBlockedReasons,
        },
      ),
    );
  }

  if (successfulTools.length > 0) {
    const names = [...new Set(successfulTools.map((event) => event.tool).filter(Boolean))].join(", ");
    candidates.push(
      candidate(
        trace,
        "prompt",
        "Carry forward successful validation tools",
        "The trace shows which local tools produced useful validation evidence.",
        `In the next loop prompt, require these tools when relevant: ${names}.`,
        successfulTools.map((event) => `${event.tool}: ${event.message ?? "passed"}`),
        { confidence: "medium", blockedReasons: traceStatusBlockedReasons(trace) },
      ),
    );
  }

  if (failedTools.length > 0) {
    candidates.push(
      candidate(
        trace,
        "tool",
        "Reduce failed tool recovery cost",
        "The trace has failed tool runs that should become next-run warnings or narrower tool wrappers.",
        `Review failed tool output and consider a narrower diagnostic wrapper for: ${[...new Set(failedTools.map((event) => event.tool).filter(Boolean))].join(", ")}.`,
        failedTools.map((event) => `${event.tool}: exit ${event.exitCode ?? "unknown"} ${event.message ?? ""}`),
        { confidence: "medium" },
      ),
    );
  }

  if (trace.status === "passed" && needed.length > 0) {
    candidates.push(
      candidate(
        trace,
        "memory",
        "Remember stable task ownership only if repeated",
        "A successful trace identified files involved in this task. Store as memory only after repeated evidence.",
        `Candidate stable fact after corroboration: tasks like \`${trace.task}\` often involve ${needed.join(", ")}.`,
        [`status: ${trace.status}`, `needed files: ${needed.join(", ")}`],
        { confidence: "low" },
      ),
    );
  }

  return candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export async function improveLatest(repoRoot: string, options: ImproveLatestOptions = {}): Promise<ImprovementReport> {
  const trace = await latestTrace(repoRoot);
  if (!trace) {
    return {
      candidates: [],
      written: [],
      summary: { candidates: 0, byType: byType([]), byPriority: byPriority([]) },
    };
  }
  const evalReport = await runTraceEvals(repoRoot, { latest: true });
  const candidates = createCandidates(trace, evalReport.summary.realRunRecallAt5);
  const written: string[] = [];
  const autoApplySafe = options.autoApplySafe === true;
  const dryRun = options.dryRun === true;
  const writeCandidates = options.writeCandidates ?? autoApplySafe;
  if (writeCandidates && !dryRun) {
    await mkdir(pendingDir(repoRoot), { recursive: true });
    for (const entry of candidates) {
      const filePath = path.join(pendingDir(repoRoot), `${entry.id}.json`);
      await writeFile(filePath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
      written.push(filePath);
    }
  }
  const applied = autoApplySafe
    ? await applyImprovementCandidates(repoRoot, { autoSafe: true, dryRun, fromLatest: false })
    : undefined;
  return {
    trace: { runId: trace.runId, task: trace.task, status: trace.status },
    candidates,
    written,
    ...(applied ? { applied } : {}),
    summary: { candidates: candidates.length, byType: byType(candidates), byPriority: byPriority(candidates) },
  };
}

export async function applyImprovementCandidates(
  repoRoot: string,
  options: { autoSafe?: boolean; dryRun?: boolean; fromLatest?: boolean } = {},
): Promise<ApplyImprovementReport> {
  const autoSafe = options.autoSafe === true;
  const dryRun = options.dryRun === true;
  if (options.fromLatest !== false) {
    await improveLatest(repoRoot, { writeCandidates: !dryRun, autoApplySafe: false });
  }
  const candidates = await readPendingCandidates(repoRoot);
  const results: AppliedImprovement[] = [];

  for (const candidate of candidates) {
    if (!autoSafe) {
      results.push({
        id: candidate.id,
        type: candidate.type,
        title: candidate.title,
        status: "skipped",
        reason: "Auto-safe promotion is disabled. Use `threadroot improve latest` or pass autoSafe=true to apply guarded local trace-derived improvements.",
        artifacts: [],
      });
      continue;
    }
    results.push(await applySafeCandidate(repoRoot, candidate, dryRun));
  }

  const applied = results.filter((entry) => entry.status === "applied");
  const skipped = results.filter((entry) => entry.status === "skipped");
  return {
    applied,
    skipped,
    summary: {
      considered: candidates.length,
      applied: applied.length,
      skipped: skipped.length,
      autoSafe,
      dryRun,
    },
  };
}
