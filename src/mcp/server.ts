import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { codexStatus } from "../core/codex.js";
import { createPrepBrief, readLatestScore, tuneLatest } from "../core/codex-optimizer.js";
import { readCodexStateJson } from "../core/codex-state.js";
import { toRepoPath } from "../core/paths.js";
import { THREADROOT_VERSION } from "../core/version.js";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

type ToolSpec = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (repoRoot: string, args: Record<string, unknown>) => Promise<unknown>;
};

const ignoredDirs = new Set([".git", "node_modules", "dist", "coverage", ".codex", ".threadroot"]);
const MAX_SEARCH_BYTES = 256_000;
const DEFAULT_READ_LIMIT = 40_000;

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

const toolRegistry: ToolSpec[] = [
  {
    name: "task_packet",
    title: "Task Packet",
    description: "Create a compact Codex preflight brief before broad repo exploration.",
    inputSchema: objectSchema(
      {
        task: { type: "string" },
        budgetTokens: { type: "number" },
        maxFiles: { type: "number" },
        forceIndex: { type: "boolean" },
        includeResourceLinks: { type: "boolean" },
      },
      ["task"],
    ),
    run: (repoRoot, args) =>
      createPrepBrief(repoRoot, stringArg(args, "task"), {
        budgetTokens: numberArg(args, "budgetTokens"),
        maxFiles: numberArg(args, "maxFiles"),
        forceIndex: booleanArg(args, "forceIndex"),
      }),
  },
  {
    name: "context_budget",
    title: "Context Budget",
    description: "Create a compact Codex preflight brief with strict token budgets.",
    inputSchema: objectSchema(
      {
        task: { type: "string" },
        budgetTokens: { type: "number" },
        hardCapTokens: { type: "number" },
        maxFiles: { type: "number" },
        memory: { type: "string" },
        forceIndex: { type: "boolean" },
      },
      ["task"],
    ),
    run: (repoRoot, args) =>
      createPrepBrief(repoRoot, stringArg(args, "task"), {
        budgetTokens: numberArg(args, "budgetTokens"),
        hardCapTokens: numberArg(args, "hardCapTokens"),
        maxFiles: numberArg(args, "maxFiles"),
        memoryProfile: enumArg(args, "memory", ["tiny", "conservative", "standard"]),
        forceIndex: booleanArg(args, "forceIndex"),
      }),
  },
  {
    name: "repo_search",
    title: "Search Repo",
    description: "Search repo text files with ignore and size limits.",
    inputSchema: objectSchema({ query: { type: "string" }, limit: { type: "number" } }, ["query"]),
    run: async (repoRoot, args) => ({ matches: await searchRepo(repoRoot, stringArg(args, "query"), numberArg(args, "limit") ?? 25) }),
  },
  {
    name: "repo_read",
    title: "Read Repo File",
    description: "Read one repo-relative text file with traversal, binary, ignore, and size protections.",
    inputSchema: objectSchema({ path: { type: "string" }, maxBytes: { type: "number" } }, ["path"]),
    run: (repoRoot, args) => readRepoFile(repoRoot, stringArg(args, "path"), numberArg(args, "maxBytes")),
  },
  {
    name: "score_latest",
    title: "Latest Score",
    description: "Return the latest tokens-to-green score report.",
    inputSchema: objectSchema({}),
    run: async (repoRoot) => (await readLatestScore(repoRoot)) ?? { score: null, message: "No Codex optimizer score has been recorded yet." },
  },
  {
    name: "trace_latest",
    title: "Latest Trace",
    description: "Return the latest Codex run artifact, if any.",
    inputSchema: objectSchema({}),
    run: async (repoRoot) => (await readCodexStateJson(repoRoot, ["runs", "latest.json"])) ?? { trace: null, message: "No Codex run has been recorded yet." },
  },
  {
    name: "tune_latest",
    title: "Tune Latest",
    description: "Create evidence-backed routing and guidance proposals from the latest score.",
    inputSchema: objectSchema({}),
    run: (repoRoot) => tuneLatest(repoRoot),
  },
  {
    name: "codex_status",
    title: "Codex Status",
    description: "Show Codex CLI, runner, and MCP setup status.",
    inputSchema: objectSchema({}),
    run: async (repoRoot) => ({ codex: await codexStatus(repoRoot) }),
  },
];

const tools = toolRegistry.map((tool) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: tool.inputSchema,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}));

