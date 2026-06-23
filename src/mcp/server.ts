import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  AutomationPolicyError,
  assertAgentMutationAllowed,
} from "../core/automation.js";
import {
  HarnessError,
  type EffectiveHarness,
  appendMemory,
  readMemory,
  resolveHarness,
} from "../core/harness/index.js";
import { doctor } from "../core/doctor.js";
import { projectHarnessDir, projectLockPath, userLockPath } from "../core/harness/paths.js";
import { harnessStatus } from "../core/status.js";
import { checkToolHealth, createTool, detectToolCandidates, runTool } from "../core/tools/index.js";
import { checkConnections, createConnection } from "../core/connections/index.js";
import { readLockFile } from "../core/install/lock.js";
import type { LockEntry } from "../core/install/source.js";
import { findSkills } from "../core/skills-find.js";
import { scanSkillPath } from "../core/skills-scan.js";
import { THREADROOT_VERSION } from "../core/version.js";
import { readRepoFile, repoMapStatus, searchRepo, writeRepoMap } from "../core/repo-map.js";
import { indexStatus, readRepoIndex } from "../core/repo-index.js";
import { createRunBrief } from "../core/run-brief.js";
import { runContextEvals } from "../core/context-evals.js";
import { assembleTaskPacket, readLatestTaskPacket, writeLatestTaskPacket } from "../core/task-packet.js";
import { embeddingsStatus } from "../core/embeddings.js";
import { webFetch, webStatus } from "../core/web.js";

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
  description: string;
  inputSchema: Record<string, unknown>;
  args: z.ZodTypeAny;
  run: (repoRoot: string, args: unknown) => Promise<unknown> | unknown;
};

type ResourceSpec = {
  uri: string;
  name: string;
  mimeType: string;
  description: string;
  read: (repoRoot: string) => Promise<unknown> | unknown;
};

function defineTool<Schema extends z.ZodTypeAny>(spec: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  args: Schema;
  run: (repoRoot: string, args: z.infer<Schema>) => Promise<unknown> | unknown;
}): ToolSpec {
  return spec as unknown as ToolSpec;
}

