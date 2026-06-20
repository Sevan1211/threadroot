import { cp, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import {
  connectionManifestSchema,
  projectObjectDir,
  ruleFrontmatterSchema,
  skillFrontmatterSchema,
  toolManifestSchema,
} from "../harness/index.js";
import { parseFrontmatter } from "../harness/frontmatter.js";
import { toRepoPath } from "../paths.js";

const packManifestSchema = z.object({
  name: z.string().min(1),
  version: z.literal(1),
  description: z.string().min(1),
  skills: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  rules: z.array(z.string()).default([]),
  connections: z.array(z.string()).default([]),
});

export type PackManifest = z.infer<typeof packManifestSchema>;

export type PackInspection = {
  name: string;
  description: string;
  path: string;
  skills: string[];
  tools: string[];
  rules: string[];
  connections: string[];
};

export type PackValidationReport = {
  ok: boolean;
  findings: Array<{ severity: "error" | "warning"; message: string; path?: string }>;
};

const DIST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT_FROM_BUNDLE = path.resolve(DIST_DIR, "..");
const PACKAGE_ROOT_FROM_DIST = path.resolve(DIST_DIR, "../../..");
const PACKAGE_ROOT_FROM_SRC = path.resolve(DIST_DIR, "../../../..");
const PACK_CANDIDATES = [
  path.join(PACKAGE_ROOT_FROM_BUNDLE, "packs"),
  path.join(PACKAGE_ROOT_FROM_DIST, "packs"),
  path.join(PACKAGE_ROOT_FROM_SRC, "packs"),
];

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function firstExisting(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (await isPackRoot(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export async function bundledPacksDir(): Promise<string | undefined> {
  return firstExisting(PACK_CANDIDATES);
}

async function isPackRoot(candidate: string): Promise<boolean> {
  let entries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = await readdir(candidate, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && (await exists(path.join(candidate, entry.name, "pack.yaml")))) {
      return true;
    }
  }
  return false;
}

function safeRelative(ref: string): string {
  const normalized = path.normalize(ref);
  if (path.isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`Unsafe pack reference: ${ref}`);
  }
  return normalized;
}

async function readPackManifest(packDir: string): Promise<PackManifest> {
  const file = path.join(packDir, "pack.yaml");
  const parsed = packManifestSchema.safeParse(parseYaml(await readFile(file, "utf8")));
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid pack manifest ${file}: ${detail}`);
  }
  return parsed.data;
}

async function packDirFor(repoRoot: string, nameOrPath: string): Promise<string> {
  if (path.isAbsolute(nameOrPath)) {
    return nameOrPath;
  }
  if (nameOrPath.startsWith(".") || nameOrPath.includes("/") || nameOrPath.includes("\\")) {
    return toRepoPath(repoRoot, nameOrPath);
  }
  const bundled = await bundledPacksDir();
  if (bundled) {
    return path.join(bundled, nameOrPath);
  }
  return toRepoPath(repoRoot, path.join("packs", nameOrPath));
}

async function directFiles(dir: string, ext: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(ext))
      .map((entry) => path.join(dir, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function skillEntries(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const result: string[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".md")) {
        result.push(full);
      }
      if (entry.isDirectory() && (await exists(path.join(full, "SKILL.md")))) {
        result.push(full);
      }
    }
    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function collectObjects(packDir: string, manifest: PackManifest): Promise<Record<string, string[]>> {
  async function resolveRef(ref: string): Promise<string> {
    const safe = safeRelative(ref);
    const local = path.resolve(packDir, safe);
    if (await exists(local)) {
      return local;
    }
    return path.resolve(packDir, "..", "..", safe);
  }

  return {
    skills: [
      ...(await Promise.all(manifest.skills.map(resolveRef))),
      ...(await skillEntries(path.join(packDir, "skills"))),
    ],
    tools: [
      ...(await Promise.all(manifest.tools.map(resolveRef))),
      ...(await directFiles(path.join(packDir, "tools"), ".yaml")),
    ],
    rules: [
      ...(await Promise.all(manifest.rules.map(resolveRef))),
      ...(await directFiles(path.join(packDir, "rules"), ".md")),
    ],
    connections: [
      ...(await Promise.all(manifest.connections.map(resolveRef))),
      ...(await directFiles(path.join(packDir, "connections"), ".yaml")),
    ],
  };
}

function baseName(source: string): string {
  const parsed = path.basename(source) === "SKILL.md" ? path.dirname(source) : source;
  return path.basename(parsed, path.extname(parsed));
}

export async function listPacks(repoRoot: string): Promise<PackInspection[]> {
  const dirs = [toRepoPath(repoRoot, "packs"), (await bundledPacksDir())].filter((dir): dir is string => Boolean(dir));
  const seen = new Set<string>();
  const packs: PackInspection[] = [];
  for (const root of dirs) {
    let entries: Array<{ name: string; isDirectory: () => boolean }>;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || seen.has(entry.name)) {
        continue;
      }
      const packDir = path.join(root, entry.name);
      if (!(await exists(path.join(packDir, "pack.yaml")))) {
        continue;
      }
      seen.add(entry.name);
      packs.push(await inspectPack(repoRoot, packDir));
    }
  }
  return packs.sort((a, b) => a.name.localeCompare(b.name));
}

export async function inspectPack(repoRoot: string, nameOrPath: string): Promise<PackInspection> {
  const packDir = await packDirFor(repoRoot, nameOrPath);
  const manifest = await readPackManifest(packDir);
  const objects = await collectObjects(packDir, manifest);
  return {
    name: manifest.name,
    description: manifest.description,
    path: packDir,
    skills: objects.skills.map(baseName),
    tools: objects.tools.map(baseName),
    rules: objects.rules.map(baseName),
    connections: objects.connections.map(baseName),
  };
}

async function validateProse(file: string, kind: "skill" | "rule"): Promise<void> {
  const target = path.basename(file) === "SKILL.md" ? file : file;
  const content = await readFile(target, "utf8");
  const parsed = parseFrontmatter(content);
  const schema = kind === "skill" ? skillFrontmatterSchema : ruleFrontmatterSchema;
  schema.parse(parsed.data);
}

async function validateYaml(file: string, kind: "tool" | "connection"): Promise<void> {
  const content = await readFile(file, "utf8");
  const schema = kind === "tool" ? toolManifestSchema : connectionManifestSchema;
  schema.parse(parseYaml(content));
}

export async function validatePack(repoRoot: string, nameOrPath: string): Promise<PackValidationReport> {
  const findings: PackValidationReport["findings"] = [];
  try {
    const packDir = await packDirFor(repoRoot, nameOrPath);
    const manifest = await readPackManifest(packDir);
    const objects = await collectObjects(packDir, manifest);
    for (const skill of objects.skills) {
      await validateProse(path.basename(skill) === "SKILL.md" ? skill : path.join(skill, "SKILL.md"), "skill");
    }
    for (const rule of objects.rules) await validateProse(rule, "rule");
    for (const tool of objects.tools) await validateYaml(tool, "tool");
    for (const connection of objects.connections) await validateYaml(connection, "connection");
    if (Object.values(objects).every((items) => items.length === 0)) {
      findings.push({ severity: "warning", message: "Pack does not include any objects." });
    }
  } catch (error) {
    findings.push({ severity: "error", message: error instanceof Error ? error.message : String(error) });
  }
  return { ok: !findings.some((finding) => finding.severity === "error"), findings };
}

async function copyObject(source: string, destDir: string): Promise<string> {
  const info = await stat(source);
  const name = baseName(source);
  const dest = info.isDirectory() ? path.join(destDir, name) : path.join(destDir, path.basename(source));
  await mkdir(destDir, { recursive: true });
  await cp(source, dest, { recursive: true, force: true });
  return dest;
}

export async function installPack(repoRoot: string, nameOrPath: string): Promise<PackInspection> {
  const validation = await validatePack(repoRoot, nameOrPath);
  if (!validation.ok) {
    throw new Error(validation.findings.map((finding) => finding.message).join("; "));
  }
  const packDir = await packDirFor(repoRoot, nameOrPath);
  const manifest = await readPackManifest(packDir);
  const objects = await collectObjects(packDir, manifest);
  await Promise.all([
    ...objects.skills.map((source) => copyObject(source, projectObjectDir(repoRoot, "skills"))),
    ...objects.tools.map((source) => copyObject(source, projectObjectDir(repoRoot, "tools"))),
    ...objects.rules.map((source) => copyObject(source, projectObjectDir(repoRoot, "rules"))),
    ...objects.connections.map((source) => copyObject(source, projectObjectDir(repoRoot, "connections"))),
  ]);
  return inspectPack(repoRoot, packDir);
}
