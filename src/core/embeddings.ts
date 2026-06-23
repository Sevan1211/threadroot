import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { projectHarnessDir } from "./harness/paths.js";
import {
  buildRepoIndex,
  indexStatus,
  LOCAL_EMBEDDING_DIMENSIONS,
  LOCAL_EMBEDDING_MODEL,
  LOCAL_EMBEDDING_PROVIDER,
} from "./repo-index.js";

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
  builtIn: {
    enabled: true;
    provider: string;
    model: string;
    dimension: number;
    indexedEmbeddings: number;
  };
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
  const builtIn = {
    enabled: true as const,
    provider: LOCAL_EMBEDDING_PROVIDER,
    model: LOCAL_EMBEDDING_MODEL,
    dimension: LOCAL_EMBEDDING_DIMENSIONS,
    indexedEmbeddings: status.counts?.embeddings ?? 0,
  };
  if (!config?.enabled) {
    return {
      configured: Boolean(config),
      enabled: true,
      provider: LOCAL_EMBEDDING_PROVIDER,
      model: LOCAL_EMBEDDING_MODEL,
      dimension: LOCAL_EMBEDDING_DIMENSIONS,
      builtIn,
      indexStatus: status.status,
      message:
        "Built-in local hashing embeddings are active with zero keys, zero network, and repo-local storage. External provider embeddings are not configured.",
    };
  }
  return {
    configured: true,
    enabled: true,
    provider: config.provider,
    model: config.model,
    endpoint: config.endpoint,
    dimension: config.dimension,
    builtIn,
    indexStatus: status.status,
    message:
      "Built-in local hashing embeddings are active. External provider embeddings are configured but never called automatically; refresh keeps provider calls explicit.",
  };
}

export async function refreshEmbeddings(repoRoot: string): Promise<EmbeddingsStatus & { refreshedChunks: number }> {
  await buildRepoIndex(repoRoot, { force: true });
  const status = await embeddingsStatus(repoRoot);
  return {
    ...status,
    refreshedChunks: status.builtIn.indexedEmbeddings,
    message: status.configured
      ? "Refreshed built-in local hashing embeddings. External provider refresh remains explicit and no model calls were made."
      : "Refreshed built-in local hashing embeddings with zero keys, zero network, and repo-local storage.",
  };
}
