import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { parseFrontmatter } from "./frontmatter.js";
import {
  HARNESS_OBJECT_EXT,
  type HarnessObjectDir,
  projectManifestPath,
  projectObjectDir,
  userObjectDir,
} from "./paths.js";
import {
  type HarnessManifest,
  type ConnectionManifest,
  type MemoryType,
  type RuleFrontmatter,
  type SkillFrontmatter,
  type ToolManifest,
  harnessManifestSchema,
  memoryTypeSchema,
  ruleFrontmatterSchema,
  skillFrontmatterSchema,
  toolManifestSchema,
  connectionManifestSchema,
} from "./schema.js";

export type Origin = "user" | "project";

export type LoadedSkill = {
  name: string;
  origin: Origin;
  sourcePath: string;
  frontmatter: SkillFrontmatter;
  body: string;
};

export type LoadedRule = {
  name: string;
  origin: Origin;
  sourcePath: string;
  frontmatter: RuleFrontmatter;
  body: string;
};

export type LoadedTool = {
  name: string;
  origin: Origin;
  sourcePath: string;
  manifest: ToolManifest;
};

export type LoadedConnection = {
  name: string;
  origin: Origin;
  sourcePath: string;
  manifest: ConnectionManifest;
};

export type LoadedMemory = {
  type: MemoryType;
  origin: Origin;
  sourcePath: string;
  body: string;
};

export type EffectiveHarness = {
  manifest: HarnessManifest;
  skills: LoadedSkill[];
  rules: LoadedRule[];
  tools: LoadedTool[];
  connections: LoadedConnection[];
  memory: LoadedMemory[];
};

export class HarnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessError";
  }
}

type RawFile = { path: string; content: string };

async function readObjectFiles(dir: string, ext: string): Promise<RawFile[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = entries.filter((name) => name.endsWith(ext)).sort();
  return Promise.all(
    files.map(async (name) => {
      const full = path.join(dir, name);
      return { path: full, content: await readFile(full, "utf8") };
    }),
  );
}

async function readSkillFiles(dir: string): Promise<RawFile[]> {
  let entries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files: RawFile[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile() && entry.name.endsWith(HARNESS_OBJECT_EXT.prose)) {
      const full = path.join(dir, entry.name);
      files.push({ path: full, content: await readFile(full, "utf8") });
      continue;
    }
    if (entry.isDirectory()) {
      const full = path.join(dir, entry.name, "SKILL.md");
      try {
        files.push({ path: full, content: await readFile(full, "utf8") });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
  }
  return files;
}

function objectDirFor(repoRoot: string, dir: HarnessObjectDir, origin: Origin, home?: string): string {
  return origin === "project" ? projectObjectDir(repoRoot, dir) : userObjectDir(dir, home);
}

function describe(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues: Array<{ path: Array<string | number>; message: string }> }).issues;
    return issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

async function loadSkillsFrom(dir: string, origin: Origin): Promise<LoadedSkill[]> {
  const files = await readSkillFiles(dir);
  return files.map((file) => {
    const { data, body } = parseFrontmatter(file.content);
    const result = skillFrontmatterSchema.safeParse(data);
    if (!result.success) {
      throw new HarnessError(`Invalid skill ${file.path}: ${describe(result.error)}`);
    }
    return { name: result.data.name, origin, sourcePath: file.path, frontmatter: result.data, body };
  });
}

async function loadRulesFrom(dir: string, origin: Origin): Promise<LoadedRule[]> {
  const files = await readObjectFiles(dir, HARNESS_OBJECT_EXT.prose);
  return files.map((file) => {
    const { data, body } = parseFrontmatter(file.content);
    const result = ruleFrontmatterSchema.safeParse(data);
    if (!result.success) {
      throw new HarnessError(`Invalid rule ${file.path}: ${describe(result.error)}`);
    }
    return { name: result.data.name, origin, sourcePath: file.path, frontmatter: result.data, body };
  });
}

