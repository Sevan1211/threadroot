import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyImprovementCandidates, improveLatest } from "../src/core/improve.js";
import { initHarness } from "../src/core/init/index.js";
import { nextLoop, reportLoop, runLoop, startLoop } from "../src/core/loop.js";
import { runContextEvals } from "../src/core/context-evals.js";
import { runTraceEvals } from "../src/core/trace-evals.js";
import { appendTraceEvent, finishTrace, latestTrace, startTrace } from "../src/core/trace.js";
import { assembleWorkingSet } from "../src/core/working-set.js";
import { handleMessage } from "../src/mcp/server.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-loop-"));
  await writeFile(
    path.join(repo, "package.json"),
    JSON.stringify({ name: "loop-demo", scripts: { test: "node --test" } }, null, 2),
    "utf8",
  );
  await writeFile(path.join(repo, "feature.ts"), "export const feature = true;\n", "utf8");
  await initHarness(repo, { import: false, home: repo });
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

function quotedNode(script: string): string {
  return `"${process.execPath}" -e "${script.replace(/"/g, '\\"')}"`;
}

async function writeFakeCodexJsonl(): Promise<string> {
  const fakeCodex = path.join(repo, "fake-codex.mjs");
  await writeFile(
    fakeCodex,
    [
      "process.stdin.resume();",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', () => {});",
      "process.stdin.on('end', () => {",
      "  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'file_change', path: 'feature.ts' } }));",
      "  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'node --test', exit_code: 0 } }));",
      "});",
    ].join("\n"),
    "utf8",
  );
  return fakeCodex;
}

