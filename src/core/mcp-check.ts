import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { commandExists } from "./command-lookup.js";
import type { McpServerEntry } from "./mcp-config.js";
import { THREADROOT_VERSION } from "./version.js";

export const REQUIRED_MCP_TOOLS = [
  "task_packet",
  "context_budget",
  "trace_latest",
  "codex_status",
  "score_latest",
  "tune_latest",
  "repo_search",
  "repo_read",
] as const;

export type McpCheckStatus = "ok" | "warning" | "error";

export type McpCheckReport = {
  status: McpCheckStatus;
  configPath: string;
  entry?: McpServerEntry;
  serverInfo?: unknown;
  serverVersion?: string;
  tools: string[];
  taskPacketSmoke?: { ok: boolean; message: string };
  messages: string[];
};

export function codexConfigPath(home = homedir()): string {
  return path.join(home, ".codex", "config.toml");
}

export function mcpEntryForCurrentProcess(): McpServerEntry {
  return mcpEntryForScriptPath(process.argv[1]);
}

export function mcpEntryForScriptPath(rawScriptPath: string | undefined): McpServerEntry {
  const scriptPath = currentScriptPath(rawScriptPath);
  if (scriptPath && isNpxPackagePath(scriptPath)) {
    return { command: "npx", args: ["--yes", `threadroot@${THREADROOT_VERSION}`, "mcp"] };
  }
  if (scriptPath && path.basename(scriptPath) === "index.js" && scriptPath.includes(`${path.sep}dist${path.sep}`)) {
    return { command: process.execPath, args: [scriptPath, "mcp"] };
  }
  return { command: "threadroot", args: ["mcp"] };
}

function currentScriptPath(scriptPath: string | undefined): string | undefined {
  if (!scriptPath) {
    return undefined;
  }
  try {
    return realpathSync(scriptPath);
  } catch {
    return scriptPath;
  }
}

function isNpxPackagePath(scriptPath: string): boolean {
  const normalized = scriptPath.split(path.sep).join("/");
  return normalized.includes("/.npm/_npx/") && normalized.includes("/node_modules/threadroot/");
}

export async function readCodexThreadrootMcpEntry(home = homedir()): Promise<McpServerEntry | undefined> {
  let raw: string;
  try {
    raw = await readFile(codexConfigPath(home), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  const table = raw.match(/(?:^|\n)\[mcp_servers\.threadroot\]\s*\n(?<body>[\s\S]*?)(?=\n\[|$)/);
  if (!table?.groups?.body) {
    return home === homedir() ? readCodexThreadrootMcpEntryFromCli() : undefined;
  }

  const command = matchTomlString(table.groups.body, "command");
  const args = matchTomlArray(table.groups.body, "args");
  if (!command || !args) {
    return home === homedir() ? readCodexThreadrootMcpEntryFromCli() : undefined;
  }
  return { command, args };
}

async function readCodexThreadrootMcpEntryFromCli(): Promise<McpServerEntry | undefined> {
  const command = process.platform === "win32" ? "codex.exe" : "codex";
  return new Promise((resolve) => {
    const child = spawn(command, ["mcp", "get", "threadroot", "--json"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (entry: McpServerEntry | undefined): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(entry);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(undefined);
    }, 4_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", () => finish(undefined));
    child.on("close", (code) => {
      if (code !== 0 || stderr.trim()) {
        finish(undefined);
        return;
      }
      try {
        const payload = JSON.parse(stdout) as {
          enabled?: boolean;
          transport?: { type?: string; command?: string; args?: unknown };
        };
        const args = Array.isArray(payload.transport?.args)
          ? payload.transport.args.filter((value): value is string => typeof value === "string")
          : undefined;
        if (payload.enabled === false || payload.transport?.type !== "stdio" || !payload.transport.command || !args) {
          finish(undefined);
          return;
        }
        finish({ command: payload.transport.command, args });
      } catch {
        finish(undefined);
      }
    });
  });
}

function matchTomlString(body: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`^${escaped}\\s*=\\s*"(?<value>(?:[^"\\\\]|\\\\.)*)"\\s*$`, "m"));
  return match?.groups?.value?.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function matchTomlArray(body: string, key: string): string[] | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`^${escaped}\\s*=\\s*\\[(?<value>.*)\\]\\s*$`, "m"));
  if (!match?.groups?.value) {
    return undefined;
  }
  const values: string[] = [];
  const pattern = /"((?:[^"\\]|\\.)*)"/g;
  let value: RegExpExecArray | null;
  while ((value = pattern.exec(match.groups.value))) {
    values.push(value[1]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
  }
  return values;
}