const toolRegistry: ToolSpec[] = [
  defineTool({
    name: "task_packet",
    description:
      "Compile the canonical Threadroot task packet: indexed files, symbols, snippets, tests, commands, skills, memory, risks, and token estimate.",
    inputSchema: objectSchema(
      {
        task: { type: "string", description: "The coding task to compile a task packet for." },
        budgetTokens: { type: "number", description: "Preferred token budget for the response." },
        maxFiles: { type: "number", description: "Maximum ranked non-test files to return." },
        debugRanking: { type: "boolean", description: "Include retrieval scoring details." },
        forceIndex: { type: "boolean", description: "Refresh the repo index before compiling." },
      },
      ["task"],
    ),
    args: z.object({
      task: z.string().min(1),
      budgetTokens: z.number().int().positive().max(100_000).optional(),
      maxFiles: z.number().int().positive().max(100).optional(),
      debugRanking: z.boolean().optional(),
      forceIndex: z.boolean().optional(),
    }),
    run: async (repoRoot, args) => {
      const packet = await assembleTaskPacket(repoRoot, args.task, args);
      await writeLatestTaskPacket(repoRoot, packet);
      return packet;
    },
  }),
  defineTool({
    name: "index_status",
    description: "Return Threadroot repo intelligence index status, backend, freshness, adapters, and object counts.",
    inputSchema: objectSchema({}),
    args: z.object({}),
    run: (repoRoot) => indexStatus(repoRoot),
  }),
  defineTool({
    name: "trace_context",
    description: "Compile a task packet with retrieval debug-ranking evidence for diagnosis.",
    inputSchema: objectSchema(
      { task: { type: "string", description: "The coding task to trace context selection for." } },
      ["task"],
    ),
    args: z.object({ task: z.string().min(1) }),
    run: async (repoRoot, args) => {
      const packet = await assembleTaskPacket(repoRoot, args.task, { debugRanking: true });
      await writeLatestTaskPacket(repoRoot, packet);
      return packet;
    },
  }),
  defineTool({
    name: "eval_context",
    description: "Run Threadroot built-in gold-context retrieval evals and return recall, precision, MRR, nDCG, and token metrics.",
    inputSchema: objectSchema({}),
    args: z.object({}),
    run: (repoRoot) => runContextEvals(repoRoot),
  }),
  defineTool({
    name: "repo_map",
    description: "Return the compact codebase map status and excerpt; optionally refresh .threadroot/memory/repo-map.md.",
    inputSchema: objectSchema({
      write: { type: "boolean", description: "Write or refresh the tracked repo map before returning it." },
    }),
    args: z.object({ write: z.boolean().optional() }),
    run: async (repoRoot, args) => {
      const result = args.write ? await writeRepoMap(repoRoot) : await repoMapStatus(repoRoot);
      return result;
    },
  }),
  defineTool({
    name: "repo_search",
    description: "Search repo text files with ignore and size limits. Use before reading broad source files.",
    inputSchema: objectSchema(
      {
        query: { type: "string", description: "Search query. All terms must appear on a matching line." },
        limit: { type: "number", description: "Maximum number of matches to return." },
      },
      ["query"],
    ),
    args: z.object({ query: z.string().min(1), limit: z.number().int().positive().max(100).optional() }),
    run: async (repoRoot, args) => ({ matches: await searchRepo(repoRoot, args.query, args.limit) }),
  }),
  defineTool({
    name: "repo_read",
    description: "Read one repo-relative text file with traversal, binary, ignore, and size protections.",
    inputSchema: objectSchema(
      {
        path: { type: "string", description: "Repo-relative file path." },
        maxBytes: { type: "number", description: "Maximum text characters to return." },
      },
      ["path"],
    ),
    args: z.object({ path: z.string().min(1), maxBytes: z.number().int().positive().max(100_000).optional() }),
    run: (repoRoot, args) => readRepoFile(repoRoot, args.path, args.maxBytes),
  }),
  defineTool({
    name: "skills_find",
    description: "Find task-specific Agent Skills and return Threadroot install commands.",
    inputSchema: objectSchema({ query: { type: "string", description: "Skill search query." } }, ["query"]),
    args: z.object({ query: z.string().min(1) }),
    run: (_repoRoot, args) => findSkills(args.query),
  }),
  defineTool({
    name: "skills_list",
    description: "List the skills defined in this repo's harness (name, when, tags).",
    inputSchema: objectSchema({}),
    args: z.object({}),
    run: async (repoRoot) => {
      const harness = await loadHarnessOrNull(repoRoot);
      if (!harness) {
        return { skills: [], note: "No harness found. Run `threadroot init` first." };
      }
      const lockEntries = await skillLockEntries(repoRoot);
      return {
        skills: harness.skills.map((skill) => {
          const entry = lockEntries.get(skill.name);
          return {
            name: skill.name,
            when: skill.frontmatter.when,
            tags: skill.frontmatter.tags,
            scope: skill.frontmatter.scope,
            sourcePath: skill.sourcePath,
            risk: entry?.risk ?? "low",
            reviewed: entry ? (entry.reviewed ?? entry.sourceKind === "local") : true,
            provenance: entry?.source,
            registryId: entry?.registryId,
            auditUrl: entry?.auditUrl,
            externalScan: entry?.externalScan,
          };
        }),
      };
    },
  }),
  defineTool({
    name: "skills_get",
    description: "Return a harness skill's full body and metadata by name.",
    inputSchema: objectSchema({ name: { type: "string", description: "Skill name." } }, ["name"]),
    args: z.object({ name: z.string().min(1) }),
    run: async (repoRoot, args) => {
      const harness = await loadHarnessOrNull(repoRoot);
      const skill = harness?.skills.find((entry) => entry.name === args.name);
      if (!skill) {
        throw new Error(`Unknown skill: ${args.name}`);
      }
      const lockEntries = await skillLockEntries(repoRoot);
      const lockEntry = lockEntries.get(skill.name);
      return {
        name: skill.name,
        frontmatter: skill.frontmatter,
        body: skill.body,
        sourcePath: skill.sourcePath,
        provenance: lockEntry,
        scan: await scanSkillPath(pathForScan(skill.sourcePath)),
      };
    },
  }),
  defineTool({
    name: "tools_list",
    description: "List the executable tools defined in this repo's harness (name, inputs, risk, connection, confirm).",
    inputSchema: objectSchema({}),
    args: z.object({}),
    run: async (repoRoot) => {
      const harness = await loadHarnessOrNull(repoRoot);
      if (!harness) {
        return { tools: [], note: "No harness found. Run `threadroot init` to create one." };
      }
      return {
        tools: harness.tools.map((tool) => ({
          name: tool.name,
          description: tool.manifest.description,
          scope: tool.manifest.scope,
          risk: tool.manifest.risk,
          confirm: tool.manifest.confirm,
          connection: tool.manifest.connection,
          healthcheck: Boolean(tool.manifest.healthcheck),
          kind: tool.manifest.run ? "shell" : "script",
          input: tool.manifest.input,
        })),
      };
    },
  }),
  defineTool({
    name: "tools_check",
    description: "Run configured harness tool healthchecks without running primary tool actions.",
    inputSchema: objectSchema({}),
    args: z.object({}),
    run: async (repoRoot) => {
      const harness = await loadHarnessOrNull(repoRoot);
      if (!harness) {
        return { checks: [], note: "No harness found. Run `threadroot init` first." };
      }
      return { checks: await Promise.all(harness.tools.map((tool) => checkToolHealth(repoRoot, tool))) };
    },
  }),
  defineTool({
    name: "tools_run",
    description:
      "Execute a safe harness tool locally. MCP cannot self-confirm risky tools; use `threadroot run <tool> --yes` after human review.",
    inputSchema: objectSchema(
      {
        name: { type: "string", description: "Tool name." },
        input: { type: "object", description: "Tool inputs as key/value pairs.", additionalProperties: true },
        brief: { type: "boolean", description: "Store full output locally and return a compact run summary." },
      },
      ["name"],
    ),
    args: z.object({
      name: z.string().min(1),
      input: z.record(z.unknown()).optional(),
      brief: z.boolean().optional(),
    }),
    run: async (repoRoot, args) => {
      const outcome = await runTool(repoRoot, {
        name: args.name,
        input: args.input,
        confirmed: false,
      });
      if (outcome.status === "blocked") {
        return {
          ok: false,
          blocked: outcome.reason,
          message:
            outcome.reason === "needs-confirmation"
              ? `${outcome.message} Ask the user to run \`threadroot run ${args.name} --yes\` after review.`
              : outcome.message,
        };
      }
      const { result } = outcome;
      if (args.brief) {
        return {
          ok: result.ok,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          durationMs: result.durationMs,
          command: result.command,
          brief: await createRunBrief(repoRoot, result),
        };
      }
      return {
        ok: result.ok,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        command: result.command,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    },
  }),
  defineTool({
    name: "tools_create",
    description:
      "Author a new harness tool (writes a validated manifest; never executes). Agent-created tools default to confirm:true.",
    inputSchema: objectSchema(
      {
        name: { type: "string", description: "Tool name (lowercase, hyphenated)." },
        description: { type: "string", description: "What the tool does." },
        run: { type: "string", description: "Shell command (use {{param}} for inputs)." },
        script: { type: "string", description: "Harness-relative script path (alternative to run)." },
        risk: { type: "string", enum: ["low", "medium", "high"], description: "Risk level." },
        connection: { type: "string", description: "Optional connection dependency." },
        healthcheck: { type: "string", description: "Command that verifies this tool is available." },
        confirm: { type: "boolean", description: "Ask before running. Defaults to true for agents." },
        scope: { type: "string", enum: ["user", "project"], description: "Tool scope." },
        input: {
          type: "object",
          description: "Declared inputs (name -> {type, description, default}).",
          additionalProperties: true,
        },
      },
      ["name", "description"],
    ),
    args: z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      run: z.string().optional(),
      script: z.string().optional(),
      risk: z.enum(["low", "medium", "high"]).optional(),
      connection: z.string().optional(),
      healthcheck: z.string().optional(),
      confirm: z.boolean().optional(),
      scope: z.enum(["user", "project"]).optional(),
      input: z.record(z.unknown()).optional(),
    }),
    run: async (repoRoot, args) => {
      const requestedRisk = args.risk ?? "low";
      if (requestedRisk !== "low") {
        return {
          ok: false,
          blocked: "risk_policy",
          message: "MCP can only create low-risk tools automatically. Ask the user to run `threadroot tools create` for medium/high-risk tools.",
        };
      }
      try {
        await assertAgentMutationAllowed(repoRoot, "creating tools through MCP");
      } catch (error) {
        if (error instanceof AutomationPolicyError) {
          return { ok: false, blocked: "automation_policy", message: error.message };
        }
        throw error;
      }
      const created = await createTool(
        repoRoot,
        {
          name: args.name,
          description: args.description,
          run: args.run,
          script: args.script,
          risk: args.risk,
          connection: args.connection,
          healthcheck: args.healthcheck ? { run: args.healthcheck, expectExitCode: 0 } : undefined,
          confirm: args.confirm,
          scope: args.scope,
          input: args.input as never,
        },
        { actor: "agent" },
      );
      return { path: created.path, scope: created.scope, tool: created.manifest };
    },
  }),
  defineTool({
    name: "tools_detect",
    description: "Propose starter tools from the repo's existing command surface (scripts, Make/just targets).",
    inputSchema: objectSchema({}),
    args: z.object({}),
    run: async (repoRoot) => {
      const harness = await loadHarnessOrNull(repoRoot);
      const profile = harness?.manifest.profile ?? "empty";
      return { candidates: await detectToolCandidates(repoRoot, profile) };
    },
  }),
  defineTool({
    name: "connections_list",
    description: "List local CLI connections defined in this repo's harness.",
    inputSchema: objectSchema({}),
    args: z.object({}),
    run: async (repoRoot) => {
      const harness = await loadHarnessOrNull(repoRoot);
      if (!harness) {
        return { connections: [], note: "No harness found. Run `threadroot init` first." };
      }
      return {
        connections: harness.connections.map((connection) => ({
          name: connection.name,
          provider: connection.manifest.provider,
          command: connection.manifest.command,
          profile: connection.manifest.profile,
          risk: connection.manifest.risk,
          confirm: connection.manifest.confirm,
          healthcheck: Boolean(connection.manifest.healthcheck),
        })),
      };
    },
  }),
  defineTool({
    name: "connections_check",
    description: "Check local CLI connections and their configured healthchecks.",
    inputSchema: objectSchema({}),
    args: z.object({}),
    run: (repoRoot) => checkConnections(repoRoot),
  }),
  defineTool({
    name: "connections_create",
    description:
      "Author a local CLI connection manifest without storing secrets. MCP can only create low-risk connections after project automation approval.",
    inputSchema: objectSchema(
      {
        name: { type: "string", description: "Connection name (lowercase, hyphenated)." },
        provider: { type: "string", description: "Provider name, such as github, aws, azure, gcp, or snowflake." },
        command: { type: "string", description: "Local CLI command, such as gh, aws, az, gcloud, or snow." },
        description: { type: "string", description: "What this connection is for." },
        profile: { type: "string", description: "Local CLI profile/account label." },
        risk: { type: "string", enum: ["low", "medium", "high"], description: "Risk level." },
        confirm: { type: "boolean", description: "Require confirmation before connection-backed tools run." },
        healthcheck: { type: "string", description: "Read-only command that verifies the connection works." },
        allow: { type: "array", items: { type: "string" }, description: "Allowed command fragments." },
        deny: { type: "array", items: { type: "string" }, description: "Denied command fragments." },
        scope: { type: "string", enum: ["user", "project"], description: "Connection scope." },
      },
      ["name", "provider", "command"],
    ),
    args: z.object({
      name: z.string().min(1),
      provider: z.string().min(1),
      command: z.string().min(1),
      description: z.string().optional(),
      profile: z.string().optional(),
      risk: z.enum(["low", "medium", "high"]).optional(),
      confirm: z.boolean().optional(),
      healthcheck: z.string().optional(),
      allow: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
      scope: z.enum(["user", "project"]).optional(),
    }),
    run: async (repoRoot, args) => {
      const requestedRisk = args.risk ?? "medium";
      if (requestedRisk !== "low") {
        return {
          ok: false,
          blocked: "risk_policy",
          message:
            "MCP can only create low-risk connections automatically. Ask the user to run `threadroot connections add` after reviewing medium/high-risk access.",
        };
      }
      try {
        await assertAgentMutationAllowed(repoRoot, "creating connections through MCP");
      } catch (error) {
        if (error instanceof AutomationPolicyError) {
          return { ok: false, blocked: "automation_policy", message: error.message };
        }
        throw error;
      }
      const created = await createConnection(repoRoot, {
        name: args.name,
        provider: args.provider,
        command: args.command,
        description: args.description,
        profile: args.profile,
        risk: args.risk,
        confirm: args.confirm,
        healthcheck: args.healthcheck,
        allow: args.allow,
        deny: args.deny,
        scope: args.scope,
      });
      return { ok: true, path: created.path, connection: created.manifest };
    },
  }),
  defineTool({
    name: "memory_read",
    description: "Read durable harness memory. Returns one type, or all when no type is given.",
    inputSchema: objectSchema({
      type: { type: "string", description: "Memory type (project, repo-map, current-focus, handoff, pitfalls)." },
    }),
    args: z.object({ type: z.string().optional() }),
    run: async (repoRoot, args) => {
      if (args.type) {
        return { type: args.type, body: await readMemory(repoRoot, args.type) };
      }
      const harness = await loadHarnessOrNull(repoRoot);
      return { memory: (harness?.memory ?? []).map((entry) => ({ type: entry.type, body: entry.body })) };
    },
  }),
  defineTool({
    name: "memory_append",
    description: "Append a durable note to a harness memory file (creates it if missing).",
    inputSchema: objectSchema(
      {
        type: { type: "string", description: "Memory type (project, repo-map, current-focus, handoff, pitfalls)." },
        note: { type: "string", description: "The note to append." },
      },
      ["type", "note"],
    ),
    args: z.object({ type: z.string().min(1), note: z.string().min(1) }),
    run: (repoRoot, args) => appendMemory(repoRoot, args.type, args.note),
  }),
  defineTool({
    name: "web_status",
    description: "Return Threadroot web capability status. Native general search is provider/delegated only for now.",
    inputSchema: objectSchema({}),
    args: z.object({}),
    run: () => webStatus(),
  }),
  defineTool({
    name: "web_fetch",
    description:
      "Fetch a known public http(s) URL, extract text, cache provenance locally, and warn that web content is untrusted.",
    inputSchema: objectSchema(
      {
        url: { type: "string", description: "Public http(s) URL to fetch." },
        maxTokens: { type: "number", description: "Maximum approximate tokens of extracted content to return." },
        refresh: { type: "boolean", description: "Ignore cached content and fetch again." },
      },
      ["url"],
    ),
    args: z.object({
      url: z.string().url(),
      maxTokens: z.number().int().positive().max(100_000).optional(),
      refresh: z.boolean().optional(),
    }),
    run: (repoRoot, args) => webFetch(repoRoot, args.url, { maxTokens: args.maxTokens, refresh: args.refresh }),
  }),
  defineTool({
    name: "status",
    description: "Return harness state: manifest, object counts, and drift between canonical and compiled outputs.",
    inputSchema: objectSchema({}),
    args: z.object({}),
    run: (repoRoot) => harnessStatus(repoRoot),
  }),
  defineTool({
    name: "doctor",
    description: "Check harness validity, compiled output health, MCP hints, and tool trust.",
    inputSchema: objectSchema({}),
    args: z.object({}),
    run: (repoRoot) => doctor(repoRoot),
  }),
];

