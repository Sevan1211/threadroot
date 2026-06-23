import { applyImprovementCandidates, improveLatest } from "../core/improve.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type ImproveLatestOptions = JsonCliOptions & {
  writeCandidates?: boolean;
  autoApply?: boolean;
  dryRun?: boolean;
};

export type ImproveApplyOptions = JsonCliOptions & {
  autoSafe?: boolean;
  dryRun?: boolean;
};

export async function runImproveLatest(repoRoot: string, options: ImproveLatestOptions = {}): Promise<void> {
  const autoApplySafe = options.autoApply !== false;
  const report = await improveLatest(repoRoot, {
    writeCandidates: options.writeCandidates ?? autoApplySafe,
    autoApplySafe,
    dryRun: options.dryRun,
  });
  if (options.json) {
    printJson(report);
    return;
  }
  if (!report.trace) {
    console.log("No trace found. Start one with `threadroot trace start \"<task>\"`.");
    return;
  }
  console.log(`improve latest: ${report.summary.candidates} candidate(s) from ${report.trace.runId}`);
  for (const candidate of report.candidates) {
    console.log(`- [${candidate.priority}/${candidate.type}] ${candidate.title} (${candidate.confidence}, score ${candidate.score})`);
    console.log(`  ${candidate.proposedChange}`);
    if (!candidate.promotion.ready) {
      console.log(`  blocked: ${candidate.promotion.blockedReasons.join("; ")}`);
    }
  }
  if (report.written.length > 0) {
    console.log("written:");
    for (const filePath of report.written) {
      console.log(`- ${filePath}`);
    }
  }
  if (report.applied) {
    const label = report.applied.summary.dryRun ? "would apply" : "applied";
    console.log(`auto-safe ${label}: ${report.applied.summary.applied}/${report.applied.summary.considered}`);
    for (const entry of [...report.applied.applied, ...report.applied.skipped]) {
      const prefix = entry.status === "applied" ? label : "skipped";
      console.log(`- ${prefix} [${entry.type}] ${entry.title}`);
      if (entry.reason) {
        console.log(`  ${entry.reason}`);
      }
      for (const artifact of entry.artifacts) {
        console.log(`  artifact: ${artifact}`);
      }
    }
  } else {
    console.log("auto-safe apply: off");
  }
}

export async function runImproveApply(repoRoot: string, options: ImproveApplyOptions = {}): Promise<void> {
  const report = await applyImprovementCandidates(repoRoot, {
    autoSafe: options.autoSafe !== false,
    dryRun: options.dryRun,
  });
  if (options.json) {
    printJson(report);
    return;
  }
  console.log(`improve apply: ${report.summary.applied}/${report.summary.considered} applied`);
  if (!report.summary.autoSafe) {
    console.log("auto-safe promotion is off.");
  }
  for (const entry of [...report.applied, ...report.skipped]) {
    const prefix = entry.status === "applied" ? "applied" : "skipped";
    console.log(`- ${prefix} [${entry.type}] ${entry.title}`);
    if (entry.reason) {
      console.log(`  ${entry.reason}`);
    }
    for (const artifact of entry.artifacts) {
      console.log(`  artifact: ${artifact}`);
    }
  }
}
