import { buildRepoMap, repoMapFiles } from "../core/repo-map.js";
import { applyWrites, planWrites } from "../core/writer.js";
import { printPlan, promptForPolicy } from "./shared.js";

export type MapOptions = {
  dryRun?: boolean;
  yes?: boolean;
};

export async function runMapRefresh(repoRoot: string, options: MapOptions): Promise<void> {
  const map = await buildRepoMap(repoRoot);
  const planned = await planWrites(repoRoot, repoMapFiles(map));
  printPlan(planned);

  if (options.dryRun) {
    return;
  }

  const policy = options.yes ? "overwrite" : await promptForPolicy(repoRoot, planned);
  const written = await applyWrites(repoRoot, planned, policy);
  console.log(`Refreshed repo map with ${map.entries.length} entr${map.entries.length === 1 ? "y" : "ies"}.`);
  console.log(`Wrote ${written.filter((file) => file.status !== "unchanged").length} file(s).`);
}
