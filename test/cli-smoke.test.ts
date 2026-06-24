import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProgram } from "../src/cli.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-cli-"));
  vi.stubEnv("HOME", path.join(repo, "home"));
  await write("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest" } }));
  await write("src/billing.ts", "export function retryInvoice() { return 'billing'; }\n");
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

async function exists(rel: string): Promise<boolean> {
  try {
    await stat(path.join(repo, rel));
    return true;
  } catch {
    return false;
  }
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
  it("walks the Codex-native first-run flow", async () => {
    const init = await run("init", "--yes", "--no-import");
    expect(init).toContain("Initialized Codex optimizer `demo`");
    expect(init).toContain("state: .codex/threadroot");
    expect(init).toContain("guidance: AGENTS.md");
    expect(await exists(".threadroot")).toBe(false);
    expect(await readFile(path.join(repo, "AGENTS.md"), "utf8")).toContain("threadroot prep");

    const install = await run("codex", "install");
    expect(install).toContain("Threadroot Codex install: written");
    expect(install).toContain("codex mcp add threadroot");
    expect(await exists(".codex/threadroot/install.json")).toBe(true);
    expect(await exists(".threadroot")).toBe(false);

    const codex = await run("codex", "status");
    expect(codex).toContain("Codex:");
    expect(codex).toContain("runner: codex exec --json");

    const status = await run("status");
    expect(status).toContain("Codex:");

    const prep = await run("prep", "fix retryInvoice billing", "--memory", "tiny");
    expect(prep).toContain("prep:");
    expect(prep).toContain("prompt tokens:");
    expect(prep).toContain(".codex/threadroot/briefs/");
    expect(await exists(".threadroot")).toBe(false);

    const codexDryRun = await run("codex", "run", "fix retryInvoice billing", "--dry-run", "--require", "npm run test");
    expect(codexDryRun).toContain("codex run: blocked");
    expect(codexDryRun).toContain("tokens-to-green: n/a");

    const score = await run("score", "latest");
    expect(score).toContain("score: blocked");

    const tune = await run("tune", "latest");
    expect(tune).toContain("tune:");
    expect(tune).toContain(".codex/threadroot/tuning/");

    const evalCodex = await run("eval", "codex");
    expect(evalCodex).toContain("codex eval:");

    const publicCommands = createProgram(repo).commands.map((command) => command.name());
    expect(publicCommands).not.toEqual(expect.arrayContaining(["task", "map", "tools", "skills", "connections", "memory", "web", "loop", "trace", "improve"]));
  }, 15000);
});
