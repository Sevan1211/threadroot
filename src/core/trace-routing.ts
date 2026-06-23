import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { serializeFrontmatter } from "./harness/frontmatter.js";
import { projectHarnessDir, projectObjectDir } from "./harness/paths.js";
import { hashContent } from "./hash.js";

export type TraceRoutingHint = {
  id: string;
  task: string;
  taskTerms: string[];
  expectedFiles: string[];
  validationTools: string[];
  sourceTraceRunIds: string[];
  evidence: string[];
  usagePolicy: {
    scope: "repo-local";
    provenance: "local-trace-metadata";
    sharing: "do-not-publish-without-review";
    secrets: "do-not-store-or-repeat-secrets";
    terms: string[];
  };
  observations: number;
  confidence: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
};

export type TraceRoutingStore = {
  schemaVersion: 1;
  generatedAt: string;
  hints: TraceRoutingHint[];
};

export type TraceRoutingEvalCase = {
  schemaVersion: 1;
  id: string;
  task: string;
  expectedFiles: string[];
  sourceTraceRunIds: string[];
  generatedBy: "threadroot improve latest" | "threadroot improve apply";
  createdAt: string;
};

export type ScoredTraceRoutingHint = TraceRoutingHint & {
  score: number;
  overlap: string[];
};

const TASK_STOPWORDS = new Set([
  "about",
  "actually",
  "after",
  "again",
  "also",
  "because",
  "before",
  "being",
  "better",
  "could",
  "does",
  "doing",
  "done",
  "from",
  "have",
  "into",
  "just",
  "make",
  "more",
  "need",
  "needs",
  "only",
  "really",
  "should",
  "than",
  "that",
  "this",
  "what",
  "when",
  "where",
  "with",
  "would",
]);

function routingDir(repoRoot: string): string {
  return path.join(projectHarnessDir(repoRoot), "routing");
}

export function traceRoutingStorePath(repoRoot: string): string {
  return path.join(routingDir(repoRoot), "trace-hints.json");
}

function traceRoutingEvalDir(repoRoot: string): string {
  return path.join(projectHarnessDir(repoRoot), "evals", "context-routing");
}

function traceRoutingEvalPath(repoRoot: string, id: string): string {
  return path.join(traceRoutingEvalDir(repoRoot), `${id}.json`);
}

export function traceRoutingTerms(task: string): string[] {
  return [
    ...new Set(
      task
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/)
        .filter((term) => term.length > 2)
        .filter((term) => !TASK_STOPWORDS.has(term)),
    ),
  ];
}

