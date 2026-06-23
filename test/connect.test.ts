import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { connectProviders } from "../src/core/connect.js";
import { initHarness } from "../src/core/init/index.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-connect-"));
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

describe("connectProviders", () => {
  it("writes only .threadroot provider receipts by default", async () => {
    const report = await connectProviders(repo, { agents: "codex,claude,cursor,vscode,gemini,windsurf,opencode" });

    expect(report.agents.map((entry) => entry.status)).toEqual([
      "written",
      "written",
      "written",
      "written",
      "written",
      "written",
      "written",
    ]);
    await expect(readFile(path.join(repo, ".threadroot/providers/codex/connection.json"), "utf8")).resolves.toContain(
      "codex mcp add threadroot",
    );

    await expect(exists("AGENTS.md")).resolves.toBe(false);
    await expect(exists("CLAUDE.md")).resolves.toBe(false);
    await expect(exists(".codex")).resolves.toBe(false);
    await expect(exists(".claude")).resolves.toBe(false);
    await expect(exists(".cursor")).resolves.toBe(false);
    await expect(exists(".vscode")).resolves.toBe(false);
    await expect(exists(".mcp.json")).resolves.toBe(false);
  });

  it("requires explicit project-files mode before writing visible MCP config", async () => {
    const report = await connectProviders(repo, { agents: "claude,cursor,vscode", projectFiles: true });

    expect(report.projectFiles).toBe(true);
    expect(report.agents.flatMap((entry) => entry.projectFiles)).toEqual(
      expect.arrayContaining([".mcp.json", path.join(".cursor", "mcp.json"), path.join(".vscode", "mcp.json")]),
    );
    await expect(exists(".mcp.json")).resolves.toBe(true);
    await expect(exists(".cursor/mcp.json")).resolves.toBe(true);
    await expect(exists(".vscode/mcp.json")).resolves.toBe(true);
  });

  it("refreshes the global agent skill only when explicitly requested", async () => {
    const dry = await connectProviders(repo, { agents: "codex", home: repo });
    expect(dry.agents[0]?.skillPath).toBeUndefined();
    await expect(exists(".agents/skills/threadroot/SKILL.md")).resolves.toBe(false);

    const report = await connectProviders(repo, { agents: "codex,claude", home: repo, refreshSkill: true });
    const codex = report.agents.find((entry) => entry.agent === "codex");
    const claude = report.agents.find((entry) => entry.agent === "claude");
    expect(codex?.skillPath).toBe(path.join(repo, ".agents", "skills", "threadroot", "SKILL.md"));
    expect(claude?.skillPath).toBeUndefined();
    expect(claude?.notes).toContain("Global Threadroot skill refresh is Codex-only in this release.");
    const skill = await readFile(path.join(repo, ".agents", "skills", "threadroot", "SKILL.md"), "utf8");
    expect(skill).toContain("threadroot task \"<task>\" --json");
    expect(skill).toContain("threadroot refresh --json");
    expect(skill).toContain("threadroot improve latest --json");
    expect(skill).not.toContain("threadroot improve apply --auto-safe --json");
    expect(skill).toContain("MCP `task_packet`");
    expect(skill).not.toContain("threadroot start");
    expect(skill).not.toContain("threadroot bootstrap");
    expect(skill).not.toContain("threadroot expose");
  });
});
