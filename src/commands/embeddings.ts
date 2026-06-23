import { embeddingsStatus, refreshEmbeddings, writeEmbeddingsConfig } from "../core/embeddings.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type EmbeddingsConfigureOptions = JsonCliOptions & {
  provider?: string;
  model?: string;
  endpoint?: string;
  dimension?: string;
  disable?: boolean;
};

function parseDimension(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function runEmbeddingsConfigure(repoRoot: string, options: EmbeddingsConfigureOptions = {}): Promise<void> {
  const config = await writeEmbeddingsConfig(repoRoot, {
    enabled: options.disable ? false : Boolean(options.provider || options.model || options.endpoint),
    provider: options.provider,
    model: options.model,
    endpoint: options.endpoint,
    dimension: parseDimension(options.dimension),
  });
  if (options.json) {
    printJson(config);
    return;
  }
  console.log(`embeddings: ${config.enabled ? "configured" : "disabled"}`);
  if (config.provider) console.log(`provider: ${config.provider}`);
  if (config.model) console.log(`model: ${config.model}`);
  console.log("Built-in local hashing embeddings stay active in the repo index; external provider calls remain explicit.");
}

export async function runEmbeddingsStatus(repoRoot: string, options: JsonCliOptions = {}): Promise<void> {
  const status = await embeddingsStatus(repoRoot);
  if (options.json) {
    printJson(status);
    return;
  }
  console.log(`embeddings: ${status.enabled ? "enabled" : "disabled"}`);
  console.log(`built-in: ${status.builtIn.provider}/${status.builtIn.model} (${status.builtIn.indexedEmbeddings} indexed)`);
  console.log(`index: ${status.indexStatus}`);
  console.log(status.message);
}

export async function runEmbeddingsRefresh(repoRoot: string, options: JsonCliOptions = {}): Promise<void> {
  const result = await refreshEmbeddings(repoRoot);
  if (options.json) {
    printJson(result);
    return;
  }
  console.log(`embeddings refresh: ${result.refreshedChunks} chunk(s)`);
  console.log(result.message);
}
