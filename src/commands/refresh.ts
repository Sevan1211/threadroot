import { refreshContext } from "../core/freshness.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type RefreshCliOptions = JsonCliOptions & {
  force?: boolean;
};

export async function runRefresh(repoRoot: string, options: RefreshCliOptions = {}): Promise<void> {
  const result = await refreshContext(repoRoot, { force: options.force });
  if (options.json) {
    printJson(result);
    return;
  }

  console.log("context: refreshed");
  console.log(`repo map: ${result.mapStatus}${result.refreshed.includes("repo-map") ? " (updated)" : ""}`);
  console.log(`index: ${result.indexStatus}${result.refreshed.includes("index") ? " (updated)" : ""}`);
  console.log(`duration: ${result.durationMs}ms`);
  for (const warning of result.warnings) {
    console.log(`warning: ${warning}`);
  }
}