const resources = [
  {
    uri: "threadroot://brief/latest",
    name: "Latest Codex Brief",
    title: "Latest Codex Brief",
    mimeType: "application/json",
    description: "Most recent compact Codex preflight brief.",
  },
  {
    uri: "threadroot://score/latest",
    name: "Latest Score",
    title: "Latest Score",
    mimeType: "application/json",
    description: "Most recent tokens-to-green score.",
  },
  {
    uri: "threadroot://tuning/latest",
    name: "Latest Tuning",
    title: "Latest Tuning",
    mimeType: "application/json",
    description: "Most recent evidence-backed tuning report.",
  },
  {
    uri: "threadroot://codex",
    name: "Codex Status",
    title: "Codex Status",
    mimeType: "application/json",
    description: "Codex CLI, runner, and MCP status.",
  },
];

const resourceTemplates = [
  {
    uriTemplate: "threadroot://repo/{path}",
    name: "repo_file",
    title: "Repo File",
    mimeType: "text/plain",
    description: "Read one repo-relative text file.",
  },
];

export async function runMcpServer(repoRoot: string): Promise<void> {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      continue;
    }
    const response = await handleMessage(repoRoot, request);
    if (response) write(response);
  }
}

export async function handleMessage(repoRoot: string, request: JsonRpcRequest): Promise<JsonRpcResponse | undefined> {
  try {
    if (request.method === "initialize") {
      return resultResponse(request, {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "threadroot", version: THREADROOT_VERSION },
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } },
        instructions:
          "Threadroot exposes the repository's local Codex context optimizer. Prefer context_budget/task_packet before broad coding work; they keep context small and write local evidence under .codex/threadroot/. Use repo_search/repo_read only for targeted follow-up, inspect brief/score/tuning/codex resources lazily, and use score_latest/tune_latest after Codex runs to reduce tokens-to-green.",
      });
    }

    if (request.method === "notifications/initialized") return undefined;
    if (request.method === "tools/list") return resultResponse(request, { tools });
    if (request.method === "resources/list") return resultResponse(request, { resources });
    if (request.method === "resources/templates/list") return resultResponse(request, { resourceTemplates });
    if (request.method === "prompts/list") return resultResponse(request, { prompts: [] });
    if (request.method === "prompts/get") throw new Error(`Unknown prompt: ${(request.params as { name?: string } | undefined)?.name ?? "<missing>"}`);

    if (request.method === "resources/read") {
      const uri = (request.params as { uri?: string } | undefined)?.uri;
      const read = await readMcpResource(repoRoot, uri);
      if (!read) throw new Error(`Unknown resource: ${uri ?? "<missing>"}`);
      return resultResponse(request, { contents: [{ uri: read.uri, mimeType: read.mimeType, text: read.text }] });
    }

    if (request.method === "tools/call") {
      const params = request.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      const result = await callTool(repoRoot, params?.name, params?.arguments ?? {});
      return resultResponse(request, result);
    }

    return errorResponse(request, -32601, `Unknown method: ${request.method ?? "<missing>"}`);
  } catch (error) {
    return errorResponse(request, -32000, error instanceof Error ? error.message : String(error));
  }
}

