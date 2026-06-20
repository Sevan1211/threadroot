import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProgram } from "../src/cli.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-cli-"));
  await write("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest" } }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await rm(repo, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(repo, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

async function run(...args: string[]): Promise<string> {
  vi.restoreAllMocks();
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
    lines.push(String(message ?? ""));
  });
  vi.spyOn(console, "error").mockImplementation((message?: unknown) => {
    lines.push(String(message ?? ""));
  });

  await createProgram(repo).exitOverride().parseAsync(["node", "threadroot", ...args]);
  return lines.join("\n");
}

describe("CLI smoke", () => {
  it("walks the core first-run command flow", async () => {
    const bootstrap = await run("bootstrap", "--yes", "--no-global", "--no-import", "--task", "write tests");
    expect(bootstrap).toContain("Threadroot bootstrap: complete");
    expect(bootstrap).toContain("project init: created local-only .threadroot/");

    const status = await run("status");
    expect(status).toContain("harness: demo");
    expect(status).toContain("adapters: none (local-only)");

    const statusJson = JSON.parse(await run("status", "--json")) as { exists: boolean; manifest: { name: string } };
    expect(statusJson.exists).toBe(true);
    expect(statusJson.manifest.name).toBe("demo");

    const context = await run("context", "write tests");
    expect(context).toContain("task: write tests");
    expect(context).toContain("add-test");

    const contextJson = JSON.parse(await run("context", "write tests", "--json")) as { task: string };
    expect(contextJson.task).toBe("write tests");

    const skills = await run("skills", "validate");
    expect(skills).toContain("Skills valid.");

    const skillsJson = JSON.parse(await run("skills", "list", "--json")) as { skills: Array<{ name: string }> };
    expect(skillsJson.skills.map((skill) => skill.name)).toContain("add-test");

    const diff = await run("diff");
    expect(diff).toContain("No drift");

    const doctor = await run("doctor");
    expect(doctor).toContain("Threadroot doctor: clean");
    expect(process.exitCode).toBeUndefined();

    const start = await run("start", "write tests");
    expect(start).toContain("Threadroot start:");
    expect(start).toContain("agent command map:");

    const toolsJson = JSON.parse(await run("tools", "list", "--json")) as { tools: unknown[] };
    expect(Array.isArray(toolsJson.tools)).toBe(true);

    const packsJson = JSON.parse(await run("packs", "list", "--json")) as { packs: Array<{ name: string }> };
    expect(packsJson.packs.map((pack) => pack.name)).toContain("testing");

    const connectionsJson = JSON.parse(await run("connections", "list", "--json")) as { connections: unknown[] };
    expect(Array.isArray(connectionsJson.connections)).toBe(true);

    const expose = await run("expose", "codex", "--dry-run");
    expect(expose).toContain(".agents");
  });
});
