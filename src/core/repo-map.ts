import path from "node:path";
import { scanRepository } from "./scanner.js";
import { walkRepo } from "./scan/walk.js";
import type { GeneratedFile, RepoMap, RepoMapEntry } from "../types.js";
import { REPO_MAP_PATH } from "./paths.js";
import { repoMapMarkdown } from "./templates.js";

function roleFor(filePath: string): string | undefined {
  const base = path.basename(filePath);
  const lower = filePath.toLowerCase();

  if (base === "package.json") return "JavaScript package metadata and scripts.";
  if (base === "pyproject.toml") return "Python project metadata and tooling.";
  if (base === "dbt_project.yml" || base === "dbt_project.yaml") return "dbt project configuration.";
  if (base === "AGENTS.md") return "Existing coding-agent guidance.";
  if (base === "README.md") return "Primary project overview.";
  if (lower.includes("/components/") || lower.startsWith("components/")) return "UI component area.";
  if (lower.includes("/app/") || lower.startsWith("app/")) return "Application routes or app entrypoints.";
  if (lower.includes("/pages/") || lower.startsWith("pages/")) return "Page routes.";
  if (lower.includes("/api/") || lower.startsWith("api/")) return "API or service endpoint area.";
  if (lower.includes("/test") || lower.includes(".test.") || lower.includes(".spec.")) return "Test coverage area.";
  if (lower.startsWith("docs/") || lower.includes("/docs/")) return "Project documentation.";
  if (lower.startsWith("src/")) return "Source code area.";
  return undefined;
}

function scoreFor(filePath: string, role: string): number {
  if (filePath === "README.md" || filePath === "AGENTS.md") return 100;
  if (role.includes("configuration") || role.includes("metadata")) return 90;
  if (role.includes("routes") || role.includes("endpoint")) return 80;
  if (role.includes("component") || role.includes("Source")) return 70;
  if (role.includes("documentation")) return 65;
  if (role.includes("Test")) return 60;
  return 50;
}

function entriesFromFiles(files: string[]): RepoMapEntry[] {
  return files
    .map((file): RepoMapEntry | undefined => {
      const role = roleFor(file);
      if (!role) return undefined;
      return {
        path: file,
        kind: "file",
        role,
        score: scoreFor(file, role),
      };
    })
    .filter((entry): entry is RepoMapEntry => Boolean(entry))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

export async function buildRepoMap(repoRoot: string): Promise<RepoMap> {
  const [files, scan] = await Promise.all([walkRepo(repoRoot), scanRepository(repoRoot)]);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    root: path.basename(repoRoot),
    likelyProfile: scan.likelyProfile,
    entries: entriesFromFiles(files),
    commands: scan.detectedCommands,
  };
}

export function repoMapFiles(map: RepoMap): GeneratedFile[] {
  return [
    {
      path: "threadroot/repo-map.md",
      content: repoMapMarkdown(map),
      generated: false,
    },
    {
      path: REPO_MAP_PATH,
      content: `${JSON.stringify(map, null, 2)}\n`,
      generated: false,
    },
  ];
}
