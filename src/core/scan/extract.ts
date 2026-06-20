import fs from "node:fs/promises";
import path from "node:path";
import type { SourceCandidate, SourceExtract } from "../../types.js";

function extractHeadings(content: string): string[] {
  return content
    .split("\n")
    .filter((line) => /^#{1,4}\s+/.test(line))
    .map((line) => line.replace(/^#{1,4}\s+/, "").trim())
    .filter(Boolean);
}

function extractSnippets(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) && /(must|avoid|never|test|build|deploy|decision|architecture|agent|context)/i.test(line))
    .slice(0, 8)
    .map((line) => line.replace(/^[-*]\s+/, ""));
}

export async function extractSources(repoRoot: string, candidates: SourceCandidate[]): Promise<SourceExtract[]> {
  const selected = candidates.filter((candidate) => candidate.selected && candidate.kind !== "directory");
  const extracts: SourceExtract[] = [];

  for (const candidate of selected) {
    try {
      const content = await fs.readFile(path.join(repoRoot, candidate.path), "utf8");
      extracts.push({
        path: candidate.path,
        kind: candidate.kind,
        headings: extractHeadings(content),
        snippets: extractSnippets(content),
      });
    } catch {
      extracts.push({
        path: candidate.path,
        kind: candidate.kind,
        headings: [],
        snippets: [],
      });
    }
  }

  return extracts;
}
