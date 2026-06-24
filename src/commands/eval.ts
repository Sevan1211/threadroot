import { runCodexOptimizerEval } from "../core/codex-optimizer.js";
import { printJson, type JsonCliOptions } from "./json.js";

export async function runEvalCodex(repoRoot: string, options: JsonCliOptions = {}): Promise<void> {
  const report = await runCodexOptimizerEval(repoRoot);
  if (options.json) {
    printJson(report);
    return;
  }
  console.log(`codex eval: ${report.optimizer.cases} case(s)`);
  console.log(`average raw prompt tokens: ${Math.round(report.optimizer.averageRawPromptTokens)}`);
  console.log(`average preflight prompt tokens: ${Math.round(report.optimizer.averagePrepPromptTokens)}`);
  console.log(`estimated token reduction: ${Math.round(report.optimizer.estimatedTokenReduction)}`);
  console.log(`estimated reduction ratio: ${report.optimizer.estimatedTokenReductionRatio.toFixed(3)}`);
}