const tools = toolRegistry.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

async function latestRun(repoRoot: string): Promise<unknown> {
  const dir = path.join(projectHarnessDir(repoRoot), "cache", "runs");
  const files = await readdir(dir).catch(() => []);
  const latest = files.filter((file) => file.endsWith(".json")).sort().at(-1);
  if (!latest) {
    return { note: "No run brief has been recorded yet. Use `threadroot run <tool> --brief`." };
  }
  return JSON.parse(await readFile(path.join(dir, latest), "utf8")) as unknown;
}

const resourceRegistry: ResourceSpec[] = [
  {
    uri: "threadroot://repo-map",
    name: "Repo Map",
    mimeType: "application/json",
    description: "Compact repo-map status and excerpt.",
    read: (repoRoot) => repoMapStatus(repoRoot),
  },
  {
    uri: "threadroot://task/latest",
    name: "Latest Task Packet",
    mimeType: "application/json",
    description: "Most recent Threadroot task packet compiled by CLI or MCP.",
    read: async (repoRoot) => (await readLatestTaskPacket(repoRoot)) ?? { note: "No task packet has been compiled yet." },
  },
  {
    uri: "threadroot://runs/latest",
    name: "Latest Run Brief",
    mimeType: "application/json",
    description: "Most recent compact run summary with raw-output pointer.",
    read: latestRun,
  },
  {
    uri: "threadroot://skills",
    name: "Skills",
    mimeType: "application/json",
    description: "Installed skill metadata without loading full skill bodies.",
    read: async (repoRoot) => {
      const harness = await loadHarnessOrNull(repoRoot);
      return {
        skills: (harness?.skills ?? []).map((skill) => ({
          name: skill.name,
          description: skill.frontmatter.description,
          when: skill.frontmatter.when,
          tags: skill.frontmatter.tags,
          scope: skill.frontmatter.scope,
          sourcePath: skill.sourcePath,
        })),
      };
    },
  },
  {
    uri: "threadroot://memory",
    name: "Memory",
    mimeType: "application/json",
    description: "Harness memory entries.",
    read: async (repoRoot) => {
      const harness = await loadHarnessOrNull(repoRoot);
      return { memory: harness?.memory ?? [] };
    },
  },
  {
    uri: "threadroot://index",
    name: "Index Stats",
    mimeType: "application/json",
    description: "Repo intelligence index status and counts.",
    read: (repoRoot) => indexStatus(repoRoot),
  },
  {
    uri: "threadroot://index/snapshot",
    name: "Index Snapshot",
    mimeType: "application/json",
    description: "Current repo intelligence index snapshot; may be larger than index stats.",
    read: async (repoRoot) => (await readRepoIndex(repoRoot)) ?? { note: "No repo index has been built yet." },
  },
  {
    uri: "threadroot://embeddings",
    name: "Embeddings Status",
    mimeType: "application/json",
    description: "Optional embedding adapter status.",
    read: (repoRoot) => embeddingsStatus(repoRoot),
  },
];

