import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { projectHarnessDir, projectLockPath, userLockPath } from "./harness/paths.js";
import { readLockFile } from "./install/lock.js";
import type { LockEntry } from "./install/source.js";
import { toRepoPath } from "./paths.js";
import { ignoredDirectories } from "./scan/rules.js";
import { walkRepo } from "./scan/walk.js";
import { hashContent } from "./hash.js";
import { resolveHarness, type EffectiveHarness } from "./harness/index.js";

const execFileAsync = promisify(execFile);

const INDEX_VERSION = 1;
const INDEX_DIR = ".threadroot/cache/index";
const SQLITE_INDEX = `${INDEX_DIR}/threadroot.sqlite`;
const FALLBACK_INDEX = `${INDEX_DIR}/threadroot.json`;
const BETTER_SQLITE_SPECIFIER = "better-sqlite3";
const NODE_SQLITE_SPECIFIER = "node:sqlite";
const MAX_TEXT_BYTES = 256_000;
const MAX_CHUNK_CHARS = 2_400;

export type RepoIndexBackend = "sqlite" | "json-fallback";

export type RepoIndexFile = {
  path: string;
  hash: string;
  size: number;
  language: string;
  mtimeMs: number;
  ignored: boolean;
  indexedAt: string;
};

export type RepoIndexSymbol = {
  file: string;
  name: string;
  kind: string;
  exported: boolean;
  signature: string;
  startLine: number;
  endLine: number;
  parent?: string;
};

export type RepoIndexEdge = {
  from: string;
  to: string;
  kind: "import" | "export" | "call" | "reference" | "test" | "doc" | "provider" | "memory" | "run";
  weight: number;
};

export type RepoIndexChunk = {
  id: string;
  path: string;
  kind: "file" | "symbol" | "doc" | "skill" | "memory" | "run";
  text: string;
  startLine: number;
  endLine: number;
  tokenEstimate: number;
  trust: "repo" | "harness" | "generated" | "external" | "local";
};

export type RepoIndexSkill = {
  name: string;
  path: string;
  hash: string;
  trigger: string;
  negativeTriggers: string[];
  scope: string;
  risk: string;
  reviewed: boolean;
  trustScore: number;
};

export type RepoIndexMemoryEvent = {
  id: string;
  type: string;
  body: string;
  source: "memory";
  confidence: "low" | "medium" | "high";
  scope: string;
  createdAt: string;
  provenance: string;
};

export type RepoIndexRun = {
  id: string;
  command: string;
  exitCode: number | null;
  durationMs: number;
  rawLogPath: string;
  summary: string;
  createdAt: string;
};

export type RepoIndexEmbedding = {
  chunkId: string;
  provider: string;
  model: string;
  textHash: string;
  vector: number[];
};

export type RepoIndexSnapshot = {
  version: number;
  backend: RepoIndexBackend;
  repoRoot: string;
  treeHash: string;
  generatedAt: string;
  files: RepoIndexFile[];
  symbols: RepoIndexSymbol[];
  edges: RepoIndexEdge[];
  chunks: RepoIndexChunk[];
  skills: RepoIndexSkill[];
  memoryEvents: RepoIndexMemoryEvent[];
  runs: RepoIndexRun[];
  embeddings: RepoIndexEmbedding[];
  adapters: {
    sqlite: "better-sqlite3" | "node:sqlite" | "unavailable";
    treeSitter: "not-installed";
    embeddings: "disabled" | "configured";
  };
  warnings: string[];
};

export type RepoIndexBuildOptions = {
  force?: boolean;
  home?: string;
};

export type RepoIndexStatus = {
  exists: boolean;
  status: "missing" | "current" | "stale" | "degraded";
  backend?: RepoIndexBackend;
  path: string;
  fallbackPath: string;
  treeHash: string;
  storedTreeHash?: string;
  generatedAt?: string;
  counts?: {
    files: number;
    symbols: number;
    edges: number;
    chunks: number;
    skills: number;
    memoryEvents: number;
    runs: number;
    embeddings: number;
  };
  adapters: RepoIndexSnapshot["adapters"];
  warnings: string[];
};

export type RepoIndexBuildResult = RepoIndexStatus & {
  written: boolean;
  durationMs: number;
};

export type IndexCandidate = {
  path: string;
  score: number;
  reasons: string[];
  lines?: number[];
  signals: Array<{ source: string; score: number; detail: string }>;
};

type SqliteModule = {
  driver: "better-sqlite3" | "node:sqlite";
  DatabaseSync: new (location: string) => SqliteDatabase;
};

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Array<Record<string, unknown>>;
  };
  close(): void;
};

type TextFile = {
  path: string;
  content: string;
  size: number;
  mtimeMs: number;
  hash: string;
  language: string;
};

async function gitFiles(repoRoot: string): Promise<string[] | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: repoRoot,
      maxBuffer: 8 * 1024 * 1024,
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

