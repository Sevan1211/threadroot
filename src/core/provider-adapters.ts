import { findExecutable } from "./command-lookup.js";
import type { AppendTraceEventInput } from "./trace.js";

export type ProviderAdapterId = "codex" | "claude" | "custom";
export type ProviderRunnerId =
  | "codex"
  | "claude"
  | "cursor"
  | "copilot"
  | "gemini"
  | "windsurf"
  | "opencode"
  | "antigravity";

export type ProviderCommandPlan = {
  adapter: ProviderAdapterId;
  command: string;
  args: string[];
  promptViaStdin: boolean;
  outputFormat: "jsonl" | "text";
};

export type ProviderPlanInput = {
  agent: string;
  repoRoot: string;
  prompt: string;
  agentCommand?: string;
  agentArgs?: string[];
  agentAdapter?: ProviderAdapterId;
};

export type ProviderCapability = {
  id: ProviderRunnerId;
  label: string;
  defaultCli?: string;
  aliases: string[];
  automation: {
    status: "default-runner" | "mcp-first" | "custom-command";
    defaultAdapter?: Exclude<ProviderAdapterId, "custom">;
    outputFormat?: ProviderCommandPlan["outputFormat"];
    eventCapture: "jsonl" | "mcp-trace" | "manual";
    safety: string;
  };
  mcp: {
    supported: boolean;
    setup: string[];
    configFiles: string[];
    access: {
      mode: "threadroot-check" | "client-managed";
      checkCommand?: string;
      smokeTools: string[];
      guidance: string;
    };
  };
  compression: string[];
  notes: string[];
  docs: string[];
};

export type ProviderStatus = ProviderCapability & {
  available: boolean;
  executablePath?: string;
  defaultPlan?: ProviderCommandPlan;
};

const CODEX_DOCS = [
  "https://developers.openai.com/codex/cli",
  "https://developers.openai.com/codex/noninteractive",
  "https://developers.openai.com/codex/mcp",
  "https://developers.openai.com/codex/hooks",
];

const CLAUDE_DOCS = [
  "https://code.claude.com/docs/en/cli-reference",
  "https://code.claude.com/docs/en/mcp",
  "https://code.claude.com/docs/en/hooks",
];

const CURSOR_DOCS = ["https://cursor.com/docs/mcp.md"];

const CORE_MCP_SMOKE_TOOLS = ["task_packet", "repo_read", "trace_event"];
const LOOP_MCP_SMOKE_TOOLS = [...CORE_MCP_SMOKE_TOOLS, "loop_next", "improve_latest", "providers_status"];

