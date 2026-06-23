import { describe, expect, it } from "vitest";

import { providerCommandPlan, providerStatuses, providerTraceEvents } from "../src/core/provider-adapters.js";

describe("provider adapters", () => {
  it("builds safe default plans for Codex and Claude Code", () => {
    const codex = providerCommandPlan({ agent: "codex", repoRoot: "/repo", prompt: "do work" });
    expect(codex).toMatchObject({
      adapter: "codex",
      command: "codex",
      outputFormat: "jsonl",
    });
    expect(codex.args).toEqual(expect.arrayContaining(["exec", "--json", "--sandbox", "workspace-write"]));

    const claude = providerCommandPlan({ agent: "claude-code", repoRoot: "/repo", prompt: "do work" });
    expect(claude).toMatchObject({
      adapter: "claude",
      command: "claude",
      outputFormat: "jsonl",
    });
    expect(claude.args).toEqual(expect.arrayContaining(["--output-format", "stream-json", "--permission-mode", "auto"]));
    expect(claude.args).not.toContain("bypassPermissions");
    expect(claude.args).not.toContain("--dangerously-skip-permissions");
  });

  it("keeps Cursor MCP-first until a stable automation command is supplied", () => {
    expect(() => providerCommandPlan({ agent: "cursor", repoRoot: "/repo", prompt: "do work" })).toThrow(/No default automated runner/);

    const custom = providerCommandPlan({
      agent: "cursor",
      repoRoot: "/repo",
      prompt: "do work",
      agentCommand: "cursor-agent",
      agentArgs: ["run"],
    });
    expect(custom).toMatchObject({ adapter: "custom", command: "cursor-agent", args: ["run"], outputFormat: "text" });
  });

  it("reports provider capabilities for CLI and MCP clients", async () => {
    const statuses = await providerStatuses(process.cwd());
    expect(statuses.map((status) => status.id)).toEqual(expect.arrayContaining(["codex", "claude", "cursor"]));
    expect(statuses.find((status) => status.id === "codex")?.automation.status).toBe("default-runner");
    expect(statuses.find((status) => status.id === "codex")?.mcp.access).toMatchObject({
      mode: "threadroot-check",
      checkCommand: "threadroot mcp check --json",
    });
    expect(statuses.find((status) => status.id === "cursor")?.mcp.configFiles).toContain("~/.cursor/mcp.json");
    expect(statuses.find((status) => status.id === "cursor")?.mcp.access.smokeTools).toContain("task_packet");
  });

  it("extracts Codex JSONL command, file, and MCP tool events into trace events", () => {
    const plan = providerCommandPlan({ agent: "codex", repoRoot: "/repo", prompt: "do work" });
    const events = providerTraceEvents(
      plan,
      [
        JSON.stringify({ type: "item.started", item: { type: "command_execution", command: "npm test", status: "in_progress" } }),
        JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "npm test", exit_code: 0 } }),
        JSON.stringify({ type: "item.completed", item: { type: "file_change", path: "src/index.ts" } }),
        JSON.stringify({ type: "item.completed", item: { type: "mcp_tool_call", name: "task_packet", status: "completed" } }),
      ].join("\n"),
    );

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "command", command: "npm test", ok: true }),
        expect.objectContaining({ type: "edit_file", path: "src/index.ts" }),
        expect.objectContaining({ type: "run_tool", tool: "task_packet" }),
      ]),
    );
  });
});
