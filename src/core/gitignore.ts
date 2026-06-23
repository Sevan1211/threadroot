import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const BEGIN = "# threadroot:begin local-state";
const END = "# threadroot:end local-state";
const THREADROOT_DIR_PATTERN = ".threadroot/";
const execFileAsync = promisify(execFile);

const THREADROOT_IGNORE_BLOCK = [
  BEGIN,
  THREADROOT_DIR_PATTERN,
  END,
].join("\n");

export type GitignorePolicyResult = {
  path: string;
  status: "create" | "update" | "unchanged" | "skipped";
  scope: "git-info-exclude" | "gitignore" | "none";
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
  const gitExclude = path.join(repoRoot, ".git", "info", "exclude");
  if (await isWritableGitExclude(gitExclude)) {
    const existing = await readMaybe(gitExclude);
    const desired = withManagedBlock(existing ?? "");
    if (existing === desired) {
      return { path: ".git/info/exclude", status: "unchanged", scope: "git-info-exclude" };
    }
    await mkdir(path.dirname(gitExclude), { recursive: true });
    await writeFile(gitExclude, desired, "utf8");
    return {
      path: ".git/info/exclude",
      status: existing === undefined ? "create" : "update",
      scope: "git-info-exclude",
    };
  }

  return { path: ".threadroot/", status: "skipped", scope: "none" };
}

export async function ensureThreadrootGitignoreFile(repoRoot: string): Promise<GitignorePolicyResult> {
  const filePath = path.join(repoRoot, ".gitignore");
  const existing = await readMaybe(filePath);
  const desired = withManagedBlock(existing ?? "");
  if (existing === desired) {
    return { path: ".gitignore", status: "unchanged", scope: "gitignore" };
  }
  await writeFile(filePath, desired, "utf8");
  return { path: ".gitignore", status: existing === undefined ? "create" : "update", scope: "gitignore" };
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

async function isWritableGitExclude(filePath: string): Promise<boolean> {
  try {
    const gitDir = path.dirname(filePath);
    await stat(path.dirname(gitDir));
    await mkdir(gitDir, { recursive: true });
    try {
      await access(filePath, constants.W_OK);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT";
    }
  } catch {
    return false;
  }
}

export async function threadrootTrackedFiles(repoRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", ".threadroot"], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024,
    });
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function threadrootIgnoredByGit(repoRoot: string): Promise<boolean | undefined> {
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repoRoot });
  } catch {
    return undefined;
  }

  try {
    await execFileAsync("git", ["check-ignore", "-q", "--", THREADROOT_DIR_PATTERN], { cwd: repoRoot });
    return true;
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 1) {
      return false;
    }
    return undefined;
  }
}
