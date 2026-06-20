import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { type EffectiveHarness, type AdapterId, resolveHarness } from "../harness/index.js";
import { type DriftEntry, compile, detectDrift } from "./index.js";
import type { CompiledFile } from "./types.js";

/** Write compiled vendor files to disk, returning their repo-relative paths. */
export async function writeCompiled(repoRoot: string, files: CompiledFile[]): Promise<string[]> {
  await Promise.all(
    files.map(async (file) => {
      const absolute = path.join(repoRoot, file.path);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, file.content, "utf8");
    }),
  );
  return files.map((file) => file.path);
}

export type CompileRunOptions = {
  /** Pre-resolved harness; loaded from disk when omitted. */
  harness?: EffectiveHarness;
  /** Restrict output to a single adapter. */
  adapter?: AdapterId;
  home?: string;
};

export type CompileRunResult = {
  written: string[];
  drift: DriftEntry[];
};

/**
 * Resolve the harness, compile it to vendor files, and write them to disk.
 * The one-way canonical -> vendor step shared by `tr init` and `tr compile`.
 */
export async function runCompile(repoRoot: string, options: CompileRunOptions = {}): Promise<CompileRunResult> {
  const resolved = options.harness ?? (await resolveHarness(repoRoot, { home: options.home }));
  const harness: EffectiveHarness = options.adapter
    ? { ...resolved, manifest: { ...resolved.manifest, adapters: [options.adapter] } }
    : resolved;

  const files = await compile(repoRoot, harness);
  const drift = await detectDrift(repoRoot, files);
  const written = await writeCompiled(repoRoot, files);
  return { written, drift };
}
