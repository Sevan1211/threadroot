import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseFrontmatter } from "./frontmatter.js";
import { HarnessError } from "./load.js";
import { HARNESS_OBJECT_EXT, projectObjectDir, userObjectDir } from "./paths.js";
import { type MemoryType, memoryTypeSchema } from "./schema.js";

export type MemoryScope = "project" | "user";

export type MemoryWriteResult = {
  type: MemoryType;
  scope: MemoryScope;
  path: string;
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
  await writeFile(file, `${base}\n- ${trimmed}\n`, "utf8");

  return { type: memoryType, scope, path: file };
}
