import { webFetch, webStatus } from "../core/web.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type WebStatusCliOptions = JsonCliOptions;
export type WebFetchCliOptions = JsonCliOptions & {
  maxTokens?: string;
  refresh?: boolean;
};

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function runWebStatus(_repoRoot: string, options: WebStatusCliOptions = {}): Promise<void> {
  const status = webStatus();
  if (options.json) {
    printJson(status);
    return;
  }
  console.log(`web fetch: ${status.fetchAvailable ? "available" : "unavailable"}`);
  console.log(`web search: ${status.searchAvailable ? "available" : "codex/delegated only"}`);
  for (const note of status.notes) {
    console.log(`note: ${note}`);
  }
}

export async function runWebFetch(repoRoot: string, url: string, options: WebFetchCliOptions = {}): Promise<void> {
  try {
    const result = await webFetch(repoRoot, url, {
      maxTokens: parsePositiveInteger(options.maxTokens),
      refresh: options.refresh,
    });
    if (options.json) {
      printJson(result);
      return;
    }
    console.log(`url: ${result.url}`);
    if (result.title) {
      console.log(`title: ${result.title}`);
    }
    console.log(`fetched: ${result.fetchedAt}${result.cached ? " (cached)" : ""}`);
    console.log(`hash: ${result.hash}`);
    console.log(`token estimate: ${result.tokenEstimate}${result.truncated ? " (truncated)" : ""}`);
    console.log(`warning: ${result.warning}`);
    console.log("");
    console.log(result.content);
  } catch (error) {
    if (options.json) {
      printJson({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } else {
      console.error(`Web fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exitCode = 1;
  }
}
