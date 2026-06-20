import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createConfig } from "../src/core/config.js";
import { runDoctor } from "../src/core/doctor.js";
import { generateFiles } from "../src/core/generate.js";
import { applyWrites, planWrites } from "../src/core/writer.js";

async function tempRepo(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "threadroot-doctor-"));
}

describe("doctor", () => {
  it("reports missing config", async () => {
    const result = await runDoctor(await tempRepo());
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain("config");
    expect(result.actions[0]?.command).toBe("threadroot start");
  });

  it("passes after init files are written", async () => {
    const repo = await tempRepo();
    const config = createConfig({
      profile: "vite-react",
      projectName: "demo",
      targets: ["codex", "copilot", "vscode"],
      strictness: "standard",
    });
    const plan = await planWrites(repo, generateFiles(config));
    await applyWrites(repo, plan, "overwrite");

    const result = await runDoctor(repo);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.actions).toEqual([]);
  });
});
