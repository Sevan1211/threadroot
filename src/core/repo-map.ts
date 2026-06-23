import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { projectObjectDir } from "./harness/paths.js";
import { toRepoPath } from "./paths.js";
import { inferProfile, readJson, scriptsFromPackageJson } from "./scan/package.js";
import { ignoredDirectories } from "./scan/rules.js";
import { walkRepo } from "./scan/walk.js";
import type { ProfileId } from "../types.js";

const execFileAsync = promisify(execFile);
const REPO_MAP_RELATIVE_PATH = ".threadroot/memory/repo-map.md";
const MAX_TEXT_FILE_BYTES = 256_000;
const DEFAULT_SEARCH_LIMIT = 25;
const DEFAULT_READ_LIMIT = 40_000;

export type RepoMapStatus = "missing" | "current" | "stale";

export type RepoMapSummary = {
  path: string;
  status: RepoMapStatus;
  treeHash: string;
  storedTreeHash?: string;
  profile: ProfileId | "unknown";
  fileCount: number;
  excerpt?: string;
};

export type RepoMapWriteResult = RepoMapSummary & {
  written: boolean;
};

export type RepoSearchMatch = {
  path: string;
  line: number;
  preview: string;
};

export type RepoReadResult = {
  path: string;
  sizeBytes: number;
  truncated: boolean;
  content: string;
};

type DirectorySummary = {
  path: string;
  files: number;
};

type RepoScan = {
  files: string[];
  treeHash: string;
  packageJson: unknown;
  profile: ProfileId | "unknown";
};

async function gitFiles(repoRoot: string): Promise<string[] | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: repoRoot,
      maxBuffer: 5 * 1024 * 1024,
    });
    const files = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((file) => !isIgnoredPath(file));
    const existing = await filterExistingFiles(repoRoot, files);
    return existing.length > 0 ? existing.sort() : undefined;
  } catch {
    return undefined;
  }
}

async function filterExistingFiles(repoRoot: string, files: string[]): Promise<string[]> {
  const checks = await Promise.all(
    files.map(async (file) => {
      const info = await stat(path.join(repoRoot, file)).catch(() => undefined);
      return { file, exists: Boolean(info?.isFile()) };
    }),
  );
  return checks.filter((entry) => entry.exists).map((entry) => entry.file);
}

async function scanRepo(repoRoot: string): Promise<RepoScan> {
  const files = (await gitFiles(repoRoot)) ?? (await filterExistingFiles(repoRoot, await walkRepo(repoRoot)));
  const packageJson = await readJson(repoRoot, "package.json");
  const profile = inferProfile(files, packageJson);
  return { files, packageJson, profile, treeHash: await hashFiles(repoRoot, files) };
}

async function hashFiles(repoRoot: string, files: string[]): Promise<string> {
  const hash = createHash("sha256");
  hash.update("threadroot-repo-map-v2\n");
  for (const file of files) {
    hash.update(file);
    try {
      const info = await stat(path.join(repoRoot, file));
      hash.update(`\0${info.size}\0`);
      if (info.isFile() && info.size <= MAX_TEXT_FILE_BYTES) {
        hash.update(await readFile(path.join(repoRoot, file)));
      } else {
        hash.update(String(Math.trunc(info.mtimeMs)));
      }
    } catch {
      hash.update("\0missing\0");
    }
    hash.update("\n");
  }
  return hash.digest("hex");
}

function isIgnoredPath(relativePath: string): boolean {
  const parts = relativePath.split("/");
  return parts.some((part) => ignoredDirectories.has(part));
}

function markdownLink(relativePath: string): string {
  const href = `../../${relativePath.split("/").map(encodeURIComponent).join("/")}`;
  return `[${relativePath}](${href})`;
}

function directoryLink(relativePath: string): string {
  const normalized = relativePath.endsWith("/") ? relativePath : `${relativePath}/`;
  const href = `../../${normalized.split("/").map(encodeURIComponent).join("/")}`;
  return `[${normalized}](${href})`;
}

function topDirectories(files: string[]): DirectorySummary[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const [first] = file.split("/");
    if (!first || first === file) {
      continue;
    }
    counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([dir, count]) => ({ path: dir, files: count }))
    .sort((a, b) => b.files - a.files || a.path.localeCompare(b.path))
    .slice(0, 16);
}

