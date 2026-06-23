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
      protocolVersion: "2025-06-18",
      serverInfo: { name: "threadroot" },
      capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } },
    });
    expect(JSON.stringify(response?.result)).toContain("Call `task_packet` before broad coding work");
  });

  it("returns no response for notifications/initialized", async () => {
    const response = await handleMessage(await tempRepo(), { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(response).toBeUndefined();
  });

  it("lists only harness-native tools with schemas and trust annotations", async () => {
    const response = await handleMessage(await tempRepo(), { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const { tools } = response?.result as {
      tools: Array<{ name: string; title?: string; inputSchema: unknown; outputSchema?: unknown; annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean } }>;
    };

    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "task_packet",
        "index_status",
        "refresh_context",
        "trace_context",
        "eval_context",
        "repo_map",
        "repo_search",
        "repo_read",
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
        "web_status",
        "web_fetch",
        "status",
        "doctor",
      ]),
    );
    // Legacy tools must be gone.
    expect(names).not.toContain("suggest_context");
    expect(names).not.toContain("session_start");
    expect(names).not.toContain("context");
    expect(names).not.toContain("working_set");
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object" });
    }
    expect(tools.find((tool) => tool.name === "task_packet")).toMatchObject({
      title: "Compile Task Packet",
      outputSchema: { type: "object" },
      annotations: { readOnlyHint: true, openWorldHint: false },
    });
    expect(tools.find((tool) => tool.name === "refresh_context")).toMatchObject({
      title: "Refresh Context",
      outputSchema: { type: "object" },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    });
    expect(tools.find((tool) => tool.name === "tools_run")).toMatchObject({
      annotations: { readOnlyHint: false, destructiveHint: true },
    });
    expect(tools.find((tool) => tool.name === "web_fetch")).toMatchObject({
      annotations: { readOnlyHint: true, openWorldHint: true },
    });
  });

  it("exposes resource templates and prompts for agent-first flows", async () => {
    const repo = await harnessRepo();
    const templates = await handleMessage(repo, { jsonrpc: "2.0", id: 30, method: "resources/templates/list" });
    const templateResult = templates?.result as { resourceTemplates: Array<{ uriTemplate: string; annotations?: unknown }> };
    expect(templateResult.resourceTemplates.map((entry) => entry.uriTemplate)).toEqual(
      expect.arrayContaining(["threadroot://repo/{path}", "threadroot://skill/{name}", "threadroot://memory/{type}"]),
    );

    const listedPrompts = await handleMessage(repo, { jsonrpc: "2.0", id: 31, method: "prompts/list" });
    const promptResult = listedPrompts?.result as { prompts: Array<{ name: string; title: string }> };
    expect(promptResult.prompts.map((entry) => entry.name)).toContain("threadroot_task");

    const prompt = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 32,
      method: "prompts/get",
      params: { name: "threadroot_task", arguments: { task: "fix billing route" } },
    });
    const promptGet = prompt?.result as { messages: Array<{ content: { text: string } }> };
    expect(promptGet.messages[0]?.content.text).toContain("task_packet");
    expect(promptGet.messages[0]?.content.text).toContain("fix billing route");
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

  it("returns repo map status and targeted repo reads", async () => {
    const repo = await harnessRepo();
    await fs.writeFile(path.join(repo, "src-feature.ts"), "export const feature = 'threadroot-map';\n", "utf8");

    const refreshedContext = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 19,
      method: "tools/call",
      params: { name: "refresh_context", arguments: {} },
    });
    const refreshedContextResult = refreshedContext?.result as { structuredContent: { mapStatus: string; refreshed: string[] } };
    expect(refreshedContextResult.structuredContent.mapStatus).toBe("current");
    expect(refreshedContextResult.structuredContent.refreshed).toEqual(expect.arrayContaining(["repo-map", "index"]));

    const refreshed = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 20,
      method: "tools/call",
      params: { name: "repo_map", arguments: { write: true } },
    });
    const refreshedResult = refreshed?.result as { structuredContent: { status: string; path: string } };
    expect(refreshedResult.structuredContent).toMatchObject({ status: "current", path: ".threadroot/memory/repo-map.md" });

    const search = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 21,
      method: "tools/call",
      params: { name: "repo_search", arguments: { query: "threadroot-map" } },
    });
    const searchResult = search?.result as { structuredContent: { matches: Array<{ path: string }> } };
    expect(searchResult.structuredContent.matches[0]?.path).toBe("src-feature.ts");

    const read = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 22,
      method: "tools/call",
      params: { name: "repo_read", arguments: { path: "src-feature.ts" } },
    });
    const readResult = read?.result as { structuredContent: { content: string } };
    expect(readResult.structuredContent.content).toContain("threadroot-map");

    const repoMapRead = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 23,
      method: "tools/call",
      params: { name: "repo_read", arguments: { path: ".threadroot/memory/repo-map.md" } },
    });
    const repoMapReadResult = repoMapRead?.result as { structuredContent: { content: string; path: string } };
    expect(repoMapReadResult.structuredContent).toMatchObject({ path: ".threadroot/memory/repo-map.md" });
    expect(repoMapReadResult.structuredContent.content).toContain("# Repo Map");
  });

  it("returns indexed task packets and lazy resources", async () => {
    const repo = await harnessRepo();
    await fs.mkdir(path.join(repo, "src"), { recursive: true });
    await fs.writeFile(path.join(repo, "src", "billing.ts"), "export function retryInvoice() { return 'billing'; }\n", "utf8");

    const task = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 241,
      method: "tools/call",
      params: { name: "task_packet", arguments: { task: "fix retryInvoice billing", debugRanking: true } },
    });
    const taskResult = task?.result as {
      structuredContent: { files: Array<{ path: string; symbols: Array<{ name: string }> }>; index: { exists: boolean } };
      content: Array<{ type: string; uri?: string; text?: string }>;
    };
    expect(taskResult.structuredContent.index.exists).toBe(true);
    expect(taskResult.structuredContent.files.map((file) => file.path)).toContain("src/billing.ts");
    expect(taskResult.structuredContent.files.find((file) => file.path === "src/billing.ts")?.symbols[0]?.name).toBe("retryInvoice");
    expect(taskResult.content.some((entry) => entry.type === "resource_link" && entry.uri === "threadroot://task/latest")).toBe(true);
    expect(taskResult.content.some((entry) => entry.type === "resource_link" && entry.uri?.startsWith("threadroot://repo/"))).toBe(true);

    const listed = await handleMessage(repo, { jsonrpc: "2.0", id: 242, method: "resources/list" });
    const listedResult = listed?.result as { resources: Array<{ uri: string }> };
    expect(listedResult.resources.map((resource) => resource.uri)).toEqual(
      expect.arrayContaining(["threadroot://task/latest", "threadroot://index"]),
    );

    const read = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 243,
      method: "resources/read",
      params: { uri: "threadroot://task/latest" },
    });
    const readResult = read?.result as { contents: Array<{ text: string }> };
    expect(readResult.contents[0]?.text).toContain("retryInvoice");

    const repoResource = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 244,
      method: "resources/read",
      params: { uri: "threadroot://repo/src%2Fbilling.ts" },
    });
    const repoResourceResult = repoResource?.result as { contents: Array<{ text: string; mimeType: string }> };
    expect(repoResourceResult.contents[0]?.mimeType).toBe("text/plain");
    expect(repoResourceResult.contents[0]?.text).toContain("retryInvoice");
  });

  it("reports web capability status through MCP", async () => {
    const response = await handleMessage(await tempRepo(), {
      jsonrpc: "2.0",
      id: 25,
      method: "tools/call",
      params: { name: "web_status", arguments: {} },
    });
    const result = response?.result as { structuredContent: { fetchAvailable: boolean; searchAvailable: boolean } };
    expect(result.structuredContent.fetchAvailable).toBe(true);
    expect(result.structuredContent.searchAvailable).toBe(false);
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
