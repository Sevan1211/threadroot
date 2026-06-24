import { readLatestScore } from "../core/codex-optimizer.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type ScoreLatestOptions = JsonCliOptions;

export async function runScoreLatest(repoRoot: string, options: ScoreLatestOptions = {}): Promise<void> {
  const score = await readLatestScore(repoRoot);
  if (options.json) {
    printJson(score ?? { score: null, message: "No Codex optimizer score has been recorded yet." });
    return;
  }
  if (!score) {
    console.log("No Codex optimizer score has been recorded yet.");
    return;
  }

  console.log(`score: ${score.status}`);
  console.log(`task: ${score.task}`);
  console.log(`mode: ${score.mode}`);
  console.log(`attempts: ${score.attempts}`);
  console.log(`tokens-to-green: ${score.tokensToGreen ?? "n/a"}`);
  console.log(
    `tokens: input ${score.tokenLedger.inputTokens}, cached ${score.tokenLedger.cachedInputTokens}, output ${score.tokenLedger.outputTokens}, reasoning ${score.tokenLedger.reasoningOutputTokens}`,
  );
  const resources = score.resources ?? {
    memoryProfile: "unknown",
    codexRawOutputBytes: 0,
    streamedOutput: false,
  };
  console.log(
    `resources: memory ${resources.memoryProfile}, codex output ${resources.codexRawOutputBytes} bytes, streamed ${resources.streamedOutput ? "yes" : "no"}`,
  );
  console.log(`irrelevant read ratio: ${score.contextPrecision.irrelevantReadRatio.toFixed(3)}`);
  console.log(`verification: ${score.verification.passed ? "passed" : "failed"}`);
  if (score.verification.failedCommands.length > 0) {
    console.log("failed checks:");
    for (const command of score.verification.failedCommands) {
      console.log(`- ${command}`);
    }
  }
  if (score.recommendations.length > 0) {
    console.log("recommendations:");
    for (const recommendation of score.recommendations) {
      console.log(`- ${recommendation}`);
    }
  }
}
