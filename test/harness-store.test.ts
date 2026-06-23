import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseFrontmatter, serializeFrontmatter } from "../src/core/harness/frontmatter.js";
import { HarnessError, loadManifest, resolveHarness } from "../src/core/harness/load.js";

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "threadroot-harness-"));
}

async function write(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

const MANIFEST = `name: demo
version: 1
profile: node-cli
adapters: [agents, claude]
`;

describe("frontmatter", () => {
  it("parses frontmatter and body, and round-trips", () => {
    const doc = serializeFrontmatter({ name: "add-test", when: "writing a test" }, "Step one.");
    const parsed = parseFrontmatter(doc);
    expect(parsed.data).toMatchObject({ name: "add-test", when: "writing a test" });
    expect(parsed.body).toBe("Step one.");
  });

  it("treats files without a fence as pure body", () => {
    expect(parseFrontmatter("just text").body).toBe("just text");
    expect(parseFrontmatter("just text").data).toEqual({});
  });
});

describe("harness store", () => {
  it("throws a clear error when no harness exists", async () => {
    const repo = await tempDir();
    await expect(loadManifest(repo)).rejects.toBeInstanceOf(HarnessError);
  });

  it("loads and merges user and project scopes (project wins by name)", async () => {
    const repo = await tempDir();
    const home = await tempDir();

    await write(path.join(repo, ".threadroot/harness.yaml"), MANIFEST);

    // user scope: a personal skill + a tool that project will override
    await write(
      path.join(home, ".threadroot/skills/commit.md"),
      "---\nname: commit\nwhen: committing\n---\nUser version.",
    );
    await write(
      path.join(home, ".threadroot/tools/test.yaml"),
      "name: test\ndescription: user test\nrun: echo user\n",
    );
    await write(path.join(home, ".threadroot/memory/project.md"), "Personal note.");

    // project scope: overrides the tool, adds a rule + memory
    await write(
      path.join(repo, ".threadroot/skills/system-design/SKILL.md"),
      "---\nname: system-design\ndescription: Use when designing software architecture.\n---\nDesign it.",
    );
    await write(
      path.join(repo, ".threadroot/tools/test.yaml"),
      "name: test\ndescription: project test\nrun: pnpm test\n",
    );
    await write(
      path.join(repo, ".threadroot/rules/api.md"),
      "---\nname: api\napplyTo: src/api/**\n---\nValidate inputs.",
    );
    await write(path.join(repo, ".threadroot/memory/project.md"), "Repo facts.");

    const harness = await resolveHarness(repo, { home });

    expect(harness.manifest.name).toBe("demo");
    expect(harness.skills.map((s) => s.name)).toEqual(["commit", "system-design"]);
    expect(harness.skills[0].origin).toBe("user");
    expect(harness.skills[1].sourcePath.replace(/\\/g, "/")).toMatch(/system-design\/SKILL\.md$/);

    const tool = harness.tools.find((t) => t.name === "test");
    expect(tool?.origin).toBe("project");
    expect(tool?.manifest.run).toBe("pnpm test");

    expect(harness.rules.map((r) => r.name)).toEqual(["api"]);
    expect(harness.rules[0].frontmatter.applyTo).toBe("src/api/**");

    // memory is additive: both user and project entries are present
    const memoryOrigins = harness.memory.filter((m) => m.type === "project").map((m) => m.origin);
    expect(memoryOrigins).toContain("user");
    expect(memoryOrigins).toContain("project");
  });

  it("surfaces validation errors with the file path", async () => {
    const repo = await tempDir();
    await write(path.join(repo, ".threadroot/harness.yaml"), MANIFEST);
    await write(path.join(repo, ".threadroot/tools/broken.yaml"), "name: broken\ndescription: x\n");

    await expect(resolveHarness(repo, { home: await tempDir() })).rejects.toThrow(/broken\.yaml/);
  });
});
