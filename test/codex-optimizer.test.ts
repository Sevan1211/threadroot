import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  codexRunEvidenceFromJsonl,
  codexTokenLedgerFromJsonl,
  createPrepBrief,
  readLatestScore,
  runCodexOptimizer,
  tuneLatest,
  type CodexRunScore,
} from "../src/core/codex-optimizer.js";
import { writeCodexStateJson } from "../src/core/codex-state.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-codex-optimizer-"));
  await write(
    "package.json",
    JSON.stringify({ name: "demo", packageManager: "pnpm@9.0.0", scripts: { typecheck: "tsc --noEmit", test: "vitest" } }, null, 2),
  );
  await write("src/billing.ts", "export function retryInvoice(id: string) { return `billing:${id}`; }\n");
  await write("test/billing.test.ts", "import { retryInvoice } from '../src/billing';\nretryInvoice('inv_1');\n");
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(repo, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

async function exists(rel: string): Promise<boolean> {
  try {
    await stat(path.join(repo, rel));
    return true;
  } catch {
    return false;
  }
}

describe("Codex optimizer", () => {
  it("creates compact Codex preflight state without writing .threadroot", async () => {
    const brief = await createPrepBrief(repo, "fix retryInvoice billing", {
      budgetTokens: 1_500,
      hardCapTokens: 3_000,
    });

    expect(brief.promptTokenEstimate).toBeLessThanOrEqual(3_000);
    expect(brief.packetTokenEstimate).toBeGreaterThan(0);
    expect(brief.firstReads).toContain("src/billing.ts");
    expect(brief.likelyTests).toContain("test/billing.test.ts");
    expect(brief.verificationCommands).toEqual(["pnpm typecheck", "pnpm test"]);
    await expect(exists(".codex/threadroot/briefs/latest.json")).resolves.toBe(true);
    await expect(exists(".codex/threadroot/index/latest.json")).resolves.toBe(true);
    await expect(exists(".threadroot")).resolves.toBe(false);

    const stored = JSON.parse(await readFile(path.join(repo, ".codex/threadroot/briefs/latest.json"), "utf8")) as {
      task: string;
      paths: { prompt: string };
    };
    expect(stored.task).toBe("fix retryInvoice billing");
    expect(stored.paths.prompt).toMatch(/^\.codex\/threadroot\/briefs\//u);
  });

  it("parses Codex JSONL usage and evidence", () => {
    const jsonl = [
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 30, reasoning_output_tokens: 10 },
      }),
      JSON.stringify({ type: "item.completed", item: { type: "file_read", path: "src/billing.ts" } }),
      JSON.stringify({ type: "item.completed", item: { type: "file_change", path: "src/billing.ts" } }),
      JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "pnpm test", output: "ok" } }),
      JSON.stringify({ type: "item.completed", item: { type: "mcp_tool_call", name: "task_packet" } }),
    ].join("\n");

    expect(codexTokenLedgerFromJsonl(jsonl)).toMatchObject({
      inputTokens: 100,
      cachedInputTokens: 40,
      outputTokens: 30,
      reasoningOutputTokens: 10,
      uncachedInputTokens: 60,
      totalTokens: 140,
      commandExecutions: 1,
      fileChanges: 1,
      mcpCalls: 1,
    });
    expect(codexRunEvidenceFromJsonl(jsonl)).toMatchObject({
      readFiles: ["src/billing.ts"],
      editedFiles: ["src/billing.ts"],
      commands: ["pnpm test"],
      mcpTools: ["task_packet"],
    });
  });

  it("records dry-run score skeletons in Codex-native state", async () => {
    const report = await runCodexOptimizer(repo, "fix retryInvoice billing", { dryRun: true, requiredCommands: ["pnpm test"] });
    const latest = await readLatestScore(repo);

    expect(report.score.status).toBe("blocked");
    expect(report.attempts).toEqual([]);
    expect(latest?.runId).toBe(report.runId);
    await expect(exists(".codex/threadroot/runs/latest.json")).resolves.toBe(true);
    await expect(exists(".codex/threadroot/scores/latest.json")).resolves.toBe(true);
    await expect(exists(".threadroot")).resolves.toBe(false);
  });

  it("uses tiny memory preflight budgets", async () => {
    const brief = await createPrepBrief(repo, "fix retryInvoice billing", { memoryProfile: "tiny" });

    expect(brief.memory).toMatchObject({
      profile: "tiny",
      maxFiles: 3,
      maxScannedFiles: 1_000,
      maxScannedBytesPerFile: 64_000,
      maxVerificationOutputChars: 100_000,
    });
    expect(brief.budget.hardCapTokens).toBe(1_600);
    expect(brief.promptTokenEstimate).toBeLessThanOrEqual(1_600);
  });

  it("streams Codex JSONL output to disk while scoring bounded samples", async () => {
    const fakeCodex = path.join(repo, "fake-codex.js");
    await writeFile(
      fakeCodex,
      `#!/usr/bin/env node
process.stdin.resume();
const event = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
event({ type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 25, output_tokens: 30, reasoning_output_tokens: 5 } });
event({ type: "item.completed", item: { type: "file_read", path: "src/billing.ts" } });
event({ type: "item.completed", item: { type: "file_change", path: "src/billing.ts" } });
event({ type: "item.completed", item: { type: "command_execution", command: "pnpm test", output: "ok" } });
process.stdout.write("tool-noise".repeat(15_000) + "\\n");
`,
      "utf8",
    );
    await chmod(fakeCodex, 0o755);

    const report = await runCodexOptimizer(repo, "fix retryInvoice billing", {
      codexBin: fakeCodex,
      ephemeral: true,
      memoryProfile: "tiny",
      requiredCommands: ['node -e "process.exit(0)"'],
      timeoutMs: 5_000,
      verificationTimeoutMs: 5_000,
    });
    const attempt = report.attempts[0]!;

    expect(report.score.status).toBe("passed");
    expect(report.score.resources).toMatchObject({
      memoryProfile: "tiny",
      streamedOutput: true,
      compactSamplesTruncated: 1,
    });
    expect(attempt.codex.outputStrategy).toBe("streamed");
    expect(attempt.codex.rawOutputBytes).toBeGreaterThan(100_000);
    expect(attempt.codex.compactSampleTruncated).toBe(true);
    expect(attempt.ledger).toMatchObject({
      inputTokens: 100,
      cachedInputTokens: 25,
      outputTokens: 30,
      reasoningOutputTokens: 5,
      totalTokens: 135,
    });
    expect(attempt.evidence).toMatchObject({
      readFiles: ["src/billing.ts"],
      editedFiles: ["src/billing.ts"],
      commands: ["pnpm test"],
    });
    await expect(readFile(attempt.codex.rawOutputPath, "utf8")).resolves.toContain("tool-noise");
    await expect(readFile(attempt.codex.compactOutputPath, "utf8")).resolves.toContain("bounded head/tail samples");
  });

  it("turns score evidence into routing proposals", async () => {
    const score: CodexRunScore = {
      schemaVersion: 1,
      runId: "manual-score",
      task: "fix retryInvoice billing",
      mode: "balanced",
      status: "failed",
      attempts: 1,
      tokenLedger: {
        inputTokens: 100,
        cachedInputTokens: 20,
        outputTokens: 30,
        reasoningOutputTokens: 10,
        totalTokens: 140,
        uncachedInputTokens: 80,
        toolOutputTokens: 12,
        commandExecutions: 1,
        fileChanges: 1,
        mcpCalls: 0,
        webSearches: 0,
        planUpdates: 0,
        events: 3,
      },
      tokensToGreen: null,
      verification: { passed: false, commands: ["pnpm test"], failedCommands: ["pnpm test"] },
      resources: {
        memoryProfile: "conservative",
        codexRawOutputBytes: 0,
        streamedOutput: true,
        compactSamplesTruncated: 0,
      },
      contextPrecision: {
        suggestedFiles: ["src/index.ts"],
        readFiles: ["src/billing.ts"],
        editedFiles: ["src/billing.ts"],
        suggestedReadHits: 0,
        suggestedEditHits: 0,
        missedReadFiles: ["src/billing.ts"],
        missedEditedFiles: ["src/billing.ts"],
        irrelevantReadRatio: 1,
        generatedLeakage: [],
      },
      recommendations: ["Add routing hints for edited files that preflight missed."],
      paths: { run: ".codex/threadroot/runs/manual-score.json", score: ".codex/threadroot/scores/manual-score.json" },
    };
    await writeCodexStateJson(repo, ["scores", "latest.json"], score);

    const tune = await tuneLatest(repo);

    expect(tune.proposals.map((proposal) => proposal.type)).toEqual(expect.arrayContaining(["routing-hint", "verification"]));
    expect(tune.proposals.some((proposal) => proposal.suggestedChange.includes("src/billing.ts"))).toBe(true);
    await expect(exists(".codex/threadroot/tuning/routing-hints.json")).resolves.toBe(true);
  });
});
