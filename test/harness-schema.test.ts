import { describe, expect, it } from "vitest";

import {
  harnessManifestSchema,
  ruleFrontmatterSchema,
  skillFrontmatterSchema,
  toolManifestSchema,
} from "../src/core/harness/schema.js";
import { emptyLockFile, lockFileSchema, parseSourceRef } from "../src/core/install/source.js";

describe("harness manifest schema", () => {
  it("applies defaults for memory budget and tool allow-list", () => {
    const manifest = harnessManifestSchema.parse({
      name: "demo",
      version: 1,
      profile: "node-cli",
      adapters: ["agents", "claude"],
    });

    expect(manifest.memory.budget).toEqual({});
    expect(manifest.tools.allow).toEqual([]);
  });

  it("rejects an empty adapter list", () => {
    expect(() =>
      harnessManifestSchema.parse({ name: "demo", version: 1, profile: "node-cli", adapters: [] }),
    ).toThrow();
  });
});

describe("object frontmatter schemas", () => {
  it("defaults skill scope to project", () => {
    const fm = skillFrontmatterSchema.parse({ name: "add-test", when: "writing a test" });
    expect(fm.scope).toBe("project");
    expect(fm.tags).toEqual([]);
  });

  it("accepts an optional applyTo glob on rules", () => {
    const fm = ruleFrontmatterSchema.parse({ name: "api-style", applyTo: "src/api/**" });
    expect(fm.applyTo).toBe("src/api/**");
  });
});

describe("tool manifest schema", () => {
  it("accepts a run command with typed inputs", () => {
    const tool = toolManifestSchema.parse({
      name: "run-migration",
      description: "Apply migrations",
      confirm: true,
      input: { target: { type: "string", default: "latest" } },
      run: "pnpm db:migrate --to {{target}}",
    });
    expect(tool.confirm).toBe(true);
    expect(tool.input.target.default).toBe("latest");
  });

  it("requires exactly one of run or script", () => {
    expect(() =>
      toolManifestSchema.parse({ name: "x", description: "y", run: "a", script: "b" }),
    ).toThrow();
    expect(() => toolManifestSchema.parse({ name: "x", description: "y" })).toThrow();
  });
});

describe("source ref parsing", () => {
  it("parses a github source with path and ref", () => {
    const ref = parseSourceRef("github:acme/agent-tools/run-migration@v1");
    expect(ref).toMatchObject({
      kind: "git",
      provider: "github",
      owner: "acme",
      repo: "agent-tools",
      objectPath: "run-migration",
      ref: "v1",
    });
  });

  it("parses a registry source with version", () => {
    expect(parseSourceRef("registry:code-review@2")).toMatchObject({
      kind: "registry",
      name: "code-review",
      version: "2",
    });
  });

  it("parses a git url", () => {
    expect(parseSourceRef("git+https://example.com/repo.git@main")).toMatchObject({
      kind: "git",
      provider: "url",
      url: "https://example.com/repo.git",
      ref: "main",
    });
  });

  it("treats explicit paths as local and bare tokens as registry", () => {
    expect(parseSourceRef("./local/skill")).toMatchObject({ kind: "local", path: "./local/skill" });
    expect(parseSourceRef("code-review")).toMatchObject({ kind: "registry", name: "code-review" });
  });

  it("throws on an invalid github source", () => {
    expect(() => parseSourceRef("github:acme")).toThrow();
  });
});

describe("lock file schema", () => {
  it("round-trips an empty lock file", () => {
    expect(lockFileSchema.parse(emptyLockFile())).toEqual({ version: 1, objects: [] });
  });
});
