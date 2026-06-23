import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { projectHarnessDir } from "./harness/paths.js";
import { indexStatus } from "./repo-index.js";

export type EmbeddingsConfig = {
  enabled: boolean;
  provider?: string;
  model?: string;
  endpoint?: string;
  dimension?: number;
  updatedAt: string;
};

export type EmbeddingsStatus = {
  configured: boolean;
  enabled: boolean;
  provider?: string;
  model?: string;
  endpoint?: string;
  dimension?: number;
  indexStatus: string;
  message: string;
};

function configPath(repoRoot: string): string {
  return path.join(projectHarnessDir(repoRoot), "embeddings.json");
}

export async function readEmbeddingsConfig(repoRoot: string): Promise<EmbeddingsConfig | undefined> {
  try {
    return JSON.parse(await readFile(configPath(repoRoot), "utf8")) as EmbeddingsConfig;
  } catch {
    return undefined;
  }
}

export async function writeEmbeddingsConfig(
  repoRoot: string,
  config: Omit<EmbeddingsConfig, "updatedAt">,
): Promise<EmbeddingsConfig> {
  const next = { ...config, updatedAt: new Date().toISOString() };
  await mkdir(path.dirname(configPath(repoRoot)), { recursive: true });
  await writeFile(configPath(repoRoot), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function embeddingsStatus(repoRoot: string): Promise<EmbeddingsStatus> {
  const config = await readEmbeddingsConfig(repoRoot);
  const status = await indexStatus(repoRoot);
  if (!config?.enabled) {
    return {
      configured: Boolean(config),
      enabled: false,
      indexStatus: status.status,
      message: "Embeddings are disabled. Threadroot uses deterministic lexical, symbol, graph, memory, and skill routing.",
    };
  }
  return {
    configured: true,
    enabled: true,
    provider: config.provider,
    model: config.model,
    endpoint: config.endpoint,
    dimension: config.dimension,
    indexStatus: status.status,
    message: "Embeddings are configured, but refresh requires an explicit provider adapter. No model calls are made automatically.",
  };
}

export async function refreshEmbeddings(repoRoot: string): Promise<EmbeddingsStatus & { refreshedChunks: number }> {
  const status = await embeddingsStatus(repoRoot);
  return {
    ...status,
    refreshedChunks: 0,
    message: status.enabled
      ? "Embedding refresh skipped: provider adapters are explicit and are not called automatically yet."
      : status.message,
  };
}
