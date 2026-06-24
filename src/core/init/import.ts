import { readFile } from "node:fs/promises";
import path from "node:path";

import { extractHandAuthored } from "../compile/managed.js";

const CODEX_AGENTS_FILE = "AGENTS.md";

export type ImportedRule = {
  name: string;
  applyTo?: string;
  body: string;
};

export type ImportReport = {
  /** Codex AGENTS.md source, if any. */
  canonicalSource?: string;
  /** Resulting hand-authored AGENTS.md body. */
  canonicalBody: string;
  /** Compatibility field. Codex-only import does not fold other agent files. */
  foldedFrom: string[];
  /** Compatibility field. Codex-only import does not import non-Codex rules. */
  importedRules: ImportedRule[];
  /** Compatibility field. Codex-only import does not classify duplicate non-Codex files. */
  skippedDuplicates: string[];
};

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

/**
 * Import existing Codex AGENTS.md prose into canonical Threadroot prose once.
 * Non-Codex instruction files are intentionally ignored in the Codex/OpenAI-only
 * product line.
 */
export async function importVendorFiles(
  repoRoot: string,
  options: { include?: string[] } = {},
): Promise<ImportReport> {
  const include = options.include ? new Set(options.include) : undefined;
  const wanted = (file: string) => !include || include.has(file);
  const content = wanted(CODEX_AGENTS_FILE) ? await readIfExists(path.join(repoRoot, CODEX_AGENTS_FILE)) : undefined;
  const canonicalBody = content && content.trim() ? extractHandAuthored(content) : "";
  return {
    canonicalSource: canonicalBody ? CODEX_AGENTS_FILE : undefined,
    canonicalBody,
    foldedFrom: [],
    importedRules: [],
    skippedDuplicates: [],
  };
}
