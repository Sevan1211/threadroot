import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import { HarnessError } from "./load.js";
import { HARNESS_OBJECT_EXT, projectHarnessDir, projectObjectDir, userObjectDir } from "./paths.js";
import { type MemoryType, memoryTypeSchema } from "./schema.js";

export type MemoryScope = "project" | "user";

export type MemoryWriteResult = {
  type: MemoryType;
  scope: MemoryScope;
  path: string;
};

export type MemoryGcOptions = MemoryAccessOptions & {
  type?: string;
  maxEntries?: number;
  maxChars?: number;
  dryRun?: boolean;
};

export type MemoryGcFileResult = {
  type: MemoryType;
  path: string;
  changed: boolean;
  entriesBefore: number;
  entriesAfter: number;
  charsBefore: number;
  charsAfter: number;
  removed: number;
  archivePath?: string;
};

export type MemoryGcResult = {
  scope: MemoryScope;
  files: MemoryGcFileResult[];
};

function assertMemoryType(type: string): MemoryType {
  const parsed = memoryTypeSchema.safeParse(type);
  if (!parsed.success) {
    throw new HarnessError(
      `Unknown memory type \`${type}\`. Expected one of: ${memoryTypeSchema.options.join(", ")}.`,
    );
  }
  return parsed.data;
}

function memoryDir(repoRoot: string, scope: MemoryScope, home?: string): string {
  return scope === "project" ? projectObjectDir(repoRoot, "memory") : userObjectDir("memory", home);
}

export function memoryFilePath(
  repoRoot: string,
  type: MemoryType,
  scope: MemoryScope = "project",
  home?: string,
): string {
  return path.join(memoryDir(repoRoot, scope, home), `${type}${HARNESS_OBJECT_EXT.prose}`);
}

export type MemoryAccessOptions = {
  scope?: MemoryScope;
  home?: string;
};

