import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  checkCodexMcp,
  mcpEntryForScriptPath,
  readCodexThreadrootMcpEntry,
  REQUIRED_MCP_TOOLS,
} from "../src/core/mcp-check.js";
import { setupGlobal } from "../src/core/setup.js";
import { THREADROOT_VERSION } from "../src/core/version.js";

let home: string;
let repo: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "tr-mcp-home-"));
  repo = await mkdtemp(path.join(tmpdir(), "tr-mcp-repo-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
  await rm(repo, { recursive: true, force: true });
});

async function writeFakeMcpServer(tools = [...REQUIRED_MCP_TOOLS]): Promise<string> {
  const filePath = path.join(home, "fake-mcp.sh");
  const toolJson = JSON.stringify(tools.map((name) => ({ name, description: name, inputSchema: { type: "object" } })));
  await writeFile(
    filePath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `tools='${toolJson}'`,
      "while IFS= read -r line; do",
      "  if [[ \"$line\" == *'\"method\":\"initialize\"'* ]]; then",
      "    printf '%s\\n' '{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"serverInfo\":{\"name\":\"fake-threadroot\"},\"capabilities\":{\"tools\":{}}}}'",
      "  elif [[ \"$line\" == *'\"method\":\"tools/list\"'* ]]; then",
      "    printf '{\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"tools\":%s}}\\n' \"$tools\"",
      "  fi",
      "done",
      "",
    ].join("\n"),
    "utf8",
  );
  return filePath;
}

describe("checkCodexMcp", () => {
  it("uses a stable npx command when setup is run from npm's npx cache", () => {
    const entry = mcpEntryForScriptPath(
      path.join(home, ".npm", "_npx", "abc123", "node_modules", "threadroot", "dist", "index.js"),
    );

    expect(entry).toEqual({ command: "npx", args: ["--yes", `threadroot@${THREADROOT_VERSION}`, "mcp"] });
  });

  it("uses the current node entry for direct local dist runs", () => {
    const scriptPath = path.join(repo, "dist", "index.js");

    expect(mcpEntryForScriptPath(scriptPath)).toEqual({ command: process.execPath, args: [scriptPath, "mcp"] });
  });

  it("warns when Codex MCP config is missing", async () => {
    const report = await checkCodexMcp({ repoRoot: repo, home });
    expect(report.status).toBe("warning");
    expect(report.messages[0]).toContain("No Codex Threadroot MCP config");
  });

  it("verifies configured stdio server tools", async () => {
    const server = await writeFakeMcpServer();
    await setupGlobal({
      home,
      agents: "codex",
      mcp: true,
      mcpEntry: { command: "bash", args: [server] },
    });

    const config = await readFile(path.join(home, ".codex/config.toml"), "utf8");
    expect(config).toContain(`command = "bash"`);
    expect(config).toContain(server);
    expect(await readCodexThreadrootMcpEntry(home)).toEqual({ command: "bash", args: [server] });

    const report = await checkCodexMcp({ repoRoot: repo, home });
    expect(report.status).toBe("ok");
    expect(report.tools).toEqual(expect.arrayContaining([...REQUIRED_MCP_TOOLS]));
  });

  it("errors when required Threadroot tools are missing", async () => {
    const server = await writeFakeMcpServer(["context"]);
    await setupGlobal({
      home,
      agents: "codex",
      mcp: true,
      mcpEntry: { command: "bash", args: [server] },
    });

    const report = await checkCodexMcp({ repoRoot: repo, home });
    expect(report.status).toBe("error");
    expect(report.messages[0]).toContain("missing required tool");
  });
});
