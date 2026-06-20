import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRevampContext, scanRepository } from "../src/core/scanner.js";

async function tempRepo(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "threadroot-scan-"));
}

describe("scanner", () => {
  it("detects likely context sources and package commands", async () => {
    const repo = await tempRepo();
    await fs.mkdir(path.join(repo, "docs"), { recursive: true });
    await fs.writeFile(path.join(repo, "README.md"), "# Demo\n\n- Avoid editing generated files.\n");
    await fs.writeFile(path.join(repo, "AGENTS.md"), "# Agents\n\n## Rules\n");
    await fs.writeFile(path.join(repo, "docs/architecture.md"), "# Architecture\n\n## API\n");
    await fs.writeFile(
      path.join(repo, "package.json"),
      JSON.stringify({ name: "demo", scripts: { test: "vitest run" }, dependencies: { vite: "^5.0.0" } }),
    );

    const scan = await scanRepository(repo);
    expect(scan.likelyProfile).toBe("vite-react");
    expect(scan.existingAgentFiles).toContain("AGENTS.md");
    expect(scan.detectedCommands).toContainEqual({
      name: "test",
      command: "pnpm test",
      purpose: "Detected package script: vitest run",
    });

    const context = await buildRevampContext(repo, scan);
    expect(context.selectedSources.map((source) => source.path)).toContain("README.md");
    expect(context.selectedSources.find((source) => source.path === "docs/architecture.md")?.headings).toContain(
      "Architecture",
    );
  });
});
