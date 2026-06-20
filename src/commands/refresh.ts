import { readConfig } from "../core/config.js";
import { generateFiles } from "../core/generate.js";
import { buildMemoryReport, memoryReportFiles } from "../core/memory.js";
import { applyWrites, planWrites } from "../core/writer.js";
import type { Target } from "../types.js";
import { fileExists, printPlan, promptForPolicy } from "./shared.js";

export type RefreshOptions = {
  dryRun?: boolean;
  yes?: boolean;
  memory?: boolean;
};

export async function runRefresh(repoRoot: string, target: Target | undefined, options: RefreshOptions): Promise<void> {
  if (options.memory) {
    await runMemoryRefresh(repoRoot, options);
    return;
  }

  const config = await readConfig(repoRoot);
  const planned = await planWrites(
    repoRoot,
    generateFiles(config, {
      targetFilter: target,
      includeCanonical: false,
      agentsPath: (await fileExists(repoRoot, "AGENTS.threadroot.md")) ? "AGENTS.threadroot.md" : "AGENTS.md",
    }),
  );
  printPlan(planned);

  if (options.dryRun) {
    return;
  }

  const policy = options.yes ? "overwrite" : await promptForPolicy(repoRoot, planned);
  const written = await applyWrites(repoRoot, planned, policy);
  console.log(`Refreshed ${written.filter((file) => file.status !== "unchanged").length} file(s).`);
}

async function runMemoryRefresh(repoRoot: string, options: RefreshOptions): Promise<void> {
  const report = await buildMemoryReport(repoRoot);
  const planned = await planWrites(repoRoot, memoryReportFiles(report));
  printPlan(planned);

  console.log(`Memory archive suggestion: ${report.archiveSuggestion}`);
  for (const finding of report.findings.filter((item) => item.level === "warning")) {
    console.log(`warning: ${finding.path}: ${finding.message}`);
  }

  if (options.dryRun) {
    return;
  }

  const policy = options.yes ? "overwrite" : await promptForPolicy(repoRoot, planned);
  const written = await applyWrites(repoRoot, planned, policy);
  console.log(`Refreshed memory review with ${written.filter((file) => file.status !== "unchanged").length} file(s).`);
}
