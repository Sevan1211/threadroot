import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

describe("Codex-only public surface", () => {
  it("keeps package metadata focused on Codex and OpenAI", async () => {
    const pkg = JSON.parse(await read("package.json")) as { description: string; keywords: string[] };

    expect(pkg.description).toContain("Codex");
    expect(pkg.keywords).toEqual(expect.arrayContaining(["codex", "openai", "mcp", "repo-context"]));
    expect(pkg.keywords).not.toEqual(expect.arrayContaining(["claude", "cursor", "copilot", "gemini", "windsurf", "opencode"]));
  });

  it("keeps current public docs off removed coding-agent commands", async () => {
    const docs = [await read("README.md"), await read("INTEGRATION.md"), await read("SECURITY.md"), await read("RELEASE.md")].join("\n");

    expect(docs).toContain("threadroot codex install");
    expect(docs).toContain("codex_status");
    for (const removed of [
      "threadroot connect",
      "threadroot providers",
      "providers_status",
      "threadroot://providers",
      "--agent-command",
      "--agent-adapter",
      ".threadroot/providers",
    ]) {
      expect(docs).not.toContain(removed);
    }
  });
});
