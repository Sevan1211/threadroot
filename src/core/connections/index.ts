import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
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

export type ConnectionCandidate = {
  name: string;
  provider: string;
  command: string;
  description: string;
  profile?: string;
  risk: RiskLevel;
  confirm: boolean;
  healthcheck: string;
  allow: string[];
  deny: string[];
  status: "available" | "configured" | "missing";
  executablePath?: string;
  rationale: string;
  terms?: string[];
  createCommand: string;
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

const CONNECTION_TEMPLATES: Array<
  Omit<ConnectionCandidate, "status" | "executablePath" | "createCommand">
> = [
  {
    name: "github-local",
    provider: "github",
    command: "gh",
    description: "Local GitHub CLI connection for issue, pull request, and workflow inspection.",
    risk: "medium",
    confirm: false,
    healthcheck: "gh auth status",
    allow: ["auth status", "repo view", "issue view", "issue list", "pr view", "pr list", "run list", "run view", "api repos/"],
    deny: ["secret", "delete", "workflow run", "release create", "pr merge", "gist", "codespace"],
    rationale:
      "GitHub is the first-class default connection because it carries issues, PR context, checks, and CI evidence; keep writes behind explicit tools.",
    terms: [
      "Use the user's local GitHub CLI authentication and repository permissions.",
      "Prefer read-only issue, PR, repo, and run inspection by default.",
      "Respect GitHub API rate limits and repository visibility; do not scrape or publish private repository data.",
      "Keep merges, releases, workflow dispatches, secrets, and deletion as separate explicit high-risk actions.",
    ],
  },
  {
    name: "docker-local",
    provider: "docker",
    command: "docker",
    description: "Local Docker CLI connection for sandbox and container status checks.",
    risk: "medium",
    confirm: false,
    healthcheck: "docker version",
    allow: ["version", "ps", "images", "inspect", "logs"],
    deny: ["rm", "rmi", "prune", "run --privileged", "exec"],
    rationale: "Container sandboxes are a practical safety boundary for agent verification and package smoke checks.",
  },
  {
    name: "dbt-local",
    provider: "dbt",
    command: "dbt",
    description: "Local dbt CLI connection for metadata, parsing, and non-production project checks.",
    risk: "medium",
    confirm: false,
    healthcheck: "dbt --version",
    allow: ["--version", "parse", "ls", "deps"],
    deny: ["run", "build", "seed", "snapshot"],
    rationale: "dbt projects benefit from structured local discovery before agents run warehouse-affecting commands.",
  },
  {
    name: "snowflake-local",
    provider: "snowflake",
    command: "snow",
    description: "Local Snowflake CLI connection for account/profile inspection.",
    risk: "high",
    confirm: true,
    healthcheck: "snow --version",
    allow: ["--version", "connection list", "connection test"],
    deny: ["sql", "object create", "object drop", "stage copy"],
    rationale: "Data warehouse access crosses a production-data boundary; default to high-risk and confirmation.",
  },
  {
    name: "aws-local",
    provider: "aws",
    command: "aws",
    description: "Local AWS CLI connection for identity and read-only infrastructure inspection.",
    risk: "high",
    confirm: true,
    healthcheck: "aws sts get-caller-identity",
    allow: ["sts get-caller-identity", "configure list", "s3 ls"],
    deny: ["delete", "terminate", "put-", "create-", "update-", "start-", "stop-"],
    rationale: "Cloud CLIs are powerful enough to mutate production; discovery should expose them without auto-authoring.",
  },
  {
    name: "azure-local",
    provider: "azure",
    command: "az",
    description: "Local Azure CLI connection for account and subscription inspection.",
    risk: "high",
    confirm: true,
    healthcheck: "az account show",
    allow: ["account show", "account list", "group list"],
    deny: ["delete", "create", "update", "deployment"],
    rationale: "Azure access should be explicit and auditable before agents use connection-backed tools.",
  },
  {
    name: "gcp-local",
    provider: "gcp",
    command: "gcloud",
    description: "Local Google Cloud CLI connection for active account and project inspection.",
    risk: "high",
    confirm: true,
    healthcheck: "gcloud auth list --filter=status:ACTIVE --format=value(account)",
    allow: ["auth list", "config list", "projects list"],
    deny: ["delete", "create", "update", "deploy", "functions"],
    rationale: "GCP access should be discovered but treated as a high-risk boundary until reviewed.",
  },
  {
    name: "kubernetes-local",
    provider: "kubernetes",
    command: "kubectl",
    description: "Local Kubernetes CLI connection for current-context and read-only cluster inspection.",
    risk: "high",
    confirm: true,
    healthcheck: "kubectl config current-context",
    allow: ["config current-context", "get", "describe", "logs"],
    deny: ["delete", "apply", "create", "patch", "scale", "exec"],
    rationale: "Kubernetes commands can mutate live services; require confirmation and deny common mutation verbs.",
  },
  {
    name: "vercel-local",
    provider: "vercel",
    command: "vercel",
    description: "Local Vercel CLI connection for project/account inspection.",
    risk: "medium",
    confirm: false,
    healthcheck: "vercel whoami",
    allow: ["whoami", "project ls", "env ls", "domains ls"],
    deny: ["deploy", "remove", "env rm", "env add", "domains add"],
    rationale: "Deployment platforms are valuable context sources, but deploy/mutation tools should be separate and confirmed.",
  },
];

export class ConnectionCreateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionCreateError";
  }
}

