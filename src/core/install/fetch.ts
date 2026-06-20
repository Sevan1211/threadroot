import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { ObjectSourceRef } from "./source.js";

const run = promisify(execFile);

/** A git source narrowed to the git variant of {@link ObjectSourceRef}. */
export type GitSourceRef = Extract<ObjectSourceRef, { kind: "git" }>;

export type FetchedSource = {
  /** Absolute path to the checked-out working tree (no `.git` is preserved). */
  dir: string;
  /** Resolved commit SHA the working tree points at. */
  sha: string;
  /** Remove the temporary checkout. Always call when done. */
  cleanup: () => Promise<void>;
};

/** Build the clone URL for a git source ref. */
export function cloneUrl(ref: GitSourceRef): string {
  if (ref.provider === "github") {
    return `https://github.com/${ref.owner}/${ref.repo}.git`;
  }
  if (!ref.url) {
    throw new Error(`Git source ${ref.raw} has no URL.`);
  }
  return ref.url;
}

async function git(cwd: string | undefined, args: string[]): Promise<string> {
  // `execFile` (not `exec`) — args are passed without a shell, so no injection.
  const { stdout } = await run("git", args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

/**
 * Clone a git source into a throwaway temp directory and resolve its commit
 * SHA. Shells out to the system `git` (zero extra dependencies); the caller
 * copies the objects it needs, then invokes {@link FetchedSource.cleanup}.
 *
 * Security: never runs repository scripts — this is a plain checkout, unlike
 * npm git dependencies which execute `prepare`/`postinstall` hooks.
 */
export async function fetchGitSource(ref: GitSourceRef): Promise<FetchedSource> {
  const url = cloneUrl(ref);
  const dir = await mkdtemp(path.join(os.tmpdir(), "threadroot-fetch-"));
  const cleanup = () => rm(dir, { recursive: true, force: true });

  try {
    if (ref.ref) {
      try {
        // Fast path: shallow clone of a branch or tag.
        await git(undefined, ["clone", "--depth", "1", "--branch", ref.ref, url, dir]);
      } catch {
        // Fallback for raw commit SHAs (not valid `--branch` targets).
        await git(undefined, ["clone", url, dir]);
        await git(dir, ["checkout", ref.ref]);
      }
    } else {
      await git(undefined, ["clone", "--depth", "1", url, dir]);
    }

    const sha = await git(dir, ["rev-parse", "HEAD"]);
    return { dir, sha, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
