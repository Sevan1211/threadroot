import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ADAPTERS,
  buildContext,
  compile,
  detectDrift,
} from "../src/core/compile/index.js";
import { extractHandAuthored, MANAGED_BEGIN } from "../src/core/compile/managed.js";
import type { EffectiveHarness } from "../src/core/harness/index.js";
import {
  harnessManifestSchema,
  ruleFrontmatterSchema,
  skillFrontmatterSchema,
  toolManifestSchema,
} from "../src/core/harness/index.js";

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(path.join(tmpdir(), "tr-compile-"));
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

function harness(overrides: Partial<EffectiveHarness> = {}): EffectiveHarness {
  const { manifest: manifestOverride, ...rest } = overrides;
  const manifest = harnessManifestSchema.parse({
    name: "demo",
    version: 1,
    profile: "node-cli",
    adapters: ["agents", "claude", "copilot", "cursor"],
    ...(manifestOverride ?? {}),
  });
  return {
    manifest,
    skills: [
      {
        name: "review",
        origin: "project",
        sourcePath: ".threadroot/skills/review.md",
        frontmatter: skillFrontmatterSchema.parse({ name: "review", when: "reviewing a PR" }),
        body: "Do the review.",
      },
    ],
    rules: [
      {
        name: "style",
        origin: "project",
        sourcePath: ".threadroot/rules/style.md",
        frontmatter: ruleFrontmatterSchema.parse({ name: "style" }),
        body: "Use tabs.",
      },
      {
        name: "tests",
        origin: "project",
        sourcePath: ".threadroot/rules/tests.md",
        frontmatter: ruleFrontmatterSchema.parse({ name: "tests", applyTo: "test/**" }),
        body: "Write vitest tests.",
      },
    ],
    tools: [
      {
        name: "build",
        origin: "project",
        sourcePath: ".threadroot/tools/build.yaml",
        manifest: toolManifestSchema.parse({ name: "build", description: "Build it", run: "pnpm build" }),
      },
    ],
    connections: [],
    memory: [
      {
        type: "project",
        origin: "project",
        sourcePath: ".threadroot/memory/project.md",
        body: "This is a demo project.",
      },
    ],
    ...rest,
  };
}

describe("compile", () => {
  it("writes AGENTS.md with a managed block containing skills, tools, conventions, and memory", async () => {
    const files = await compile(repoRoot, harness());
    const agents = files.find((f) => f.path === "AGENTS.md");
    expect(agents).toBeDefined();
    expect(agents!.content).toContain(MANAGED_BEGIN);
    expect(agents!.content).toContain("## Skills");
    expect(agents!.content).toContain("**review** — reviewing a PR");
    expect(agents!.content).toContain("## Tools");
    expect(agents!.content).toContain("`build`");
    expect(agents!.content).toContain("## Conventions");
    expect(agents!.content).toContain("Use tabs.");
    expect(agents!.content).toContain("This is a demo project.");
  });

  it("keeps global rules in AGENTS.md but emits scoped rules as vendor files", async () => {
    const files = await compile(repoRoot, harness());
    const byPath = new Map(files.map((f) => [f.path, f.content]));

    expect(byPath.get("AGENTS.md")).not.toContain("Write vitest tests.");
    expect(byPath.has(".cursor/rules/tests.mdc")).toBe(true);
    expect(byPath.has(".claude/rules/tests.md")).toBe(true);
    expect(byPath.has(".github/instructions/tests.instructions.md")).toBe(true);

    expect(byPath.get(".cursor/rules/tests.mdc")).toContain("globs: test/**");
    expect(byPath.get(".cursor/rules/tests.mdc")).toContain("alwaysApply: false");
    expect(byPath.get(".claude/rules/tests.md")).toContain('  - "test/**"');
    expect(byPath.get(".github/instructions/tests.instructions.md")).toContain('applyTo: "test/**"');
  });

  it("does not emit vendor files for global rules", async () => {
    const files = await compile(repoRoot, harness());
    expect(files.some((f) => f.path.endsWith("style.mdc"))).toBe(false);
    expect(files.some((f) => f.path === ".claude/rules/style.md")).toBe(false);
  });

  it("CLAUDE.md imports AGENTS.md and copilot mirrors the canonical content", async () => {
    const files = await compile(repoRoot, harness());
    const claude = files.find((f) => f.path === "CLAUDE.md")!;
    const copilot = files.find((f) => f.path === ".github/copilot-instructions.md")!;
    const agents = files.find((f) => f.path === "AGENTS.md")!;

    expect(claude.content).toContain("@AGENTS.md");
    expect(copilot.content).toBe(agents.content);
  });

  it("emits a Claude slash command per tool", async () => {
    const files = await compile(repoRoot, harness());
    const command = files.find((f) => f.path === ".claude/commands/build.md")!;
    expect(command.content).toContain("pnpm build");
  });

  it("is deterministic", async () => {
    const a = await compile(repoRoot, harness());
    const b = await compile(repoRoot, harness());
    expect(a).toEqual(b);
  });

  it("only runs adapters listed in the manifest", async () => {
    const files = await compile(repoRoot, harness({ manifest: { adapters: ["agents"] } as never }));
    expect(files.some((f) => f.path === "CLAUDE.md")).toBe(false);
    expect(files.some((f) => f.path === "AGENTS.md")).toBe(true);
  });
});

