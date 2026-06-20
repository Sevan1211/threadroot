import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { toRepoPath } from "../src/core/paths.js";
import { walkRepo } from "../src/core/scan/walk.js";

async function tempRepo(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "threadroot-hardening-"));
}

describe("toRepoPath containment", () => {
  it("resolves a valid relative path inside the repo", async () => {
    const repo = await tempRepo();
    const resolved = toRepoPath(repo, ".threadroot/harness.yaml");
    expect(resolved).toBe(path.join(path.resolve(repo), ".threadroot/harness.yaml"));
  });

  it("rejects parent-directory traversal", async () => {
    const repo = await tempRepo();
    expect(() => toRepoPath(repo, "../../etc/passwd")).toThrow(/outside the repository/);
  });

  it("rejects absolute paths that escape the repo", async () => {
    const repo = await tempRepo();
    expect(() => toRepoPath(repo, "/etc/passwd")).toThrow(/absolute repository path/);
  });

  it("rejects absolute paths even when they point inside the repo", async () => {
    const repo = await tempRepo();
    expect(() => toRepoPath(repo, path.join(repo, "AGENTS.md"))).toThrow(/absolute repository path/);
  });

  it("rejects the repo root itself", async () => {
    const repo = await tempRepo();
    expect(() => toRepoPath(repo, ".")).toThrow(/outside the repository/);
  });
});

describe("walkRepo", () => {
  it("returns an empty list for an unreadable directory", async () => {
    const repo = await tempRepo();
    const files = await walkRepo(repo, path.join(repo, "does-not-exist"));
    expect(files).toEqual([]);
  });

  it("includes nested files and skips ignored directories", async () => {
    const repo = await tempRepo();
    await fs.mkdir(path.join(repo, "src"), { recursive: true });
    await fs.mkdir(path.join(repo, "node_modules", "pkg"), { recursive: true });
    await fs.writeFile(path.join(repo, "src", "index.ts"), "export {};\n");
    await fs.writeFile(path.join(repo, "node_modules", "pkg", "skip.js"), "module.exports = {};\n");

    const files = await walkRepo(repo);
    expect(files).toContain("src/index.ts");
    expect(files.some((file) => file.startsWith("node_modules/"))).toBe(false);
  });
});
