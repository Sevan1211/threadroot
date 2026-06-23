import { runContextEvals } from "../core/context-evals.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type EvalCliOptions = JsonCliOptions & {
  minRecall?: string;
  minPrecision?: string;
  minNdcg?: string;
  maxAverageTokens?: string;
};

type EvalGate = {
  metric: string;
  actual: number;
  threshold: number;
  passed: boolean;
};

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function gatesFor(report: Awaited<ReturnType<typeof runContextEvals>>, options: EvalCliOptions): EvalGate[] {
  const gates: EvalGate[] = [];
  const minRecall = parseNumber(options.minRecall);
  const minPrecision = parseNumber(options.minPrecision);
  const minNdcg = parseNumber(options.minNdcg);
  const maxAverageTokens = parseNumber(options.maxAverageTokens);
  if (minRecall !== undefined) {
    gates.push({ metric: "recallAt5", actual: report.summary.recallAt5, threshold: minRecall, passed: report.summary.recallAt5 >= minRecall });
  }
  if (minPrecision !== undefined) {
    gates.push({ metric: "precisionAt5", actual: report.summary.precisionAt5, threshold: minPrecision, passed: report.summary.precisionAt5 >= minPrecision });
  }
  if (minNdcg !== undefined) {
    gates.push({ metric: "ndcgAt5", actual: report.summary.ndcgAt5, threshold: minNdcg, passed: report.summary.ndcgAt5 >= minNdcg });
  }
  if (maxAverageTokens !== undefined) {
    gates.push({ metric: "averageTokens", actual: report.summary.averageTokens, threshold: maxAverageTokens, passed: report.summary.averageTokens <= maxAverageTokens });
  }
  return gates;
}

export async function runEvalContext(repoRoot: string, options: EvalCliOptions = {}): Promise<void> {
  const report = await runContextEvals(repoRoot);
  const gates = gatesFor(report, options);
  const failedGates = gates.filter((gate) => !gate.passed);
  if (options.json) {
    printJson(gates.length > 0 ? { ...report, gates } : report);
    if (failedGates.length > 0) {
      process.exitCode = 1;
    }
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
  for (const gate of gates) {
    const relation = gate.metric === "averageTokens" ? "<=" : ">=";
    console.log(`gate ${gate.passed ? "pass" : "fail"}: ${gate.metric} ${gate.actual.toFixed(3)} ${relation} ${gate.threshold}`);
  }
  if (failedGates.length > 0) {
    process.exitCode = 1;
  }
}