async function callTool(repoRoot: string, name: string | undefined, args: Record<string, unknown>) {
  const tool = toolRegistry.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name ?? "<missing>"}`);
  const structuredContent = normalizeStructuredContent(await tool.run(repoRoot, args));
  return {
    content: [{ type: "text", text: shortToolText(tool.name, structuredContent) }, ...resourceLinksForTool(tool.name, structuredContent, args)],
    structuredContent,
  };
}

async function readMcpResource(repoRoot: string, uri: string | undefined): Promise<{ uri: string; mimeType: string; text: string } | undefined> {
  if (!uri) return undefined;
  if (uri === "threadroot://brief/latest") return jsonResource(uri, (await readCodexStateJson(repoRoot, ["briefs", "latest.json"])) ?? { note: "No brief yet." });
  if (uri === "threadroot://score/latest") return jsonResource(uri, (await readLatestScore(repoRoot)) ?? { note: "No score yet." });
  if (uri === "threadroot://tuning/latest") return jsonResource(uri, (await readCodexStateJson(repoRoot, ["tuning", "latest.json"])) ?? { note: "No tuning report yet." });
  if (uri === "threadroot://codex") return jsonResource(uri, await codexStatus(repoRoot));
  if (uri.startsWith("threadroot://repo/")) {
    const repoPath = decodeURIComponent(uri.slice("threadroot://repo/".length));
    const file = await readRepoFile(repoRoot, repoPath);
    return { uri, mimeType: "text/plain", text: file.content };
  }
  return undefined;
}

function jsonResource(uri: string, value: unknown): { uri: string; mimeType: string; text: string } {
  return { uri, mimeType: "application/json", text: JSON.stringify(value, null, 2) };
}

async function walkFiles(repoRoot: string, directory = repoRoot): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(repoRoot, absolute).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) files.push(...(await walkFiles(repoRoot, absolute)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

async function searchRepo(repoRoot: string, query: string, limit: number): Promise<Array<{ path: string; line: number; preview: string }>> {
  const terms = query.toLowerCase().split(/\s+/u).filter(Boolean);
  const matches: Array<{ path: string; line: number; preview: string }> = [];
  for (const file of await walkFiles(repoRoot)) {
    if (matches.length >= limit) break;
    const absolute = path.join(repoRoot, file);
    const info = await stat(absolute).catch(() => undefined);
    if (!info?.isFile() || info.size > MAX_SEARCH_BYTES) continue;
    const text = await readFile(absolute, "utf8").catch(() => "");
    const lines = text.split(/\r?\n/u);
    for (let index = 0; index < lines.length && matches.length < limit; index += 1) {
      const lower = lines[index]!.toLowerCase();
      if (terms.every((term) => lower.includes(term))) {
        matches.push({ path: file, line: index + 1, preview: lines[index]!.trim().slice(0, 240) });
      }
    }
  }
  return matches;
}

async function readRepoFile(repoRoot: string, repoPath: string, maxBytes = DEFAULT_READ_LIMIT): Promise<{ path: string; sizeBytes: number; truncated: boolean; content: string }> {
  const absolute = toRepoPath(repoRoot, repoPath);
  const normalized = path.relative(repoRoot, absolute).split(path.sep).join("/");
  if (normalized.split("/").some((part) => ignoredDirs.has(part))) {
    throw new Error(`Refusing to read ignored path: ${repoPath}`);
  }
  const info = await stat(absolute);
  if (!info.isFile()) throw new Error(`Not a file: ${repoPath}`);
  const text = await readFile(absolute, "utf8");
  return { path: normalized, sizeBytes: Buffer.byteLength(text), truncated: text.length > maxBytes, content: text.slice(0, maxBytes) };
}

function resourceLinksForTool(name: string, structured: Record<string, unknown>, args: Record<string, unknown>): Array<Record<string, unknown>> {
  if (name !== "task_packet" || args.includeResourceLinks !== true) return [];
  const reads = arrayOfStrings(structured.nextReads) ?? arrayOfStrings(structured.firstReads) ?? [];
  return [
    { type: "resource_link", uri: "threadroot://brief/latest", name: "latest-codex-brief", mimeType: "application/json" },
    ...reads.slice(0, 6).map((repoPath) => ({ type: "resource_link", uri: repoResourceUri(repoPath), name: repoPath, mimeType: "text/plain" })),
  ];
}

function shortToolText(name: string, structured: Record<string, unknown>): string {
  if (name === "task_packet" || name === "context_budget") {
    const reads = arrayOfStrings(structured.firstReads) ?? arrayOfStrings(structured.nextReads) ?? [];
    return [
      `Codex preflight: ${String(structured.id ?? structured.task ?? "brief")}`,
      `Estimated tokens: ${String(structured.promptTokenEstimate ?? structured.tokenEstimate ?? "unknown")}`,
      reads.length > 0 ? `Read first: ${reads.slice(0, 6).join(", ")}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (name === "codex_status") {
    const codex = structured.codex as { available?: boolean; defaultPlan?: { command?: string; args?: string[] }; mcp?: { configured?: boolean } } | undefined;
    return `Threadroot Codex status: ${codex?.available ? "Codex CLI available" : "Codex CLI missing"}. MCP: ${codex?.mcp?.configured ? "configured" : "missing"}.`;
  }
  if (name === "score_latest") {
    return structured.score === null ? "No Codex optimizer score has been recorded yet." : `Latest score: ${String(structured.status ?? "unknown")}`;
  }
  if (name === "tune_latest") {
    return `Tuning proposals: ${Array.isArray(structured.proposals) ? structured.proposals.length : 0}`;
  }
  return JSON.stringify(structured).slice(0, 3_000);
}

function repoResourceUri(repoPath: string): string {
  return `threadroot://repo/${encodeURIComponent(repoPath)}`;
}

function normalizeStructuredContent(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : { value };
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing required string argument: ${key}`);
  return value;
}

function numberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanArg(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
}

function enumArg<T extends string>(args: Record<string, unknown>, key: string, values: readonly T[]): T | undefined {
  const value = args[key];
  return typeof value === "string" && values.includes(value as T) ? (value as T) : undefined;
}

function arrayOfStrings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : undefined;
}

function resultResponse(request: JsonRpcRequest, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: request.id ?? null, result };
}

function errorResponse(request: JsonRpcRequest, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id: request.id ?? null, error: { code, message } };
}

function write(payload: unknown): void {
  output.write(`${JSON.stringify(payload)}\n`);
}
