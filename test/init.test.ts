import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveHarness } from "../src/core/harness/index.js";
import { projectLockPath } from "../src/core/harness/paths.js";
import { InitError, initHarness } from "../src/core/init/index.js";
import { importVendorFiles } from "../src/core/init/import.js";
import { readLockFile } from "../src/core/install/lock.js";

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
  it("scaffolds built-ins, detects the profile, and stays local-only by default", async () => {
    await mkdir(path.join(repo, ".git", "info"), { recursive: true });
    await write("package.json", JSON.stringify({ name: "demo-app", bin: { demo: "cli.js" }, scripts: { test: "vitest", build: "tsup" } }));

    const report = await initHarness(repo, { import: false });

    expect(report.name).toBe("demo-app");
    expect(report.profile).toBe("node-cli");
    expect(report.adapters).toEqual([]);
    expect(report.skills.length).toBe(5);
    expect(report.tools).toEqual(expect.arrayContaining(["test", "build"]));

    const harness = await resolveHarness(repo);
    expect(harness.skills.map((s) => s.name).sort()).toEqual([
      "create-connection",
      "create-skill",
      "create-tool",
      "find-skills",
      "threadroot",
    ]);
    expect(harness.manifest.automation.mode).toBe("ask");
    expect(harness.manifest.tools.allow).toEqual(expect.arrayContaining(["test", "build"]));
    expect(harness.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["test", "build"]));

    const lock = await readLockFile(projectLockPath(repo));
    expect(lock.objects.filter((entry) => entry.kind === "skill").map((entry) => entry.name).sort()).toEqual([
      "create-connection",
      "create-skill",
      "create-tool",
      "find-skills",
      "threadroot",
    ]);
    expect(lock.objects.find((entry) => entry.name === "find-skills")).toMatchObject({
      source: "threadroot:seed/find-skills",
      upstreamSource: "https://www.skills.sh/vercel-labs/skills/find-skills",
      adaptedBy: "threadroot",
      reviewed: true,
    });

    await expect(readFile(path.join(repo, "AGENTS.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(report.compiled).toEqual([]);
    await expect(readFile(path.join(repo, ".threadroot/memory/repo-map.md"), "utf8")).resolves.toContain("# Repo Map");
    await expect(readFile(path.join(repo, ".gitignore"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(repo, ".git/info/exclude"), "utf8")).resolves.toContain(".threadroot/");
  });

  it("refuses to clobber an existing harness without force", async () => {
    await initHarness(repo, { import: false });
    await expect(initHarness(repo, { import: false })).rejects.toThrow(InitError);
    await expect(initHarness(repo, { import: false, force: true })).resolves.toBeDefined();
  });

  it("imports existing AGENTS.md prose without injecting adapter output by default", async () => {
    await write("AGENTS.md", "# Demo\n\nAlways run the tests before committing.\n");

    await initHarness(repo, {});

    const agents = await readFile(path.join(repo, "AGENTS.md"), "utf8");
    expect(agents).toContain("Always run the tests before committing.");
    expect(agents).not.toContain("<!-- threadroot:begin");
    await expect(readFile(path.join(repo, ".threadroot/imports/report.json"), "utf8")).resolves.toContain("AGENTS.md");
  });

  it("does not create AGENTS.md when importing other provider files", async () => {
    await write("CLAUDE.md", "# Claude\n\nUse pnpm for package commands.\n");

    await initHarness(repo, {});

    await expect(readFile(path.join(repo, "AGENTS.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(repo, ".threadroot/imports/canonical.md"), "utf8")).resolves.toContain("Use pnpm");
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
