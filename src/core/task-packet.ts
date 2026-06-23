import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { refreshContext, type ContextFreshnessSummary } from "./freshness.js";
import { projectHarnessDir } from "./harness/paths.js";
import { assembleWorkingSet, type WorkingSet, type WorkingSetFile } from "./working-set.js";
import {
  indexStatus,
  readRepoIndex,
  scoreIndexCandidates,
  snippetsForFile,
  symbolsForFile,
  type IndexCandidate,
  type RepoIndexBuildResult,
  type RepoIndexChunk,
  type RepoIndexStatus,
  type RepoIndexSymbol,
} from "./repo-index.js";

export type TaskPacketFile = WorkingSetFile & {
  symbols: Array<Pick<RepoIndexSymbol, "name" | "kind" | "signature" | "startLine">>;
  snippets: Array<Pick<RepoIndexChunk, "kind" | "text" | "startLine" | "endLine" | "tokenEstimate">>;
};

export type TaskPacket = Omit<WorkingSet, "files" | "tests"> & {
  files: TaskPacketFile[];
  tests: TaskPacketFile[];
  index: RepoIndexStatus;
  indexBuild?: RepoIndexBuildResult;
  freshness?: ContextFreshnessSummary;
  debugRanking?: {
    candidates: IndexCandidate[];
  };
};

export type TaskPacketOptions = {
  budgetTokens?: number;
  maxFiles?: number;
  debugRanking?: boolean;
  forceIndex?: boolean;
};

const MAX_PACKET_SNIPPET_CHARS = 420;
const MAX_MEMORY_CHARS = 360;
const MAX_REPO_MAP_MEMORY_CHARS = 520;
const DEFAULT_PACKET_BUDGET = 4_000;
const MIN_PACKET_BUDGET = 1_200;
const MAX_REASON_CHARS = 160;
const MAX_SIGNATURE_CHARS = 140;

function clipText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: `${text.slice(0, maxChars).trimEnd()}\n[truncated]`, truncated: true };
}

function compactReasons(reasons: string[], limit: number): string[] {
  return reasons
    .slice(0, limit)
    .map((reason) => clipText(reason.replace(/\s+/g, " "), MAX_REASON_CHARS).text)
    .filter(Boolean);
}

function compactMemory(memory: WorkingSet["memory"]): WorkingSet["memory"] {
  return memory.slice(0, 2).map((entry) => {
    const maxChars = entry.type === "repo-map" ? MAX_REPO_MAP_MEMORY_CHARS : MAX_MEMORY_CHARS;
    const clipped = clipText(entry.body, maxChars);
    return { ...entry, body: clipped.text, truncated: entry.truncated || clipped.truncated };
  });
}

function compactRepoMap(repoMap: WorkingSet["repoMap"], maxChars: number): WorkingSet["repoMap"] {
  if (!repoMap?.excerpt) {
    return repoMap;
  }
  return { ...repoMap, excerpt: clipText(repoMap.excerpt, maxChars).text };
}

function snippetLimitFor(rank: number, section: "file" | "test", budgetTokens: number): number {
  if (budgetTokens <= 2_500) {
    return 0;
  }
  if (budgetTokens <= 4_000) {
    return section === "file" && rank === 0 ? 1 : 0;
  }
  return section === "file" ? (rank < 3 ? 1 : 0) : rank < 2 ? 1 : 0;
}

function hydrateFile(
  file: WorkingSetFile,
  task: string,
  index: Awaited<ReturnType<typeof readRepoIndex>>,
  rank: number,
  section: "file" | "test",
  budgetTokens: number,
): TaskPacketFile {
  const snippetLimit = snippetLimitFor(rank, section, budgetTokens);
  const symbolLimit = budgetTokens <= 2_500 ? (rank < 3 ? 3 : 1) : rank < 4 ? 5 : 2;
  return {
    ...file,
    reasons: compactReasons(file.reasons, budgetTokens <= 2_500 ? 3 : 5),
    symbols: symbolsForFile(index, file.path, symbolLimit).map((symbol) => ({
      name: symbol.name,
      kind: symbol.kind,
      signature: clipText(symbol.signature, MAX_SIGNATURE_CHARS).text,
      startLine: symbol.startLine,
    })),
    snippets: snippetsForFile(index, file.path, task, snippetLimit).map((snippet) => {
      const clipped = clipText(snippet.text, MAX_PACKET_SNIPPET_CHARS);
      return {
        kind: snippet.kind,
        text: clipped.text,
        startLine: snippet.startLine,
        endLine: snippet.endLine,
        tokenEstimate: Math.ceil(clipped.text.length / 4),
      };
    }),
  };
}