function hintId(task: string, expectedFiles: string[]): string {
  const normalizedFiles = [...expectedFiles].sort().join(",");
  return `trace-${hashContent(`${traceRoutingTerms(task).join(" ")}:${normalizedFiles}`).slice(0, 12)}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueSorted(values: string[]): string[] {
  return unique(values).sort();
}

function confidenceFor(observations: number, explicit?: TraceRoutingHint["confidence"]): TraceRoutingHint["confidence"] {
  if (explicit === "high" || observations >= 3) return "high";
  if (explicit === "medium" || observations >= 2) return "medium";
  return "low";
}

function traceLessonUsagePolicy(existing?: TraceRoutingHint["usagePolicy"]): TraceRoutingHint["usagePolicy"] {
  return {
    scope: "repo-local",
    provenance: "local-trace-metadata",
    sharing: "do-not-publish-without-review",
    secrets: "do-not-store-or-repeat-secrets",
    terms: unique([
      ...(existing?.terms ?? []),
      "Use only inside this repository's local Threadroot harness.",
      "Treat source traces, file paths, tool output, and validation evidence as local project context.",
      "Do not upload, publish, or sync trace-derived lessons without user approval and provider terms review.",
      "Prefer fresh trace/eval evidence over stale lessons when the repo changes.",
    ]),
  };
}

function isTraceRoutingStore(value: unknown): value is TraceRoutingStore {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as TraceRoutingStore).schemaVersion === 1 &&
    Array.isArray((value as TraceRoutingStore).hints)
  );
}

export async function readTraceRoutingStore(repoRoot: string): Promise<TraceRoutingStore> {
  try {
    const parsed = JSON.parse(await readFile(traceRoutingStorePath(repoRoot), "utf8")) as unknown;
    if (isTraceRoutingStore(parsed)) {
      return parsed;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  return { schemaVersion: 1, generatedAt: new Date(0).toISOString(), hints: [] };
}

export async function writeTraceRoutingStore(repoRoot: string, store: TraceRoutingStore): Promise<string> {
  const filePath = traceRoutingStorePath(repoRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  return filePath;
}

export async function upsertTraceRoutingHint(
  repoRoot: string,
  input: {
    task: string;
    expectedFiles?: string[];
    validationTools?: string[];
    sourceTraceRunId: string;
    evidence?: string[];
    confidence?: TraceRoutingHint["confidence"];
  },
): Promise<{ hint: TraceRoutingHint; path: string }> {
  const store = await readTraceRoutingStore(repoRoot);
  const expectedFiles = unique(input.expectedFiles ?? []);
  const id = hintId(input.task, expectedFiles);
  const now = new Date().toISOString();
  const existing = store.hints.find((entry) => entry.id === id);
  const observations = (existing?.observations ?? 0) + 1;
  const hint: TraceRoutingHint = {
    id,
    task: existing?.task ?? input.task,
    taskTerms: traceRoutingTerms(existing?.task ?? input.task),
    expectedFiles: unique([...(existing?.expectedFiles ?? []), ...expectedFiles]),
    validationTools: uniqueSorted([...(existing?.validationTools ?? []), ...(input.validationTools ?? [])]),
    sourceTraceRunIds: uniqueSorted([...(existing?.sourceTraceRunIds ?? []), input.sourceTraceRunId]),
    evidence: uniqueSorted([...(existing?.evidence ?? []), ...(input.evidence ?? [])]).slice(0, 16),
    usagePolicy: traceLessonUsagePolicy(existing?.usagePolicy),
    observations,
    confidence: confidenceFor(observations, input.confidence ?? existing?.confidence),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const hints = store.hints.filter((entry) => entry.id !== id);
  hints.push(hint);
  const pathWritten = await writeTraceRoutingStore(repoRoot, {
    schemaVersion: 1,
    generatedAt: now,
    hints: hints.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)).slice(0, 200),
  });
  return { hint, path: pathWritten };
}

export function scoreTraceRoutingHints(hints: TraceRoutingHint[], task: string): ScoredTraceRoutingHint[] {
  const taskTerms = traceRoutingTerms(task);
  const termSet = new Set(taskTerms);
  const normalizedTask = taskTerms.join(" ");
  return hints
    .map((hint) => {
      const overlap = hint.taskTerms.filter((term) => termSet.has(term));
      const coverage = overlap.length / Math.max(1, Math.min(taskTerms.length, hint.taskTerms.length));
      const exact = normalizedTask && normalizedTask === hint.taskTerms.join(" ") ? 26 : 0;
      const observations = Math.min(14, hint.observations * 4);
      const confidence = hint.confidence === "high" ? 12 : hint.confidence === "medium" ? 7 : 2;
      const fileEvidence = hint.expectedFiles.length > 0 ? 8 : 0;
      const score = overlap.length * 12 + Math.round(coverage * 30) + exact + observations + confidence + fileEvidence;
      return { ...hint, score, overlap };
    })
    .filter((hint) => hint.score >= 24 && hint.overlap.length > 0)
    .sort((a, b) => b.score - a.score || b.observations - a.observations || a.id.localeCompare(b.id));
}

export async function matchingTraceRoutingHints(repoRoot: string, task: string): Promise<ScoredTraceRoutingHint[]> {
  const store = await readTraceRoutingStore(repoRoot);
  return scoreTraceRoutingHints(store.hints, task);
}

export async function writeTraceRoutingEvalCase(
  repoRoot: string,
  input: {
    id: string;
    task: string;
    expectedFiles: string[];
    sourceTraceRunIds: string[];
  },
): Promise<string | undefined> {
  if (input.expectedFiles.length === 0) {
    return undefined;
  }
  const filePath = traceRoutingEvalPath(repoRoot, input.id);
  const entry: TraceRoutingEvalCase = {
    schemaVersion: 1,
    id: input.id,
    task: input.task,
    expectedFiles: unique(input.expectedFiles),
    sourceTraceRunIds: uniqueSorted(input.sourceTraceRunIds),
    generatedBy: "threadroot improve latest",
    createdAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  return filePath;
}

function isTraceRoutingEvalCase(value: unknown): value is TraceRoutingEvalCase {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as TraceRoutingEvalCase).schemaVersion === 1 &&
    typeof (value as TraceRoutingEvalCase).id === "string" &&
    typeof (value as TraceRoutingEvalCase).task === "string" &&
    Array.isArray((value as TraceRoutingEvalCase).expectedFiles)
  );
}

export async function readTraceRoutingEvalCases(repoRoot: string): Promise<TraceRoutingEvalCase[]> {
  let entries: string[];
  try {
    entries = await readdir(traceRoutingEvalDir(repoRoot));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const cases: TraceRoutingEvalCase[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".json")).sort()) {
    const parsed = JSON.parse(await readFile(path.join(traceRoutingEvalDir(repoRoot), entry), "utf8")) as unknown;
    if (isTraceRoutingEvalCase(parsed)) {
      cases.push(parsed);
    }
  }
  return cases;
}

export async function updateTraceLessonsSkill(repoRoot: string): Promise<string> {
  const store = await readTraceRoutingStore(repoRoot);
  const skillDir = path.join(projectObjectDir(repoRoot, "skills"), "threadroot-trace-lessons");
  const skillPath = path.join(skillDir, "SKILL.md");
  const lessons = store.hints
    .slice()
    .sort((a, b) => b.observations - a.observations || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 24);
  const body = [
    "# Trace-Derived Lessons",
    "",
    "This skill is generated by `threadroot improve latest` auto-safe promotion from local trace metadata. It is intentionally narrow: use it to reuse observed routing and validation lessons, not to make product claims or store secrets.",
    "",
    "## Local Policy",
    "",
    "- Scope: repo-local Threadroot harness context only.",
    "- Provenance: local trace metadata from this repository.",
    "- Sharing: do not publish, upload, or sync without user approval and provider terms review.",
    "- Secrets: do not store, infer, or repeat secrets from traces or tool output.",
    "",
    "## How To Use",
    "",
    "1. Match the current task against the lesson task and terms.",
    "2. Inspect listed files early when they still exist in the repo.",
    "3. Prefer listed validation tools after related edits.",
    "4. If a lesson is stale, rerun trace and context evals before trusting it.",
    "",
    "## Lessons",
    "",
    lessons.length === 0 ? "No applied trace lessons yet." : "",
    ...lessons.flatMap((lesson) => [
      `### ${lesson.task}`,
      "",
      `- Terms: ${lesson.taskTerms.join(", ") || "none"}`,
      `- Files: ${lesson.expectedFiles.join(", ") || "none recorded"}`,
      `- Validation tools: ${lesson.validationTools.join(", ") || "none recorded"}`,
      `- Confidence: ${lesson.confidence} from ${lesson.observations} observation(s)`,
      `- Source traces: ${lesson.sourceTraceRunIds.join(", ")}`,
      `- Evidence: ${lesson.evidence.join("; ") || "trace-derived"}`,
      `- Policy: ${lesson.usagePolicy?.terms?.join(" ") || "repo-local only; do not publish without review."}`,
      "",
    ]),
  ].join("\n");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    skillPath,
    serializeFrontmatter(
      {
        name: "threadroot-trace-lessons",
        description:
          "Use when a task resembles recent successful Threadroot traces, routing corrections, validation tools, or self-improvement loops; apply trace-derived file-routing lessons before broad exploration.",
        license: "local-generated",
        compatibility: "Threadroot local harness only. Generated from local trace metadata; do not publish without review.",
        scope: "project",
        tags: ["threadroot", "trace", "routing", "self-improvement"],
      },
      body,
    ),
    "utf8",
  );
  return skillPath;
}
