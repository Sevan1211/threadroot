import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { codexCommandPlan, codexStatus, installCodex } from "../src/core/codex.js";
import { initHarness } from "../src/core/init/index.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-codex-"));
  await mkdir(path.join(repo, ".git", "info"), { recursive: true });
  await initHarness(repo, { import: false, home: repo });
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

async function exists(relativePath: string): Promise<boolean> {
  try {
    await stat(path.join(repo, relativePath));
    return true;
  } catch {
    return false;
  }
}

describe("Codex integration", () => {
  it("builds the safe default Codex exec plan", () => {
    const plan = codexCommandPlan({ repoRoot: "/repo" });
    expect(plan).toMatchObject({
      runner: "exec",
      command: "codex",
      outputFormat: "jsonl",
    });
    expect(plan.args).toEqual(expect.arrayContaining(["exec", "--json", "--sandbox", "workspace-write", "-C", "/repo", "-"]));
  });

  it("writes only a Codex install receipt by default", async () => {
    const report = await installCodex(repo);

    expect(report.status).toBe("written");
    await expect(readFile(path.join(repo, ".codex/threadroot/install.json"), "utf8")).resolves.toContain(
      "codex mcp add threadroot",
    );

    await expect(exists("AGENTS.md")).resolves.toBe(true);
    await expect(exists(".codex/threadroot/init.json")).resolves.toBe(true);
    await expect(exists(".agents/skills/threadroot/SKILL.md")).resolves.toBe(false);
    await expect(exists(".threadroot")).resolves.toBe(false);
  });

  it("refreshes the global Codex skill only when explicitly requested", async () => {
    const dry = await installCodex(repo, { home: repo });
    expect(dry.skillPath).toBeUndefined();
    await expect(exists(".agents/skills/threadroot/SKILL.md")).resolves.toBe(false);

    const report = await installCodex(repo, { home: repo, refreshSkill: true });
    expect(report.skillPath).toBe(path.join(repo, ".agents", "skills", "threadroot", "SKILL.md"));
    const skill = await readFile(path.join(repo, ".agents", "skills", "threadroot", "SKILL.md"), "utf8");
    expect(skill).toContain("threadroot codex status --json");
    expect(skill).toContain("threadroot codex doctor --json");
    expect(skill).toContain("threadroot prep \"<task>\" --json");
    expect(skill).toContain("MCP `context_budget`");
    expect(skill).not.toContain("threadroot task");
    expect(skill).not.toContain("threadroot providers");
    expect(skill).not.toContain("providers_status");
    expect(skill).not.toContain("threadroot connect");
    expect(skill).not.toContain("threadroot start");
  });

  it("reports Codex status and MCP guidance", async () => {
    const status = await codexStatus(repo, repo);
    expect(status.id).toBe("codex");
    expect(status.defaultPlan.args).toEqual(expect.arrayContaining(["exec", "--json"]));
    expect(status.mcp.setup).toContain("codex mcp add threadroot -- threadroot mcp");
    expect(status.mcp.smokeTools).toContain("codex_status");
  });

});
