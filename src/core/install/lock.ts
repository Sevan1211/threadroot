import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { type LockEntry, type LockFile, emptyLockFile, lockFileSchema } from "./source.js";

/** Read a lock file, returning an empty lock when absent. */
export async function readLockFile(lockPath: string): Promise<LockFile> {
  let raw: string;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyLockFile();
    }
    throw error;
  }
  return lockFileSchema.parse(JSON.parse(raw));
}

/** Write a lock file, sorting entries by name for stable diffs. */
export async function writeLockFile(lockPath: string, lock: LockFile): Promise<void> {
  const sorted: LockFile = {
    version: lock.version,
    objects: [...lock.objects].sort((a, b) => a.name.localeCompare(b.name)),
  };
  await mkdir(path.dirname(lockPath), { recursive: true });
  await writeFile(lockPath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

/** Insert or replace an entry, keyed by object name + kind. */
export function upsertLockEntry(lock: LockFile, entry: LockEntry): LockFile {
  const objects = lock.objects.filter((existing) => !(existing.name === entry.name && existing.kind === entry.kind));
  objects.push(entry);
  return { version: lock.version, objects };
}

/** Names of tools whose provenance is an external source (git/registry). */
export function externalToolNames(lock: LockFile): Set<string> {
  const names = new Set<string>();
  for (const entry of lock.objects) {
    if (entry.kind === "tool" && entry.sourceKind !== "local") {
      names.add(entry.name);
    }
  }
  return names;
}
