import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initHarness } from "../src/core/init/index.js";
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
  it("ranks Threadroot context-routing surfaces ahead of low-signal dotfile mentions", async () => {
    await write("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest" } }));
    await write(".gitignore", "# Threadroot is local-only.\n.threadroot/\n");
    await write("src/core/working-set.ts", "export function assembleWorkingSet() { return 'context router'; }\n");
    await write("src/commands/working-set.ts", "export function runWorkingSet() { return 'cli'; }\n");
    await write("src/mcp/server.ts", "export function handleMessage() { return 'working_set'; }\n");
    await write("src/core/harness/context.ts", "export function assembleContext() { return 'context'; }\n");
    await write("test/mcp-server.test.ts", "test('working_set', () => undefined);\n");

    await initHarness(repo, { import: false, home: repo });

    const result = await assembleWorkingSet(repo, "make threadroot actually valuable", { home: repo, maxFiles: 8 });
    const paths = result.files.map((file) => file.path);

    expect(paths[0]).toBe("src/core/working-set.ts");
    expect(paths.slice(0, 4)).toEqual(
      expect.arrayContaining(["src/commands/working-set.ts", "src/mcp/server.ts", "src/core/harness/context.ts"]),
    );
    expect(paths.indexOf(".gitignore")).toBeGreaterThan(0);
  });
});