function likelyEntrypoints(files: string[]): string[] {
  const names = new Set([
    "src/index.ts",
    "src/index.tsx",
    "src/main.ts",
    "src/main.tsx",
    "src/cli.ts",
    "src/index.js",
    "app/page.tsx",
    "pages/index.tsx",
    "main.py",
    "app.py",
    "pyproject.toml",
  ]);
  return files.filter((file) => names.has(file) || file.endsWith("/main.py") || file.endsWith("/cli.ts")).slice(0, 12);
}

function likelyTests(files: string): boolean {
  return (
    fileContainsSegment(files, "test") ||
    fileContainsSegment(files, "tests") ||
    files.endsWith(".test.ts") ||
    files.endsWith(".test.tsx") ||
    files.endsWith(".spec.ts") ||
    files.endsWith(".spec.tsx")
  );
}

function fileContainsSegment(file: string, segment: string): boolean {
  return file.split("/").includes(segment);
}

function configFiles(files: string[]): string[] {
  return files
    .filter((file) => {
      const base = path.basename(file);
      return (
        base === "package.json" ||
        base === "pnpm-lock.yaml" ||
        base === "tsconfig.json" ||
        base.startsWith("vite.config.") ||
        base.startsWith("next.config.") ||
        base === "pyproject.toml" ||
        base === "dbt_project.yml" ||
        base === "dbt_project.yaml" ||
        base === "Dockerfile" ||
        file.startsWith(".github/workflows/")
      );
    })
    .slice(0, 24);
}

function renderList(items: string[], empty = "- None detected."): string[] {
  return items.length > 0 ? items.map((item) => `- ${markdownLink(item)}`) : [empty];
}

function renderRepoMap(scan: RepoScan): string {
  const generatedAt = new Date().toISOString();
  const commands = scriptsFromPackageJson(scan.packageJson);
  const dirs = topDirectories(scan.files);
  const configs = configFiles(scan.files);
  const entrypoints = likelyEntrypoints(scan.files);
  const tests = scan.files.filter(likelyTests).slice(0, 24);
  const sourceDirs = dirs.filter((dir) => ["src", "app", "pages", "lib", "packages", "apps", "test", "tests"].includes(dir.path));

  return [
    `<!-- threadroot:repo-map-v1 tree-hash=${scan.treeHash} generated=${generatedAt} -->`,
    "# Repo Map",
    "",
    "Compact navigation context for agents. Use this map to choose targeted file reads instead of loading the whole repository.",
    "",
    "## Overview",
    "",
    `- Profile: ${scan.profile}`,
    `- Files scanned: ${scan.files.length}`,
    `- Tree hash: ${scan.treeHash}`,
    "",
    "## Command Surface",
    "",
    ...(commands.length > 0
      ? commands.map((command) => `- \`${command.name}\`: \`${command.command}\` - ${command.purpose}`)
      : ["- No package scripts detected."]),
    "",
    "## Important Config Files",
    "",
    ...renderList(configs),
    "",
    "## Primary Directories",
    "",
    ...(dirs.length > 0
      ? dirs.map((dir) => `- ${directoryLink(dir.path)} - ${dir.files} file(s)`)
      : ["- No nested directories detected."]),
    "",
    "## Source Areas",
    "",
    ...(sourceDirs.length > 0
      ? sourceDirs.map((dir) => `- ${directoryLink(dir.path)} - ${dir.files} file(s)`)
      : ["- No conventional source directories detected."]),
    "",
    "## Likely Entrypoints",
    "",
    ...renderList(entrypoints),
    "",
    "## Tests",
    "",
    ...renderList(tests, "- No obvious test files detected."),
    "",
    "## Agent Notes",
    "",
    "- Start with `threadroot task \"<task>\"` for indexed task context.",
    "- Use this map to pick likely files, then search/read only what is relevant.",
    "- Use MCP `task_packet`, `repo_search`, and `repo_read` when available; otherwise use CLI task packets, `rg`, and targeted file reads.",
    "- Do not load generated, dependency, build, cache, or secret files unless the user explicitly asks.",
    "",
  ].join("\n");
}

