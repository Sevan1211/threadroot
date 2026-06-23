import { type EffectiveHarness, resolveHarness } from "../harness/index.js";
import type { LoadedTool } from "../harness/load.js";
import { projectLockPath, userLockPath } from "../harness/paths.js";
import { externalToolNames, readLockFile } from "../install/lock.js";
import { appendTraceEventIfActive } from "../trace.js";
import { authorizeTool } from "./authorize.js";
import { authorizeConnectionCommand } from "./connection-policy.js";
import { type ToolRunResult, executeScript, executeShell } from "./execute.js";
import { inputEnv, interpolateRun, resolveInputs } from "./interpolate.js";

export * from "./interpolate.js";
export * from "./execute.js";
export * from "./authorize.js";
export * from "./create.js";
export * from "./catalog.js";

export class ToolNotFoundError extends Error {
  constructor(name: string) {
    super(`Unknown tool: \`${name}\`.`);
    this.name = "ToolNotFoundError";
  }
}

export type RunToolOptions = {
  /** Pre-resolved harness; loaded from disk when omitted. */
  harness?: EffectiveHarness;
  name: string;
  input?: Record<string, unknown>;
  confirmed?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  home?: string;
};

export type RunToolOutcome =
  | { status: "blocked"; tool: string; reason: "needs-confirmation" | "not-allowed"; message: string }
  | { status: "ran"; tool: string; result: ToolRunResult };

export type ToolHealthCheck =
  | { status: "skipped"; tool: string; message: string }
  | { status: "ok"; tool: string; result: ToolRunResult }
  | { status: "error"; tool: string; message: string; result?: ToolRunResult };

/**
 * Resolve, authorize, interpolate, and execute a harness tool. The single
 * orchestration path shared by the MCP server and the `tr` CLI.
 */
export async function runTool(repoRoot: string, options: RunToolOptions): Promise<RunToolOutcome> {
  const harness = options.harness ?? (await resolveHarness(repoRoot, { home: options.home }));
  const tool = harness.tools.find((entry) => entry.name === options.name);
  if (!tool) {
    throw new ToolNotFoundError(options.name);
  }

  // Provenance gate: tools installed from external sources are untrusted until
  // explicitly allow-listed (recorded in project/user lock.json).
  const [projectLock, userLock] = await Promise.all([
    readLockFile(projectLockPath(repoRoot)),
    readLockFile(userLockPath(options.home)),
  ]);
  const external = new Set([...externalToolNames(projectLock), ...externalToolNames(userLock)]);
  const connection = tool.manifest.connection
    ? harness.connections.find((entry) => entry.name === tool.manifest.connection)
    : undefined;
  if (tool.manifest.connection && !connection) {
    await appendTraceEventIfActive(repoRoot, {
      type: "tool_blocked",
      tool: tool.name,
      message: `Unknown connection ${tool.manifest.connection}.`,
    });
    return {
      status: "blocked",
      tool: tool.name,
      reason: "not-allowed",
      message: `\`${tool.name}\` references unknown connection \`${tool.manifest.connection}\`.`,
    };
  }

  const decision = authorizeTool(tool, {
    allow: harness.manifest.tools.allow,
    confirmed: options.confirmed,
    trusted: !external.has(tool.name),
    connectionRisk: connection?.manifest.risk,
  });
  if (!decision.allowed) {
    await appendTraceEventIfActive(repoRoot, {
      type: "tool_blocked",
      tool: tool.name,
      message: decision.message,
    });
    return { status: "blocked", tool: tool.name, reason: decision.reason, message: decision.message };
  }

  const values = resolveInputs(tool.manifest, options.input);
  const env = inputEnv(values);
  const execOptions = { cwd: repoRoot, env, timeoutMs: options.timeoutMs, signal: options.signal };
  const command = tool.manifest.run ? interpolateRun(tool.manifest.run, values) : undefined;

  if (connection) {
    const connectionDecision = authorizeConnectionCommand(connection, command);
    if (!connectionDecision.allowed) {
      await appendTraceEventIfActive(repoRoot, {
        type: "tool_blocked",
        tool: tool.name,
        command,
        message: connectionDecision.message,
      });
      return {
        status: "blocked",
        tool: tool.name,
        reason: "not-allowed",
        message: connectionDecision.message,
      };
    }
  }

  const result = command
    ? await executeShell(command, execOptions)
    : await executeScript(repoRoot, tool.manifest.script!, execOptions);

  await appendTraceEventIfActive(repoRoot, {
    type: "run_tool",
    tool: tool.name,
    command: result.command,
    exitCode: result.exitCode,
    ok: result.ok,
    durationMs: result.durationMs,
    message: result.timedOut ? "Tool timed out." : result.ok ? "Tool passed." : "Tool failed.",
  });

  return { status: "ran", tool: tool.name, result };
}

export async function checkToolHealth(repoRoot: string, tool: LoadedTool): Promise<ToolHealthCheck> {
  if (!tool.manifest.healthcheck) {
    return { status: "skipped", tool: tool.name, message: "No healthcheck configured." };
  }
  const result = await executeShell(tool.manifest.healthcheck.run, { cwd: repoRoot, timeoutMs: 30_000 });
  const expected = tool.manifest.healthcheck.expectExitCode;
  if (result.exitCode !== expected) {
    return {
      status: "error",
      tool: tool.name,
      message: `Healthcheck exited ${result.exitCode}; expected ${expected}.`,
      result,
    };
  }
  return { status: "ok", tool: tool.name, result };
}