const resources = resourceRegistry.map(({ uri, name, mimeType, description }) => ({
  uri,
  name,
  mimeType,
  description,
}));

export async function runMcpServer(repoRoot: string): Promise<void> {
  const lines = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const request = parseRequest(line);
    if (!request) {
      write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      continue;
    }

    const response = await handleMessage(repoRoot, request);
    if (response) {
      write(response);
    }
  }
}

export async function handleMessage(
  repoRoot: string,
  request: JsonRpcRequest,
): Promise<JsonRpcResponse | undefined> {
  try {
    if (request.method === "initialize") {
      return resultResponse(request, {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "threadroot", version: THREADROOT_VERSION },
        capabilities: { tools: {}, resources: {} },
        instructions:
          "Threadroot exposes the repository's local agent harness. Call `task_packet` before broad coding work, use `repo_search`/`repo_read` only for targeted follow-up, inspect `threadroot://index` and `threadroot://task/latest` as lazy resources, run `doctor` for health/trust checks, load full skills only when recommended, and use `memory_append` for durable handoffs.",
      });
    }

    if (request.method === "notifications/initialized") {
      return undefined;
    }

    if (request.method === "tools/list") {
      return resultResponse(request, { tools });
    }

    if (request.method === "resources/list") {
      return resultResponse(request, { resources });
    }

    if (request.method === "resources/read") {
      const params = request.params as { uri?: string } | undefined;
      const resource = resourceRegistry.find((entry) => entry.uri === params?.uri);
      if (!resource) {
        throw new Error(`Unknown resource: ${params?.uri ?? "<missing>"}`);
      }
      const value = await resource.read(repoRoot);
      return resultResponse(request, {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: JSON.stringify(value, null, 2),
          },
        ],
      });
    }

    if (request.method === "tools/call") {
      const params = request.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      const result = await callTool(repoRoot, params?.name, params?.arguments ?? {});
      return resultResponse(request, {
        content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
        structuredContent: result,
      });
    }

    return errorResponse(request, -32601, `Unknown method: ${request.method ?? "<missing>"}`);
  } catch (error) {
    return errorResponse(request, -32000, error instanceof Error ? error.message : String(error));
  }
}

