import path from "node:path";

export const CONFIG_PATH = ".threadroot/config.json";
export const MANIFEST_PATH = ".threadroot/manifest.json";
export const SKILLS_INDEX_PATH = ".threadroot/skills-index.json";
export const REPO_MAP_PATH = ".threadroot/repo-map.json";
export const MEMORY_REPORT_PATH = ".threadroot/memory-report.json";
export const AUTOMATION_PATH = ".threadroot/automation.json";

export function toRepoPath(repoRoot: string, relativePath: string): string {
  return path.join(repoRoot, relativePath);
}