function compactDebugCandidates(candidates: IndexCandidate[], budgetTokens: number): IndexCandidate[] {
  const limit = budgetTokens <= 2_500 ? 8 : budgetTokens <= 4_000 ? 12 : 24;
  return candidates.slice(0, limit).map((candidate) => ({
    ...candidate,
    reasons: compactReasons(candidate.reasons, 4),
    signals: candidate.signals.slice(0, budgetTokens <= 4_000 ? 3 : 5).map((signal) => ({
      ...signal,
      detail: clipText(signal.detail.replace(/\s+/g, " "), MAX_REASON_CHARS).text,
    })),
  }));
}

function withoutDebug(packet: TaskPacket): TaskPacket {
  const { debugRanking: _debugRanking, ...rest } = packet;
  return rest;
}

function packetEstimate(packet: TaskPacket): number {
  return Math.ceil(JSON.stringify(packet).length / 4);
}

function withEstimate(packet: TaskPacket): TaskPacket {
  packet.tokenEstimate = packetEstimate(packet);
  return packet;
}

function enforceBudget(packet: TaskPacket, budgetTokens: number): TaskPacket {
  const target = Math.max(MIN_PACKET_BUDGET, budgetTokens);
  withEstimate(packet);
  if (packet.tokenEstimate <= target) {
    return packet;
  }

  const omitted = [...packet.omitted];
  const addOmitted = (reason: string): void => {
    if (!omitted.some((entry) => entry.section === "budget" && entry.reason === reason)) {
      omitted.push({ section: "budget", reason });
    }
  };

  let compacted: TaskPacket = {
    ...packet,
    omitted,
    summary: clipText(packet.summary, 180).text,
    repoMap: compactRepoMap(packet.repoMap, target <= 2_500 ? 240 : 480),
    memory: packet.memory.slice(0, target <= 2_500 ? 1 : 2).map((entry) => ({
      ...entry,
      body: clipText(entry.body, target <= 2_500 ? 180 : 280).text,
      truncated: true,
    })),
    files: packet.files.map((file, index) => ({
      ...file,
      reasons: compactReasons(file.reasons, target <= 2_500 ? 2 : 3),
      symbols: file.symbols.slice(0, target <= 2_500 ? (index < 3 ? 2 : 0) : index < 5 ? 3 : 1),
      snippets: target <= 3_000 || index > 0 ? [] : file.snippets.slice(0, 1),
    })),
    tests: packet.tests.map((file, index) => ({
      ...file,
      reasons: compactReasons(file.reasons, 2),
      symbols: file.symbols.slice(0, target <= 2_500 ? 0 : 2),
      snippets: target <= 4_000 || index > 0 ? [] : file.snippets.slice(0, 1),
    })),
    recommendedSkills: packet.recommendedSkills.slice(0, target <= 2_500 ? 4 : 6),
    commands: packet.commands.slice(0, target <= 2_500 ? 4 : 6),
    debugRanking: packet.debugRanking
      ? { candidates: compactDebugCandidates(packet.debugRanking.candidates, target) }
      : undefined,
  };
  addOmitted(`Compacted packet details to respect requested budget ${target}; use repo_read, skills_get, or threadroot://task/latest for lazy expansion.`);
  compacted = withEstimate(compacted);

  if (compacted.tokenEstimate > target && compacted.debugRanking) {
    compacted = withEstimate(withoutDebug(compacted));
    addOmitted("Removed debugRanking from the first-hop packet because it exceeded the token budget; rerun trace_context for ranking diagnostics.");
    compacted.omitted = omitted;
  }

  if (compacted.tokenEstimate > target) {
    compacted = withEstimate({
      ...compacted,
      repoMap: compactRepoMap(compacted.repoMap, 120),
      memory: [],
      files: compacted.files.map((file) => ({ ...file, snippets: [], symbols: file.symbols.slice(0, 1) })),
      tests: compacted.tests.map((file) => ({ ...file, snippets: [], symbols: [] })),
    });
    addOmitted("Removed memory, snippets, and extra symbols because the ranked route itself exceeded budget.");
    compacted.omitted = omitted;
  }

  if (compacted.tokenEstimate > target) {
    compacted = withEstimate({
      ...compacted,
      files: compacted.files.slice(0, target <= 2_500 ? 6 : 8),
      tests: compacted.tests.slice(0, target <= 2_500 ? 4 : 6),
      nextReads: compacted.nextReads.slice(0, target <= 2_500 ? 4 : 5),
    });
    addOmitted("Shortened lower-ranked files/tests because the route still exceeded budget.");
    compacted.omitted = omitted;
  }

  compacted.tokenEstimate = packetEstimate(compacted);
  return compacted;
}