async function callTool(repoRoot: string, name: string | undefined, rawArgs: Record<string, unknown>): Promise<unknown> {
  const tool = toolRegistry.find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name ?? "<missing>"}`);
  }

  const parsed = tool.args.safeParse(rawArgs);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for ${tool.name}: ${formatZodIssues(parsed.error)}`);
  }

  return tool.run(repoRoot, parsed.data);
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`).join("; ");
}

async function loadHarnessOrNull(repoRoot: string): Promise<EffectiveHarness | null> {
  try {
    return await resolveHarness(repoRoot);
  } catch (error) {
    if (error instanceof HarnessError) {
      return null;
    }
    throw error;
  }
}

async function skillLockEntries(repoRoot: string): Promise<Map<string, LockEntry>> {
  const [projectLock, userLock] = await Promise.all([
    readLockFile(projectLockPath(repoRoot)),
    readLockFile(userLockPath()),
  ]);
  const entries = new Map<string, LockEntry>();
  for (const entry of userLock.objects) {
    if (entry.kind === "skill") entries.set(entry.name, entry);
  }
  for (const entry of projectLock.objects) {
    if (entry.kind === "skill") entries.set(entry.name, entry);
  }
  return entries;
}

function pathForScan(skillSourcePath: string): string {
  return path.basename(skillSourcePath) === "SKILL.md" ? path.dirname(skillSourcePath) : skillSourcePath;
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function parseRequest(line: string): JsonRpcRequest | undefined {
  try {
    return JSON.parse(line) as JsonRpcRequest;
  } catch {
    return undefined;
  }
}

function resultResponse(request: JsonRpcRequest, result: unknown): JsonRpcResponse | undefined {
  if (request.id === undefined) {
    return undefined;
  }
  return { jsonrpc: "2.0", id: request.id, result };
}

function errorResponse(request: JsonRpcRequest, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id: request.id ?? null, error: { code, message } };
}

function write(payload: unknown): void {
  output.write(`${JSON.stringify(payload)}\n`);
}
