import { tuneLatest } from "../core/codex-optimizer.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type TuneLatestOptions = JsonCliOptions;

export async function runTuneLatest(repoRoot: string, options: TuneLatestOptions = {}): Promise<void> {
  const report = await tuneLatest(repoRoot);
  if (options.json) {
    printJson(report);
    return;
  }

  console.log(`tune: ${report.proposals.length} proposal(s)`);
  console.log(`routing hints: ${report.routingHintsPath}`);
  console.log(`report: ${report.reportPath}`);
  for (const proposal of report.proposals) {
    console.log(`- [${proposal.priority}] ${proposal.title}`);
  }
}
