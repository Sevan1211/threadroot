import { createConnection, checkConnections, discoverConnectionCandidates } from "../core/connections/index.js";
import { HarnessError, resolveHarness } from "../core/harness/index.js";
import type { RiskLevel } from "../core/harness/schema.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type ConnectionAddOptions = JsonCliOptions & {
  provider: string;
  command: string;
  description?: string;
  profile?: string;
  risk?: RiskLevel;
  confirm?: boolean;
  healthcheck?: string;
  allow?: string;
  deny?: string;
  scope?: "user" | "project";
  force?: boolean;
};

export type ConnectionsListOptions = JsonCliOptions;
export type ConnectionsCheckOptions = JsonCliOptions;
export type ConnectionsDiscoverOptions = JsonCliOptions & {
  includeMissing?: boolean;
};

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function runConnectionsList(repoRoot: string, options: ConnectionsListOptions = {}): Promise<void> {
  let harness;
  try {
    harness = await resolveHarness(repoRoot);
  } catch (error) {
    if (error instanceof HarnessError) {
      if (options.json) {
        printJson({ connections: [], ok: false, error: "harness_missing", message: "No harness found. Run `threadroot init` first." });
      } else {
        console.log("No harness found. Run `threadroot init` first.");
      }
      return;
    }
    throw error;
  }

  const connections = harness.connections.map((connection) => ({
    name: connection.name,
    origin: connection.origin,
    provider: connection.manifest.provider,
    command: connection.manifest.command,
    profile: connection.manifest.profile,
    risk: connection.manifest.risk,
    confirm: connection.manifest.confirm,
    healthcheck: Boolean(connection.manifest.healthcheck),
    allow: connection.manifest.allow,
    deny: connection.manifest.deny,
  }));
  if (options.json) {
    printJson({ connections });
    return;
  }

  if (harness.connections.length === 0) {
    console.log("No connections defined. Add one with `tr connections add`.");
    return;
  }

  for (const connection of harness.connections) {
    const flags = [
      connection.manifest.provider,
      connection.manifest.risk,
      connection.manifest.confirm ? "confirm" : null,
      connection.manifest.healthcheck ? "healthcheck" : null,
    ]
      .filter(Boolean)
      .join(", ");
    console.log(`${connection.name}  [${flags}]  - ${connection.manifest.description}`);
  }
}

export async function runConnectionsAdd(
  repoRoot: string,
  name: string,
  options: ConnectionAddOptions,
): Promise<void> {
  const created = await createConnection(
    repoRoot,
    {
      name,
      provider: options.provider,
      command: options.command,
      description: options.description,
      profile: options.profile,
      risk: options.risk,
      confirm: options.confirm,
      healthcheck: options.healthcheck,
      allow: parseList(options.allow),
      deny: parseList(options.deny),
      scope: options.scope,
    },
    { force: options.force },
  );
  if (options.json) {
    printJson(created);
  } else {
    console.log(`Created ${created.manifest.scope} connection \`${name}\` at ${created.path}.`);
  }
}

export async function runConnectionsCheck(repoRoot: string, options: ConnectionsCheckOptions = {}): Promise<void> {
  const checks = await checkConnections(repoRoot);
  if (options.json) {
    printJson({ checks });
    if (checks.some((check) => check.status === "error")) {
      process.exitCode = 1;
    }
    return;
  }

  if (checks.length === 0) {
    console.log("No connections defined.");
    return;
  }

  let failures = 0;
  for (const check of checks) {
    console.log(`${check.name}: ${check.status} - ${check.message}`);
    if (check.status === "error") {
      failures += 1;
    }
  }
  if (failures > 0) {
    process.exitCode = 1;
  }
}

export async function runConnectionsDiscover(
  repoRoot: string,
  options: ConnectionsDiscoverOptions = {},
): Promise<void> {
  const report = await discoverConnectionCandidates(repoRoot, { includeMissing: options.includeMissing });
  if (options.json) {
    printJson(report);
    return;
  }

  if (report.candidates.length === 0) {
    console.log("No local CLI connection candidates found.");
    return;
  }

  console.log(
    `connection discovery: ${report.summary.available} available, ${report.summary.configured} configured, ${report.summary.missing} missing`,
  );
  for (const candidate of report.candidates) {
    const flags = [candidate.provider, candidate.status, candidate.risk, candidate.confirm ? "confirm" : null]
      .filter(Boolean)
      .join(", ");
    console.log(`- ${candidate.name} [${flags}] ${candidate.description}`);
    console.log(`  ${candidate.createCommand}`);
  }
}
