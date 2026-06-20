import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { hashContent } from "../hash.js";
import type { EffectiveHarness, LoadedRule, Reference } from "../harness/index.js";
import { toRepoPath } from "../paths.js";
import { agentsAdapter } from "./adapters/agents.js";
import { claudeAdapter } from "./adapters/claude.js";
import { copilotAdapter } from "./adapters/copilot.js";
import { cursorAdapter } from "./adapters/cursor.js";
import { composeWithManaged, extractHandAuthored } from "./managed.js";
import { buildManagedBlock } from "./sections.js";
import type { Adapter, CompiledFile, CompileContext, ResolvedReference } from "./types.js";

export const ADAPTERS: Record<string, Adapter> = {
  agents: agentsAdapter,
  claude: claudeAdapter,
  copilot: copilotAdapter,
  cursor: cursorAdapter,
};

/** Largest file we will inline for an eager reference (anti context-rot). */
const EAGER_INLINE_LIMIT = 8000;

const AGENTS_FILE = "AGENTS.md";

function splitRules(rules: LoadedRule[]): { global: LoadedRule[]; scoped: LoadedRule[] } {
  const global: LoadedRule[] = [];
  const scoped: LoadedRule[] = [];
  for (const rule of rules) {
    if (rule.frontmatter.applyTo) {
      scoped.push(rule);
    } else {
      global.push(rule);
    }
  }
  return { global, scoped };
}

function isGlob(value: string): boolean {
  return /[*?[\]{}]/.test(value);
}

async function readIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function resolveReference(repoRoot: string, reference: Reference): Promise<ResolvedReference> {
  if (isGlob(reference.path)) {
    return { reference, exists: true };
  }
  const absolute = toRepoPath(repoRoot, reference.path);
  try {
    const info = await stat(absolute);
    if (!info.isFile()) {
      return { reference, exists: true };
    }
    if (reference.load === "eager" && info.size <= EAGER_INLINE_LIMIT) {
      const inlined = await readFile(absolute, "utf8");
      return { reference, exists: true, inlined };
    }
    return { reference, exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { reference, exists: false };
    }
    throw error;
  }
}

/** Build the compile context: read AGENTS.md, resolve refs, compose canonical. */
export async function buildContext(repoRoot: string, harness: EffectiveHarness): Promise<CompileContext> {
  const existingAgents = (await readIfExists(path.join(repoRoot, AGENTS_FILE))) ?? "";
  const handAuthored = extractHandAuthored(existingAgents);
  const { global, scoped } = splitRules(harness.rules);
  const references = await Promise.all(
    harness.manifest.references.map((reference) => resolveReference(repoRoot, reference)),
  );

  const partial: CompileContext = {
    repoRoot,
    manifest: harness.manifest,
    handAuthored,
    canonicalAgents: "",
    skills: harness.skills,
    globalRules: global,
    scopedRules: scoped,
    tools: harness.tools,
    memory: harness.memory,
    references,
  };

  const managed = buildManagedBlock(partial);
  partial.canonicalAgents = composeWithManaged(handAuthored, managed);
  return partial;
}

/** Compile the effective harness into vendor files for every enabled adapter. */
export async function compile(repoRoot: string, harness: EffectiveHarness): Promise<CompiledFile[]> {
  const ctx = await buildContext(repoRoot, harness);
  const files: CompiledFile[] = [];
  const seen = new Set<string>();

  for (const adapterId of harness.manifest.adapters) {
    const adapter = ADAPTERS[adapterId];
    if (!adapter) {
      continue;
    }
    for (const file of adapter.compile(ctx)) {
      if (seen.has(file.path)) {
        continue;
      }
      seen.add(file.path);
      files.push(file);
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

export type DriftStatus = "create" | "unchanged" | "drift";

export type DriftEntry = {
  path: string;
  status: DriftStatus;
};

/** Compare freshly compiled files against what is on disk. */
export async function detectDrift(repoRoot: string, files: CompiledFile[]): Promise<DriftEntry[]> {
  const entries = await Promise.all(
    files.map(async (file): Promise<DriftEntry> => {
      const existing = await readIfExists(path.join(repoRoot, file.path));
      if (existing === undefined) {
        return { path: file.path, status: "create" };
      }
      const status = hashContent(existing) === hashContent(file.content) ? "unchanged" : "drift";
      return { path: file.path, status };
    }),
  );
  return entries;
}
