import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BEGIN = "# threadroot:begin local-state";
const END = "# threadroot:end local-state";

const THREADROOT_IGNORE_BLOCK = [
  BEGIN,
  ".threadroot/cache/",
  ".threadroot/tmp/",
  ".threadroot/logs/",
  ".threadroot/state/",
  ".threadroot/local.*",
  ".threadroot/*.local.*",
  ".threadroot/*.secret.*",
  END,
].join("\n");

export type GitignorePolicyResult = {
  path: string;
  status: "create" | "update" | "unchanged";
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

function withManagedBlock(existing: string): string {
  const trimmedBlock = THREADROOT_IGNORE_BLOCK.trim();
  if (existing.includes(BEGIN) && existing.includes(END)) {
    const pattern = new RegExp(`${escapeRegExp(BEGIN)}[\\s\\S]*?${escapeRegExp(END)}`);
    return ensureTrailingNewline(existing.replace(pattern, trimmedBlock));
  }

  const prefix = existing.trimEnd();
  return ensureTrailingNewline(prefix ? `${prefix}\n\n${trimmedBlock}` : trimmedBlock);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

export async function ensureThreadrootGitignore(repoRoot: string): Promise<GitignorePolicyResult> {
  const filePath = path.join(repoRoot, ".gitignore");
  const existing = await readMaybe(filePath);
  const desired = withManagedBlock(existing ?? "");
  if (existing === desired) {
    return { path: ".gitignore", status: "unchanged" };
  }
  await writeFile(filePath, desired, "utf8");
  return { path: ".gitignore", status: existing === undefined ? "create" : "update" };
}

export async function threadrootWholeDirectoryIgnored(repoRoot: string): Promise<boolean> {
  const raw = await readMaybe(path.join(repoRoot, ".gitignore"));
  if (!raw) {
    return false;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
      continue;
    }
    if (trimmed === ".threadroot" || trimmed === ".threadroot/" || trimmed === "/.threadroot" || trimmed === "/.threadroot/") {
      return true;
    }
    if (trimmed === ".threadroot/**" || trimmed === "/.threadroot/**") {
      return true;
    }
  }
  return false;
}
