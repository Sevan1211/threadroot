import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  HarnessError,
  appendMemory,
  assembleContext,
  compactMemory,
  readMemory,
  resolveHarness,
} from "../src/core/harness/index.js";
import { mcpServerEntry } from "../src/core/mcp-config.js";
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
    "name: demo\nversion: 1\nprofile: node-cli\nadapters:\n  - agents\n",
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

  it("dedupes appends and compacts old bullets with a cache archive", async () => {
    await appendMemory(repo, "pitfalls", "Do not call the API twice.");
    await appendMemory(repo, "pitfalls", "Do not call the API twice.");
    await appendMemory(repo, "pitfalls", "Cache invalidation is hard.");
    await appendMemory(repo, "pitfalls", "Prefer indexed task packets.");

    const result = await compactMemory(repo, { type: "pitfalls", maxEntries: 2 });
    const body = await readMemory(repo, "pitfalls");

    expect(result.files[0]).toMatchObject({ changed: true, entriesBefore: 3, entriesAfter: 2, removed: 1 });
    expect(result.files[0]?.archivePath).toContain(".threadroot");
    expect(body).not.toContain("Do not call the API twice.");
    expect(body).toContain("Cache invalidation is hard.");
    expect(body).toContain("Prefer indexed task packets.");
  });

  it("does not rewrite structured prose memory during compaction", async () => {
    await write(
      ".threadroot/memory/project.md",
      ["# Project", "", "This paragraph should remain intact.", "- A stable project fact."].join("\n"),
    );

    const result = await compactMemory(repo, { type: "project", maxEntries: 1 });
    const body = await readMemory(repo, "project");

    expect(result.files[0]).toMatchObject({ changed: false, entriesBefore: 1, entriesAfter: 1 });
    expect(body).toContain("This paragraph should remain intact.");
    expect(body).toContain("- A stable project fact.");
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

describe("mcpServerEntry", () => {
  it("builds the Threadroot stdio MCP command entry", () => {
    expect(mcpServerEntry("node", "/path/cli.js")).toEqual({ command: "node", args: ["/path/cli.js", "mcp"] });
    expect(mcpServerEntry("threadroot")).toEqual({ command: "threadroot", args: ["mcp"] });
  });
});