export async function assembleTaskPacket(
  repoRoot: string,
  task: string,
  options: TaskPacketOptions = {},
): Promise<TaskPacket> {
  const budgetTokens = options.budgetTokens ?? DEFAULT_PACKET_BUDGET;
  const freshness = await refreshContext(repoRoot, { force: options.forceIndex });

  const index = await readRepoIndex(repoRoot);
  const workingSet = await assembleWorkingSet(repoRoot, task, {
    budgetTokens,
    maxFiles: options.maxFiles,
  });
  const currentIndexStatus = freshness.index ?? (await indexStatus(repoRoot));
  const omitted = [...workingSet.omitted];
  if (workingSet.files.length > 6 || workingSet.tests.length > 4) {
    omitted.push({
      section: "snippets",
      reason: "Snippets are compact previews for top-ranked files/tests only; use repo_read or normal file reads for full bodies.",
    });
  }
  if (workingSet.memory.some((entry) => entry.body.length > (entry.type === "repo-map" ? MAX_REPO_MAP_MEMORY_CHARS : MAX_MEMORY_CHARS))) {
    omitted.push({
      section: "memory",
      reason: "Memory is projected into short task-packet excerpts; inspect threadroot://memory for full local memory.",
    });
  }
  const packet: TaskPacket = {
    ...workingSet,
    memory: compactMemory(workingSet.memory),
    repoMap: compactRepoMap(workingSet.repoMap, budgetTokens <= 2_500 ? 360 : 720),
    files: workingSet.files.map((file, rank) => hydrateFile(file, task, index, rank, "file", budgetTokens)),
    tests: workingSet.tests.map((file, rank) => hydrateFile(file, task, index, rank, "test", budgetTokens)),
    omitted,
    index: currentIndexStatus,
    indexBuild: freshness.indexBuild,
    freshness: {
      mapStatus: freshness.mapStatus,
      indexStatus: freshness.indexStatus,
      refreshed: freshness.refreshed,
      durationMs: freshness.durationMs,
      warnings: freshness.warnings,
    },
  };
  if (options.debugRanking && index) {
    packet.debugRanking = { candidates: compactDebugCandidates(scoreIndexCandidates(index, task), budgetTokens) };
  }
  return enforceBudget(packet, budgetTokens);
}

function latestTaskPath(repoRoot: string): string {
  return path.join(projectHarnessDir(repoRoot), "cache", "task", "latest.json");
}

export async function writeLatestTaskPacket(repoRoot: string, packet: TaskPacket): Promise<void> {
  const file = latestTaskPath(repoRoot);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(packet, null, 2), "utf8");
}

export async function readLatestTaskPacket(repoRoot: string): Promise<TaskPacket | undefined> {
  try {
    return JSON.parse(await readFile(latestTaskPath(repoRoot), "utf8")) as TaskPacket;
  } catch {
    return undefined;
  }
}
