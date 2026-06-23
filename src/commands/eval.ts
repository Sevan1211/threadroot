import { runContextEvals } from "../core/context-evals.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type EvalCliOptions = JsonCliOptions;

export async function runEvalContext(repoRoot: string, options: EvalCliOptions = {}): Promise<void> {
  const report = await runContextEvals(repoRoot);
  if (options.json) {
    printJson(report);
    return;
  }
  console.log(`context eval: ${report.summary.cases} case(s)`);
  if (report.summary.skipped > 0) {
    console.log(`skipped: ${report.summary.skipped} non-applicable built-in case(s)`);
  }
  if (report.summary.cases === 0) {
    console.log("No built-in eval cases apply to this repository yet.");
    return;
  }
  console.log(`Recall@5: ${report.summary.recallAt5.toFixed(3)}`);
  console.log(`Precision@5: ${report.summary.precisionAt5.toFixed(3)}`);
  console.log(`MRR: ${report.summary.mrr.toFixed(3)}`);
  console.log(`nDCG@5: ${report.summary.ndcgAt5.toFixed(3)}`);
  console.log(`irrelevant top-5: ${report.summary.irrelevantTop5}`);
  console.log(`command hit rate: ${report.summary.commandHitRate.toFixed(3)}`);
  console.log(`skill hit rate: ${report.summary.skillHitRate.toFixed(3)}`);
  console.log(`average tokens: ${Math.round(report.summary.averageTokens)}`);
}
