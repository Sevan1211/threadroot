import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveHarness } from "../src/core/harness/index.js";
import { InitError, initHarness } from "../src/core/init/index.js";
import { importVendorFiles } from "../src/core/init/import.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-init-"));
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(repo, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

describe("initHarness", () => {
  it("scaffolds built-ins, detects the profile, and compiles", async () => {
    await write("package.json", JSON.stringify({ name: "demo-app", bin: { demo: "cli.js" }, scripts: { test: "vitest", build: "tsup" } }));

    const report = await initHarness(repo, { import: false });

    expect(report.name).toBe("demo-app");
    expect(report.profile).toBe("node-cli");
    expect(report.skills.length).toBe(9);
    expect(report.tools).toEqual(expect.arrayContaining(["test", "build"]));

    const harness = await resolveHarness(repo);
    expect(harness.skills.map((s) => s.name)).toContain("code-review");
    expect(harness.skills.map((s) => s.name)).toContain("system-design");
    expect(harness.skills.map((s) => s.name)).toContain("build-skill");
    expect(harness.skills.map((s) => s.name)).toContain("build-tool");
    expect(await readFile(path.join(repo, ".threadroot/skills/system-design/evals/triggers.json"), "utf8"))
      .toContain("shouldTrigger");
    expect(harness.manifest.tools.allow).toEqual(expect.arrayContaining(["test", "build"]));
    expect(harness.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["test", "build"]));

    const agents = await readFile(path.join(repo, "AGENTS.md"), "utf8");
    expect(agents).toContain("<!-- threadroot:begin");
    expect(report.compiled).toContain("AGENTS.md");
  });

  it("refuses to clobber an existing harness without force", async () => {
    await initHarness(repo, { import: false });
    await expect(initHarness(repo, { import: false })).rejects.toThrow(InitError);
    await expect(initHarness(repo, { import: false, force: true })).resolves.toBeDefined();
  });

  it("imports existing AGENTS.md prose into canonical, preserved through compile", async () => {
    await write("AGENTS.md", "# Demo\n\nAlways run the tests before committing.\n");

    await initHarness(repo, {});

    const agents = await readFile(path.join(repo, "AGENTS.md"), "utf8");
    expect(agents).toContain("Always run the tests before committing.");
    expect(agents).toContain("<!-- threadroot:begin");
  });
});

describe("importVendorFiles (approach D)", () => {
  it("picks canonical by precedence and skips pure duplicates", async () => {
    await write("AGENTS.md", "# Guide\n\nUse conventional commits.\n");
    await write("CLAUDE.md", "# Guide\n\nUse conventional commits.\n");

    const report = await importVendorFiles(repo);

    expect(report.canonicalSource).toBe("AGENTS.md");
    expect(report.skippedDuplicates).toContain("CLAUDE.md");
    expect(report.foldedFrom).toHaveLength(0);
  });

  it("folds novel sections from secondary files", async () => {
    await write("AGENTS.md", "# Guide\n\nUse conventional commits.\n");
    await write("CLAUDE.md", "# Guide\n\nUse conventional commits.\n\n## Deploy\n\nRun the deploy script.\n");

    const report = await importVendorFiles(repo);

    expect(report.foldedFrom).toContain("CLAUDE.md");
    expect(report.canonicalBody).toContain("Run the deploy script.");
    expect(report.canonicalBody).toContain("<!-- imported from CLAUDE.md -->");
  });

  it("maps cursor .mdc rules structurally with applyTo", async () => {
    await write(".cursor/rules/api.mdc", "---\nglobs: src/api/**\n---\nKeep handlers thin.\n");

    const report = await importVendorFiles(repo);

    expect(report.importedRules).toHaveLength(1);
    expect(report.importedRules[0]).toMatchObject({ name: "api", applyTo: "src/api/**" });
  });
});