async function loadToolsFrom(dir: string, origin: Origin): Promise<LoadedTool[]> {
  const files = await readObjectFiles(dir, HARNESS_OBJECT_EXT.tool);
  return files.map((file) => {
    const parsed = parseYaml(file.content) as unknown;
    const result = toolManifestSchema.safeParse(parsed);
    if (!result.success) {
      throw new HarnessError(`Invalid tool ${file.path}: ${describe(result.error)}`);
    }
    return { name: result.data.name, origin, sourcePath: file.path, manifest: result.data };
  });
}

async function loadConnectionsFrom(dir: string, origin: Origin): Promise<LoadedConnection[]> {
  const files = await readObjectFiles(dir, HARNESS_OBJECT_EXT.tool);
  return files.map((file) => {
    const parsed = parseYaml(file.content) as unknown;
    const result = connectionManifestSchema.safeParse(parsed);
    if (!result.success) {
      throw new HarnessError(`Invalid connection ${file.path}: ${describe(result.error)}`);
    }
    return { name: result.data.name, origin, sourcePath: file.path, manifest: result.data };
  });
}

async function loadMemoryFrom(dir: string, origin: Origin): Promise<LoadedMemory[]> {
  const files = await readObjectFiles(dir, HARNESS_OBJECT_EXT.prose);
  const memory: LoadedMemory[] = [];
  for (const file of files) {
    const base = path.basename(file.path, HARNESS_OBJECT_EXT.prose);
    const type = memoryTypeSchema.safeParse(base);
    if (!type.success) {
      continue; // ignore files that are not a known memory type
    }
    const { body } = parseFrontmatter(file.content);
    memory.push({ type: type.data, origin, sourcePath: file.path, body });
  }
  return memory;
}

/** Merge user then project by name; project overrides user (spec §4). */
function mergeByName<T extends { name: string }>(user: T[], project: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of user) {
    merged.set(item.name, item);
  }
  for (const item of project) {
    merged.set(item.name, item);
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadManifest(repoRoot: string): Promise<HarnessManifest> {
  const manifestPath = projectManifestPath(repoRoot);
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new HarnessError(`No harness found at ${manifestPath}. Run \`threadroot init\` first.`);
    }
    throw error;
  }

  const result = harnessManifestSchema.safeParse(parseYaml(raw));
  if (!result.success) {
    throw new HarnessError(`Invalid ${manifestPath}: ${describe(result.error)}`);
  }
  return result.data;
}

/** Load + merge user and project scopes into the effective harness view. */
export async function resolveHarness(repoRoot: string, opts: { home?: string } = {}): Promise<EffectiveHarness> {
  const { home } = opts;
  const manifest = await loadManifest(repoRoot);

  const [
    userSkills,
    projectSkills,
    userRules,
    projectRules,
    userTools,
    projectTools,
    userConnections,
    projectConnections,
    userMemory,
    projectMemory,
  ] = await Promise.all([
      loadSkillsFrom(objectDirFor(repoRoot, "skills", "user", home), "user"),
      loadSkillsFrom(objectDirFor(repoRoot, "skills", "project", home), "project"),
      loadRulesFrom(objectDirFor(repoRoot, "rules", "user", home), "user"),
      loadRulesFrom(objectDirFor(repoRoot, "rules", "project", home), "project"),
      loadToolsFrom(objectDirFor(repoRoot, "tools", "user", home), "user"),
      loadToolsFrom(objectDirFor(repoRoot, "tools", "project", home), "project"),
      loadConnectionsFrom(objectDirFor(repoRoot, "connections", "user", home), "user"),
      loadConnectionsFrom(objectDirFor(repoRoot, "connections", "project", home), "project"),
      loadMemoryFrom(objectDirFor(repoRoot, "memory", "user", home), "user"),
      loadMemoryFrom(objectDirFor(repoRoot, "memory", "project", home), "project"),
    ]);

  return {
    manifest,
    skills: mergeByName(userSkills, projectSkills),
    rules: mergeByName(userRules, projectRules),
    tools: mergeByName(userTools, projectTools),
    connections: mergeByName(userConnections, projectConnections),
    memory: [...userMemory, ...projectMemory],
  };
}
