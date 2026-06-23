import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readRepoFile, repoMapStatus, searchRepo, writeRepoMap } from "../src/core/repo-map.js";

let repo: string;
const execFileAsync = promisify(execFile);

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-repo-map-"));
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(repo, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

describe("repo map", () => {
  it("writes a compact navigation map with markdown links", async () => {
    await write("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest", build: "tsup" } }, null, 2));
    await write("src/index.ts", "export const demo = true;\n");
    await write("test/index.test.ts", "import { expect, it } from 'vitest';\n");

    const written = await writeRepoMap(repo);
    const content = await readFile(path.join(repo, ".threadroot/memory/repo-map.md"), "utf8");
    const status = await repoMapStatus(repo);

    expect(written.status).toBe("current");
    expect(status.status).toBe("current");
    expect(content).toContain("# Repo Map");
    expect(content).toContain("`test`: `pnpm test`");
    expect(content).toContain("[src/](../../src/)");
    expect(content).toContain("[test/index.test.ts](../../test/index.test.ts)");
  });

  it("detects stale maps after repo shape changes", async () => {
    await write("package.json", JSON.stringify({ name: "demo" }));
    await writeRepoMap(repo);

    await write("src/new-file.ts", "export const changed = true;\n");

    const status = await repoMapStatus(repo);
    expect(status.status).toBe("stale");
  });

  it("detects stale maps after content-only changes", async () => {
    await write("package.json", JSON.stringify({ name: "demo" }));
    await write("src/existing.ts", "export const value = 'old';\n");
    await writeRepoMap(repo);

    await write("src/existing.ts", "export const value = 'new';\n");

    const status = await repoMapStatus(repo);
    expect(status.status).toBe("stale");
  });

  it("does not include deleted git-index files in generated maps", async () => {
    await execFileAsync("git", ["init"], { cwd: repo });
    await write("package.json", JSON.stringify({ name: "demo" }));
    await write("test/live.test.ts", "test('live', () => {});\n");
    await write("test/deleted.test.ts", "test('deleted', () => {});\n");
    await execFileAsync("git", ["add", "package.json", "test/live.test.ts", "test/deleted.test.ts"], { cwd: repo });
    await rm(path.join(repo, "test/deleted.test.ts"));

    await writeRepoMap(repo);
    const content = await readFile(path.join(repo, ".threadroot/memory/repo-map.md"), "utf8");

    expect(content).toContain("test/live.test.ts");
    expect(content).not.toContain("test/deleted.test.ts");
  });

  it("supports safe targeted search and reads", async () => {
    await write("src/feature.ts", "export function threadrootFeature() { return 'map'; }\n");
    await writeRepoMap(repo);

    const matches = await searchRepo(repo, "threadrootFeature");
    const read = await readRepoFile(repo, "src/feature.ts", 20);
    const repoMap = await readRepoFile(repo, ".threadroot/memory/repo-map.md", 20);

    expect(matches[0]).toMatchObject({ path: "src/feature.ts", line: 1 });
    expect(read.truncated).toBe(true);
    expect(read.content).toBe("export function thre");
    expect(repoMap.content).toBe("<!-- threadroot:repo");
    await expect(readRepoFile(repo, "../outside.txt")).rejects.toThrow(/outside the repository/);
    await expect(readRepoFile(repo, path.join(repo, "src/feature.ts"))).rejects.toThrow(/absolute repository path/);
    await expect(readRepoFile(repo, ".threadroot/harness.yaml")).rejects.toThrow(/Cannot read repo text file/);
  });
});
