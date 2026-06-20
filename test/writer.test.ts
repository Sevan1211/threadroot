import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createConfig } from "../src/core/config.js";
import { generateFiles } from "../src/core/generate.js";
import { applyWrites, planWrites } from "../src/core/writer.js";

async function tempRepo(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "threadroot-test-"));
}

describe("writer", () => {
  it("plans creates, unchanged files, stale files, and manual edits", async () => {
    const repo = await tempRepo();
    const config = createConfig({
      profile: "nextjs",
      projectName: "demo",
      targets: ["codex", "copilot", "vscode"],
      strictness: "standard",
    });
    const files = generateFiles(config);

    const firstPlan = await planWrites(repo, files);
    expect(firstPlan.every((file) => file.status === "create")).toBe(true);

    await applyWrites(repo, firstPlan, "overwrite");
    const secondPlan = await planWrites(repo, files);
    expect(secondPlan.every((file) => file.status === "unchanged")).toBe(true);

    await fs.writeFile(path.join(repo, "AGENTS.md"), "manual edit\n");
    const thirdPlan = await planWrites(repo, files);
    expect(thirdPlan.find((file) => file.path === "AGENTS.md")?.status).toBe("manual-edit");
  });
});

