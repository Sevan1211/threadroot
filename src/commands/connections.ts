import { createConnection, checkConnections } from "../core/connections/index.js";
import { HarnessError, resolveHarness } from "../core/harness/index.js";
import type { RiskLevel } from "../core/harness/schema.js";

export type ConnectionAddOptions = {
  provider: string;
  command: string;
  description?: string;
  profile?: string;
  risk?: RiskLevel;
  confirm?: boolean;
  healthcheck?: string;
  scope?: "user" | "project";
  force?: boolean;
};

export async function runConnectionsList(repoRoot: string): Promise<void> {
  let harness;
  try {
    harness = await resolveHarness(repoRoot);
  } catch (error) {
    if (error instanceof HarnessError) {
      console.log("No harness found. Run `tr init` first.");
      return;
    }
    throw error;
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
      scope: options.scope,
    },
    { force: options.force },
  );
  console.log(`Created ${created.manifest.scope} connection \`${name}\` at ${created.path}.`);
}

export async function runConnectionsCheck(repoRoot: string): Promise<void> {
  const checks = await checkConnections(repoRoot);
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
