import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setupGlobal } from "../src/core/setup.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "tr-setup-home-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("global setup", () => {
  it("installs, checks, and removes managed global agent setup", async () => {
    const mcpEntry = { command: "node", args: ["/tmp/threadroot/dist/index.js", "mcp"] };
    const dryRun = await setupGlobal({ home, agents: "codex,claude,cursor,copilot,gemini,windsurf,antigravity,opencode", mode: "dry-run", mcp: true, mcpEntry });
    expect(dryRun.entries.filter((entry) => entry.status === "create").length).toBe(10);

    await expect(readFile(path.join(home, ".agents/skills/threadroot/SKILL.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });

    const write = await setupGlobal({ home, agents: "all", mcp: true, mcpEntry });
    expect(write.entries.map((entry) => entry.path)).toEqual(
      expect.arrayContaining([
        path.join("~", ".agents", "skills", "threadroot", "SKILL.md"),
        path.join("~", ".claude", "skills", "threadroot", "SKILL.md"),
        path.join("~", ".cursor", "skills", "threadroot", "SKILL.md"),
        path.join("~", ".copilot", "skills", "threadroot", "SKILL.md"),
        path.join("~", ".gemini", "skills", "threadroot", "SKILL.md"),
        path.join("~", ".codeium", "windsurf", "skills", "threadroot", "SKILL.md"),
        path.join("~", ".gemini", "antigravity", "skills", "threadroot", "SKILL.md"),
        path.join("~", ".config", "opencode", "skills", "threadroot", "SKILL.md"),
        path.join("~", ".codex", "AGENTS.md"),
        path.join("~", ".codex", "config.toml"),
      ]),
    );

    const codexSkill = await readFile(path.join(home, ".agents/skills/threadroot/SKILL.md"), "utf8");
    expect(codexSkill).toContain("name: threadroot");
    expect(codexSkill).toContain("threadroot context");

    const codexAgents = await readFile(path.join(home, ".codex/AGENTS.md"), "utf8");
    expect(codexAgents).toContain("threadroot:begin global-codex");

    const codexConfig = await readFile(path.join(home, ".codex/config.toml"), "utf8");
    expect(codexConfig).toContain("[mcp_servers.threadroot]");
    expect(codexConfig).toContain('command = "node"');
    expect(codexConfig).toContain('args = ["/tmp/threadroot/dist/index.js", "mcp"]');

    const check = await setupGlobal({ home, agents: "codex", mode: "check", mcp: true, mcpEntry });
    expect(check.entries.every((entry) => entry.status === "present" || entry.status === "unchanged")).toBe(true);

    const undo = await setupGlobal({ home, agents: "codex", mode: "undo", mcp: true, mcpEntry });
    expect(undo.entries.map((entry) => entry.status)).toEqual(["removed", "removed", "removed"]);
  });
});
