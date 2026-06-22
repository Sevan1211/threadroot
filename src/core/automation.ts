import { readFile, writeFile } from "node:fs/promises";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { harnessManifestSchema, type AutomationMode, type AutomationPolicy } from "./harness/schema.js";
import { projectManifestPath } from "./harness/paths.js";

export type AutomationStatus = {
  mode: AutomationMode;
  approved: boolean;
  approvedAt?: string;
  approvedBy?: string;
};

export class AutomationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationPolicyError";
  }
}

export async function automationStatus(repoRoot: string): Promise<AutomationStatus> {
  const manifest = harnessManifestSchema.parse(parseYaml(await readFile(projectManifestPath(repoRoot), "utf8")));
  return {
    mode: manifest.automation.mode,
    approved: manifest.automation.mode === "auto-safe",
    approvedAt: manifest.automation.approvedAt,
    approvedBy: manifest.automation.approvedBy,
  };
}

export async function setAutomationPolicy(
  repoRoot: string,
  policy: AutomationPolicy,
): Promise<AutomationStatus> {
  const manifestPath = projectManifestPath(repoRoot);
  const raw = (parseYaml(await readFile(manifestPath, "utf8")) ?? {}) as Record<string, unknown>;
  const next = harnessManifestSchema.parse({
    ...raw,
    automation: policy,
  });
  await writeFile(
    manifestPath,
    stringifyYaml({
      ...raw,
      automation: next.automation,
    }),
    "utf8",
  );
  return automationStatus(repoRoot);
}

export async function approveAutomation(repoRoot: string, approvedBy = "human"): Promise<AutomationStatus> {
  return setAutomationPolicy(repoRoot, {
    mode: "auto-safe",
    approvedAt: new Date().toISOString(),
    approvedBy,
  });
}

export async function resetAutomation(repoRoot: string): Promise<AutomationStatus> {
  return setAutomationPolicy(repoRoot, { mode: "ask" });
}

export async function assertAgentMutationAllowed(repoRoot: string, action: string): Promise<void> {
  const status = await automationStatus(repoRoot);
  if (status.mode === "auto-safe") {
    return;
  }
  if (status.mode === "off") {
    throw new AutomationPolicyError(
      `Project automation is off. Ask the user to run this action manually or change policy before ${action}.`,
    );
  }
  throw new AutomationPolicyError(
    `Project automation is waiting for approval. Ask the user to run \`threadroot automation approve\` before ${action}.`,
  );
}