async function repoFiles(repoRoot: string): Promise<string[]> {
  const files = ((await gitFiles(repoRoot)) ?? (await walkRepo(repoRoot))).filter((file) => !isIgnoredPath(file));
  return (await filterExistingFiles(repoRoot, files)).sort();
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

function isIgnoredPath(relativePath: string): boolean {
  return relativePath.split("/").some((part) => ignoredDirectories.has(part));
}

function indexPath(repoRoot: string): string {
  return toRepoPath(repoRoot, SQLITE_INDEX);
}

function fallbackPath(repoRoot: string): string {
  return toRepoPath(repoRoot, FALLBACK_INDEX);
}

function languageFor(filePath: string): string {
  const base = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  if (base === "package.json") return "json";
  if (base === "tsconfig.json") return "json";
  if ([".ts", ".tsx", ".mts", ".cts"].includes(ext)) return "typescript";
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "javascript";
  if (ext === ".py") return "python";
  if (ext === ".go") return "go";
  if (ext === ".rs") return "rust";
  if (ext === ".json") return "json";
  if ([".yaml", ".yml"].includes(ext)) return "yaml";
  if ([".md", ".mdx"].includes(ext)) return "markdown";
  if ([".toml"].includes(ext)) return "toml";
  if ([".sh", ".bash"].includes(ext)) return "shell";
  return ext ? ext.slice(1) : "text";
}

function isProbablyText(buffer: Buffer): boolean {
  return !buffer.includes(0);
}

async function readTextFile(repoRoot: string, filePath: string): Promise<TextFile | undefined> {
  const absolute = path.join(repoRoot, filePath);
  const info = await stat(absolute).catch(() => undefined);
  if (!info?.isFile() || info.size > MAX_TEXT_BYTES) {
    return undefined;
  }
  const raw = await readFile(absolute).catch(() => undefined);
  if (!raw || !isProbablyText(raw)) {
    return undefined;
  }
  const content = raw.toString("utf8");
  return {
    path: filePath,
    content,
    size: info.size,
    mtimeMs: info.mtimeMs,
    hash: hashContent(content),
    language: languageFor(filePath),
  };
}

async function computeTreeHash(files: TextFile[]): Promise<string> {
  const hash = createHash("sha256");
  hash.update("threadroot-index-v1\n");
  for (const file of files) {
    hash.update(`${file.path}\0${file.hash}\0${file.size}\n`);
  }
  return hash.digest("hex");
}

function lineNumber(content: string, offset: number): number {
  return content.slice(0, offset).split("\n").length;
}

function addSymbol(
  symbols: RepoIndexSymbol[],
  file: TextFile,
  match: RegExpExecArray,
  kind: string,
  nameIndex: number,
  exported: boolean,
): void {
  const name = match[nameIndex];
  if (!name) {
    return;
  }
  const startLine = lineNumber(file.content, match.index);
  const signature = match[0].split("\n")[0]!.trim().slice(0, 240);
  symbols.push({
    file: file.path,
    name,
    kind,
    exported,
    signature,
    startLine,
    endLine: startLine,
  });
}

function extractSymbols(file: TextFile): RepoIndexSymbol[] {
  const symbols: RepoIndexSymbol[] = [];
  const patterns: Array<{ regex: RegExp; kind: string; nameIndex: number; exported: boolean }> = [];

  if (file.language === "typescript" || file.language === "javascript") {
    patterns.push(
      { regex: /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)/g, kind: "function", nameIndex: 1, exported: true },
      { regex: /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)/g, kind: "function", nameIndex: 1, exported: false },
      { regex: /\bexport\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g, kind: "class", nameIndex: 1, exported: true },
      { regex: /\bclass\s+([A-Za-z_$][\w$]*)/g, kind: "class", nameIndex: 1, exported: false },
      { regex: /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g, kind: "variable", nameIndex: 1, exported: true },
      { regex: /\bexport\s+type\s+([A-Za-z_$][\w$]*)/g, kind: "type", nameIndex: 1, exported: true },
      { regex: /\bexport\s+interface\s+([A-Za-z_$][\w$]*)/g, kind: "interface", nameIndex: 1, exported: true },
    );
  } else if (file.language === "python") {
    patterns.push(
      { regex: /^def\s+([A-Za-z_]\w*)\s*\([^)]*\):/gm, kind: "function", nameIndex: 1, exported: true },
      { regex: /^class\s+([A-Za-z_]\w*)\s*[:(]/gm, kind: "class", nameIndex: 1, exported: true },
    );
  } else if (file.language === "go") {
    patterns.push(
      { regex: /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\([^)]*\)/gm, kind: "function", nameIndex: 1, exported: true },
      { regex: /^type\s+([A-Za-z_]\w*)\s+(?:struct|interface)/gm, kind: "type", nameIndex: 1, exported: true },
    );
  } else if (file.language === "rust") {
    patterns.push(
      { regex: /\bpub\s+fn\s+([A-Za-z_]\w*)\s*\([^)]*\)/g, kind: "function", nameIndex: 1, exported: true },
      { regex: /\bfn\s+([A-Za-z_]\w*)\s*\([^)]*\)/g, kind: "function", nameIndex: 1, exported: false },
      { regex: /\bpub\s+(?:struct|enum|trait)\s+([A-Za-z_]\w*)/g, kind: "type", nameIndex: 1, exported: true },
    );
  } else if (file.language === "markdown") {
    patterns.push({ regex: /^(#{1,6})\s+(.+)$/gm, kind: "heading", nameIndex: 2, exported: true });
  }

  for (const pattern of patterns) {
    for (const match of file.content.matchAll(pattern.regex)) {
      addSymbol(symbols, file, match, pattern.kind, pattern.nameIndex, pattern.exported);
    }
  }

  return dedupeSymbols(symbols);
}

function dedupeSymbols(symbols: RepoIndexSymbol[]): RepoIndexSymbol[] {
  const seen = new Set<string>();
  return symbols.filter((symbol) => {
    const key = `${symbol.file}:${symbol.kind}:${symbol.name}:${symbol.startLine}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveImport(files: Set<string>, fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) {
    return undefined;
  }
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.py`,
    `${base}.go`,
    `${base}.rs`,
    path.posix.join(base, "index.ts"),
    path.posix.join(base, "index.tsx"),
    path.posix.join(base, "index.js"),
  ];
  return candidates.find((candidate) => files.has(candidate));
}

function extractImportSpecifiers(file: TextFile): string[] {
  const specs: string[] = [];
  const patterns =
    file.language === "python"
      ? [/^\s*from\s+([.\w]+)\s+import\s+/gm, /^\s*import\s+([.\w]+)/gm]
      : file.language === "go"
        ? [/"([^"]+)"/g]
        : file.language === "rust"
          ? [/\buse\s+([^;]+);/g]
          : [/\bimport\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g, /\bexport\s+[^'"]+\s+from\s+["']([^"']+)["']/g, /\brequire\(["']([^"']+)["']\)/g];
  for (const pattern of patterns) {
    for (const match of file.content.matchAll(pattern)) {
      const specifier = match[1]?.trim();
      if (specifier) {
        specs.push(specifier);
      }
    }
  }
  return specs;
}

function isTestPath(filePath: string): boolean {
  const base = path.basename(filePath);
  return (
    filePath.split("/").some((part) => part === "test" || part === "tests" || part === "__tests__") ||
    base.includes(".test.") ||
    base.includes(".spec.")
  );
}

function stemForOwnership(filePath: string): string {
  const base = path.basename(filePath).toLowerCase();
  return base
    .replace(/\.d\.(ts|mts|cts)$/u, "")
    .replace(/\.(test|spec)\.[^.]+$/u, "")
    .replace(/\.[^.]+$/u, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function sourceOwnershipScore(testPath: string, sourcePath: string): number {
  const testStem = stemForOwnership(testPath);
  const sourceStem = stemForOwnership(sourcePath);
  if (!testStem || !sourceStem || testStem !== sourceStem) {
    return 0;
  }
  let score = 4;
  if (sourcePath.startsWith("src/")) {
    score += 1;
  }
  if (path.dirname(testPath).split("/").some((part) => path.dirname(sourcePath).split("/").includes(part))) {
    score += 1;
  }
  return score;
}

function ownershipEdges(files: TextFile[]): RepoIndexEdge[] {
  const sourcesByStem = new Map<string, TextFile[]>();
  for (const file of files) {
    if (isTestPath(file.path)) {
      continue;
    }
    const stem = stemForOwnership(file.path);
    if (!stem) {
      continue;
    }
    const current = sourcesByStem.get(stem) ?? [];
    current.push(file);
    sourcesByStem.set(stem, current);
  }

  const edges: RepoIndexEdge[] = [];
  for (const testFile of files.filter((file) => isTestPath(file.path))) {
    const stem = stemForOwnership(testFile.path);
    const sources = sourcesByStem.get(stem) ?? [];
    for (const source of sources
      .map((file) => ({ file, score: sourceOwnershipScore(testFile.path, file.path) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path))
      .slice(0, 8)) {
      edges.push({ from: testFile.path, to: source.file.path, kind: "test", weight: source.score });
      edges.push({ from: source.file.path, to: testFile.path, kind: "test", weight: Math.max(2, source.score - 1) });
    }
  }
  return edges;
}

function extractEdges(files: TextFile[]): RepoIndexEdge[] {
  const fileSet = new Set(files.map((file) => file.path));
  const edges: RepoIndexEdge[] = [];
  for (const file of files) {
    for (const specifier of extractImportSpecifiers(file)) {
      const target = resolveImport(fileSet, file.path, specifier);
      if (!target) {
        continue;
      }
      edges.push({ from: file.path, to: target, kind: "import", weight: 4 });
      if (isTestPath(file.path) && !isTestPath(target)) {
        edges.push({ from: file.path, to: target, kind: "test", weight: 6 });
        edges.push({ from: target, to: file.path, kind: "test", weight: 5 });
      }
    }
  }
  edges.push(...ownershipEdges(files));
  return dedupeEdges(edges);
}

function dedupeEdges(edges: RepoIndexEdge[]): RepoIndexEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}:${edge.kind}:${edge.to}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function chunkFile(file: TextFile, symbols: RepoIndexSymbol[]): RepoIndexChunk[] {
  const chunks: RepoIndexChunk[] = [];
  const text = file.content.trim();
  if (text) {
    const clipped = text.length > MAX_CHUNK_CHARS ? text.slice(0, MAX_CHUNK_CHARS) : text;
    chunks.push({
      id: hashContent(`file:${file.path}:${file.hash}`),
      path: file.path,
      kind: file.language === "markdown" ? "doc" : "file",
      text: clipped,
      startLine: 1,
      endLine: clipped.split("\n").length,
      tokenEstimate: estimateTokens(clipped),
      trust: "repo",
    });
  }

  for (const symbol of symbols.filter((entry) => entry.file === file.path)) {
    chunks.push({
      id: hashContent(`symbol:${file.path}:${symbol.kind}:${symbol.name}:${symbol.startLine}`),
      path: file.path,
      kind: "symbol",
      text: `${symbol.kind} ${symbol.name}: ${symbol.signature}`,
      startLine: symbol.startLine,
      endLine: symbol.endLine,
      tokenEstimate: estimateTokens(symbol.signature),
      trust: "repo",
    });
  }
  return chunks;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

async function lockEntries(repoRoot: string, home?: string): Promise<Map<string, LockEntry>> {
  const lock = await readLockFile(projectLockPath(repoRoot));
  const userLock = await readLockFile(userLockPath(home)).catch(() => ({ objects: [] }));
  const entries = new Map<string, LockEntry>();
  for (const entry of userLock.objects) {
    if (entry.kind === "skill") entries.set(entry.name, entry);
  }
  for (const entry of lock.objects) {
    if (entry.kind === "skill") entries.set(entry.name, entry);
  }
  return entries;
}

function metadataList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

async function indexSkills(harness: EffectiveHarness, repoRoot: string, home?: string): Promise<{ skills: RepoIndexSkill[]; chunks: RepoIndexChunk[] }> {
  const entries = await lockEntries(repoRoot, home);
  const skills: RepoIndexSkill[] = [];
  const chunks: RepoIndexChunk[] = [];
  for (const skill of harness.skills) {
    const entry = entries.get(skill.name);
    const raw = await readFile(skill.sourcePath, "utf8").catch(() => "");
    const negativeTriggers = metadataList(skill.frontmatter.metadata?.not_when ?? skill.frontmatter.metadata?.notWhen);
    const trigger = `${skill.frontmatter.description} ${skill.frontmatter.when} ${skill.frontmatter.tags.join(" ")}`.trim();
    const reviewed = entry ? (entry.reviewed ?? entry.sourceKind === "local") : true;
    const risk = entry?.risk ?? "low";
    const trustScore = reviewed ? (risk === "low" ? 1 : 0.7) : 0.35;
    skills.push({
      name: skill.name,
      path: path.relative(repoRoot, skill.sourcePath).split(path.sep).join("/"),
      hash: hashContent(raw),
      trigger,
      negativeTriggers,
      scope: skill.frontmatter.scope,
      risk,
      reviewed,
      trustScore,
    });
    chunks.push({
      id: hashContent(`skill:${skill.name}:${trigger}`),
      path: path.relative(repoRoot, skill.sourcePath).split(path.sep).join("/"),
      kind: "skill",
      text: `${skill.name}: ${trigger}`,
      startLine: 1,
      endLine: 1,
      tokenEstimate: estimateTokens(trigger),
      trust: entry?.sourceKind === "local" || !entry ? "harness" : "external",
    });
  }
  return { skills, chunks };
}

async function indexMemory(repoRoot: string): Promise<{ memoryEvents: RepoIndexMemoryEvent[]; chunks: RepoIndexChunk[] }> {
  const dir = path.join(projectHarnessDir(repoRoot), "memory");
  const files = await walkRepo(dir).catch(() => []);
  const memoryEvents: RepoIndexMemoryEvent[] = [];
  const chunks: RepoIndexChunk[] = [];
  for (const file of files.filter((entry) => entry.endsWith(".md"))) {
    const absolute = path.join(dir, file);
    const body = await readFile(absolute, "utf8").catch(() => "");
    const type = path.basename(file, ".md");
    const text = body.trim();
    if (!text) {
      continue;
    }
    const event: RepoIndexMemoryEvent = {
      id: hashContent(`memory:${type}:${text}`),
      type,
      body: text,
      source: "memory",
      confidence: "medium",
      scope: "project",
      createdAt: new Date(0).toISOString(),
      provenance: `.threadroot/memory/${file}`,
    };
    memoryEvents.push(event);
    chunks.push({
      id: event.id,
      path: `.threadroot/memory/${file}`,
      kind: "memory",
      text: text.slice(0, MAX_CHUNK_CHARS),
      startLine: 1,
      endLine: text.split("\n").length,
      tokenEstimate: estimateTokens(text),
      trust: "harness",
    });
  }
  return { memoryEvents, chunks };
}

async function assembleSnapshot(
  repoRoot: string,
  backend: RepoIndexBackend,
  home?: string,
  sqliteAdapter: RepoIndexSnapshot["adapters"]["sqlite"] = "unavailable",
): Promise<RepoIndexSnapshot> {
  const rawFiles = await repoFiles(repoRoot);
  const textFiles = (
    await Promise.all(rawFiles.map((file) => readTextFile(repoRoot, file).catch(() => undefined)))
  ).filter((file): file is TextFile => Boolean(file));
  const generatedAt = new Date().toISOString();
  const treeHash = await computeTreeHash(textFiles);
  const files: RepoIndexFile[] = textFiles.map((file) => ({
    path: file.path,
    hash: file.hash,
    size: file.size,
    language: file.language,
    mtimeMs: file.mtimeMs,
    ignored: false,
    indexedAt: generatedAt,
  }));
  const symbols = textFiles.flatMap(extractSymbols);
  const edges = extractEdges(textFiles);
  const codeChunks = textFiles.flatMap((file) => chunkFile(file, symbols));
  let skills: RepoIndexSkill[] = [];
  let skillChunks: RepoIndexChunk[] = [];
  try {
    const harness = await resolveHarness(repoRoot, { home });
    const indexedSkills = await indexSkills(harness, repoRoot, home);
    skills = indexedSkills.skills;
    skillChunks = indexedSkills.chunks;
  } catch {
    skills = [];
    skillChunks = [];
  }
  const memory = await indexMemory(repoRoot);
  return {
    version: INDEX_VERSION,
    backend,
    repoRoot,
    treeHash,
    generatedAt,
    files,
    symbols,
    edges,
    chunks: [...codeChunks, ...skillChunks, ...memory.chunks],
    skills,
    memoryEvents: memory.memoryEvents,
    runs: [],
    embeddings: [],
    adapters: {
      sqlite: backend === "sqlite" ? sqliteAdapter : "unavailable",
      treeSitter: "not-installed",
      embeddings: "disabled",
    },
    warnings:
      backend === "sqlite"
        ? ["Tree-sitter grammars are not installed; using language-aware extraction fallback."]
        : ["Native SQLite adapter is unavailable or not enabled; using JSON fallback index.", "Tree-sitter grammars are not installed; using language-aware extraction fallback."],
  };
}

async function sqliteModule(): Promise<SqliteModule | undefined> {
  try {
    const imported = (await import(BETTER_SQLITE_SPECIFIER)) as { default?: unknown };
    const DatabaseSync = imported.default as SqliteModule["DatabaseSync"] | undefined;
    if (DatabaseSync) {
      return { driver: "better-sqlite3", DatabaseSync };
    }
  } catch {
    // Optional dependency: fall through to Node's builtin or JSON fallback.
  }

  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (nodeMajor < 24 && process.env.THREADROOT_EXPERIMENTAL_SQLITE !== "1") {
    return undefined;
  }
  try {
    const imported = (await import(NODE_SQLITE_SPECIFIER)) as unknown as Omit<SqliteModule, "driver">;
    return { driver: "node:sqlite", DatabaseSync: imported.DatabaseSync };
  } catch {
    return undefined;
  }
}

function setupSqlite(db: InstanceType<SqliteModule["DatabaseSync"]>): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, hash TEXT, size INTEGER, language TEXT, mtime_ms REAL, ignored INTEGER, indexed_at TEXT);
    CREATE TABLE IF NOT EXISTS symbols (file TEXT, name TEXT, kind TEXT, exported INTEGER, signature TEXT, start_line INTEGER, end_line INTEGER, parent TEXT);
    CREATE TABLE IF NOT EXISTS edges (from_path TEXT, to_path TEXT, kind TEXT, weight REAL);
    CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, path TEXT, kind TEXT, text TEXT, start_line INTEGER, end_line INTEGER, token_estimate INTEGER, trust TEXT);
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(id UNINDEXED, path, kind, text, tokenize='porter');
    CREATE TABLE IF NOT EXISTS skills (name TEXT PRIMARY KEY, path TEXT, hash TEXT, trigger TEXT, negative_triggers TEXT, scope TEXT, risk TEXT, reviewed INTEGER, trust_score REAL);
    CREATE TABLE IF NOT EXISTS memory_events (id TEXT PRIMARY KEY, type TEXT, body TEXT, source TEXT, confidence TEXT, scope TEXT, created_at TEXT, provenance TEXT);
    CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, command TEXT, exit_code INTEGER, duration_ms INTEGER, raw_log_path TEXT, summary TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS embeddings (chunk_id TEXT, provider TEXT, model TEXT, text_hash TEXT, vector TEXT, PRIMARY KEY(chunk_id, provider, model));
  `);
}

function resetSqlite(db: InstanceType<SqliteModule["DatabaseSync"]>): void {
  db.exec(`
    DELETE FROM meta;
    DELETE FROM files;
    DELETE FROM symbols;
    DELETE FROM edges;
    DELETE FROM chunks;
    DELETE FROM chunks_fts;
    DELETE FROM skills;
    DELETE FROM memory_events;
    DELETE FROM runs;
    DELETE FROM embeddings;
  `);
}

function writeSqlite(db: InstanceType<SqliteModule["DatabaseSync"]>, snapshot: RepoIndexSnapshot): void {
  const putMeta = db.prepare("INSERT INTO meta(key, value) VALUES (?, ?)");
  putMeta.run("version", String(snapshot.version));
  putMeta.run("treeHash", snapshot.treeHash);
  putMeta.run("generatedAt", snapshot.generatedAt);
  putMeta.run("backend", snapshot.backend);
  putMeta.run("adapters", JSON.stringify(snapshot.adapters));
  putMeta.run("warnings", JSON.stringify(snapshot.warnings));

  const putFile = db.prepare("INSERT INTO files(path, hash, size, language, mtime_ms, ignored, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const file of snapshot.files) {
    putFile.run(file.path, file.hash, file.size, file.language, file.mtimeMs, file.ignored ? 1 : 0, file.indexedAt);
  }

  const putSymbol = db.prepare("INSERT INTO symbols(file, name, kind, exported, signature, start_line, end_line, parent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const symbol of snapshot.symbols) {
    putSymbol.run(symbol.file, symbol.name, symbol.kind, symbol.exported ? 1 : 0, symbol.signature, symbol.startLine, symbol.endLine, symbol.parent ?? null);
  }

  const putEdge = db.prepare("INSERT INTO edges(from_path, to_path, kind, weight) VALUES (?, ?, ?, ?)");
  for (const edge of snapshot.edges) {
    putEdge.run(edge.from, edge.to, edge.kind, edge.weight);
  }

  const putChunk = db.prepare("INSERT INTO chunks(id, path, kind, text, start_line, end_line, token_estimate, trust) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const putFts = db.prepare("INSERT INTO chunks_fts(id, path, kind, text) VALUES (?, ?, ?, ?)");
  for (const chunk of snapshot.chunks) {
    putChunk.run(chunk.id, chunk.path, chunk.kind, chunk.text, chunk.startLine, chunk.endLine, chunk.tokenEstimate, chunk.trust);
    putFts.run(chunk.id, chunk.path, chunk.kind, chunk.text);
  }

  const putSkill = db.prepare("INSERT INTO skills(name, path, hash, trigger, negative_triggers, scope, risk, reviewed, trust_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const skill of snapshot.skills) {
    putSkill.run(skill.name, skill.path, skill.hash, skill.trigger, JSON.stringify(skill.negativeTriggers), skill.scope, skill.risk, skill.reviewed ? 1 : 0, skill.trustScore);
  }

  const putMemory = db.prepare("INSERT INTO memory_events(id, type, body, source, confidence, scope, created_at, provenance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const event of snapshot.memoryEvents) {
    putMemory.run(event.id, event.type, event.body, event.source, event.confidence, event.scope, event.createdAt, event.provenance);
  }
}

function rowString(row: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = row?.[key];
  return typeof value === "string" ? value : undefined;
}

function parseJsonArray(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function normalizeSqliteAdapter(value: unknown): RepoIndexSnapshot["adapters"]["sqlite"] {
  if (value === "better-sqlite3" || value === "node:sqlite" || value === "unavailable") {
    return value;
  }
  if (value === "available") {
    return "node:sqlite";
  }
  return "unavailable";
}

function readSqliteSnapshot(repoRoot: string, db: InstanceType<SqliteModule["DatabaseSync"]>): RepoIndexSnapshot | undefined {
  try {
    const metaRows = db.prepare("SELECT key, value FROM meta").all();
    const meta = new Map(metaRows.map((row) => [String(row.key), String(row.value)]));
    const treeHash = meta.get("treeHash");
    const generatedAt = meta.get("generatedAt");
    if (!treeHash || !generatedAt) {
      return undefined;
    }
    const adapters = JSON.parse(meta.get("adapters") ?? "{}") as RepoIndexSnapshot["adapters"];
    const warnings = parseJsonArray(meta.get("warnings"));
    const files = db.prepare("SELECT * FROM files ORDER BY path").all().map((row) => ({
      path: String(row.path),
      hash: String(row.hash),
      size: Number(row.size),
      language: String(row.language),
      mtimeMs: Number(row.mtime_ms),
      ignored: Boolean(row.ignored),
      indexedAt: String(row.indexed_at),
    }));
    const symbols = db.prepare("SELECT * FROM symbols ORDER BY file, start_line, name").all().map((row) => ({
      file: String(row.file),
      name: String(row.name),
      kind: String(row.kind),
      exported: Boolean(row.exported),
      signature: String(row.signature),
      startLine: Number(row.start_line),
      endLine: Number(row.end_line),
      parent: rowString(row, "parent"),
    }));
    const edges = db.prepare("SELECT * FROM edges ORDER BY from_path, kind, to_path").all().map((row) => ({
      from: String(row.from_path),
      to: String(row.to_path),
      kind: String(row.kind) as RepoIndexEdge["kind"],
      weight: Number(row.weight),
    }));
    const chunks = db.prepare("SELECT * FROM chunks ORDER BY path, start_line, id").all().map((row) => ({
      id: String(row.id),
      path: String(row.path),
      kind: String(row.kind) as RepoIndexChunk["kind"],
      text: String(row.text),
      startLine: Number(row.start_line),
      endLine: Number(row.end_line),
      tokenEstimate: Number(row.token_estimate),
      trust: String(row.trust) as RepoIndexChunk["trust"],
    }));
    const skills = db.prepare("SELECT * FROM skills ORDER BY name").all().map((row) => ({
      name: String(row.name),
      path: String(row.path),
      hash: String(row.hash),
      trigger: String(row.trigger),
      negativeTriggers: parseJsonArray(String(row.negative_triggers)),
      scope: String(row.scope),
      risk: String(row.risk),
      reviewed: Boolean(row.reviewed),
      trustScore: Number(row.trust_score),
    }));
    const memoryEvents = db.prepare("SELECT * FROM memory_events ORDER BY type, id").all().map((row) => ({
      id: String(row.id),
      type: String(row.type),
      body: String(row.body),
      source: "memory" as const,
      confidence: String(row.confidence) as RepoIndexMemoryEvent["confidence"],
      scope: String(row.scope),
      createdAt: String(row.created_at),
      provenance: String(row.provenance),
    }));
    const runs = db.prepare("SELECT * FROM runs ORDER BY created_at DESC").all().map((row) => ({
      id: String(row.id),
      command: String(row.command),
      exitCode: row.exit_code === null ? null : Number(row.exit_code),
      durationMs: Number(row.duration_ms),
      rawLogPath: String(row.raw_log_path),
      summary: String(row.summary),
      createdAt: String(row.created_at),
    }));
    const embeddings = db.prepare("SELECT * FROM embeddings ORDER BY chunk_id").all().map((row) => ({
      chunkId: String(row.chunk_id),
      provider: String(row.provider),
      model: String(row.model),
      textHash: String(row.text_hash),
      vector: JSON.parse(String(row.vector)) as number[],
    }));
    return {
      version: Number(meta.get("version") ?? INDEX_VERSION),
      backend: "sqlite",
      repoRoot,
      treeHash,
      generatedAt,
      files,
      symbols,
      edges,
      chunks,
      skills,
      memoryEvents,
      runs,
      embeddings,
      adapters: {
        sqlite: normalizeSqliteAdapter(adapters.sqlite),
        treeSitter: adapters.treeSitter ?? "not-installed",
        embeddings: adapters.embeddings ?? "disabled",
      },
      warnings,
    };
  } catch {
    return undefined;
  }
}

async function writeFallback(snapshot: RepoIndexSnapshot, repoRoot: string): Promise<void> {
  await mkdir(path.dirname(fallbackPath(repoRoot)), { recursive: true });
  await writeFile(fallbackPath(repoRoot), JSON.stringify(snapshot, null, 2), "utf8");
}

async function readFallback(repoRoot: string): Promise<RepoIndexSnapshot | undefined> {
  try {
    return JSON.parse(await readFile(fallbackPath(repoRoot), "utf8")) as RepoIndexSnapshot;
  } catch {
    return undefined;
  }
}

function counts(snapshot: RepoIndexSnapshot): RepoIndexStatus["counts"] {
  return {
    files: snapshot.files.length,
    symbols: snapshot.symbols.length,
    edges: snapshot.edges.length,
    chunks: snapshot.chunks.length,
    skills: snapshot.skills.length,
    memoryEvents: snapshot.memoryEvents.length,
    runs: snapshot.runs.length,
    embeddings: snapshot.embeddings.length,
  };
}

async function currentTreeHash(repoRoot: string): Promise<string> {
  const files = (await Promise.all((await repoFiles(repoRoot)).map((file) => readTextFile(repoRoot, file).catch(() => undefined)))).filter(
    (file): file is TextFile => Boolean(file),
  );
  return computeTreeHash(files);
}

export async function buildRepoIndex(repoRoot: string, options: RepoIndexBuildOptions = {}): Promise<RepoIndexBuildResult> {
  const started = Date.now();
  await mkdir(path.dirname(indexPath(repoRoot)), { recursive: true });
  const sqlite = await sqliteModule();
  if (sqlite) {
    const snapshot = await assembleSnapshot(repoRoot, "sqlite", options.home, sqlite.driver);
    const db = new sqlite.DatabaseSync(indexPath(repoRoot));
    try {
      setupSqlite(db);
      resetSqlite(db);
      writeSqlite(db, snapshot);
    } finally {
      db.close();
    }
    return {
      ...(await indexStatus(repoRoot)),
      written: true,
      durationMs: Date.now() - started,
    };
  }

  const snapshot = await assembleSnapshot(repoRoot, "json-fallback", options.home);
  await writeFallback(snapshot, repoRoot);
  return {
    ...(await indexStatus(repoRoot)),
    written: true,
    durationMs: Date.now() - started,
  };
}

export async function readRepoIndex(repoRoot: string): Promise<RepoIndexSnapshot | undefined> {
  const sqlite = await sqliteModule();
  if (sqlite) {
    const absolute = indexPath(repoRoot);
    try {
      const db = new sqlite.DatabaseSync(absolute);
      try {
        setupSqlite(db);
        const snapshot = readSqliteSnapshot(repoRoot, db);
        if (snapshot) {
          return snapshot;
        }
      } finally {
        db.close();
      }
    } catch {
      // Fall through to JSON fallback.
    }
  }
  return readFallback(repoRoot);
}

export async function indexStatus(repoRoot: string): Promise<RepoIndexStatus> {
  const treeHash = await currentTreeHash(repoRoot);
  const snapshot = await readRepoIndex(repoRoot);
  const sqlite = await sqliteModule();
  const adapters: RepoIndexSnapshot["adapters"] = {
    sqlite: sqlite?.driver ?? "unavailable",
    treeSitter: "not-installed",
    embeddings: "disabled",
  };
  if (!snapshot) {
    return {
      exists: false,
      status: "missing",
      path: SQLITE_INDEX,
      fallbackPath: FALLBACK_INDEX,
      treeHash,
      adapters,
      warnings: sqlite ? ["Index has not been built. Run `threadroot index`."] : ["Native SQLite adapter unavailable or not enabled; index will use JSON fallback."],
    };
  }
  const stale = snapshot.treeHash !== treeHash;
  const statusAdapters: RepoIndexSnapshot["adapters"] = {
    ...snapshot.adapters,
    sqlite: adapters.sqlite,
    embeddings: snapshot.adapters.embeddings ?? adapters.embeddings,
    treeSitter: snapshot.adapters.treeSitter ?? adapters.treeSitter,
  };
  const warnings = [...snapshot.warnings];
  if (snapshot.backend === "json-fallback" && adapters.sqlite !== "unavailable" && !warnings.some((warning) => warning.includes("SQLite adapter is now available"))) {
    warnings.push(`${adapters.sqlite} adapter is now available; the next index refresh can upgrade from JSON fallback.`);
  }
  return {
    exists: true,
    status: stale ? "stale" : snapshot.backend === "json-fallback" ? "degraded" : "current",
    backend: snapshot.backend,
    path: snapshot.backend === "sqlite" ? SQLITE_INDEX : FALLBACK_INDEX,
    fallbackPath: FALLBACK_INDEX,
    treeHash,
    storedTreeHash: snapshot.treeHash,
    generatedAt: snapshot.generatedAt,
    counts: counts(snapshot),
    adapters: statusAdapters,
    warnings,
  };
}

function terms(task: string): string[] {
  return [
    ...new Set(
      task
        .toLowerCase()
        .split(/[^a-z0-9_./:-]+/)
        .filter((term) => term.length > 2)
        .filter((term) => !["the", "and", "for", "with", "that", "this", "from", "into", "make", "implement"].includes(term)),
    ),
  ];
}

function addCandidate(
  candidates: Map<string, IndexCandidate>,
  filePath: string,
  score: number,
  reason: string,
  source: string,
  detail: string,
  line?: number,
): void {
  const current = candidates.get(filePath) ?? { path: filePath, score: 0, reasons: [], signals: [] };
  current.score += score;
  if (!current.reasons.includes(reason)) {
    current.reasons.push(reason);
  }
  current.signals.push({ source, score, detail });
  if (line) {
    current.lines = [...new Set([...(current.lines ?? []), line])].sort((a, b) => a - b).slice(0, 8);
  }
  candidates.set(filePath, current);
}

function termCount(text: string, taskTerms: string[]): number {
  const lower = text.toLowerCase();
  return taskTerms.reduce((count, term) => count + (lower.includes(term) ? 1 : 0), 0);
}

function lowSignalPenalty(filePath: string, taskTerms: string[]): number {
  if (filePath.startsWith(".") && !taskTerms.some((term) => filePath.toLowerCase().includes(term))) {
    return 8;
  }
  if (filePath.includes("/cache/") || filePath.includes("/dist/")) {
    return 6;
  }
  return 0;
}

export function scoreIndexCandidates(snapshot: RepoIndexSnapshot, task: string): IndexCandidate[] {
  const taskTerms = terms(task);
  const candidates = new Map<string, IndexCandidate>();
  for (const file of snapshot.files) {
    const pathMatches = termCount(file.path, taskTerms);
    if (pathMatches > 0) {
      addCandidate(candidates, file.path, pathMatches * 7, "index path match", "path", file.path);
    }
  }

  for (const symbol of snapshot.symbols) {
    const score = termCount(`${symbol.name} ${symbol.kind} ${symbol.signature}`, taskTerms);
    if (score > 0) {
      addCandidate(candidates, symbol.file, score * 9 + (symbol.exported ? 2 : 0), "symbol match", "symbol", `${symbol.kind} ${symbol.name}`, symbol.startLine);
    }
  }

  for (const chunk of snapshot.chunks) {
    const score = termCount(`${chunk.path} ${chunk.text}`, taskTerms);
    if (score > 0 && !chunk.path.startsWith(".threadroot/")) {
      const multiplier = chunk.kind === "symbol" ? 6 : chunk.kind === "doc" ? 4 : 3;
      addCandidate(candidates, chunk.path, score * multiplier, `${chunk.kind} chunk match`, "chunk", chunk.text.slice(0, 120), chunk.startLine);
    }
  }

  const seeded = [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, 20);
  const seededPaths = new Set(seeded.map((candidate) => candidate.path));
  for (const edge of snapshot.edges) {
    if (seededPaths.has(edge.from)) {
      addCandidate(candidates, edge.to, edge.weight * 2, `graph ${edge.kind} neighbor`, "graph", `${edge.from} -> ${edge.to}`);
    }
    if (seededPaths.has(edge.to)) {
      addCandidate(candidates, edge.from, edge.weight * 2, `graph ${edge.kind} neighbor`, "graph", `${edge.from} -> ${edge.to}`);
    }
  }

  for (const candidate of candidates.values()) {
    candidate.score = Math.max(1, candidate.score - lowSignalPenalty(candidate.path, taskTerms));
  }

  return [...candidates.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

export function symbolsForFile(snapshot: RepoIndexSnapshot | undefined, filePath: string, limit = 8): RepoIndexSymbol[] {
  return snapshot?.symbols.filter((symbol) => symbol.file === filePath).slice(0, limit) ?? [];
}

export function snippetsForFile(snapshot: RepoIndexSnapshot | undefined, filePath: string, task: string, limit = 2): RepoIndexChunk[] {
  if (!snapshot) {
    return [];
  }
  const taskTerms = terms(task);
  return snapshot.chunks
    .filter((chunk) => chunk.path === filePath)
    .map((chunk) => ({ chunk, score: termCount(chunk.text, taskTerms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.startLine - b.chunk.startLine)
    .slice(0, limit)
    .map((entry) => entry.chunk);
}
