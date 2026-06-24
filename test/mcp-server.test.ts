import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { handleMessage } from "../src/mcp/server.js";

async function tempRepo(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "threadroot-mcp-"));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function repoWithFile(): Promise<string> {
  const repo = await tempRepo();
  await fs.mkdir(path.join(repo, "src"), { recursive: true });
  await fs.writeFile(path.join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "vitest" } }, null, 2), "utf8");
  await fs.writeFile(path.join(repo, "src", "billing.ts"), "export function retryInvoice() { return 'billing'; }\n", "utf8");
  return repo;
}

describe("mcp server handleMessage", () => {
  it("responds to initialize with Codex optimizer instructions", async () => {
    const response = await handleMessage(await tempRepo(), { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(response?.result).toMatchObject({
      protocolVersion: "2025-06-18",
      serverInfo: { name: "threadroot" },
      capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } },
    });
    expect(JSON.stringify(response?.result)).toContain("Codex context optimizer");
    expect(JSON.stringify(response?.result)).toContain(".codex/threadroot");
  });

  it("lists only optimizer tools and Codex resources", async () => {
    const response = await handleMessage(await tempRepo(), { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const { tools } = response?.result as { tools: Array<{ name: string }> };
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "task_packet",
      "context_budget",
      "codex_status",
      "score_latest",
      "tune_latest",
      "repo_search",
      "repo_read",
      "trace_latest",
    ].sort());

    const listed = await handleMessage(await tempRepo(), { jsonrpc: "2.0", id: 3, method: "resources/list" });
    const listedResult = listed?.result as { resources: Array<{ uri: string }> };
    expect(listedResult.resources.map((resource) => resource.uri)).toEqual([
      "threadroot://brief/latest",
      "threadroot://score/latest",
      "threadroot://tuning/latest",
      "threadroot://codex",
    ]);

    const templates = await handleMessage(await tempRepo(), { jsonrpc: "2.0", id: 4, method: "resources/templates/list" });
    const templateResult = templates?.result as { resourceTemplates: Array<{ uriTemplate: string }> };
    expect(templateResult.resourceTemplates.map((entry) => entry.uriTemplate)).toEqual(["threadroot://repo/{path}"]);
  });

  it("uses Codex preflight for task_packet without creating .threadroot", async () => {
    const repo = await repoWithFile();

    const task = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "task_packet",
        arguments: { task: "fix retryInvoice billing", budgetTokens: 1_500, includeResourceLinks: true },
      },
    });

    const taskResult = task?.result as {
      structuredContent: { firstReads: string[]; paths: { prompt: string }; promptTokenEstimate: number };
      content: Array<{ type: string; uri?: string; text?: string }>;
    };
    expect(taskResult.structuredContent.firstReads).toContain("src/billing.ts");
    expect(taskResult.structuredContent.paths.prompt).toMatch(/^\.codex\/threadroot\/briefs\//u);
    expect(taskResult.structuredContent.promptTokenEstimate).toBeLessThanOrEqual(1_500);
    expect(taskResult.content[0]?.text).toContain("Estimated tokens:");
    expect(taskResult.content.some((entry) => entry.type === "resource_link" && entry.uri === "threadroot://brief/latest")).toBe(true);
    expect(taskResult.content.some((entry) => entry.type === "resource_link" && entry.uri === "threadroot://repo/src%2Fbilling.ts")).toBe(true);
    await expect(exists(path.join(repo, ".codex", "threadroot", "briefs", "latest.json"))).resolves.toBe(true);
    await expect(exists(path.join(repo, ".threadroot"))).resolves.toBe(false);
  });

  it("supports targeted repo search/read and blocks hidden legacy tools", async () => {
    const repo = await repoWithFile();

    const search = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "repo_search", arguments: { query: "retryInvoice", maxResults: 5 } },
    });
    const searchResult = search?.result as { structuredContent: { matches: Array<{ path: string }> } };
    expect(searchResult.structuredContent.matches.map((entry) => entry.path)).toContain("src/billing.ts");

    const read = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "repo_read", arguments: { path: "src/billing.ts" } },
    });
    const readResult = read?.result as { structuredContent: { content: string } };
    expect(readResult.structuredContent.content).toContain("retryInvoice");

    const blocked = await handleMessage(repo, {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "web_status", arguments: {} },
    });
    expect(blocked?.error?.message).toContain("Unknown tool");
  });

  it("reports Codex capabilities through MCP", async () => {
    const response = await handleMessage(await tempRepo(), {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "codex_status", arguments: {} },
    });
    const result = response?.result as {
      content: Array<{ type: string; text: string }>;
      structuredContent: { codex: { defaultPlan: { command: string; args: string[] }; mcp: { smokeTools: string[] } } };
    };
    expect(result.content[0]?.text).toContain("Threadroot Codex status");
    expect(result.structuredContent.codex.defaultPlan.args).toContain("exec");
    expect(result.structuredContent.codex.mcp.smokeTools).toEqual(
      expect.arrayContaining(["task_packet", "context_budget", "repo_read", "score_latest", "tune_latest", "codex_status"]),
    );
  });
});
