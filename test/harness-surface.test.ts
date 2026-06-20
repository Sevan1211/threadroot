import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HarnessError, appendMemory, assembleContext, readMemory, resolveHarness } from "../src/core/harness/index.js";
import { mcpServerEntry, writeProjectMcpConfigs } from "../src/core/mcp-config.js";
import { harnessStatus } from "../src/core/status.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-surface-"));
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(repo, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

async function seedHarness(): Promise<void> {
  await write(
    ".threadroot/harness.yaml",
    "name: demo\nversion: 1\nprofile: node-cli\nadapters:\n  - agents\n  - claude\n",
  );
  await write(
    ".threadroot/skills/add-test.md",
    "---\nname: add-test\nwhen: \"writing or fixing a unit test\"\ntags: [testing]\n---\nWrite the test.\n",
  );
  await write(
    ".threadroot/skills/deploy.md",
    "---\nname: deploy\nwhen: \"shipping a release\"\n---\nShip it.\n",
  );
  await write(".threadroot/tools/build.yaml", "name: build\ndescription: Build it\nrun: echo build\n");
  await write(".threadroot/memory/project.md", "This is the demo project.\n");
}

describe("assembleContext", () => {
  it("ranks skills by task relevance and includes tools and memory", async () => {
    await seedHarness();
    const harness = await resolveHarness(repo);
    const context = await assembleContext(repo, "fix a failing unit test", { harness });

    expect(context.skills.map((s) => s.name)).toEqual(["add-test"]);
    expect(context.skills[0]!.score).toBeGreaterThan(0);
    expect(context.tools.map((t) => t.name)).toEqual(["build"]);
    expect(context.memory).toEqual([{ type: "project", body: "This is the demo project." }]);
  });
});

describe("memory read/append", () => {
  it("appends bullets, creating the file with a heading", async () => {
    const first = await appendMemory(repo, "pitfalls", "Do not call the API twice.");
    expect(first.type).toBe("pitfalls");

    await appendMemory(repo, "pitfalls", "Cache invalidation is hard.");
    const body = await readMemory(repo, "pitfalls");
    expect(body).toContain("# Pitfalls");
    expect(body).toContain("- Do not call the API twice.");
    expect(body).toContain("- Cache invalidation is hard.");
  });

  it("returns null for missing memory and rejects unknown types", async () => {
    expect(await readMemory(repo, "handoff")).toBeNull();
    await expect(readMemory(repo, "bogus")).rejects.toThrow(HarnessError);
    await expect(appendMemory(repo, "project", "   ")).rejects.toThrow(HarnessError);
  });
});

describe("harnessStatus", () => {
  it("reports absence when there is no harness", async () => {
    expect(await harnessStatus(repo)).toEqual({ exists: false });
  });

  it("summarizes manifest, counts, and drift", async () => {
    await seedHarness();
    const status = await harnessStatus(repo);
    expect(status.exists).toBe(true);
    if (status.exists) {
      expect(status.manifest.profile).toBe("node-cli");
      expect(status.counts).toMatchObject({ skills: 2, tools: 1, memory: 1 });
      expect(status.drift.some((entry) => entry.path === "AGENTS.md" && entry.status === "create")).toBe(true);
    }
  });
});

describe("writeProjectMcpConfigs", () => {
  it("writes merge-aware project config for each agent", async () => {
    await write(".cursor/mcp.json", JSON.stringify({ mcpServers: { other: { command: "x", args: [] } } }));

    const result = await writeProjectMcpConfigs({ repoRoot: repo, entry: mcpServerEntry("node", "/path/cli.js") });
    expect(result.written).toContain(path.join(".vscode", "mcp.json"));

    const vscode = JSON.parse(await readFile(path.join(repo, ".vscode", "mcp.json"), "utf8"));
    expect(vscode.servers.threadroot).toEqual({ command: "node", args: ["/path/cli.js", "mcp"] });

    const cursor = JSON.parse(await readFile(path.join(repo, ".cursor", "mcp.json"), "utf8"));
    expect(cursor.mcpServers.other).toBeDefined();
    expect(cursor.mcpServers.threadroot).toBeDefined();
  });
});
