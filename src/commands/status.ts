import { harnessStatus } from "../core/status.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type StatusCliOptions = JsonCliOptions;

export async function runStatus(repoRoot: string, options: StatusCliOptions = {}): Promise<void> {
  const status = await harnessStatus(repoRoot);
  if (options.json) {
    printJson(status);
    return;
  }

  if (!status.exists) {
    console.log("No harness found. Run `threadroot init` first.");
    return;
  }

  console.log(`harness: ${status.manifest.name} (${status.manifest.profile})`);
  console.log(`adapters: ${status.manifest.adapters.length > 0 ? status.manifest.adapters.join(", ") : "none (local-only)"}`);
  console.log(`automation: ${status.manifest.automation}`);
  console.log(
    `objects: ${status.counts.skills} skills, ${status.counts.rules} rules, ${status.counts.tools} tools, ${status.counts.connections} connections, ${status.counts.memory} memory`,
  );

  const changed = status.drift.filter((entry) => entry.status !== "unchanged");
  if (changed.length === 0) {
    console.log("compiled outputs: up to date");
    return;
  }

  console.log("compiled outputs:");
  for (const entry of changed) {
    console.log(`- ${entry.status}: ${entry.path}`);
  }
}
