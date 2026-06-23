import { assembleTaskPacket, writeLatestTaskPacket } from "../core/task-packet.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type TaskCliOptions = JsonCliOptions & {
  budget?: string;
  maxFiles?: string;
  debugRanking?: boolean;
  forceIndex?: boolean;
};

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function runTask(repoRoot: string, task: string, options: TaskCliOptions = {}): Promise<void> {
  const packet = await assembleTaskPacket(repoRoot, task, {
    budgetTokens: parsePositiveInteger(options.budget),
    maxFiles: parsePositiveInteger(options.maxFiles),
    debugRanking: options.debugRanking,
    forceIndex: options.forceIndex,
  });
  await writeLatestTaskPacket(repoRoot, packet);

  if (options.json) {
    printJson(packet);
    return;
  }

  console.log(`task: ${packet.task}`);
  console.log(`token estimate: ${packet.tokenEstimate}`);
  console.log(`index: ${packet.index.status} (${packet.index.path})`);
  if (packet.freshness) {
    const refreshed = packet.freshness.refreshed.length > 0 ? packet.freshness.refreshed.join(", ") : "nothing";
    console.log(`freshness: map ${packet.freshness.mapStatus}, index ${packet.freshness.indexStatus}, refreshed ${refreshed}`);
  }
  if (packet.indexBuild) {
    console.log(`index refreshed: ${packet.indexBuild.durationMs}ms`);
  }

  if (packet.files.length > 0) {
    console.log("\nread first:");
    for (const file of packet.files.slice(0, 8)) {
      const symbols = file.symbols.length > 0 ? ` symbols:${file.symbols.map((symbol) => symbol.name).slice(0, 4).join(",")}` : "";
      console.log(`- ${file.path} (${file.score}) - ${file.reasons.join("; ")}${symbols}`);
    }
  }

  if (packet.tests.length > 0) {
    console.log("\ntests:");
    for (const test of packet.tests.slice(0, 6)) {
      console.log(`- ${test.path} (${test.score}) - ${test.reasons.join("; ")}`);
    }
  }

  if (packet.commands.length > 0) {
    console.log("\ncommands:");
    for (const command of packet.commands) {
      console.log(`- ${command.command} (${command.risk}) - ${command.reason}`);
    }
  }

  if (packet.recommendedSkills.length > 0) {
    console.log("\nskills:");
    for (const skill of packet.recommendedSkills) {
      console.log(`- ${skill.name} (${skill.confidence}, ${skill.risk}) - ${skill.reason}`);
    }
  }

  if (packet.warnings.length > 0) {
    console.log("\nwarnings:");
    for (const warning of packet.warnings) {
      console.log(`- ${warning.type}: ${warning.message}${warning.path ? ` (${warning.path})` : ""}`);
    }
  }

  if (packet.debugRanking) {
    console.log("\ndebug ranking:");
    for (const candidate of packet.debugRanking.candidates.slice(0, 12)) {
      console.log(`- ${candidate.path} (${candidate.score}) - ${candidate.reasons.join("; ")}`);
    }
  }
}
