import path from "node:path";
import type { SourceCandidateKind } from "../../types.js";
import { configFiles } from "./rules.js";

export type Classification = {
  kind: SourceCandidateKind;
  score: number;
  reason: string;
};

export function isMarkdown(filePath: string): boolean {
  return /\.(md|mdx)$/i.test(filePath);
}

export function classify(relativePath: string): Classification | undefined {
  const base = path.basename(relativePath);
  const lower = relativePath.toLowerCase();

  if (base === "AGENTS.md" || base === "CLAUDE.md" || lower.includes(".cursor/") || lower.endsWith("copilot-instructions.md")) {
    return { kind: "agent", score: 100, reason: "Existing agent instructions" };
  }

  if (base === "README.md") {
    return { kind: "markdown", score: 95, reason: "Project README" };
  }

  if (lower.startsWith("docs/") || lower.includes("/docs/")) {
    return { kind: "markdown", score: isMarkdown(relativePath) ? 85 : 55, reason: "Project documentation" };
  }

  if (isMarkdown(relativePath)) {
    const contextual = /(architecture|decision|adr|todo|notes|roadmap|plan|pitfall|handoff)/i.test(relativePath);
    return { kind: "markdown", score: contextual ? 80 : 60, reason: contextual ? "Likely project context" : "Markdown file" };
  }

  if (configFiles.has(base)) {
    return { kind: "config", score: 75, reason: "Project configuration" };
  }

  if (lower.startsWith(".github/workflows/") && /\.(yml|yaml)$/i.test(relativePath)) {
    return { kind: "workflow", score: 70, reason: "CI workflow" };
  }

  return undefined;
}
