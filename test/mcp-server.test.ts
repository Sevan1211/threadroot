import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { approveAutomation } from "../src/core/automation.js";
import { initHarness } from "../src/core/init/index.js";
import { handleMessage } from "../src/mcp/server.js";

async function tempRepo(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "threadroot-mcp-"));
}

async function harnessRepo(): Promise<string> {
  const repo = await tempRepo();
  await fs.writeFile(
    path.join(repo, "package.json"),
    JSON.stringify({ name: "demo", bin: { demo: "cli.js" }, scripts: { test: "vitest" } }, null, 2),
  );
  await initHarness(repo, { import: false, home: repo });
  return repo;
}

describe("mcp server handleMessage", () => {
  it("responds to initialize with server info", async () => {
    const response = await handleMessage(await tempRepo(), { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(response?.result).toMatchObject({
      protocolVersion: "2024-11-05",
      serverInfo: { name: "threadroot" },
    });
    expect(JSON.stringify(response?.result)).toContain("Call `context` before broad coding work");
  });

  it("returns no response for notifications/initialized", async () => {
    const response = await handleMessage(await tempRepo(), { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(response).toBeUndefined();
  });

  it("lists only harness-native tools, each with a JSON input schema", async () => {
    const response = await handleMessage(await tempRepo(), { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const { tools } = response?.result as { tools: Array<{ name: string; inputSchema: unknown }> };

    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "context",
        "skills_find",
        "skills_list",
        "skills_get",
        "tools_list",
        "tools_check",
        "tools_run",
        "tools_create",
        "tools_detect",
        "connections_list",
        "connections_check",
        "connections_create",
        "memory_read",
        "memory_append",
        "status",
        "doctor",
      ]),
    );
    // Legacy tools must be gone.
    expect(names).not.toContain("suggest_context");
    expect(names).not.toContain("session_start");
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object" });
    }
  });

  it("calls the status tool against a real harness", async () => {
    const repo = await harnessRepo();
    const response = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "status", arguments: {} },
    });
    const { content } = response?.result as { content: Array<{ type: string; text: string }> };
    const status = JSON.parse(content[0].text) as { exists: boolean; manifest: { name: string } };
    expect(status.exists).toBe(true);
    expect(status.manifest.name).toBe("demo");
  });

  it("does not let MCP self-confirm risky tool execution", async () => {
    const repo = await harnessRepo();
    await fs.mkdir(path.join(repo, ".threadroot", "tools"), { recursive: true });
    await fs.writeFile(
      path.join(repo, ".threadroot", "tools", "danger.yaml"),
      [
        "name: danger",
        "description: Risky tool",
        "risk: high",
        "confirm: true",
        "run: echo dangerous",
      ].join("\n"),
      "utf8",
    );

    const response = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "tools_run", arguments: { name: "danger", confirm: true } },
    });

    const result = response?.result as {
      content: Array<{ type: string; text: string }>;
      structuredContent: { ok: boolean; blocked?: string; message?: string };
    };
    expect(result.structuredContent).toMatchObject({ ok: false, blocked: "needs-confirmation" });
    expect(result.structuredContent.message).toContain("threadroot run danger --yes");
    expect(result.content[0]?.text).not.toContain("dangerous");
  });

  it("blocks MCP-created capabilities until project automation is approved", async () => {
    const repo = await harnessRepo();
    const blocked = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "tools_create",
        arguments: { name: "format", description: "Run formatter", run: "pnpm format", risk: "low" },
      },
    });
    const blockedResult = blocked?.result as { structuredContent: { ok: boolean; blocked?: string } };
    expect(blockedResult.structuredContent).toMatchObject({ ok: false, blocked: "automation_policy" });

    await approveAutomation(repo);
    const created = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "tools_create",
        arguments: { name: "format", description: "Run formatter", run: "pnpm format", risk: "low" },
      },
    });
    const createdResult = created?.result as { structuredContent: { tool: { name: string; confirm: boolean } } };
    expect(createdResult.structuredContent.tool).toMatchObject({ name: "format", confirm: true });
  });

  it("blocks non-low-risk MCP connection creation", async () => {
    const repo = await harnessRepo();
    await approveAutomation(repo);
    const response = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "connections_create",
        arguments: { name: "aws-dev", provider: "aws", command: "aws", risk: "medium" },
      },
    });
    const result = response?.result as { structuredContent: { ok: boolean; blocked?: string } };
    expect(result.structuredContent).toMatchObject({ ok: false, blocked: "risk_policy" });
  });

  it("errors on an unknown tool", async () => {
    const response = await handleMessage(await tempRepo(), {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "no_such_tool", arguments: {} },
    });
    expect(response?.error?.message).toMatch(/Unknown tool/);
  });
});
