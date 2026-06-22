import { repoMapStatus, writeRepoMap, type RepoMapSummary } from "../core/repo-map.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type MapCliOptions = JsonCliOptions & {
  write?: boolean;
  check?: boolean;
};

function printSummary(summary: RepoMapSummary): void {
  console.log(`repo map: ${summary.status}`);
  console.log(`path: ${summary.path}`);
  console.log(`profile: ${summary.profile}`);
  console.log(`files: ${summary.fileCount}`);
  console.log(`tree hash: ${summary.treeHash}`);
  if (summary.storedTreeHash && summary.storedTreeHash !== summary.treeHash) {
    console.log(`stored tree hash: ${summary.storedTreeHash}`);
  }
  if (summary.status !== "current") {
    console.log("next: threadroot map --write");
  }
}

export async function runMap(repoRoot: string, options: MapCliOptions): Promise<void> {
  const result = options.write ? await writeRepoMap(repoRoot) : await repoMapStatus(repoRoot);
  if (options.json) {
    printJson(result);
    if (options.check && result.status !== "current") {
      process.exitCode = 1;
    }
    return;
  }

  printSummary(result);
  if (options.write) {
    console.log(`written: ${result.path}`);
  }
  if (options.check && result.status !== "current") {
    process.exitCode = 1;
  }
}
