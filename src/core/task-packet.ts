import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { projectHarnessDir } from "./harness/paths.js";
import { assembleWorkingSet, type WorkingSet, type WorkingSetFile } from "./working-set.js";
import {
  buildRepoIndex,
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

function clipText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: `${text.slice(0, maxChars).trimEnd()}\n[truncated]`, truncated: true };
}

function compactMemory(memory: WorkingSet["memory"]): WorkingSet["memory"] {
  return memory.slice(0, 2).map((entry) => {
    const maxChars = entry.type === "repo-map" ? MAX_REPO_MAP_MEMORY_CHARS : MAX_MEMORY_CHARS;
    const clipped = clipText(entry.body, maxChars);
    return { ...entry, body: clipped.text, truncated: entry.truncated || clipped.truncated };
  });
}

function hydrateFile(
  file: WorkingSetFile,
  task: string,
  index: Awaited<ReturnType<typeof readRepoIndex>>,
  rank: number,
  section: "file" | "test",
): TaskPacketFile {
  const snippetLimit = section === "file" ? (rank < 3 ? 1 : 0) : rank < 2 ? 1 : 0;
  const symbolLimit = rank < 4 ? 5 : 2;
  return {
    ...file,
    symbols: symbolsForFile(index, file.path, symbolLimit).map((symbol) => ({
      name: symbol.name,
      kind: symbol.kind,
      signature: symbol.signature,
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

export async function assembleTaskPacket(
  repoRoot: string,
  task: string,
  options: TaskPacketOptions = {},
): Promise<TaskPacket> {
  const before = await indexStatus(repoRoot);
  let indexBuild: RepoIndexBuildResult | undefined;
  const canUpgradeDegradedIndex = before.status === "degraded" && before.adapters.sqlite !== "unavailable";
  if (options.forceIndex || before.status === "missing" || before.status === "stale" || canUpgradeDegradedIndex) {
    indexBuild = await buildRepoIndex(repoRoot, { force: options.forceIndex });
  }

  const index = await readRepoIndex(repoRoot);
  const workingSet = await assembleWorkingSet(repoRoot, task, {
    budgetTokens: options.budgetTokens,
    maxFiles: options.maxFiles,
  });
  const currentIndexStatus = await indexStatus(repoRoot);
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
    files: workingSet.files.map((file, rank) => hydrateFile(file, task, index, rank, "file")),
    tests: workingSet.tests.map((file, rank) => hydrateFile(file, task, index, rank, "test")),
    omitted,
    index: currentIndexStatus,
    indexBuild,
  };
  if (options.debugRanking && index) {
    packet.debugRanking = { candidates: scoreIndexCandidates(index, task).slice(0, 50) };
  }
  packet.tokenEstimate = Math.ceil(JSON.stringify(packet).length / 4);
  return packet;
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