export const PROVIDER_CAPABILITIES: ProviderCapability[] = [
  {
    id: "codex",
    label: "Codex",
    defaultCli: "codex",
    aliases: ["openai", "openai-codex"],
    automation: {
      status: "default-runner",
      defaultAdapter: "codex",
      outputFormat: "jsonl",
      eventCapture: "jsonl",
      safety: "Uses `codex exec --json --sandbox workspace-write`; avoids deprecated full-auto and danger-full-access flags.",
    },
    mcp: {
      supported: true,
      setup: ["codex mcp add threadroot -- threadroot mcp"],
      configFiles: ["~/.codex/config.toml", ".codex/config.toml"],
      access: {
        mode: "threadroot-check",
        checkCommand: "threadroot mcp check --json",
        smokeTools: LOOP_MCP_SMOKE_TOOLS,
        guidance:
          "Run the Threadroot MCP check before autonomous loops; it launches the configured Codex stdio server and smoke-calls task_packet.",
      },
    },
    compression: [
      "Prefer JSONL event parsing for trace signals.",
      "Store full provider output and expose compact loop summaries with raw log pointers.",
    ],
    notes: [
      "Best automated loop target on this machine when the Codex CLI is installed and authenticated.",
      "Codex CLI and IDE extension share MCP config, so one Threadroot MCP entry should serve both surfaces.",
    ],
    docs: CODEX_DOCS,
  },
  {
    id: "claude",
    label: "Claude Code",
    defaultCli: "claude",
    aliases: ["claude-code", "anthropic"],
    automation: {
      status: "default-runner",
      defaultAdapter: "claude",
      outputFormat: "jsonl",
      eventCapture: "jsonl",
      safety: "Uses print mode with `--permission-mode auto`, stream JSON, turn limits, and no bypass-permissions flags.",
    },
    mcp: {
      supported: true,
      setup: ["claude mcp add threadroot --scope local -- threadroot mcp"],
      configFiles: ["~/.claude.json", ".mcp.json"],
      access: {
        mode: "client-managed",
        smokeTools: LOOP_MCP_SMOKE_TOOLS,
        guidance:
          "Verify Threadroot from Claude Code's MCP tool list before relying on loop tools; Threadroot does not inspect Claude's user config yet.",
      },
    },
    compression: [
      "Use `--exclude-dynamic-system-prompt-sections` for better cache reuse across machines.",
      "Use stream JSON and hook events for compact trace extraction when available.",
    ],
    notes: [
      "MCP setup should stay user/local by default; project `.mcp.json` remains opt-in.",
      "Hooks can add context and capture tool lifecycle events, but Threadroot should keep hook installation explicit.",
    ],
    docs: CLAUDE_DOCS,
  },
  {
    id: "cursor",
    label: "Cursor",
    aliases: ["cursor-agent"],
    automation: {
      status: "mcp-first",
      eventCapture: "mcp-trace",
      safety: "Expose Threadroot through MCP and project/user config; require a custom command until a stable noninteractive runner is verified.",
    },
    mcp: {
      supported: true,
      setup: ["Add `threadroot` to Cursor MCP settings with command `threadroot` and args `[\"mcp\"]`."],
      configFiles: ["~/.cursor/mcp.json", ".cursor/mcp.json"],
      access: {
        mode: "client-managed",
        smokeTools: CORE_MCP_SMOKE_TOOLS,
        guidance: "Verify these tools inside Cursor before using Threadroot as the loop context source.",
      },
    },
    compression: [
      "Keep MCP responses compact with structuredContent and lazy resources.",
      "Use resource links instead of dumping full files or logs into chat.",
    ],
    notes: [
      "Cursor's documented MCP path supports stdio, resources, prompts, tools, and MCP apps.",
      "Threadroot should not invent a default Cursor automation command without a verified local CLI contract.",
    ],
    docs: CURSOR_DOCS,
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    aliases: ["vscode", "github-copilot"],
    automation: {
      status: "mcp-first",
      eventCapture: "mcp-trace",
      safety: "Use VS Code/Copilot MCP configuration and Threadroot trace tools; no default autonomous CLI runner is assumed.",
    },
    mcp: {
      supported: true,
      setup: ["Configure the VS Code MCP server entry for `threadroot mcp`."],
      configFiles: [".vscode/mcp.json"],
      access: {
        mode: "client-managed",
        smokeTools: CORE_MCP_SMOKE_TOOLS,
        guidance: "Verify these tools inside VS Code/Copilot before using Threadroot for agent context.",
      },
    },
    compression: ["Use compact MCP text plus structuredContent and lazy Threadroot resources."],
    notes: ["Treat Copilot as an MCP/app client unless a specific local CLI command is supplied."],
    docs: [],
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    defaultCli: "gemini",
    aliases: ["gemini-cli"],
    automation: {
      status: "custom-command",
      eventCapture: "manual",
      safety: "Supported as a custom provider command until Threadroot adds a verified event-stream adapter.",
    },
    mcp: {
      supported: true,
      setup: ['Add {"mcpServers":{"threadroot":{"command":"threadroot","args":["mcp"]}}} to Gemini CLI user settings.'],
      configFiles: ["Gemini CLI user settings.json"],
      access: {
        mode: "client-managed",
        smokeTools: CORE_MCP_SMOKE_TOOLS,
        guidance: "Verify these tools inside Gemini CLI before using Threadroot context or trace capture.",
      },
    },
    compression: ["Use `threadroot run --brief` and loop verification summaries for noisy command output."],
    notes: ["Pass `--agent-command` and `--agent-adapter custom` for experimental runs."],
    docs: [],
  },
  {
    id: "windsurf",
    label: "Windsurf",
    aliases: ["codeium"],
    automation: {
      status: "mcp-first",
      eventCapture: "mcp-trace",
      safety: "Expose Threadroot through MCP; require a custom command for automated loops.",
    },
    mcp: {
      supported: true,
      setup: ["Add a user/global MCP server named threadroot with command `threadroot` and args `[\"mcp\"]`."],
      configFiles: ["Windsurf MCP settings"],
      access: {
        mode: "client-managed",
        smokeTools: CORE_MCP_SMOKE_TOOLS,
        guidance: "Verify these tools inside Windsurf before using Threadroot context or trace capture.",
      },
    },
    compression: ["Use compact MCP responses and lazy resources."],
    notes: ["No default autonomous local runner is assumed."],
    docs: [],
  },
  {
    id: "opencode",
    label: "OpenCode",
    defaultCli: "opencode",
    aliases: ["open-code"],
    automation: {
      status: "custom-command",
      eventCapture: "manual",
      safety: "Supported as a custom provider command until Threadroot adds a verified event-stream adapter.",
    },
    mcp: {
      supported: true,
      setup: ["Add a user/global MCP server named threadroot with command `threadroot` and args `[\"mcp\"]`."],
      configFiles: ["OpenCode MCP settings"],
      access: {
        mode: "client-managed",
        smokeTools: CORE_MCP_SMOKE_TOOLS,
        guidance: "Verify these tools inside OpenCode before using Threadroot context or trace capture.",
      },
    },
    compression: ["Use verification summaries and raw log pointers for noisy output."],
    notes: ["Pass `--agent-command` for automation experiments."],
    docs: [],
  },
  {
    id: "antigravity",
    label: "Antigravity",
    aliases: ["google-antigravity"],
    automation: {
      status: "mcp-first",
      eventCapture: "mcp-trace",
      safety: "Expose Threadroot through MCP and skills; require a custom command for automated loops.",
    },
    mcp: {
      supported: true,
      setup: ["Add a user/global MCP server named threadroot with command `threadroot` and args `[\"mcp\"]`."],
      configFiles: ["Antigravity MCP settings"],
      access: {
        mode: "client-managed",
        smokeTools: CORE_MCP_SMOKE_TOOLS,
        guidance: "Verify these tools inside Antigravity before using Threadroot context or trace capture.",
      },
    },
    compression: ["Use compact MCP responses and lazy resources."],
    notes: ["No default autonomous local runner is assumed."],
    docs: [],
  },
];

