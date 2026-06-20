import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { stringify as stringifyYaml } from "yaml";

import {
  type ConnectionManifest,
  type LoadedConnection,
  type ObjectScope,
  type RiskLevel,
  connectionManifestSchema,
  projectObjectDir,
  resolveHarness,
  userObjectDir,
} from "../harness/index.js";
import { executeShell, type ToolRunResult } from "../tools/execute.js";

export type ConnectionCheckStatus = "ok" | "warning" | "error";

export type ConnectionCheck = {
  name: string;
  status: ConnectionCheckStatus;
  message: string;
  sourcePath?: string;
  command?: string;
  healthcheck?: ToolRunResult;
};

export type CreateConnectionInput = {
  name: string;
  provider: string;
  command: string;
  description?: string;
  profile?: string;
  risk?: RiskLevel;
  confirm?: boolean;
  healthcheck?: string;
  allow?: string[];
  deny?: string[];
  scope?: ObjectScope;
};

export type CreateConnectionOptions = {
  force?: boolean;
  home?: string;
};

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export class ConnectionCreateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionCreateError";
  }
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function commandExists(command: string): Promise<ToolRunResult> {
  return executeShell(`command -v ${shellQuote(command)}`, { cwd: process.cwd(), timeoutMs: 10_000 });
}

function defaultDescription(input: CreateConnectionInput): string {
  return `Local ${input.provider} CLI connection using \`${input.command}\`.`;
}

export async function createConnection(
  repoRoot: string,
  input: CreateConnectionInput,
  options: CreateConnectionOptions = {},
): Promise<{ path: string; manifest: ConnectionManifest }> {
  if (!NAME_RE.test(input.name)) {
    throw new ConnectionCreateError(
      `Invalid connection name \`${input.name}\`. Use lowercase letters, numbers, and hyphens.`,
    );
  }

  const scope = input.scope ?? "project";
  const candidate = {
    name: input.name,
    provider: input.provider,
    kind: "cli",
    command: input.command,
    description: input.description ?? defaultDescription(input),
    profile: input.profile,
    risk: input.risk ?? "medium",
    confirm: input.confirm ?? (input.risk === "high"),
    healthcheck: input.healthcheck ? { run: input.healthcheck, expectExitCode: 0 } : undefined,
    allow: input.allow ?? [],
    deny: input.deny ?? [],
    scope,
  };

  const parsed = connectionManifestSchema.safeParse(candidate);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new ConnectionCreateError(`Invalid connection definition: ${detail}`);
  }

  const dir =
    scope === "project" ? projectObjectDir(repoRoot, "connections") : userObjectDir("connections", options.home);
  const filePath = path.join(dir, `${input.name}.yaml`);
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, stringifyYaml(parsed.data), { encoding: "utf8", flag: options.force ? "w" : "wx" }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") {
        throw new ConnectionCreateError(
          `Connection \`${input.name}\` already exists at ${filePath}. Pass force to overwrite.`,
        );
      }
      throw error;
    },
  );

  return { path: filePath, manifest: parsed.data };
}

export async function checkConnection(repoRoot: string, connection: LoadedConnection): Promise<ConnectionCheck> {
  const exists = await commandExists(connection.manifest.command);
  if (!exists.ok) {
    return {
      name: connection.name,
      status: "error",
      message: `Command \`${connection.manifest.command}\` was not found on PATH.`,
      sourcePath: connection.sourcePath,
      command: connection.manifest.command,
      healthcheck: exists,
    };
  }

  if (!connection.manifest.healthcheck) {
    return {
      name: connection.name,
      status: "warning",
      message: "No healthcheck configured.",
      sourcePath: connection.sourcePath,
      command: connection.manifest.command,
    };
  }

  const result = await executeShell(connection.manifest.healthcheck.run, { cwd: repoRoot, timeoutMs: 30_000 });
  const expected = connection.manifest.healthcheck.expectExitCode;
  if (result.exitCode !== expected) {
    return {
      name: connection.name,
      status: "error",
      message: `Healthcheck exited ${result.exitCode}; expected ${expected}.`,
      sourcePath: connection.sourcePath,
      command: connection.manifest.command,
      healthcheck: result,
    };
  }

  return {
    name: connection.name,
    status: "ok",
    message: "Connection healthcheck passed.",
    sourcePath: connection.sourcePath,
    command: connection.manifest.command,
    healthcheck: result,
  };
}

export async function checkConnections(repoRoot: string, options: { home?: string } = {}): Promise<ConnectionCheck[]> {
  const harness = await resolveHarness(repoRoot, { home: options.home });
  return Promise.all(harness.connections.map((connection) => checkConnection(repoRoot, connection)));
}
