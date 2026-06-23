import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProgram } from "../src/cli.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-cli-"));
  vi.stubEnv("HOME", path.join(repo, "home"));
  await write("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest" } }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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
    const init = await run("init", "--yes", "--no-import");
    expect(init).toContain("Initialized harness `demo`");
    expect(init).toContain("adapters: none (local-only)");

    const connect = await run("connect", "codex");
    expect(connect).toContain("Threadroot connect: write");
    expect(connect).toContain("codex: written");
    expect(connect).toContain("codex mcp add threadroot");

    const status = await run("status");
    expect(status).toContain("harness: demo");
    expect(status).toContain("adapters: none (local-only)");

    const statusJson = JSON.parse(await run("status", "--json")) as { exists: boolean; manifest: { name: string } };
    expect(statusJson.exists).toBe(true);
    expect(statusJson.manifest.name).toBe("demo");

    const context = await run("context", "write tests");
    expect(context).toContain("task: write tests");
    expect(context).toContain("memory:");

    const contextJson = JSON.parse(await run("context", "write tests", "--json")) as { task: string };
    expect(contextJson.task).toBe("write tests");

    const workingSet = await run("working-set", "write tests");
    expect(workingSet).toContain("working set: write tests");
    expect(workingSet).toContain("token estimate:");

    const workingSetJson = JSON.parse(await run("working-set", "write tests", "--json")) as { task: string; tokenEstimate: number };
    expect(workingSetJson.task).toBe("write tests");
    expect(workingSetJson.tokenEstimate).toBeGreaterThan(0);

    const map = await run("map", "--check");
    expect(map).toContain("repo map: current");

    const web = await run("web", "status");
    expect(web).toContain("web fetch: available");
    expect(web).toContain("web search: provider/delegated only");

    const skills = await run("skills", "validate");
    expect(skills).toContain("Skills valid.");

    const matchedSkills = await run("skills", "match", "write tests");
    expect(matchedSkills).toContain("skill matches: write tests");

    const skillsJson = JSON.parse(await run("skills", "list", "--json")) as { skills: Array<{ name: string }> };
    expect(skillsJson.skills.map((skill) => skill.name)).toContain("find-skills");

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

    const connectionsJson = JSON.parse(await run("connections", "list", "--json")) as { connections: unknown[] };
    expect(Array.isArray(connectionsJson.connections)).toBe(true);

    const automationJson = JSON.parse(await run("automation", "status", "--json")) as { mode: string };
    expect(automationJson.mode).toBe("ask");

    const expose = await run("expose", "codex", "--dry-run");
    expect(expose).toContain(".agents");
  }, 15000);
});
