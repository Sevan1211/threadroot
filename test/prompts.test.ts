import { describe, expect, it } from "vitest";
import { agentBootstrapPrompt } from "../src/core/prompts/agents.js";
import { maintainPrompt } from "../src/core/prompts/maintain.js";

describe("agent prompts", () => {
  it("prints a Codex bootstrap prompt that routes through Threadroot", () => {
    const prompt = agentBootstrapPrompt("codex");

    expect(prompt).toContain("You are operating in Codex");
    expect(prompt).toContain('threadroot context suggest "<task>"');
    expect(prompt).toContain("Do not read every skill file up front");
  });

  it("prints a Copilot prompt with VS Code guidance", () => {
    const prompt = agentBootstrapPrompt("copilot");

    expect(prompt).toContain("VS Code Copilot Chat");
    expect(prompt).toContain("@workspace");
  });

  it("prints an end-of-session maintenance prompt", () => {
    const prompt = maintainPrompt();

    expect(prompt).toContain("threadroot doctor");
    expect(prompt).toContain("threadroot maintain");
    expect(prompt).toContain("Do not delete memory silently");
  });
});
