import { describe, expect, it } from "vitest";
import { automationFiles, automationMarkdown, defaultAutomationConfig, formatAutomationStatus } from "../src/core/automation.js";

describe("automation", () => {
  it("defines opt-in agent-suggested upkeep triggers", () => {
    const config = defaultAutomationConfig();

    expect(config.enabled).toBe(false);
    expect(config.mode).toBe("agent-suggested");
    expect(config.triggers.map((trigger) => trigger.id)).toEqual([
      "session-start",
      "task-routing",
      "structure-change",
      "meaningful-work",
      "session-end",
    ]);
  });

  it("renders human-readable automation guidance with links", () => {
    const markdown = automationMarkdown();

    expect(markdown).toContain("# Automation");
    expect(markdown).toContain("threadroot maintain --dry-run");
    expect(markdown).toContain("[threadroot/repo-map.md](threadroot/repo-map.md)");
  });

  it("generates visible guidance and hidden metadata", () => {
    expect(automationFiles().map((file) => file.path)).toEqual([
      "threadroot/automation.md",
      ".threadroot/automation.json",
    ]);
  });

  it("formats status output for agents and humans", () => {
    const status = formatAutomationStatus(defaultAutomationConfig());

    expect(status).toContain("Threadroot automation: suggested only");
    expect(status).toContain("Session start: threadroot doctor");
    expect(status).toContain("Session end: threadroot refresh --memory");
  });
});
