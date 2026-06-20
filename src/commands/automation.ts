import {
  automationFiles,
  formatAutomationStatus,
  readAutomationConfig,
  setAutomationEnabled,
} from "../core/automation.js";
import { applyWrites, planWrites } from "../core/writer.js";
import { printPlan, promptForPolicy } from "./shared.js";

export type AutomationSetOptions = {
  dryRun?: boolean;
  yes?: boolean;
};

export async function runAutomationStatus(repoRoot: string): Promise<void> {
  const config = await readAutomationConfig(repoRoot);
  console.log(formatAutomationStatus(config));
}

export async function runAutomationSet(
  repoRoot: string,
  enabled: boolean,
  options: AutomationSetOptions,
): Promise<void> {
  const current = await readAutomationConfig(repoRoot);
  const next = setAutomationEnabled(current, enabled);
  const planned = await planWrites(repoRoot, automationFiles(next));

  printPlan(planned);

  if (options.dryRun) {
    return;
  }

  const policy = options.yes ? "overwrite" : await promptForPolicy(repoRoot, planned);
  const written = await applyWrites(repoRoot, planned, policy);
  console.log(`Automation ${enabled ? "enabled" : "disabled"} with ${written.filter((file) => file.status !== "unchanged").length} file(s) updated.`);
}
