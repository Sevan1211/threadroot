import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildRepoIndex, indexStatus, readRepoIndex, scoreIndexCandidates } from "../src/core/repo-index.js";
import { assembleTaskPacket } from "../src/core/task-packet.js";
import { initHarness } from "../src/core/init/index.js";

let repo: string;
const execFileAsync = promisify(execFile);

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-index-"));
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(repo, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

describe("repo index", () => {
  it("indexes files, symbols, chunks, and graph edges for task routing", async () => {
    await write("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest" } }));
    await write("src/auth.ts", "export function loginUser() { return 'auth'; }\n");
    await write("test/auth.test.ts", "import { loginUser } from '../src/auth';\ntest('loginUser', () => loginUser());\n");
    await initHarness(repo, { import: false, home: repo });

    const built = await buildRepoIndex(repo, { home: repo });
    expect(built.exists).toBe(true);
    expect(built.counts?.files).toBeGreaterThan(0);
    expect(built.counts?.symbols).toBeGreaterThan(0);

    const status = await indexStatus(repo);
    expect(["current", "degraded"]).toContain(status.status);

    const snapshot = await readRepoIndex(repo);
    expect(snapshot?.symbols.map((symbol) => symbol.name)).toContain("loginUser");
    expect(snapshot?.edges.some((edge) => edge.kind === "test" && edge.to === "src/auth.ts")).toBe(true);

    const candidates = scoreIndexCandidates(snapshot!, "fix loginUser auth test");
    expect(candidates[0]?.path).toBe("src/auth.ts");
  });

  it("compiles task packets with index status, symbols, snippets, and debug ranking", async () => {
    await write("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest" } }));
    await write("src/billing.ts", "export function retryInvoice() { return 'billing'; }\n");
    await initHarness(repo, { import: false, home: repo });

    const packet = await assembleTaskPacket(repo, "fix retryInvoice billing bug", { debugRanking: true });

    expect(packet.index.exists).toBe(true);
    expect(packet.files.map((file) => file.path)).toContain("src/billing.ts");
    expect(packet.files.find((file) => file.path === "src/billing.ts")?.symbols[0]?.name).toBe("retryInvoice");
    expect(packet.files.find((file) => file.path === "src/billing.ts")?.snippets.length).toBeLessThanOrEqual(1);
    expect(packet.files.find((file) => file.path === "src/billing.ts")?.snippets[0]?.text.length ?? 0).toBeLessThanOrEqual(720);
    expect(packet.debugRanking?.candidates.some((candidate) => candidate.path === "src/billing.ts")).toBe(true);
  });

  it("does not route deleted git-index files into task packets", async () => {
    await execFileAsync("git", ["init"], { cwd: repo });
    await write("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest" } }));
    await write("src/live.ts", "export function liveRoute() { return 'live'; }\n");
    await write("src/deleted.ts", "export function deletedRoute() { return 'deleted'; }\n");
    await initHarness(repo, { import: false, home: repo });
    await execFileAsync("git", ["add", "package.json", "src/live.ts", "src/deleted.ts"], { cwd: repo });
    await rm(path.join(repo, "src/deleted.ts"));

    const packet = await assembleTaskPacket(repo, "fix deletedRoute liveRoute", { forceIndex: true, debugRanking: true });
    const paths = [...packet.files, ...packet.tests].map((file) => file.path);

    expect(paths).toContain("src/live.ts");
    expect(paths).not.toContain("src/deleted.ts");
    expect(packet.debugRanking?.candidates.some((candidate) => candidate.path === "src/deleted.ts")).toBe(false);
  });
});
