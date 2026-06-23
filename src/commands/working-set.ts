import { HarnessError } from "../core/harness/index.js";
import { assembleWorkingSet } from "../core/working-set.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type WorkingSetCliOptions = JsonCliOptions & {
  budget?: string;
  maxFiles?: string;
};

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function runWorkingSet(
  repoRoot: string,
  task: string,
  options: WorkingSetCliOptions = {},
): Promise<void> {
  try {
    const workingSet = await assembleWorkingSet(repoRoot, task, {
      budgetTokens: parsePositiveInteger(options.budget),
      maxFiles: parsePositiveInteger(options.maxFiles),
    });
    if (options.json) {
      printJson(workingSet);
      return;
    }

    console.log(`working set: ${workingSet.task}`);
    console.log(`token estimate: ${workingSet.tokenEstimate}`);
    if (workingSet.repoMap) {
      console.log(`repo map: ${workingSet.repoMap.status} (${workingSet.repoMap.path})`);
    }

    if (workingSet.files.length > 0) {
      console.log("\nfiles:");
      for (const file of workingSet.files) {
        const lines = file.lines && file.lines.length > 0 ? `:${file.lines.join(",")}` : "";
        console.log(`- ${file.path}${lines} (${file.score}) - ${file.reasons.join("; ")}`);
      }
    }

    if (workingSet.tests.length > 0) {
      console.log("\ntests:");
      for (const test of workingSet.tests) {
        console.log(`- ${test.path} (${test.score}) - ${test.reasons.join("; ")}`);
      }
    }

    if (workingSet.commands.length > 0) {
      console.log("\ncommands:");
      for (const command of workingSet.commands) {
        console.log(`- ${command.command} (${command.risk}) - ${command.reason}`);
      }
    }

    if (workingSet.recommendedSkills.length > 0) {
      console.log("\nskills:");
      for (const skill of workingSet.recommendedSkills) {
        console.log(`- ${skill.name} (${skill.confidence}, ${skill.risk}) - ${skill.reason}`);
      }
    }

    if (workingSet.nextReads.length > 0) {
      console.log("\nnext reads:");
      for (const file of workingSet.nextReads) {
        console.log(`- ${file}`);
      }
    }

    if (workingSet.warnings.length > 0) {
      console.log("\nwarnings:");
      for (const warning of workingSet.warnings) {
        console.log(`- ${warning.type}: ${warning.message}${warning.path ? ` (${warning.path})` : ""}`);
      }
    }
  } catch (error) {
    if (error instanceof HarnessError) {
      if (options.json) {
        printJson({ ok: false, error: "harness_missing", message: "No harness found. Run `threadroot init` first." });
      } else {
        console.log("No harness found. Run `threadroot init` first.");
      }
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
