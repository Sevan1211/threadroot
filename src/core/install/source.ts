import { z } from "zod";

/**
 * Object distribution — the source interface (spec §11, §13 seam #1).
 *
 * v1 resolves objects from `local` paths and `git` URLs; `registry` is reserved
 * for the future hosted index. Parsing is deterministic and never touches the
 * network — fetching is layered on top by the installer (milestone 6).
 */

/** Installable object kinds (prose/tools that can be shared). */
export const objectKindSchema = z.enum(["skill", "tool", "rule"]);
export type ObjectKind = z.infer<typeof objectKindSchema>;

export const objectSourceKindSchema = z.enum(["local", "git", "registry"]);
export type ObjectSourceKind = z.infer<typeof objectSourceKindSchema>;

export type ObjectSourceRef =
  | { kind: "local"; raw: string; path: string }
  | {
      kind: "git";
      raw: string;
      provider: "github" | "url";
      owner?: string;
      repo?: string;
      url?: string;
      objectPath?: string;
      ref?: string;
    }
  | { kind: "registry"; raw: string; name: string; version?: string };

function splitRef(body: string): { body: string; ref?: string } {
  const at = body.lastIndexOf("@");
  // Ignore a leading scope-style `@` (none expected here) and scheme colons.
  if (at > 0) {
    return { body: body.slice(0, at), ref: body.slice(at + 1) || undefined };
  }
  return { body };
}

function parseGithub(raw: string): ObjectSourceRef {
  const { body, ref } = splitRef(raw.slice("github:".length));
  const parts = body.split("/").filter(Boolean);
  const [owner, repo, ...rest] = parts;
  if (!owner || !repo) {
    throw new Error(`Invalid github source: ${raw} (expected github:owner/repo[/path][@ref]).`);
  }
  return {
    kind: "git",
    raw,
    provider: "github",
    owner,
    repo,
    objectPath: rest.length > 0 ? rest.join("/") : undefined,
    ref,
  };
}

function isLocalPath(raw: string): boolean {
  return raw.startsWith("./") || raw.startsWith("../") || raw.startsWith("/") || raw === "." || raw === "..";
}

/**
 * Parse a source specifier into a structured ref. Supported forms:
 * - `github:owner/repo[/path][@ref]`
 * - `git+https://host/repo.git[@ref]` or any `https://...git`
 * - `registry:name[@version]`
 * - local paths: `./x`, `../x`, `/abs`, `.`
 * - bare token → registry name (reserved)
 */
export function parseSourceRef(raw: string): ObjectSourceRef {
  const value = raw.trim();
  if (!value) {
    throw new Error("Empty source reference.");
  }

  if (value.startsWith("github:")) {
    return parseGithub(value);
  }

  if (value.startsWith("registry:")) {
    const { body, ref } = splitRef(value.slice("registry:".length));
    if (!body) {
      throw new Error(`Invalid registry source: ${raw} (expected registry:name[@version]).`);
    }
    return { kind: "registry", raw: value, name: body, version: ref };
  }

  if (value.startsWith("git+") || /^https?:\/\/.+\.git(@.+)?$/.test(value) || value.startsWith("git@")) {
    const stripped = value.startsWith("git+") ? value.slice("git+".length) : value;
    const { body, ref } = splitRef(stripped);
    return { kind: "git", raw: value, provider: "url", url: body, ref };
  }

  if (isLocalPath(value)) {
    return { kind: "local", raw: value, path: value };
  }

  // Bare token: reserved for the future hosted registry.
  const { body, ref } = splitRef(value);
  return { kind: "registry", raw: value, name: body, version: ref };
}

/** A single installed object recorded in lock.json (spec §4, §13 seam #3). */
export const lockEntrySchema = z.object({
  name: z.string().min(1),
  kind: objectKindSchema,
  sourceKind: objectSourceKindSchema,
  source: z.string().min(1),
  /** Path of the object within the source repository, when applicable. */
  objectPath: z.string().optional(),
  /** Human-supplied ref (tag/branch/commit) before resolution. */
  ref: z.string().optional(),
  /** Immutable resolved identifier — the commit SHA for git sources. */
  resolved: z.string().optional(),
  /** `sha256:<hex>` content digest for tamper detection + reproducibility. */
  integrity: z.string().optional(),
  installedAt: z.string(),
});
export type LockEntry = z.infer<typeof lockEntrySchema>;

export const lockFileSchema = z.object({
  version: z.literal(1),
  objects: z.array(lockEntrySchema).default([]),
});
export type LockFile = z.infer<typeof lockFileSchema>;

export function emptyLockFile(): LockFile {
  return { version: 1, objects: [] };
}
