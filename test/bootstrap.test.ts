import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bootstrapProject, startSession } from "../src/core/bootstrap.js";

let repo: string;
let home: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-bootstrap-repo-"));
  home = await mkdtemp(path.join(tmpdir(), "tr-bootstrap-home-"));
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(repo, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

describe("bootstrapProject", () => {
  it("prints a safe plan without writing by default", async () => {
    const report = await bootstrapProject(repo, { home, agents: "codex" });

    expect(report.mode).toBe("plan");
    expect(report.init).toBeUndefined();
    expect(report.setup?.entries.map((entry) => entry.status)).toEqual(["create", "create"]);
    await expect(readFile(path.join(repo, ".threadroot/harness.yaml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(home, ".agents/skills/threadroot/SKILL.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("bootstraps global setup and local-only project harness with --yes", async () => {
    await write("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest" } }));

    const report = await bootstrapProject(repo, { home, yes: true, agents: "codex", task: "write tests" });

    expect(report.mode).toBe("write");
    expect(report.init?.name).toBe("demo");
    expect(report.status?.exists).toBe(true);
    expect(report.doctor?.ok).toBe(true);
    expect(report.context?.skills.map((skill) => skill.name)).toEqual(
      expect.arrayContaining(["threadroot", "find-skills", "create-skill", "create-tool", "create-connection"]),
    );

    const manifest = await readFile(path.join(repo, ".threadroot/harness.yaml"), "utf8");
    expect(manifest).toContain("adapters: []");
    await expect(readFile(path.join(repo, "AGENTS.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    const skill = await readFile(path.join(home, ".agents/skills/threadroot/SKILL.md"), "utf8");
    expect(skill).toContain("threadroot context");
    expect(skill).toContain("threadroot map --write");
  });

  it("returns starter skills when the bootstrap task has no direct skill match", async () => {
    const report = await bootstrapProject(repo, { home, yes: true, agents: "codex", task: "zzzz-no-match" });
    expect(report.context?.skills.length).toBeGreaterThan(0);
    expect(report.context?.skills.every((skill) => skill.score === 0)).toBe(true);
  });

  it("keeps provider exposure opt-in", async () => {
    const report = await bootstrapProject(repo, { home, yes: true, agents: "codex", expose: "codex" });

    expect(report.expose?.entries[0]?.path).toBe(path.join(".agents", "skills", "threadroot", "SKILL.md"));
    const skill = await readFile(path.join(repo, ".agents/skills/threadroot/SKILL.md"), "utf8");
    expect(skill).toContain("Provider target: Codex.");
  });

  it("preserves an existing harness", async () => {
    const first = await bootstrapProject(repo, { home, yes: true, agents: "codex" });
    const second = await bootstrapProject(repo, { home, yes: true, agents: "codex" });

    expect(first.init).toBeDefined();
    expect(second.init).toBeUndefined();
    expect(second.notes).toContain("Existing harness detected; bootstrap will not reinitialize it.");
  });
});

describe("startSession", () => {
  it("returns doctor, status, and task context for an initialized harness", async () => {
    await write("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest" } }));
    await bootstrapProject(repo, { home, yes: true, agents: "codex" });

    const report = await startSession(repo, { home, task: "write tests" });

    expect(report.status.exists).toBe(true);
    expect(report.doctor?.ok).toBe(true);
    expect(report.context?.skills.map((skill) => skill.name)).toContain("find-skills");
  });
});
