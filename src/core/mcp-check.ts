import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import type { McpServerEntry } from "./mcp-config.js";
import { THREADROOT_VERSION } from "./version.js";

export const REQUIRED_MCP_TOOLS = [
  "context",
  "working_set",
  "repo_map",
  "repo_search",
  "repo_read",
  "skills_find",
  "skills_list",
  "skills_get",
  "tools_list",
  "tools_check",
  "tools_run",
  "tools_create",
  "tools_detect",
  "connections_list",
  "connections_check",
  "connections_create",
  "memory_read",
  "memory_append",
  "web_status",
  "web_fetch",
  "status",
  "doctor",
] as const;

export type McpCheckStatus = "ok" | "warning" | "error";

export type McpCheckReport = {
  status: McpCheckStatus;
  configPath: string;
  entry?: McpServerEntry;
  serverInfo?: unknown;
  tools: string[];
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
    return undefined;
  }

  const command = matchTomlString(table.groups.body, "command");
  const args = matchTomlArray(table.groups.body, "args");
  if (!command || !args) {
    return undefined;
  }
  return { command, args };
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

async function commandExists(command: string): Promise<boolean> {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    try {
      await access(command, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  const paths = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of paths) {
    try {
      await access(path.join(dir, command), constants.X_OK);
      return true;
    } catch {
      // keep looking
    }
  }
  return false;
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
    const missing = REQUIRED_MCP_TOOLS.filter((tool) => !toolNames.includes(tool));
    if (missing.length > 0) {
      return {
        status: "error",
        configPath,
        entry,
        serverInfo: handshake.serverInfo,
        tools: toolNames,
        messages: [`MCP server is missing required tool(s): ${missing.join(", ")}`],
      };
    }

    return {
      status: "ok",
      configPath,
      entry,
      serverInfo: handshake.serverInfo,
      tools: toolNames,
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

function runMcpHandshake(
  entry: McpServerEntry,
  repoRoot: string,
  timeoutMs: number,
): Promise<{ serverInfo: unknown; tools: string[] }> {
  if (process.platform !== "win32") {
    return runOneShotMcpHandshake(entry, repoRoot, timeoutMs);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(entry.command, entry.args, {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let settled = false;
    const finish = (result: { serverInfo: unknown; tools: string[] }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(result);
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(error);
    };
    const timer = setTimeout(() => {
      fail(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let stdout = "";
    let stderr = "";
    let initialized = false;
    let serverInfo: unknown;

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
          finish({
            serverInfo,
            tools: (message.result?.tools ?? []).map((tool) => tool.name),
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
      if (!settled && !initialized && code !== null) {
        fail(new Error(`Server exited before initialize completed (exit ${code})${stderr ? `: ${stderr}` : ""}`));
      }
    });

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "threadroot-check", version: THREADROOT_VERSION },
        },
      })}\n`,
    );
  });
}

async function runOneShotMcpHandshake(
  entry: McpServerEntry,
  repoRoot: string,
  timeoutMs: number,
): Promise<{ serverInfo: unknown; tools: string[] }> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "threadroot-mcp-check-"));
  const inputPath = path.join(tempDir, "input.jsonl");
  const stdoutPath = path.join(tempDir, "stdout.jsonl");
  const stderrPath = path.join(tempDir, "stderr.txt");
  try {
    await writeFile(
      inputPath,
      [
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "threadroot-check", version: THREADROOT_VERSION },
          },
        }),
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
        "",
      ].join("\n"),
      "utf8",
    );

    const commandLine = [
      shellQuote(entry.command),
      ...entry.args.map(shellQuote),
      "<",
      shellQuote(inputPath),
      ">",
      shellQuote(stdoutPath),
      "2>",
      shellQuote(stderrPath),
    ].join(" ");

    await runShell(commandLine, repoRoot, timeoutMs);
    const [stdout, stderr] = await Promise.all([readFile(stdoutPath, "utf8"), readOptional(stderrPath)]);
    if (stderr.trim()) {
      throw new Error(stderr.trim());
    }
    return parseHandshakeOutput(stdout);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function runShell(commandLine: string, repoRoot: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", commandLine], {
      cwd: repoRoot,
      stdio: "ignore",
      env: process.env,
    });
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);

    child.on("error", fail);
    child.on("close", async (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Server exited with status ${code ?? "unknown"}`));
    });
  });
}

function parseHandshakeOutput(stdout: string): { serverInfo: unknown; tools: string[] } {
  let initialized = false;
  let serverInfo: unknown;
  let tools: string[] | undefined;
  for (const line of stdout.split("\n")) {
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
      throw new Error(`Invalid JSON-RPC response: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (message.error) {
      throw new Error(message.error.message ?? "MCP server returned an error");
    }
    if (message.id === 1) {
      initialized = true;
      serverInfo = message.result?.serverInfo;
    }
    if (message.id === 2) {
      tools = (message.result?.tools ?? []).map((tool) => tool.name);
    }
  }

  if (!initialized) {
    throw new Error("Server did not return an initialize response");
  }
  if (!tools) {
    throw new Error("Server did not return a tools/list response");
  }
  return { serverInfo, tools };
}

async function readOptional(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