function normalizeAgent(agent: string): ProviderRunnerId | undefined {
  const key = agent.trim().toLowerCase();
  for (const provider of PROVIDER_CAPABILITIES) {
    if (provider.id === key || provider.aliases.includes(key)) {
      return provider.id;
    }
  }
  return undefined;
}

function defaultProviderCommandPlan(agent: ProviderRunnerId, repoRoot: string): ProviderCommandPlan | undefined {
  if (agent === "codex") {
    return {
      adapter: "codex",
      command: "codex",
      args: ["exec", "--json", "--sandbox", "workspace-write", "-C", repoRoot, "-"],
      promptViaStdin: true,
      outputFormat: "jsonl",
    };
  }

  if (agent === "claude") {
    return {
      adapter: "claude",
      command: "claude",
      args: [
        "-p",
        "Execute the Threadroot loop prompt provided on stdin.",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-hook-events",
        "--permission-mode",
        "auto",
        "--max-turns",
        "8",
        "--exclude-dynamic-system-prompt-sections",
        "--no-session-persistence",
      ],
      promptViaStdin: true,
      outputFormat: "jsonl",
    };
  }

  return undefined;
}

function adapterForAgent(agent: string): ProviderAdapterId | undefined {
  const provider = normalizeAgent(agent);
  if (provider === "codex" || provider === "claude") {
    return provider;
  }
  return undefined;
}

export function providerCommandPlan(input: ProviderPlanInput): ProviderCommandPlan {
  if (input.agentCommand) {
    const adapter = input.agentAdapter ?? adapterForAgent(input.agent) ?? "custom";
    return {
      adapter,
      command: input.agentCommand,
      args: input.agentArgs ?? [],
      promptViaStdin: true,
      outputFormat: adapter === "custom" ? "text" : "jsonl",
    };
  }

  const agent = normalizeAgent(input.agent);
  const plan = agent ? defaultProviderCommandPlan(agent, input.repoRoot) : undefined;
  if (plan) {
    return plan;
  }

  throw new Error(
    `No default automated runner is configured for agent \`${input.agent}\`. Use \`threadroot providers --json\` for supported surfaces, or pass --agent-command.`,
  );
}

