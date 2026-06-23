import { buildRepoIndex, indexStatus, type RepoIndexBuildResult, type RepoIndexStatus } from "./repo-index.js";
import { repoMapStatus, writeRepoMap, type RepoMapStatus, type RepoMapSummary, type RepoMapWriteResult } from "./repo-map.js";

export type ContextFreshnessSummary = {
  mapStatus: RepoMapStatus | "error";
  indexStatus: RepoIndexStatus["status"] | "error";
  refreshed: Array<"repo-map" | "index">;
  durationMs: number;
  warnings: string[];
};

export type ContextRefreshResult = ContextFreshnessSummary & {
  repoMap?: RepoMapSummary | RepoMapWriteResult;
  index?: RepoIndexStatus;
  indexBuild?: RepoIndexBuildResult;
};

export type RefreshContextOptions = {
  force?: boolean;
  home?: string;
};

function shouldRefreshIndex(status: RepoIndexStatus): boolean {
  if (status.status === "missing" || status.status === "stale") {
    return true;
  }
  return status.status === "degraded" && status.adapters.sqlite !== "unavailable";
}

export async function refreshContext(repoRoot: string, options: RefreshContextOptions = {}): Promise<ContextRefreshResult> {
  const started = Date.now();
  const refreshed: ContextRefreshResult["refreshed"] = [];
  const warnings: string[] = [];
  let repoMap: RepoMapSummary | RepoMapWriteResult | undefined;
  let index: RepoIndexStatus | undefined;
  let indexBuild: RepoIndexBuildResult | undefined;

  try {
    const mapBefore = await repoMapStatus(repoRoot);
    if (options.force || mapBefore.status !== "current") {
      repoMap = await writeRepoMap(repoRoot);
      refreshed.push("repo-map");
    } else {
      repoMap = mapBefore;
    }
  } catch (error) {
    warnings.push(`repo-map refresh failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const before = await indexStatus(repoRoot);
    if (options.force || shouldRefreshIndex(before) || refreshed.includes("repo-map")) {
      indexBuild = await buildRepoIndex(repoRoot, { force: options.force, home: options.home });
      index = indexBuild;
      refreshed.push("index");
    } else {
      index = before;
    }
  } catch (error) {
    warnings.push(`index refresh failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    mapStatus: repoMap?.status ?? "error",
    indexStatus: index?.status ?? "error",
    refreshed,
    durationMs: Date.now() - started,
    warnings,
    repoMap,
    index,
    indexBuild,
  };
}
