import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readLockFile } from "../src/core/install/index.js";
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

    const lock = await readLockFile(path.join(repo, ".threadroot/lock.json"));
    const addTest = lock.objects.find((entry) => entry.name === "add-test" && entry.kind === "skill");
    expect(addTest).toMatchObject({
      sourceKind: "local",
      source: "pack:testing",
      objectPath: "skills/add-test",
    });
    expect(addTest?.integrity).toMatch(/^sha256:[0-9a-f]{64}$/);
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

  it("rejects absolute pack paths outside the repository", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "tr-outside-pack-"));
    try {
      await writeFile(
        path.join(outside, "pack.yaml"),
        ["name: outside", "version: 1", "description: Outside pack"].join("\n"),
      );
      const report = await validatePack(repo, outside);
      expect(report.ok).toBe(false);
      expect(report.findings[0]?.message).toContain("repo-relative or a built-in pack name");
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
