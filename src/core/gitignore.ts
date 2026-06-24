import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BEGIN = "# threadroot:begin local-state";
const END = "# threadroot:end local-state";
const CODEX_THREADROOT_DIR_PATTERN = ".codex/threadroot/";

const THREADROOT_IGNORE_BLOCK = [
  BEGIN,
  CODEX_THREADROOT_DIR_PATTERN,
  END,
].join("\n");

export type GitignorePolicyResult = {
  path: string;
  status: "create" | "update" | "unchanged";
  scope: "gitignore";
};

async function readMaybe(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function withManagedBlock(existing: string): string {
  const trimmedBlock = THREADROOT_IGNORE_BLOCK.trim();
  if (existing.includes(BEGIN) && existing.includes(END)) {
    const pattern = new RegExp(`${escapeRegExp(BEGIN)}[\\s\\S]*?${escapeRegExp(END)}`);
    return ensureTrailingNewline(existing.replace(pattern, trimmedBlock));
  }

  const prefix = existing.trimEnd();
  return ensureTrailingNewline(prefix ? `${prefix}\n\n${trimmedBlock}` : trimmedBlock);
}

export async function ensureCodexThreadrootGitignore(repoRoot: string): Promise<GitignorePolicyResult> {
  const filePath = path.join(repoRoot, ".gitignore");
  const existing = await readMaybe(filePath);
  const desired = withManagedBlock(existing ?? "");
  if (existing === desired) {
    return { path: ".gitignore", status: "unchanged", scope: "gitignore" };
  }
  await writeFile(filePath, desired, "utf8");
  return { path: ".gitignore", status: existing === undefined ? "create" : "update", scope: "gitignore" };
}