function parseStoredTreeHash(content: string): string | undefined {
  return content.match(/tree-hash=([a-f0-9]+)/)?.[1];
}

function excerpt(content: string): string {
  const lines = content.split("\n");
  const sections: string[] = [];
  let include = false;
  for (const line of lines) {
    if (line.startsWith("## Overview") || line.startsWith("## Command Surface") || line.startsWith("## Source Areas")) {
      include = true;
      sections.push(line);
      continue;
    }
    if (line.startsWith("## ") && include) {
      include = false;
    }
    if (include) {
      sections.push(line);
    }
  }
  return sections.join("\n").trim().slice(0, 4_000);
}

export async function repoMapStatus(repoRoot: string): Promise<RepoMapSummary> {
  const scan = await scanRepo(repoRoot);
  const mapPath = path.join(repoRoot, REPO_MAP_RELATIVE_PATH);
  try {
    const content = await readFile(mapPath, "utf8");
    const storedTreeHash = parseStoredTreeHash(content);
    return {
      path: REPO_MAP_RELATIVE_PATH,
      status: storedTreeHash === scan.treeHash ? "current" : "stale",
      treeHash: scan.treeHash,
      storedTreeHash,
      profile: scan.profile,
      fileCount: scan.files.length,
      excerpt: excerpt(content),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    return {
      path: REPO_MAP_RELATIVE_PATH,
      status: "missing",
      treeHash: scan.treeHash,
      profile: scan.profile,
      fileCount: scan.files.length,
    };
  }
}

export async function writeRepoMap(repoRoot: string): Promise<RepoMapWriteResult> {
  const scan = await scanRepo(repoRoot);
  const content = renderRepoMap(scan);
  const dir = projectObjectDir(repoRoot, "memory");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(repoRoot, REPO_MAP_RELATIVE_PATH), content, "utf8");
  return {
    path: REPO_MAP_RELATIVE_PATH,
    status: "current",
    treeHash: scan.treeHash,
    storedTreeHash: scan.treeHash,
    profile: scan.profile,
    fileCount: scan.files.length,
    excerpt: excerpt(content),
    written: true,
  };
}

function isProbablyText(buffer: Buffer): boolean {
  if (buffer.includes(0)) {
    return false;
  }
  return true;
}

async function readTextFile(repoRoot: string, relativePath: string, maxBytes: number): Promise<RepoReadResult | undefined> {
  if (isIgnoredPath(relativePath) && relativePath !== REPO_MAP_RELATIVE_PATH) {
    return undefined;
  }
  const filePath = toRepoPath(repoRoot, relativePath);
  const info = await stat(filePath);
  if (!info.isFile() || info.size > MAX_TEXT_FILE_BYTES) {
    return undefined;
  }
  const raw = await readFile(filePath);
  if (!isProbablyText(raw)) {
    return undefined;
  }
  const content = raw.toString("utf8");
  return {
    path: relativePath,
    sizeBytes: info.size,
    truncated: content.length > maxBytes,
    content: content.slice(0, maxBytes),
  };
}

export async function readRepoFile(repoRoot: string, relativePath: string, maxBytes = DEFAULT_READ_LIMIT): Promise<RepoReadResult> {
  const normalized = relativePath.split(path.sep).join("/");
  const result = await readTextFile(repoRoot, normalized, maxBytes);
  if (!result) {
    throw new Error(`Cannot read repo text file: ${relativePath}`);
  }
  return result;
}

export async function searchRepo(repoRoot: string, query: string, limit = DEFAULT_SEARCH_LIMIT): Promise<RepoSearchMatch[]> {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((term) => term.length > 1);
  if (terms.length === 0) {
    return [];
  }

  const scan = await scanRepo(repoRoot);
  const matches: RepoSearchMatch[] = [];
  for (const file of scan.files) {
    const read = await readTextFile(repoRoot, file, DEFAULT_READ_LIMIT).catch(() => undefined);
    if (!read) {
      continue;
    }
    const lines = read.content.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const lower = lines[index]!.toLowerCase();
      if (terms.every((term) => lower.includes(term))) {
        matches.push({
          path: file,
          line: index + 1,
          preview: lines[index]!.trim().slice(0, 240),
        });
        if (matches.length >= limit) {
          return matches;
        }
      }
    }
  }
  return matches;
}
