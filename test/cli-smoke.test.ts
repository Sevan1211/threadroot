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
    const init = await run("init", "--no-import");
    expect(init).toContain("Initialized harness `demo`");

    const status = await run("status");
    expect(status).toContain("harness: demo");

    const context = await run("context", "write tests");
    expect(context).toContain("task: write tests");
    expect(context).toContain("add-test");

    const skills = await run("skills", "validate");
    expect(skills).toContain("Skills valid.");

    const diff = await run("diff");
    expect(diff).toContain("No drift");

    const doctor = await run("doctor");
    expect(doctor).toContain("Threadroot doctor:");
    expect(process.exitCode).toBeUndefined();
  });
});
