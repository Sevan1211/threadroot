import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  emptyLockFile,
  externalToolNames,
  installObject,
  readLockFile,
  upsertLockEntry,
} from "../src/core/install/index.js";
import { runTool } from "../src/core/tools/index.js";

const run = promisify(execFile);

let repo: string;
let source: string;

async function git(cwd: string, args: string[]): Promise<void> {
  await run("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  });
}

async function write(root: string, rel: string, content: string): Promise<void> {
  const full = path.join(root, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-install-repo-"));
  source = await mkdtemp(path.join(tmpdir(), "tr-install-src-"));
  await git(source, ["init", "-b", "main"]);
  await write(source, "skills/code-review.md", "---\nname: code-review\nwhen: reviewing code\n---\nReview it.\n");
  await write(
    source,
    "skills/system-design/SKILL.md",
    "---\nname: system-design\ndescription: Use when designing software architecture and tradeoffs.\n---\nDesign it.\n",
  );
  await write(source, "skills/system-design/references/checklist.md", "# Checklist\n");
  await write(source, "tools/echo.yaml", "name: echo\ndescription: Echo a value\nrun: echo hi\n");
  await git(source, ["add", "-A"]);
  await git(source, ["commit", "-m", "seed"]);
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
  await rm(source, { recursive: true, force: true });
});

describe("installObject (local)", () => {
  it("copies a local object and records integrity without a commit", async () => {
    await write(repo, "obj/my-skill.md", "---\nname: my-skill\nwhen: x\n---\nbody\n");
    const installed = await installObject(repo, "./obj/my-skill.md");

    expect(installed).toMatchObject({ name: "my-skill", kind: "skill", scope: "project" });
    const onDisk = await readFile(path.join(repo, ".threadroot/skills/my-skill.md"), "utf8");
    expect(onDisk).toContain("name: my-skill");

    const lock = await readLockFile(path.join(repo, ".threadroot/lock.json"));
    const entry = lock.objects.find((e) => e.name === "my-skill");
    expect(entry).toMatchObject({ sourceKind: "local", kind: "skill" });
    expect(entry!.integrity).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(entry!.resolved).toBeUndefined();
  });

  it("copies a local skill directory and records tree integrity", async () => {
    await write(
      repo,
      "skills/system-design/SKILL.md",
      "---\nname: system-design\ndescription: Use when designing software architecture.\n---\nDesign it.\n",
    );
    await write(repo, "skills/system-design/references/checklist.md", "# Checklist\n");

    const installed = await installObject(repo, "./skills/system-design", { kind: "skill" });

    expect(installed).toMatchObject({ name: "system-design", kind: "skill", scope: "project" });
    expect(await readFile(path.join(repo, ".threadroot/skills/system-design/SKILL.md"), "utf8")).toContain(
      "name: system-design",
    );
    expect(await readFile(path.join(repo, ".threadroot/skills/system-design/references/checklist.md"), "utf8"))
      .toContain("Checklist");
    expect(installed.entry.integrity).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("rejects skill directories whose folder does not match SKILL.md name", async () => {
    await write(
      repo,
      "skills/wrong/SKILL.md",
      "---\nname: right\ndescription: Use when testing folder mismatch.\n---\nNope.\n",
    );

    await expect(installObject(repo, "./skills/wrong", { kind: "skill" })).rejects.toThrow(/must match/);
  });

  it("rejects local paths that escape the repo", async () => {
    await write(source, "outside.md", "---\nname: outside\nwhen: x\n---\nbody\n");

    await expect(installObject(repo, "../outside.md", { objectPath: path.relative(repo, path.join(source, "outside.md")) }))
      .rejects.toThrow(/outside the repository/);
  });

  it("rejects absolute local paths", async () => {
    await write(repo, "obj/my-skill.md", "---\nname: my-skill\nwhen: x\n---\nbody\n");

    await expect(installObject(repo, path.join(repo, "obj/my-skill.md"))).rejects.toThrow(
      /absolute repository path/,
    );
  });
});

describe("installObject (git)", () => {
  it("clones, copies the object, and pins the commit SHA + integrity", async () => {
    const installed = await installObject(repo, `git+file://${source}`, { objectPath: "skills/code-review.md" });

    expect(installed.name).toBe("code-review");
    const onDisk = await readFile(path.join(repo, ".threadroot/skills/code-review.md"), "utf8");
    expect(onDisk).toContain("name: code-review");

    const entry = installed.entry;
    expect(entry.sourceKind).toBe("git");
    expect(entry.objectPath).toBe("skills/code-review.md");
    expect(entry.resolved).toMatch(/^[0-9a-f]{40}$/);
    expect(entry.integrity).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("installs a skill directory from git and pins commit SHA + tree integrity", async () => {
    const installed = await installObject(repo, `git+file://${source}`, { objectPath: "skills/system-design" });

    expect(installed.name).toBe("system-design");
    expect(installed.entry.resolved).toMatch(/^[0-9a-f]{40}$/);
    expect(installed.entry.integrity).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await readFile(path.join(repo, ".threadroot/skills/system-design/SKILL.md"), "utf8")).toContain(
      "Design it.",
    );
  });

  it("marks installed tools untrusted until allow-listed", async () => {
    await write(repo, ".threadroot/harness.yaml", "name: demo\nversion: 1\nprofile: node-cli\nadapters:\n  - agents\n");
    await installObject(repo, `git+file://${source}`, { objectPath: "tools/echo.yaml" });

    const lock = await readLockFile(path.join(repo, ".threadroot/lock.json"));
    expect(externalToolNames(lock).has("echo")).toBe(true);

    const blocked = await runTool(repo, { name: "echo" });
    expect(blocked).toMatchObject({ status: "blocked", reason: "not-allowed" });

    await write(
      repo,
      ".threadroot/harness.yaml",
      "name: demo\nversion: 1\nprofile: node-cli\nadapters:\n  - agents\ntools:\n  allow:\n    - echo\n",
    );
    const ran = await runTool(repo, { name: "echo" });
    expect(ran.status).toBe("ran");
  });

  it("rejects object paths that escape the source repo", async () => {
    await expect(
      installObject(repo, `git+file://${source}`, { objectPath: "../escape.md" }),
    ).rejects.toThrow(/Unsafe object path/);
  });
});

describe("lock helpers", () => {
  it("upserts entries by name and kind", () => {
    let lock = emptyLockFile();
    const base = { kind: "skill" as const, sourceKind: "local" as const, source: "x", installedAt: "t" };
    lock = upsertLockEntry(lock, { name: "a", ...base, integrity: "sha256:1" });
    lock = upsertLockEntry(lock, { name: "a", ...base, integrity: "sha256:2" });
    expect(lock.objects).toHaveLength(1);
    expect(lock.objects[0]!.integrity).toBe("sha256:2");
  });
});
