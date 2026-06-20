import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { simpleDiff } from "../core/diff.js";
import { targetSchema, type PlannedWrite, type Target, type WritePolicy } from "../types.js";

export function parseTargets(value?: string): Target[] {
  if (!value) {
    return ["codex", "copilot", "vscode"];
  }
  return value.split(",").map((item) => targetSchema.parse(item.trim()));
}

export function printPlan(files: PlannedWrite[]): void {
  for (const file of files) {
    const icon =
      file.status === "create" ? "+" : file.status === "unchanged" ? "=" : file.status === "stale" ? "~" : "!";
    console.log(`${icon} ${file.path} (${file.status})`);
  }
}

export async function currentProjectName(repoRoot: string, explicit?: string): Promise<string> {
  return explicit ?? path.basename(repoRoot);
}

export async function fileExists(repoRoot: string, relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function promptForPolicy(repoRoot: string, planned: PlannedWrite[]): Promise<WritePolicy> {
  const manualEdits = planned.filter((file) => file.status === "manual-edit");
  if (manualEdits.length === 0) {
    return "overwrite";
  }

  console.log("Threadroot found files with manual edits:");
  for (const file of manualEdits) {
    console.log(`! ${file.path}`);
    try {
      const current = await fs.readFile(path.join(repoRoot, file.path), "utf8");
      console.log(simpleDiff(current, file.content));
    } catch {
      // The plan already captured file state; this is only a best-effort preview.
    }
  }

  const rl = readline.createInterface({ input, output });
  const answer = await rl.question("Overwrite manual edits? [y/N] ");
  rl.close();
  return answer.trim().toLowerCase() === "y" ? "overwrite" : "skip";
}
