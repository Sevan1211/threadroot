import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { codexCommandPlan, codexStatus, codexTraceEvents, installCodex } from "../src/core/codex.js";
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
    await expect(readFile(path.join(repo, ".threadroot/codex/install.json"), "utf8")).resolves.toContain(
      "codex mcp add threadroot",
    );

    await expect(exists("AGENTS.md")).resolves.toBe(false);
    await expect(exists(".codex")).resolves.toBe(false);
    await expect(exists(".agents/skills/threadroot/SKILL.md")).resolves.toBe(false);
    await expect(exists(".threadroot/providers/codex/connection.json")).resolves.toBe(false);
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
    expect(skill).toContain("threadroot task \"<task>\" --json");
    expect(skill).toContain("MCP `task_packet`");
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

  it("extracts Codex JSONL command, file, and MCP tool events into trace events", () => {
    const plan = codexCommandPlan({ repoRoot: "/repo" });
    const events = codexTraceEvents(
      plan,
      [
        JSON.stringify({ type: "item.started", item: { type: "command_execution", command: "npm test", status: "in_progress" } }),
        JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "npm test", exit_code: 0 } }),
        JSON.stringify({ type: "item.completed", item: { type: "file_change", path: "src/index.ts" } }),
        JSON.stringify({ type: "item.completed", item: { type: "mcp_tool_call", name: "task_packet", status: "completed" } }),
      ].join("\n"),
    );

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "command", command: "npm test", ok: true }),
        expect.objectContaining({ type: "edit_file", path: "src/index.ts" }),
        expect.objectContaining({ type: "run_tool", tool: "task_packet" }),
      ]),
    );
  });
});
