import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

async function exists(rel: string): Promise<boolean> {
  try {
    await stat(path.join(repo, rel));
    return true;
  } catch {
    return false;
  }
}

describe("initHarness", () => {
  it("initializes Codex-native state and AGENTS.md without .threadroot", async () => {
    await write("package.json", JSON.stringify({ name: "demo-app", scripts: { test: "vitest", lint: "eslint ." } }, null, 2));

    const report = await initHarness(repo, { import: false });

    expect(report.name).toBe("demo-app");
    expect(report.adapters).toEqual([]);
    expect(report.skills).toEqual([]);
    expect(report.tools).toEqual([]);
    expect(report.stateDir).toBe(path.join(repo, ".codex", "threadroot"));
    expect(report.compiled).toEqual([path.join(repo, "AGENTS.md")]);
    expect(report.nextSteps.map((step) => step.command)).toEqual(
      expect.arrayContaining([
        "threadroot codex install --refresh-skill",
        'threadroot prep "<task>" --memory tiny --json',
        "threadroot codex doctor --json",
      ]),
    );

    const agents = await readFile(path.join(repo, "AGENTS.md"), "utf8");
    expect(agents).toContain("## Threadroot");
    expect(agents).toContain('threadroot prep "<task>" --memory tiny --json');
    expect(agents).toContain("Store local optimizer evidence only under `.codex/threadroot/`");
    expect(agents).toContain("lint: `npm run lint`");
    expect(agents).toContain("test: `npm run test`");

    const receipt = await readFile(path.join(repo, ".codex", "threadroot", "init.json"), "utf8");
    expect(receipt).toContain("https://developers.openai.com/codex/guides/agents-md");
    expect(await exists(".threadroot")).toBe(false);
    expect(await readFile(path.join(repo, ".gitignore"), "utf8")).toContain(".codex/threadroot/");
  });

  it("refuses legacy .threadroot unless force is used, then removes it", async () => {
    await write(".threadroot/harness.yaml", "name: stale\n");

    await expect(initHarness(repo, { import: false })).rejects.toThrow(InitError);
    await expect(initHarness(repo, { import: false, force: true })).resolves.toBeDefined();
    expect(await exists(".threadroot")).toBe(false);
    expect(await exists(".codex/threadroot/init.json")).toBe(true);
  });

  it("preserves existing AGENTS.md prose and upserts the Threadroot block", async () => {
    await write("AGENTS.md", "# Demo\n\nAlways run the tests before committing.\n");

    await initHarness(repo, {});
    await initHarness(repo, { force: true });

    const agents = await readFile(path.join(repo, "AGENTS.md"), "utf8");
    expect(agents).toContain("Always run the tests before committing.");
    expect((agents.match(/threadroot:begin codex-context-optimizer/g) ?? []).length).toBe(1);
    expect(await exists(".threadroot")).toBe(false);
  });
});

describe("importVendorFiles", () => {
  it("imports AGENTS.md as the only canonical source", async () => {
    await write("AGENTS.md", "# Guide\n\nUse conventional commits.\n");
    await write("CLAUDE.md", "# Guide\n\nUse conventional commits.\n");

    const report = await importVendorFiles(repo);

    expect(report.canonicalSource).toBe("AGENTS.md");
    expect(report.canonicalBody).toContain("Use conventional commits.");
    expect(report.skippedDuplicates).toHaveLength(0);
    expect(report.foldedFrom).toHaveLength(0);
  });

  it("ignores secondary non-Codex files", async () => {
    await write("OTHER_AGENT.md", "# Guide\n\nUse conventional commits.\n\n## Deploy\n\nRun the deploy script.\n");

    const report = await importVendorFiles(repo);

    expect(report.canonicalSource).toBeUndefined();
    expect(report.canonicalBody).toBe("");
    expect(report.foldedFrom).toHaveLength(0);
  });
});
