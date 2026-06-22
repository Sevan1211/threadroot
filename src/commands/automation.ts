import {
  approveAutomation,
  resetAutomation,
  automationStatus,
  type AutomationStatus,
} from "../core/automation.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type AutomationCliOptions = JsonCliOptions;

function printStatus(status: AutomationStatus): void {
  console.log(`automation: ${status.mode}`);
  if (status.approvedAt) {
    console.log(`approved: ${status.approvedAt}${status.approvedBy ? ` by ${status.approvedBy}` : ""}`);
  }
  if (status.mode === "ask") {
    console.log("safe agent-created capabilities require one project-level approval.");
  }
}

export async function runAutomationStatus(repoRoot: string, options: AutomationCliOptions = {}): Promise<void> {
  const status = await automationStatus(repoRoot);
  if (options.json) {
    printJson(status);
    return;
  }
  printStatus(status);
}

export async function runAutomationApprove(repoRoot: string, options: AutomationCliOptions = {}): Promise<void> {
  const status = await approveAutomation(repoRoot);
  if (options.json) {
    printJson(status);
    return;
  }
  printStatus(status);
}

export async function runAutomationReset(repoRoot: string, options: AutomationCliOptions = {}): Promise<void> {
  const status = await resetAutomation(repoRoot);
  if (options.json) {
    printJson(status);
    return;
  }
  printStatus(status);
}
