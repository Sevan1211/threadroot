import { buildRepoIndex, indexStatus } from "../core/repo-index.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type IndexCliOptions = JsonCliOptions & {
  force?: boolean;
};

export async function runIndex(repoRoot: string, options: IndexCliOptions = {}): Promise<void> {
  const result = await buildRepoIndex(repoRoot, { force: options.force });
  if (options.json) {
    printJson(result);
    return;
  }
  console.log(`index: ${result.status}`);
  console.log(`backend: ${result.backend ?? "none"}`);
  console.log(`path: ${result.path}`);
  console.log(`duration: ${result.durationMs}ms`);
  if (result.counts) {
    console.log(
      `objects: ${result.counts.files} files, ${result.counts.symbols} symbols, ${result.counts.edges} edges, ${result.counts.chunks} chunks, ${result.counts.skills} skills`,
    );
  }
  for (const warning of result.warnings) {
    console.log(`warning: ${warning}`);
  }
}

export async function runIndexStatus(repoRoot: string, options: JsonCliOptions = {}): Promise<void> {
  const status = await indexStatus(repoRoot);
  if (options.json) {
    printJson(status);
    return;
  }
  console.log(`index: ${status.status}`);
  console.log(`path: ${status.path}`);
  if (status.backend) {
    console.log(`backend: ${status.backend}`);
  }
  if (status.counts) {
    console.log(
      `objects: ${status.counts.files} files, ${status.counts.symbols} symbols, ${status.counts.edges} edges, ${status.counts.chunks} chunks, ${status.counts.skills} skills`,
    );
  }
  for (const warning of status.warnings) {
    console.log(`warning: ${warning}`);
  }
}