describe("trace receipts and loop sessions", () => {
  it("records trace events, evaluates real-run recall, and proposes improvements", async () => {
    const trace = await startTrace(repo, "fix feature routing", { agent: "codex", maxFiles: 4 });
    expect(trace.status).toBe("running");

    await appendTraceEvent(repo, { type: "read_file", path: "feature.ts", message: "Inspected feature." });
    await appendTraceEvent(repo, { type: "edit_file", path: ".threadroot/cache/task/latest.json", message: "Generated harness state." });
    await appendTraceEvent(repo, { type: "run_tool", tool: "test", command: "pnpm test", exitCode: 0, ok: true, durationMs: 42 });
    const finished = await finishTrace(repo, "passed", "Feature check passed.");

    expect(finished.status).toBe("passed");
    expect(finished.events).toHaveLength(3);

    const evals = await runTraceEvals(repo, { latest: true });
    expect(evals.summary.cases).toBe(1);
    expect(evals.cases[0]?.neededFiles).toContain("feature.ts");
    expect(evals.cases[0]?.neededFiles).not.toContain(".threadroot/cache/task/latest.json");

    const improvements = await improveLatest(repo, { writeCandidates: true });
    expect(improvements.trace?.runId).toBe(finished.runId);
    expect(JSON.stringify(improvements.candidates)).not.toContain(".threadroot/cache/task/latest.json");
    expect(improvements.candidates.some((candidate) => candidate.type === "prompt")).toBe(true);
    expect(improvements.candidates[0]?.score).toBeGreaterThan(0);
    expect(improvements.summary.byPriority.p0 + improvements.summary.byPriority.p1 + improvements.summary.byPriority.p2).toBe(
      improvements.summary.candidates,
    );
    expect(improvements.candidates.find((candidate) => candidate.type === "memory")?.promotion.ready).toBe(false);
    expect(improvements.written.length).toBeGreaterThan(0);
  });

  it("applies auto-safe trace improvements into routing hints, evals, and generated skill lessons", async () => {
    await mkdir(path.join(repo, "src"), { recursive: true });
    for (let index = 0; index < 8; index += 1) {
      await writeFile(path.join(repo, "src", `loop-automation-${index}.ts`), `export const loop${index} = true;\n`, "utf8");
    }

    await startTrace(repo, "improve loop automation", { agent: "codex", maxFiles: 4 });
    await appendTraceEvent(repo, { type: "read_file", path: "feature.ts", message: "The useful file was outside initial context." });
    await appendTraceEvent(repo, { type: "run_tool", tool: "test", command: "node --test", exitCode: 0, ok: true });
    await finishTrace(repo, "passed", "Trace produced a reusable routing lesson.");

    const improvements = await improveLatest(repo, { writeCandidates: true, autoApplySafe: true });
    expect(improvements.candidates.some((candidate) => candidate.title === "Promote trace into a routing eval")).toBe(true);
    const applied = improvements.applied!;
    expect(applied.summary.applied).toBeGreaterThan(0);
    expect(applied.applied.flatMap((entry) => entry.artifacts).some((artifact) => artifact.includes("trace-hints.json"))).toBe(true);
    expect(await readFile(path.join(repo, ".threadroot", "skills", "threadroot-trace-lessons", "SKILL.md"), "utf8")).toContain(
      "feature.ts",
    );

    const routed = await assembleWorkingSet(repo, "improve loop automation", { home: repo, maxFiles: 8 });
    expect(routed.files.map((file) => file.path).slice(0, 5)).toContain("feature.ts");

    const contextEval = await runContextEvals(repo);
    expect(contextEval.cases.some((entry) => entry.id.startsWith("trace-") && entry.topFiles.includes("feature.ts"))).toBe(true);
  });

  it("keeps unfinished routing candidates out of auto-safe promotion", async () => {
    await mkdir(path.join(repo, "src"), { recursive: true });
    for (let index = 0; index < 8; index += 1) {
      await writeFile(path.join(repo, "src", `loop-automation-${index}.ts`), `export const loop${index} = true;\n`, "utf8");
    }

    await startTrace(repo, "improve loop automation", { agent: "codex", maxFiles: 4 });
    await appendTraceEvent(repo, { type: "read_file", path: "feature.ts", message: "The useful file was outside initial context." });

    const improvements = await improveLatest(repo, { writeCandidates: true });
    const routingCandidate = improvements.candidates.find((candidate) => candidate.title === "Promote trace into a routing eval");
    expect(routingCandidate?.promotion.ready).toBe(false);
    expect(routingCandidate?.promotion.blockedReasons.join(" ")).toContain("running");

    const applied = await applyImprovementCandidates(repo, { autoSafe: true, fromLatest: false });
    expect(applied.summary.applied).toBe(0);

    await finishTrace(repo, "cancelled", "Unfinished promotion guard verified.");
  });

  it("does not auto-promote broad routing traces as recall-at-five evals", async () => {
    await mkdir(path.join(repo, "src"), { recursive: true });
    const broadFiles: string[] = [];
    for (let index = 0; index < 9; index += 1) {
      const file = `src/broad-routing-${index}.ts`;
      broadFiles.push(file);
      await writeFile(path.join(repo, file), `export const broad${index} = true;\n`, "utf8");
    }

    await startTrace(repo, "broad product routing sweep", { agent: "codex", maxFiles: 4 });
    for (const file of broadFiles) {
      await appendTraceEvent(repo, { type: "read_file", path: file });
    }
    await finishTrace(repo, "passed", "Broad trace should remain a review candidate.");

    const improvements = await improveLatest(repo, { writeCandidates: true });
    const routingCandidate = improvements.candidates.find((candidate) => candidate.title === "Promote trace into a routing eval");
    expect(routingCandidate?.promotion.ready).toBe(false);
    expect(routingCandidate?.promotion.blockedReasons.join(" ")).toContain("capped");

    const applied = await applyImprovementCandidates(repo, { autoSafe: true, fromLatest: false });
    expect(applied.summary.applied).toBe(0);
  });

  it("generates an evidence-backed next loop prompt and report", async () => {
    const session = await startLoop(repo, "Improve loop evidence quality", {
      agent: "codex",
      timeMinutes: 30,
      maxIterations: 2,
      risk: "low",
    });
    expect(session.status).toBe("active");

    const next = await nextLoop(repo);
    expect(next.prompt).toContain("Goal: Improve loop evidence quality");
    expect(next.trace.status).toBe("running");
    expect(next.session.iteration).toBe(1);

    const report = await reportLoop(repo);
    expect(report.session?.sessionId).toBe(session.sessionId);
    expect(report.latestTrace?.runId).toBe(next.trace.runId);
  });

  it("runs a budgeted loop through a custom provider command", async () => {
    const fakeAgent = path.join(repo, "fake-agent.mjs");
    await writeFile(
      fakeAgent,
      [
        "let prompt = '';",
        "process.stdin.setEncoding('utf8');",
        "process.stdin.on('data', (chunk) => { prompt += chunk; });",
        "process.stdin.on('end', () => {",
        "  console.log(JSON.stringify({ hasGoal: prompt.includes('Goal: Custom provider loop') }));",
        "});",
      ].join("\n"),
      "utf8",
    );

    await startLoop(repo, "Custom provider loop", { agent: "codex", maxIterations: 1 });
    const report = await runLoop(repo, {
      iterations: 1,
      agentCommand: process.execPath,
      agentArgs: [fakeAgent],
      timeoutMs: 5_000,
      writeCandidates: false,
    });

    expect(report.iterations).toHaveLength(1);
    expect(report.stoppedReason).toBe("completed");
    expect(report.iterations[0]?.provider.ok).toBe(true);
    expect(report.iterations[0]?.provider.timedOut).toBe(false);
    expect(report.iterations[0]?.improvements.summary.candidates).toBeGreaterThanOrEqual(0);

    const output = await readFile(report.iterations[0]!.provider.outputPath, "utf8");
    expect(output).toContain('"hasGoal":true');

    const loopReport = await reportLoop(repo);
    expect(loopReport.latestTrace?.status).toBe("partial");
  });

  it("captures provider JSONL events and required verification evidence", async () => {
    const fakeCodex = await writeFakeCodexJsonl();

    await startLoop(repo, "Codex adapter loop", { agent: "codex", maxIterations: 1 });
    const report = await runLoop(repo, {
      iterations: 1,
      agentCommand: process.execPath,
      agentArgs: [fakeCodex],
      agentAdapter: "codex",
      requiredCommands: [quotedNode("process.exit(0)")],
      timeoutMs: 5_000,
      verificationTimeoutMs: 5_000,
      writeCandidates: false,
    });

    expect(report.stoppedReason).toBe("completed");
    expect(report.finalReportPath).toBeTruthy();
    expect(report.iterations[0]?.provider.adapter).toBe("codex");
    expect(report.iterations[0]?.provider.compactOutputPath).toContain("agent-output-1.brief.md");
    expect(report.iterations[0]?.provider.eventsCaptured).toBeGreaterThanOrEqual(2);
    expect(report.iterations[0]?.verification).toHaveLength(1);
    expect(report.iterations[0]?.verification[0]?.ok).toBe(true);
    expect(report.iterations[0]?.verification[0]?.compactOutputPath).toContain("verification-1-1.brief.md");

    const trace = await latestTrace(repo);
    expect(trace?.status).toBe("passed");
    expect(trace?.events.some((event) => event.type === "edit_file" && event.path === "feature.ts")).toBe(true);
    expect(trace?.events.some((event) => event.type === "run_tool" && event.tool === "verification")).toBe(true);

    const finalReport = await readFile(report.finalReportPath!, "utf8");
    expect(finalReport).toContain("Provider events captured");
    expect(finalReport).toContain("Provider compact output");
    expect(finalReport).toContain("Trace eval: Recall@5");
  });

  it("stops automated loops when required verification fails", async () => {
    const fakeCodex = await writeFakeCodexJsonl();

    await startLoop(repo, "Verification failure loop", { agent: "codex", maxIterations: 2 });
    const report = await runLoop(repo, {
      iterations: 2,
      agentCommand: process.execPath,
      agentArgs: [fakeCodex],
      agentAdapter: "codex",
      requiredCommands: [quotedNode("process.exit(7)")],
      timeoutMs: 5_000,
      verificationTimeoutMs: 5_000,
      writeCandidates: false,
    });

    expect(report.stoppedReason).toBe("verification-failed");
    expect(report.iterations).toHaveLength(1);
    expect(report.iterations[0]?.verification[0]?.ok).toBe(false);
    expect((await latestTrace(repo))?.status).toBe("failed");
  });

  it("records a failed trace and report when the provider command is missing", async () => {
    await startLoop(repo, "Missing provider loop", { agent: "codex", maxIterations: 1 });
    const report = await runLoop(repo, {
      iterations: 1,
      agentCommand: "threadroot-missing-provider-for-test",
      agentAdapter: "custom",
      timeoutMs: 5_000,
      writeCandidates: false,
    });

    expect(report.stoppedReason).toBe("provider-failed");
    expect(report.iterations).toHaveLength(1);
    expect(report.iterations[0]?.provider.ok).toBe(false);
    expect(report.iterations[0]?.provider.exitCode).toBeNull();
    expect((await latestTrace(repo))?.status).toBe("failed");

    const output = await readFile(report.iterations[0]!.provider.outputPath, "utf8");
    expect(output).toContain("Provider command is not executable");
  });

  it("exposes trace and loop primitives through MCP", async () => {
    const start = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "loop_start", arguments: { goal: "Improve MCP loop tools", maxIterations: 1 } },
    });
    const startResult = start?.result as { structuredContent: { sessionId: string } };
    expect(startResult.structuredContent.sessionId).toBeTruthy();

    const next = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "loop_next", arguments: {} },
    });
    const nextResult = next?.result as { structuredContent: { prompt: string; trace: { runId: string } } };
    expect(nextResult.structuredContent.prompt).toContain("Improve MCP loop tools");

    await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "trace_event", arguments: { type: "read_file", path: "feature.ts" } },
    });
    const evals = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "eval_traces", arguments: { latest: true } },
    });
    const evalResult = evals?.result as { structuredContent: { summary: { cases: number } } };
    expect(evalResult.structuredContent.summary.cases).toBe(1);
  });
});
