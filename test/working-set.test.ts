import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initHarness } from "../src/core/init/index.js";
import { buildRepoIndex } from "../src/core/repo-index.js";
import { assembleWorkingSet } from "../src/core/working-set.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-working-set-"));
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(repo, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

describe("assembleWorkingSet", () => {
  it("ranks Threadroot task-packet surfaces ahead of low-signal dotfile mentions", async () => {
    await write("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest" } }));
    await write(".gitignore", "# Threadroot is local-only.\n.threadroot/\n");
    await write("src/core/task-packet.ts", "export function assembleTaskPacket() { return 'task packet context router'; }\n");
    await write("src/commands/task.ts", "export function runTask() { return 'task packet cli'; }\n");
    await write("src/core/working-set.ts", "export function assembleWorkingSet() { return 'context candidate engine'; }\n");
    await write("src/mcp/server.ts", "export function handleMessage() { return 'task_packet'; }\n");
    await write("src/core/harness/context.ts", "export function assembleContext() { return 'context'; }\n");
    await write("test/mcp-server.test.ts", "test('task_packet', () => undefined);\n");

    await initHarness(repo, { import: false, home: repo });

    const result = await assembleWorkingSet(repo, "make threadroot actually valuable", { home: repo, maxFiles: 8 });
    const paths = result.files.map((file) => file.path);

    expect(paths[0]).toBe("src/core/task-packet.ts");
    expect(paths.slice(0, 4)).toEqual(
      expect.arrayContaining(["src/commands/task.ts", "src/core/working-set.ts", "src/mcp/server.ts"]),
    );
    expect(paths.indexOf(".gitignore")).toBeGreaterThan(0);
  });

  it("prefers source files over docs for implementation-oriented index tasks", async () => {
    await write("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest" } }));
    await write(
      "CHANGELOG.md",
      [
        "# Changelog",
        "",
        "## Unreleased - Repo intelligence runtime",
        "",
        "- Add repo intelligence context routing for task packets.",
      ].join("\n"),
    );
    await write(
      "src/core/repo-index.ts",
      "export function buildRepoIndex() { return 'repo intelligence context routing'; }\nexport function scoreIndexCandidates() { return 'index'; }\n",
    );
    await write("src/core/context-evals.ts", "export function runContextEvals() { return 'repo intelligence eval'; }\n");
    await write("test/repo-index.test.ts", "test('repo index', () => undefined);\n");

    await initHarness(repo, { import: false, home: repo });
    await buildRepoIndex(repo, { home: repo });

    const result = await assembleWorkingSet(repo, "improve repo intelligence context routing", { home: repo, maxFiles: 5 });
    const paths = result.files.map((file) => file.path);

    expect(paths[0]?.startsWith("src/")).toBe(true);
    expect(paths.indexOf("CHANGELOG.md")).toBeGreaterThan(paths.indexOf("src/core/repo-index.ts"));
  });
});
