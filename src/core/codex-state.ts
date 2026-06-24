import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { toRepoPath } from "./paths.js";

export const CODEX_THREADROOT_DIR = ".codex/threadroot";

export function codexThreadrootDir(repoRoot: string): string {
  return toRepoPath(repoRoot, CODEX_THREADROOT_DIR);
}

export function codexThreadrootPath(repoRoot: string, ...parts: string[]): string {
  return path.join(codexThreadrootDir(repoRoot), ...parts);
}

export function codexThreadrootRelativePath(...parts: string[]): string {
  return path.posix.join(CODEX_THREADROOT_DIR, ...parts.map((part) => part.replace(/\\/g, "/")));
}

export async function writeCodexStateJson(repoRoot: string, parts: string[], value: unknown): Promise<string> {
  const filePath = codexThreadrootPath(repoRoot, ...parts);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

export async function readCodexStateJson<T>(repoRoot: string, parts: string[]): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(codexThreadrootPath(repoRoot, ...parts), "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}
