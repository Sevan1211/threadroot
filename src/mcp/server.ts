import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { z } from "zod";
import {
  HarnessError,
  type EffectiveHarness,
  appendMemory,
  assembleContext,
  readMemory,
  resolveHarness,
} from "../core/harness/index.js";
import { doctor } from "../core/doctor.js";
import { harnessStatus } from "../core/status.js";
import { checkToolHealth, createTool, detectToolCandidates, runTool } from "../core/tools/index.js";
import { checkConnections } from "../core/connections/index.js";
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
  description: string;
  inputSchema: Record<string, unknown>;
  args: z.ZodTypeAny;
  run: (repoRoot: string, args: unknown) => Promise<unknown> | unknown;
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
    name: "context",
    description: "Return the task-relevant harness slice: ranked skills, rules, tools, and memory.",
    inputSchema: objectSchema(
      { task: { type: "string", description: "The coding task to assemble context for." } },
      ["task"],
    ),
    args: z.object({ task: z.string().min(1) }),
    run: async (repoRoot, args) => {
      const harness = await loadHarnessOrNull(repoRoot);
      if (!harness) {
        return { note: "No harness found. Run `tr init` first." };
      }
      return assembleContext(repoRoot, args.task, { harness });
    },
  }),
  defineTool({
    name: "skills_list",
    description: "List the skills defined in this repo's harness (name, when, tags).",
    inputSchema: objectSchema({}),
    args: z.object({}),
    run: async (repoRoot) => {
      const harness = await loadHarnessOrNull(repoRoot);
      if (!harness) {
        return { skills: [], note: "No harness found. Run `tr init` first." };
      }
      return {
        skills: harness.skills.map((skill) => ({
          name: skill.name,
          when: skill.frontmatter.when,
          tags: skill.frontmatter.tags,
          scope: skill.frontmatter.scope,
        })),
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
      return { name: skill.name, frontmatter: skill.frontmatter, body: skill.body, sourcePath: skill.sourcePath };
    },
  }),
  defineTool({
    name: "tools_list",
    description: "List the executable tools defined in this repo's harness (name, inputs, confirm).",
    inputSchema: objectSchema({}),
    args: z.object({}),
    run: async (repoRoot) => {
      const harness = await loadHarnessOrNull(repoRoot);
      if (!harness) {
        return { tools: [], note: "No harness found. Run `tr init` to create one." };
      }
      return {
        tools: harness.tools.map((tool) => ({
          name: tool.name,
          description: tool.manifest.description,
          scope: tool.manifest.scope,
          confirm: tool.manifest.confirm,
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
        return { checks: [], note: "No harness found. Run `tr init` first." };
      }
      return { checks: await Promise.all(harness.tools.map((tool) => checkToolHealth(repoRoot, tool))) };
    },
  }),
  defineTool({
    name: "tools_run",
    description:
      "Execute a harness tool locally. Tools marked confirm:true require `confirm: true` after user approval.",
    inputSchema: objectSchema(
      {
        name: { type: "string", description: "Tool name." },
        input: { type: "object", description: "Tool inputs as key/value pairs.", additionalProperties: true },
        confirm: { type: "boolean", description: "Confirm running a tool that requires confirmation." },
      },
      ["name"],
    ),
    args: z.object({
      name: z.string().min(1),
      input: z.record(z.unknown()).optional(),
      confirm: z.boolean().optional(),
    }),
    run: async (repoRoot, args) => {
      const outcome = await runTool(repoRoot, {
        name: args.name,
        input: args.input,
        confirmed: args.confirm,
      });
      if (outcome.status === "blocked") {
        return { ok: false, blocked: outcome.reason, message: outcome.message };
      }
      const { result } = outcome;
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
      confirm: z.boolean().optional(),
      scope: z.enum(["user", "project"]).optional(),
      input: z.record(z.unknown()).optional(),
    }),
    run: async (repoRoot, args) => {
      const created = await createTool(
        repoRoot,
        {
          name: args.name,
          description: args.description,
          run: args.run,
          script: args.script,
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
        return { connections: [], note: "No harness found. Run `tr init` first." };
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
        capabilities: { tools: {} },
        instructions:
          "Threadroot exposes the repository's AI agent harness. Call `context` before broad coding work, `doctor` for health and trust checks, inspect skills/tools before risky actions, and use `memory_append` for durable handoffs.",
      });
    }

    if (request.method === "notifications/initialized") {
      return undefined;
    }

    if (request.method === "tools/list") {
      return resultResponse(request, { tools });
    }

    if (request.method === "tools/call") {
      const params = request.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      const result = await callTool(repoRoot, params?.name, params?.arguments ?? {});
      return resultResponse(request, {
        content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
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