export async function checkCodexMcp(input: {
  repoRoot: string;
  home?: string;
  timeoutMs?: number;
}): Promise<McpCheckReport> {
  const configPath = codexConfigPath(input.home);
  const entry = await readCodexThreadrootMcpEntry(input.home);
  if (!entry) {
    return {
      status: "warning",
      configPath,
      tools: [],
      messages: ["No Codex Threadroot MCP config found."],
    };
  }

  if (!(await commandExists(entry.command))) {
    return {
      status: "error",
      configPath,
      entry,
      tools: [],
      messages: [`MCP command is not executable or not on PATH: ${entry.command}`],
    };
  }

  try {
    const handshake = await runMcpHandshake(entry, input.repoRoot, input.timeoutMs ?? 4000);
    const toolNames = handshake.tools;
    const serverVersion = versionFromServerInfo(handshake.serverInfo);
    const missing = REQUIRED_MCP_TOOLS.filter((tool) => !toolNames.includes(tool));
    if (missing.length > 0) {
      return {
        status: "error",
        configPath,
        entry,
        serverInfo: handshake.serverInfo,
        serverVersion,
        tools: toolNames,
        taskPacketSmoke: handshake.taskPacketSmoke,
        messages: [`MCP server is missing required tool(s): ${missing.join(", ")}`],
      };
    }

    if (serverVersion && serverVersion !== THREADROOT_VERSION) {
      return {
        status: "warning",
        configPath,
        entry,
        serverInfo: handshake.serverInfo,
        serverVersion,
        tools: toolNames,
        taskPacketSmoke: handshake.taskPacketSmoke,
        messages: [
          `MCP server version ${serverVersion} differs from local Threadroot ${THREADROOT_VERSION}. Update/reinstall the global Threadroot package, rerun \`threadroot codex install --refresh-skill\` if the command path changes, and restart the Codex session before judging routing quality.`,
        ],
      };
    }

    return {
      status: "ok",
      configPath,
      entry,
      serverInfo: handshake.serverInfo,
      serverVersion,
      tools: toolNames,
      taskPacketSmoke: handshake.taskPacketSmoke,
      messages: ["MCP server initialized and returned the expected Threadroot tools."],
    };
  } catch (error) {
    return {
      status: "error",
      configPath,
      entry,
      tools: [],
      messages: [`MCP handshake failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

function versionFromServerInfo(serverInfo: unknown): string | undefined {
  if (!serverInfo || typeof serverInfo !== "object") {
    return undefined;
  }
  const value = (serverInfo as { version?: unknown }).version;
  return typeof value === "string" ? value : undefined;
}

function runMcpHandshake(
  entry: McpServerEntry,
  repoRoot: string,
  timeoutMs: number,
): Promise<{ serverInfo: unknown; tools: string[]; taskPacketSmoke?: { ok: boolean; message: string } }> {
  return new Promise((resolve, reject) => {
    const child = spawn(entry.command, entry.args, {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let settled = false;
    let closed = false;
    let closeError: Error | undefined;
    const settleAfterClose = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (closed) {
        complete();
        return;
      }
      let completed = false;
      const cleanupTimers: { kill?: NodeJS.Timeout; force?: NodeJS.Timeout } = {};
      const finishCleanup = (): void => {
        if (completed) return;
        completed = true;
        if (cleanupTimers.kill) clearTimeout(cleanupTimers.kill);
        if (cleanupTimers.force) clearTimeout(cleanupTimers.force);
        complete();
      };
      child.once("close", finishCleanup);
      try {
        child.stdin.end();
      } catch {
        // Fall through to timed termination.
      }
      cleanupTimers.kill = setTimeout(() => terminateMcpChild(child), 250);
      cleanupTimers.force = setTimeout(finishCleanup, 3_000);
    };
    const finish = (result: { serverInfo: unknown; tools: string[]; taskPacketSmoke?: { ok: boolean; message: string } }): void => {
      settleAfterClose(() => resolve(result));
    };
    const fail = (error: Error): void => {
      closeError = error;
      settleAfterClose(() => reject(closeError ?? error));
    };
    const timer = setTimeout(() => {
      fail(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let stdout = "";
    let stderr = "";
    let initialized = false;
    let serverInfo: unknown;
    let listedTools: string[] = [];

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      const lines = stdout.split("\n");
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        let message: {
          id?: number;
          result?: { serverInfo?: unknown; tools?: Array<{ name: string }> };
          error?: { message?: string };
        };
        try {
          message = JSON.parse(line) as typeof message;
        } catch (error) {
          fail(new Error(`Invalid JSON-RPC response: ${error instanceof Error ? error.message : String(error)}`));
          return;
        }
        if (message.error) {
          fail(new Error(message.error.message ?? "MCP server returned an error"));
          return;
        }
        if (message.id === 1) {
          initialized = true;
          serverInfo = message.result?.serverInfo;
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
        }
        if (message.id === 2) {
          const tools = (message.result?.tools ?? []).map((tool) => tool.name);
          listedTools = tools;
          if (!tools.includes("task_packet")) {
            finish({ serverInfo, tools });
            return;
          }
          child.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 3,
              method: "tools/call",
              params: {
                name: "task_packet",
                arguments: {
                  task: "threadroot MCP smoke check",
                  budgetTokens: 500,
                  maxFiles: 1,
                  includeResourceLinks: false,
                },
              },
            })}\n`,
          );
        }
        if (message.id === 3) {
          const content = (message.result as { content?: Array<{ type?: string }> } | undefined)?.content ?? [];
          const structuredContent = (message.result as { structuredContent?: unknown } | undefined)?.structuredContent;
          const hasOnlyTextContent = content.length > 0 && content.every((entry) => entry.type === "text");
          const hasStructuredPacket =
            structuredContent !== null &&
            typeof structuredContent === "object" &&
            typeof (structuredContent as { task?: unknown }).task === "string";
          if (!hasOnlyTextContent || !hasStructuredPacket) {
            fail(new Error("task_packet smoke returned an unexpected response shape"));
            return;
          }
          finish({
            serverInfo,
            tools: listedTools,
            taskPacketSmoke: { ok: true, message: "task_packet returned text content and structuredContent." },
          });
        }
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      fail(error);
    });
    child.on("close", (code) => {
      closed = true;
      if (!settled && !initialized && code !== null) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Server exited before initialize completed (exit ${code})${stderr ? `: ${stderr}` : ""}`));
      }
    });

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "threadroot-check", version: THREADROOT_VERSION },
        },
      })}\n`,
    );
  });
}

function terminateMcpChild(child: ChildProcessWithoutNullStreams): void {
  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.on("error", () => {
      child.kill();
    });
    return;
  }
  child.kill("SIGTERM");
}
