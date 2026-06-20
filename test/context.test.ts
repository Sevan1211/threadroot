import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatContextSuggestion, suggestContext } from "../src/core/context-suggest.js";
import { buildRepoMap } from "../src/core/repo-map.js";

async function tempRepo(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "threadroot-context-"));
}

describe("context suggestions", () => {
  it("builds a repo map and suggests focused context", async () => {
    const repo = await tempRepo();
    await fs.mkdir(path.join(repo, "src/components"), { recursive: true });
    await fs.writeFile(path.join(repo, "README.md"), "# Demo\n");
    await fs.writeFile(path.join(repo, "src/components/BillingSettings.tsx"), "export function BillingSettings() {}\n");
    await fs.writeFile(path.join(repo, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));

    const map = await buildRepoMap(repo);
    expect(map.entries.map((entry) => entry.path)).toContain("src/components/BillingSettings.tsx");

    const suggestion = await suggestContext(repo, "add billing settings screen");
    expect(suggestion.skills.map((skill) => skill.id)).toContain("ui.implement-screen");
    expect(formatContextSuggestion(suggestion)).toContain("threadroot/repo-map.md");
  });
});
