import os from "node:os";
import path from "node:path";

import { toRepoPath } from "../paths.js";

/** Project-scope harness root: `<repo>/.threadroot`. */
export const HARNESS_DIR = ".threadroot";
export const HARNESS_MANIFEST = "harness.yaml";
export const LOCK_FILE = "lock.json";

export const HARNESS_SUBDIRS = {
  skills: "skills",
  tools: "tools",
  rules: "rules",
  memory: "memory",
} as const;

export type HarnessObjectDir = keyof typeof HARNESS_SUBDIRS;

/** File extensions per object family. */
export const HARNESS_OBJECT_EXT = {
  prose: ".md",
  tool: ".yaml",
} as const;

/** Absolute path to the project harness directory. */
export function projectHarnessDir(repoRoot: string): string {
  return toRepoPath(repoRoot, HARNESS_DIR);
}

export function projectManifestPath(repoRoot: string): string {
  return toRepoPath(repoRoot, path.join(HARNESS_DIR, HARNESS_MANIFEST));
}

export function projectLockPath(repoRoot: string): string {
  return toRepoPath(repoRoot, path.join(HARNESS_DIR, LOCK_FILE));
}

export function projectObjectDir(repoRoot: string, dir: HarnessObjectDir): string {
  return toRepoPath(repoRoot, path.join(HARNESS_DIR, HARNESS_SUBDIRS[dir]));
}

/** User-scope harness root: `~/.threadroot` (override `home` in tests). */
export function userHarnessDir(home = os.homedir()): string {
  return path.join(home, HARNESS_DIR);
}

export function userObjectDir(dir: HarnessObjectDir, home = os.homedir()): string {
  return path.join(userHarnessDir(home), HARNESS_SUBDIRS[dir]);
}

/** User-scope lock file: `~/.threadroot/lock.json`. */
export function userLockPath(home = os.homedir()): string {
  return path.join(userHarnessDir(home), LOCK_FILE);
}
