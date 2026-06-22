import { describe, expect, it } from "vitest";
import { agentLaunchPrompt, mcpSetupGuide } from "../src/core/mcp-setup.js";

const removedContracts = [
  "threadroot revamp",
  "threadroot map refresh",
  "threadroot refresh --memory",
  "session_start",
  "use_skill",
  "end_skill",
  "threadroot workbench",
  "threadroot packs",
  "--packs",
];

describe("mcp setup guide", () => {
  it("prints config and launch prompt", () => {
    const output = mcpSetupGuide({
      repoRoot: "/tmp/demo",
      agent: "codex",
      executable: "node",
      scriptPath: "/tmp/threadroot/dist/index.js",
    });

    expect(output).toContain("Threadroot MCP setup");
    expect(output).toContain('"threadroot"');
    expect(output).toContain("threadroot bootstrap --yes");
    expect(output).toContain("threadroot start");
    expect(output).toContain("Success: Threadroot is ready");
    for (const contract of removedContracts) {
      expect(output).not.toContain(contract);
    }
  });

  it("uses real commands in the agent prompt", () => {
    const prompt = agentLaunchPrompt("/tmp/demo");
    expect(prompt).toContain("threadroot bootstrap --yes");
    expect(prompt).toContain("threadroot skills find");
    expect(prompt).toContain("threadroot skills add <source>");
    expect(prompt).toContain("threadroot automation status");
    expect(prompt).toContain("threadroot skills expose");
    expect(prompt).toContain("threadroot expose <agent>");
    expect(prompt).toContain("threadroot mcp setup --write");
    expect(prompt).toContain("ask before running");
    for (const contract of removedContracts) {
      expect(prompt).not.toContain(contract);
    }
  });
});