describe("references", () => {
  it("links by default and inlines eager files", async () => {
    await writeFile(path.join(repoRoot, "ARCH.md"), "# Architecture\n\nLayered.", "utf8");
    const h = harness({
      manifest: harnessManifestSchema.parse({
        name: "demo",
        version: 1,
        profile: "node-cli",
        adapters: ["agents"],
        references: [
          { path: "docs/guide.md", description: "Guide" },
          { path: "ARCH.md", load: "eager" },
        ],
      }),
    });
    const files = await compile(repoRoot, h);
    const agents = files.find((f) => f.path === "AGENTS.md")!;
    expect(agents.content).toContain("[docs/guide.md](docs/guide.md) — Guide");
    expect(agents.content).toContain("_(missing)_");
    expect(agents.content).toContain("Layered.");
  });

  it("rejects eager references that escape the repo", async () => {
    const h = harness({
      manifest: harnessManifestSchema.parse({
        name: "demo",
        version: 1,
        profile: "node-cli",
        adapters: ["agents"],
        references: [{ path: "../outside.md", load: "eager" }],
      }),
    });

    await expect(compile(repoRoot, h)).rejects.toThrow(/outside the repository/);
  });

  it("rejects absolute eager references", async () => {
    const h = harness({
      manifest: harnessManifestSchema.parse({
        name: "demo",
        version: 1,
        profile: "node-cli",
        adapters: ["agents"],
        references: [{ path: path.join(repoRoot, "ARCH.md"), load: "eager" }],
      }),
    });

    await expect(compile(repoRoot, h)).rejects.toThrow(/absolute repository path/);
  });
});

describe("hand-authored prose", () => {
  it("is preserved across recompiles", async () => {
    const first = await compile(repoRoot, harness());
    const agents = first.find((f) => f.path === "AGENTS.md")!;
    const handEdited = `# My Project\n\nHand-authored intro.\n\n${agents.content.slice(agents.content.indexOf(MANAGED_BEGIN))}`;
    await writeFile(path.join(repoRoot, "AGENTS.md"), handEdited, "utf8");

    const ctx = await buildContext(repoRoot, harness());
    expect(ctx.handAuthored).toContain("Hand-authored intro.");
    expect(ctx.canonicalAgents).toContain("Hand-authored intro.");
    expect(ctx.canonicalAgents).toContain("## Skills");
    expect(extractHandAuthored(ctx.canonicalAgents)).not.toContain(MANAGED_BEGIN);
  });
});

describe("detectDrift", () => {
  it("reports create, unchanged, and drift", async () => {
    const files = await compile(repoRoot, harness());
    const agents = files.find((f) => f.path === "AGENTS.md")!;

    const beforeWrite = await detectDrift(repoRoot, [agents]);
    expect(beforeWrite[0].status).toBe("create");

    await writeFile(path.join(repoRoot, "AGENTS.md"), agents.content, "utf8");
    const afterWrite = await detectDrift(repoRoot, [agents]);
    expect(afterWrite[0].status).toBe("unchanged");

    await writeFile(path.join(repoRoot, "AGENTS.md"), `${agents.content}\nedited`, "utf8");
    const afterEdit = await detectDrift(repoRoot, [agents]);
    expect(afterEdit[0].status).toBe("drift");
  });
});

describe("adapter registry", () => {
  it("exposes all four adapters", () => {
    expect(Object.keys(ADAPTERS).sort()).toEqual(["agents", "claude", "copilot", "cursor"]);
  });
});