export async function providerStatuses(repoRoot: string): Promise<ProviderStatus[]> {
  return Promise.all(
    PROVIDER_CAPABILITIES.map(async (provider) => {
      const plan = defaultProviderCommandPlan(provider.id, repoRoot);
      const executablePath = provider.defaultCli ? await findExecutable(provider.defaultCli) : undefined;
      return {
        ...provider,
        available: Boolean(executablePath),
        ...(executablePath ? { executablePath } : {}),
        ...(plan ? { defaultPlan: plan } : {}),
      };
    }),
  );
}

function parseJsonl(output: string): unknown[] {
  const events: unknown[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.startsWith("{")) {
      continue;
    }
    try {
      events.push(JSON.parse(line) as unknown);
    } catch {
      // Provider streams may include non-JSON diagnostics; keep the raw log as source of truth.
    }
  }
  return events;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringField(value: unknown, keys: string[]): string | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  for (const nested of ["item", "data", "event", "message", "tool_input", "tool_response"]) {
    const found = stringField(record[nested], keys);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function numberField(value: unknown, keys: string[]): number | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  for (const nested of ["item", "data", "event", "message", "tool_response"]) {
    const found = numberField(record[nested], keys);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function boolField(value: unknown, keys: string[]): boolean | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "boolean") {
      return candidate;
    }
  }
  for (const nested of ["item", "data", "event", "message", "tool_response"]) {
    const found = boolField(record[nested], keys);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function providerEventType(value: unknown): string {
  const record = asRecord(value);
  return [
    stringField(value, ["type", "event_type", "hook_event_name"]),
    stringField(record?.item, ["type", "item_type", "kind"]),
    stringField(record?.data, ["type", "item_type", "kind"]),
  ]
    .filter(Boolean)
    .join(":")
    .toLowerCase();
}

function providerTraceEvent(value: unknown): AppendTraceEventInput | undefined {
  const type = providerEventType(value);
  const path = stringField(value, ["path", "file_path", "filePath", "filename"]);
  if (path && (type.includes("file") || type.includes("edit") || type.includes("write") || type.includes("patch"))) {
    return {
      type: type.includes("read") ? "read_file" : "edit_file",
      path,
      message: "Captured from provider event stream.",
      data: { providerEventType: type },
    };
  }

  const command = stringField(value, ["command", "cmd", "shell_command", "shellCommand"]);
  if (command && (type.includes("command") || type.includes("exec") || type.includes("bash") || type.includes("shell"))) {
    const exitCode = numberField(value, ["exit_code", "exitCode", "code"]);
    return {
      type: "command",
      command,
      exitCode: exitCode ?? null,
      ok: boolField(value, ["ok", "success"]) ?? (exitCode === undefined ? undefined : exitCode === 0),
      message: "Captured from provider event stream.",
      data: { providerEventType: type },
    };
  }

  const tool = stringField(value, ["tool", "tool_name", "name"]);
  if (tool && (type.includes("tool") || type.includes("mcp"))) {
    return {
      type: "run_tool",
      tool,
      ok: boolField(value, ["ok", "success"]),
      message: "Captured from provider event stream.",
      data: { providerEventType: type },
    };
  }

  return undefined;
}

export function providerTraceEvents(plan: ProviderCommandPlan, stdout: string): AppendTraceEventInput[] {
  if (plan.outputFormat !== "jsonl") {
    return [];
  }
  const events = new Map<string, AppendTraceEventInput>();
  for (const payload of parseJsonl(stdout)) {
    const event = providerTraceEvent(payload);
    if (!event) {
      continue;
    }
    const key = `${event.type}:${event.path ?? ""}:${event.command ?? ""}:${event.tool ?? ""}`;
    const existing = events.get(key);
    if (existing && eventCompleteness(existing) >= eventCompleteness(event)) {
      continue;
    }
    events.set(key, event);
    if (events.size >= 50) {
      break;
    }
  }
  return [...events.values()];
}

function eventCompleteness(event: AppendTraceEventInput): number {
  return [
    event.ok !== undefined,
    event.exitCode !== undefined,
    event.durationMs !== undefined,
    event.message !== undefined,
    event.data !== undefined,
  ].filter(Boolean).length;
}
