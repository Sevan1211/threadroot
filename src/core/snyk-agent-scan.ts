import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ExternalScannerReport } from "./install/source.js";

const run = promisify(execFile);

export type SnykAgentScanOptions = {
  enabled?: boolean;
  required?: boolean;
  command?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_SUMMARY_LENGTH = 8000;

function trimOutput(value: string): string | undefined {
  const clean = value.trim();
  if (!clean) {
    return undefined;
  }
  return clean.length > MAX_SUMMARY_LENGTH ? `${clean.slice(0, MAX_SUMMARY_LENGTH)}\n[truncated]` : clean;
}

async function commandExists(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    await run(command, args, { env, timeout: 10_000 });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    return true;
  }
}

async function resolveSnykCommand(
  env: NodeJS.ProcessEnv,
  commandOverride?: string,
): Promise<{ command: string; argsPrefix: string[] } | undefined> {
  if (commandOverride) {
    return { command: commandOverride, argsPrefix: [] };
  }
  if (await commandExists("snyk-agent-scan", ["--help"], env)) {
    return { command: "snyk-agent-scan", argsPrefix: [] };
  }
  if (await commandExists("uvx", ["--version"], env)) {
    return { command: "uvx", argsPrefix: ["snyk-agent-scan@latest"] };
  }
  return undefined;
}

export async function runSnykAgentScan(
  targetPath: string,
  options: SnykAgentScanOptions = {},
): Promise<ExternalScannerReport> {
  const env = options.env ?? process.env;
  const scannedAt = new Date().toISOString();
  if (options.enabled === false) {
    return {
      provider: "snyk-agent-scan",
      status: "skipped",
      reason: "Snyk Agent Scan disabled for this command.",
      scannedAt,
    };
  }
  if (!env.SNYK_TOKEN && !options.command) {
    return {
      provider: "snyk-agent-scan",
      status: "skipped",
      reason: "SNYK_TOKEN is not set.",
      scannedAt,
    };
  }

  const resolved = await resolveSnykCommand(env, options.command);
  if (!resolved) {
    return {
      provider: "snyk-agent-scan",
      status: "skipped",
      reason: "Neither snyk-agent-scan nor uvx is available.",
      scannedAt,
    };
  }

  const args = [...resolved.argsPrefix, targetPath];
  const command = [resolved.command, ...args];
  try {
    const { stdout, stderr } = await run(resolved.command, args, {
      env,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    return {
      provider: "snyk-agent-scan",
      status: "passed",
      command,
      summary: trimOutput([stdout, stderr].filter(Boolean).join("\n")),
      scannedAt,
    };
  } catch (error) {
    const failed = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: string | number;
      signal?: NodeJS.Signals;
      killed?: boolean;
      message: string;
    };
    if (failed.code === "ENOENT") {
      return {
        provider: "snyk-agent-scan",
        status: "skipped",
        command,
        reason: `${resolved.command} is not available.`,
        scannedAt,
      };
    }
    const timedOut = failed.signal === "SIGTERM" || failed.killed;
    return {
      provider: "snyk-agent-scan",
      status: timedOut ? "failed" : "warn",
      command,
      exitCode: typeof failed.code === "number" ? failed.code : undefined,
      reason: timedOut ? "Snyk Agent Scan timed out." : "Snyk Agent Scan reported findings or failed.",
      summary: trimOutput([failed.stdout, failed.stderr, failed.message].filter(Boolean).join("\n")),
      scannedAt,
    };
  }
}
