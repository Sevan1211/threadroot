import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { inspectPack, installPack, listPacks, validatePack } from "../src/core/packs/index.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-packs-"));
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(repo, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

describe("packs", () => {
  it("lists and inspects bundled packs", async () => {
    const packs = await listPacks(repo);
    expect(packs.map((pack) => pack.name)).toContain("typescript-node");

    const inspected = await inspectPack(repo, "typescript-node");
    expect(inspected.skills).toContain("build-tool");
    expect(inspected.skills).toContain("add-test");
  });

  it("validates bundled packs", async () => {
    const report = await validatePack(repo, "system-design");
    expect(report.ok).toBe(true);
  });

  it("installs a bundled pack into the project harness", async () => {
    await installPack(repo, "testing");

    expect(await readFile(path.join(repo, ".threadroot/skills/add-test/SKILL.md"), "utf8")).toContain("Add Test");
    expect(await readFile(path.join(repo, ".threadroot/skills/debug-failure/SKILL.md"), "utf8")).toContain(
      "Debug Failure",
    );
  });

  it("rejects unsafe pack references", async () => {
    await write(
      "packs/bad/pack.yaml",
      ["name: bad", "version: 1", "description: Bad pack", "skills:", "  - ../skills/add-test"].join("\n"),
    );

    const report = await validatePack(repo, "packs/bad");
    expect(report.ok).toBe(false);
    expect(report.findings[0]?.message).toContain("Unsafe pack reference");
  });
});
