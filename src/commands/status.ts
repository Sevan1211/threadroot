import { harnessStatus } from "../core/status.js";

export async function runStatus(repoRoot: string): Promise<void> {
  const status = await harnessStatus(repoRoot);
  if (!status.exists) {
    console.log("No harness found. Run `tr init` first.");
    return;
  }

  console.log(`harness: ${status.manifest.name} (${status.manifest.profile})`);
  console.log(`adapters: ${status.manifest.adapters.length > 0 ? status.manifest.adapters.join(", ") : "none (local-only)"}`);
  console.log(
    `objects: ${status.counts.skills} skills, ${status.counts.rules} rules, ${status.counts.tools} tools, ${status.counts.memory} memory`,
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
