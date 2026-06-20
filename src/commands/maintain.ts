import { readConfig } from "../core/config.js";
import { generateFiles } from "../core/generate.js";
import { buildMemoryReport, memoryReportFiles } from "../core/memory.js";
import { buildRepoMap, repoMapFiles } from "../core/repo-map.js";
import { applyWrites, planWrites } from "../core/writer.js";
import { fileExists, printPlan, promptForPolicy } from "./shared.js";

export type MaintainOptions = {
  dryRun?: boolean;
  yes?: boolean;
};

export async function runMaintain(repoRoot: string, options: MaintainOptions): Promise<void> {
  const config = await readConfig(repoRoot);
  const [map, memoryReport] = await Promise.all([buildRepoMap(repoRoot), buildMemoryReport(repoRoot)]);
  const adapterFiles = generateFiles(config, {
    includeCanonical: false,
    agentsPath: (await fileExists(repoRoot, "AGENTS.threadroot.md")) ? "AGENTS.threadroot.md" : "AGENTS.md",
  });
  const planned = await planWrites(repoRoot, [...repoMapFiles(map), ...memoryReportFiles(memoryReport), ...adapterFiles]);

  printPlan(planned);
  console.log(`Repo map entries: ${map.entries.length}`);
  console.log(`Memory warnings: ${memoryReport.findings.filter((finding) => finding.level === "warning").length}`);

  if (options.dryRun) {
    return;
  }

  const policy = options.yes ? "overwrite" : await promptForPolicy(repoRoot, planned);
  const written = await applyWrites(repoRoot, planned, policy);
  console.log(`Maintained Threadroot with ${written.filter((file) => file.status !== "unchanged").length} file(s).`);
}
