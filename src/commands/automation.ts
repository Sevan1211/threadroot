import { formatAutomationStatus, readAutomationConfig } from "../core/automation.js";

export async function runAutomationStatus(repoRoot: string): Promise<void> {
  const config = await readAutomationConfig(repoRoot);
  console.log(formatAutomationStatus(config));
}