async function canAccessExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function quoteCli(value: string): string {
  return value.includes(" ") ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function createCommandFor(candidate: Omit<ConnectionCandidate, "status" | "executablePath" | "createCommand">): string {
  const parts = [
    "threadroot",
    "connections",
    "add",
    candidate.name,
    "--provider",
    candidate.provider,
    "--command",
    candidate.command,
    "--risk",
    candidate.risk,
    "--healthcheck",
    candidate.healthcheck,
  ];
  if (candidate.confirm) {
    parts.push("--confirm");
  }
  if (candidate.allow.length > 0) {
    parts.push("--allow", candidate.allow.join(","));
  }
  if (candidate.deny.length > 0) {
    parts.push("--deny", candidate.deny.join(","));
  }
  return parts.map(quoteCli).join(" ");
}

async function findCommand(command: string): Promise<string | undefined> {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return (await canAccessExecutable(command)) ? command : undefined;
  }

  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .filter(Boolean)
          .flatMap((extension) => [extension, extension.toLowerCase()])
      : [""];
  const candidates = process.platform === "win32" && path.extname(command) ? [command] : extensions.map((extension) => `${command}${extension}`);
  for (const dir of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    for (const candidate of candidates) {
      const resolved = path.join(dir, candidate);
      if (await canAccessExecutable(resolved)) {
        return resolved;
      }
    }
  }
  return undefined;
}

export async function discoverConnectionCandidates(
  repoRoot: string,
  options: { home?: string; includeMissing?: boolean } = {},
): Promise<{ candidates: ConnectionCandidate[]; summary: { available: number; configured: number; missing: number } }> {
  const harness = await resolveHarness(repoRoot, { home: options.home }).catch(() => undefined);
  const configured = new Set((harness?.connections ?? []).map((connection) => connection.manifest.provider));
  const byName = new Set((harness?.connections ?? []).map((connection) => connection.name));
  const candidates = await Promise.all(
    CONNECTION_TEMPLATES.map(async (template) => {
      const executablePath = await findCommand(template.command);
      const status =
        configured.has(template.provider) || byName.has(template.name)
          ? "configured"
          : executablePath
            ? "available"
            : "missing";
      return {
        ...template,
        status,
        ...(executablePath ? { executablePath } : {}),
        createCommand: createCommandFor(template),
      } satisfies ConnectionCandidate;
    }),
  );
  const filtered = options.includeMissing ? candidates : candidates.filter((candidate) => candidate.status !== "missing");
  return {
    candidates: filtered,
    summary: {
      available: candidates.filter((candidate) => candidate.status === "available").length,
      configured: candidates.filter((candidate) => candidate.status === "configured").length,
      missing: candidates.filter((candidate) => candidate.status === "missing").length,
    },
  };
}

async function commandExists(command: string): Promise<ToolRunResult> {
  const started = Date.now();
  const found = await findCommand(command);
  return {
    ok: Boolean(found),
    exitCode: found ? 0 : 1,
    signal: null,
    stdout: found ? `${found}\n` : "",
    stderr: found ? "" : `${command} not found\n`,
    durationMs: Date.now() - started,
    timedOut: false,
    command: `resolve ${command}`,
  };
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
