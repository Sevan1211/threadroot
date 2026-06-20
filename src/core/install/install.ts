import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import {
  type HarnessObjectDir,
  projectLockPath,
  projectObjectDir,
  userLockPath,
  userObjectDir,
} from "../harness/paths.js";
import { parseFrontmatter } from "../harness/frontmatter.js";
import { skillFrontmatterSchema } from "../harness/schema.js";
import { hashContent } from "../hash.js";
import { toRepoPath } from "../paths.js";
import { fetchGitSource } from "./fetch.js";
import { readLockFile, upsertLockEntry, writeLockFile } from "./lock.js";
import { type LockEntry, type ObjectKind, parseSourceRef } from "./source.js";

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export type InstallScope = "project" | "user";

export type InstallOptions = {
  /** Object family; inferred from the source path when omitted. */
  kind?: ObjectKind;
  /** Install target — project `.threadroot/` (default) or user `~/.threadroot/`. */
  scope?: InstallScope;
  /** Path within the source repo (overrides any path in the source ref). */
  objectPath?: string;
  /** Override `~` for tests. */
  home?: string;
};

export type InstalledObject = {
  name: string;
  kind: ObjectKind;
  scope: InstallScope;
  /** Absolute path the object was written to. */
  path: string;
  entry: LockEntry;
};

const KIND_DIR: Record<ObjectKind, HarnessObjectDir> = {
  skill: "skills",
  tool: "tools",
  connection: "connections",
  rule: "rules",
};

function objectExt(kind: ObjectKind): string {
  return kind === "tool" || kind === "connection" ? ".yaml" : ".md";
}

/** Reject paths that escape the source repository root. */
function safeRepoPath(objectPath: string): string {
  const normalized = path.normalize(objectPath);
  if (path.isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`Unsafe object path: ${objectPath}`);
  }
  return normalized;
}

/** Infer the object kind from a path's directory or extension. */
function inferKind(objectPath: string, override?: ObjectKind): ObjectKind {
  if (override) {
    return override;
  }
  const segments = objectPath.split(/[\\/]/);
  if (segments.includes("skills")) return "skill";
  if (segments.includes("tools")) return "tool";
  if (segments.includes("connections")) return "connection";
  if (segments.includes("rules")) return "rule";
  const ext = path.extname(objectPath).toLowerCase();
  if (ext === ".yaml" || ext === ".yml") return "tool";
  if (ext === ".md") return "skill";
  throw new Error(
    `Cannot infer object kind from ${objectPath}; pass an explicit kind (skill, tool, rule, or connection).`,
  );
}

function deriveName(objectPath: string): string {
  const base = path.basename(objectPath, path.extname(objectPath));
  if (!NAME_RE.test(base)) {
    throw new Error(`Invalid object name \`${base}\` (use lowercase letters, digits, and dashes).`);
  }
  return base;
}

async function hashDirectory(root: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update("threadroot-directory-v1\n");

  async function walk(dir: string): Promise<void> {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (entry.isSymbolicLink()) {
        throw new Error(`Refusing to install skill directory with symlink: ${rel}`);
      }
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.isFile()) {
        hash.update(`file:${rel}\n`);
        hash.update(await readFile(full));
        hash.update("\n");
      }
    }
  }

  await walk(root);
  return hash.digest("hex");
}

async function validateSkillDirectory(sourcePath: string, expectedName: string): Promise<string> {
  const skillPath = path.join(sourcePath, "SKILL.md");
  const parsed = parseFrontmatter(await readFile(skillPath, "utf8"));
  const result = skillFrontmatterSchema.safeParse(parsed.data);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid skill directory ${sourcePath}: ${detail}`);
  }
  if (result.data.name !== expectedName) {
    throw new Error(`Skill directory name \`${expectedName}\` must match SKILL.md name \`${result.data.name}\`.`);
  }
  return await hashDirectory(sourcePath);
}

/**
 * Install a single harness object from a local path or git source into the
 * project (default) or user harness, recording it in lock.json with a resolved
 * commit SHA and a sha256 integrity digest.
 *
 * Security: only copies files — never runs repository scripts; validates object
 * names and blocks path traversal out of the source repo or harness dir.
 */
export async function installObject(
  repoRoot: string,
  rawSource: string,
  options: InstallOptions = {},
): Promise<InstalledObject> {
  const ref = parseSourceRef(rawSource);
  if (ref.kind === "registry") {
    throw new Error(`Registry sources are not available yet: ${rawSource}`);
  }

  let objectPath: string;
  let resolved: string | undefined;
  let refLabel: string | undefined;
  let sourcePath: string;
  let cleanup: (() => Promise<void>) | undefined;

  if (ref.kind === "git") {
    const within = options.objectPath ?? ref.objectPath;
    if (!within) {
      throw new Error(`Git source ${rawSource} needs an object path (e.g. github:owner/repo/skills/x.md).`);
    }
    objectPath = safeRepoPath(within);
    refLabel = ref.ref;
    const fetched = await fetchGitSource(ref);
    sourcePath = path.join(fetched.dir, objectPath);
    resolved = fetched.sha;
    cleanup = fetched.cleanup;
  } else {
    objectPath = options.objectPath ?? ref.path;
    sourcePath = toRepoPath(repoRoot, objectPath);
  }

  try {
    const kind = inferKind(objectPath, options.kind);
    const name = deriveName(objectPath);
    const scope: InstallScope = options.scope ?? "project";
    const dirKey = KIND_DIR[kind];
    const destDir = scope === "user" ? userObjectDir(dirKey, options.home) : projectObjectDir(repoRoot, dirKey);

    let destPath: string;
    let integrity: string;
    const info = await stat(sourcePath);
    if (info.isDirectory()) {
      if (kind !== "skill") {
        throw new Error("Only skill objects may be installed from a directory.");
      }
      integrity = `sha256:${await validateSkillDirectory(sourcePath, name)}`;
      destPath = path.join(destDir, name);
      await mkdir(destDir, { recursive: true });
      await cp(sourcePath, destPath, { recursive: true, force: true });
    } else {
      const content = await readFile(sourcePath, "utf8");
      destPath = path.join(destDir, `${name}${objectExt(kind)}`);
      await mkdir(destDir, { recursive: true });
      await writeFile(destPath, content, "utf8");
      integrity = `sha256:${hashContent(content)}`;
    }

    const entry: LockEntry = {
      name,
      kind,
      sourceKind: ref.kind,
      source: ref.raw,
      objectPath,
      ref: refLabel,
      resolved,
      integrity,
      installedAt: new Date().toISOString(),
    };

    const lockPath = scope === "user" ? userLockPath(options.home) : projectLockPath(repoRoot);
    const lock = await readLockFile(lockPath);
    await writeLockFile(lockPath, upsertLockEntry(lock, entry));

    return { name, kind, scope, path: destPath, entry };
  } finally {
    await cleanup?.();
  }
}