/** Read a memory file's body, or null when it does not exist. */
export async function readMemory(
  repoRoot: string,
  type: string,
  options: MemoryAccessOptions = {},
): Promise<string | null> {
  const memoryType = assertMemoryType(type);
  const file = memoryFilePath(repoRoot, memoryType, options.scope ?? "project", options.home);
  try {
    const raw = await readFile(file, "utf8");
    return parseFrontmatter(raw).body;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function headingFor(type: MemoryType): string {
  const title = type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `# ${title}`;
}

function normalizeMemoryBullet(value: string): string {
  return value
    .replace(/^[-*]\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function memoryArchivePath(repoRoot: string, type: MemoryType, _home?: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(projectHarnessDir(repoRoot), "cache", "memory", "archive", `${type}-${stamp}.md`);
}

/**
 * Append a durable note to a memory file as a bullet, creating the file (with a
 * heading) when missing. Powers MCP `memory.append` and `tr remember`.
 */
export async function appendMemory(
  repoRoot: string,
  type: string,
  note: string,
  options: MemoryAccessOptions = {},
): Promise<MemoryWriteResult> {
  const memoryType = assertMemoryType(type);
  const trimmed = note.trim();
  if (!trimmed) {
    throw new HarnessError("Cannot append an empty memory note.");
  }

  const scope = options.scope ?? "project";
  const dir = memoryDir(repoRoot, scope, options.home);
  const file = memoryFilePath(repoRoot, memoryType, scope, options.home);

  let existing = "";
  try {
    existing = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(dir, { recursive: true });
  const base = existing.trim() ? existing.replace(/\s*$/, "") : headingFor(memoryType);
  const normalized = normalizeMemoryBullet(trimmed);
  if (
    parseFrontmatter(base)
      .body.split(/\r?\n/)
      .some((line) => /^[-*]\s+/.test(line.trim()) && normalizeMemoryBullet(line.trim()) === normalized)
  ) {
    return { type: memoryType, scope, path: file };
  }
  await writeFile(file, `${base}\n- ${trimmed}\n`, "utf8");

  return { type: memoryType, scope, path: file };
}

function compactMemoryBody(
  type: MemoryType,
  body: string,
  options: Required<Pick<MemoryGcOptions, "maxEntries" | "maxChars">>,
): { body: string; entriesBefore: number; entriesAfter: number; removed: string[]; changed: boolean } {
  const lines = body.split(/\r?\n/);
  const heading = lines.find((line) => /^#\s+/.test(line.trim()))?.trim() ?? headingFor(type);
  const bullets = lines.map((line) => line.trim()).filter((line) => /^[-*]\s+/.test(line));
  const hasStructuredProse = lines.some((line) => {
    const trimmed = line.trim();
    return trimmed && !/^#\s+/.test(trimmed) && !/^[-*]\s+/.test(trimmed);
  });
  if (bullets.length === 0) {
    const clipped = body.length > options.maxChars ? `${body.slice(0, options.maxChars).trimEnd()}\n[trimmed by threadroot memory gc]` : body;
    return {
      body: clipped,
      entriesBefore: 0,
      entriesAfter: 0,
      removed: body.length > clipped.length ? [body.slice(options.maxChars)] : [],
      changed: clipped !== body,
    };
  }
  if (hasStructuredProse) {
    return {
      body,
      entriesBefore: bullets.length,
      entriesAfter: bullets.length,
      removed: [],
      changed: false,
    };
  }

  const seen = new Set<string>();
  const keptNewestFirst: string[] = [];
  const removed: string[] = [];
  for (const bullet of [...bullets].reverse()) {
    const normalized = normalizeMemoryBullet(bullet);
    if (!normalized || seen.has(normalized) || keptNewestFirst.length >= options.maxEntries) {
      removed.push(bullet);
      continue;
    }
    seen.add(normalized);
    keptNewestFirst.push(`- ${bullet.replace(/^[-*]\s+/, "").trim()}`);
  }

  const kept = keptNewestFirst.reverse();
  let nextBody = `${heading}\n${kept.join("\n")}`.trimEnd();
  while (nextBody.length > options.maxChars && kept.length > 1) {
    removed.push(kept.shift()!);
    nextBody = `${heading}\n${kept.join("\n")}`.trimEnd();
  }

  return {
    body: `${nextBody}\n`,
    entriesBefore: bullets.length,
    entriesAfter: kept.length,
    removed: removed.reverse(),
    changed: removed.length > 0 || nextBody.trim() !== body.trim(),
  };
}

export async function compactMemory(
  repoRoot: string,
  options: MemoryGcOptions = {},
): Promise<MemoryGcResult> {
  const scope = options.scope ?? "project";
  const types = options.type
    ? [assertMemoryType(options.type)]
    : memoryTypeSchema.options.filter((type) => type !== "repo-map");
  const maxEntries = options.maxEntries ?? 40;
  const maxChars = options.maxChars ?? 8_000;
  const files: MemoryGcFileResult[] = [];

  for (const type of types) {
    const file = memoryFilePath(repoRoot, type, scope, options.home);
    let raw = "";
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }

    const parsed = parseFrontmatter(raw);
    const compacted = compactMemoryBody(type, parsed.body, { maxEntries, maxChars });
    let archivePath: string | undefined;
    if (compacted.changed && compacted.removed.length > 0 && !options.dryRun) {
      archivePath = memoryArchivePath(repoRoot, type, options.home);
      await mkdir(path.dirname(archivePath), { recursive: true });
      await writeFile(archivePath, `${headingFor(type)} Archive\n${compacted.removed.join("\n")}\n`, "utf8");
    }

    if (compacted.changed && !options.dryRun) {
      const nextRaw = Object.keys(parsed.data).length > 0 ? serializeFrontmatter(parsed.data, compacted.body) : compacted.body;
      await writeFile(file, nextRaw, "utf8");
    }

    files.push({
      type,
      path: file,
      changed: compacted.changed,
      entriesBefore: compacted.entriesBefore,
      entriesAfter: compacted.entriesAfter,
      charsBefore: parsed.body.length,
      charsAfter: compacted.body.length,
      removed: compacted.removed.length,
      archivePath,
    });
  }

  return { scope, files };
}
