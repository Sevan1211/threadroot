import { readFile } from "node:fs/promises";
import path from "node:path";

const CODEX_AGENTS_FILE = "AGENTS.md";
const MANAGED_BLOCK_PATTERNS = [
  /<!-- threadroot:begin codex-context-optimizer -->[\s\S]*?<!-- threadroot:end codex-context-optimizer -->/gu,
  /<!-- threadroot:begin \(generated[\s\S]*?<!-- threadroot:end -->/gu,
];

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

function extractHandAuthored(content: string): string {
  let next = content;
  for (const pattern of MANAGED_BLOCK_PATTERNS) {
    next = next.replace(pattern, "\n");
  }
  return next.trim();
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
