import { describe, expect, it } from "vitest";
import { createConfig } from "../src/core/config.js";
import { generateFiles } from "../src/core/generate.js";
import { profiles } from "../src/core/profiles.js";
import type { ProfileId } from "../src/types.js";

describe("generateFiles", () => {
  it("generates expected adapter outputs", () => {
    const config = createConfig({
      profile: "nextjs",
      projectName: "demo",
      targets: ["codex", "copilot", "vscode"],
      strictness: "standard",
    });

    const paths = generateFiles(config).map((file) => file.path);
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain(".github/copilot-instructions.md");
    expect(paths).toContain(".vscode/settings.json");
    expect(paths).toContain("threadroot/skills/refresh-context.md");
  });

  it.each(Object.keys(profiles) as ProfileId[])("generates the complete V1 file set for %s", (profile) => {
    const config = createConfig({
      profile,
      projectName: "demo",
      targets: ["codex", "copilot", "vscode"],
      strictness: "standard",
    });

    const paths = generateFiles(config).map((file) => file.path);
    expect(paths).toEqual(
      expect.arrayContaining([
      ".threadroot/config.json",
      "threadroot/project.md",
      "threadroot/repo-map.md",
      ".threadroot/repo-map.json",
      "threadroot/commands.md",
      "threadroot/architecture.md",
      "threadroot/current-focus.md",
      "threadroot/handoff.md",
      "threadroot/decisions.md",
      "threadroot/pitfalls.md",
      "threadroot/sources.md",
      "threadroot/automation.md",
      ".threadroot/automation.json",
      "threadroot/skills/catalog.md",
      "threadroot/skills/index.md",
      ".threadroot/skills-index.json",
      "threadroot/skills/start-session.md",
      "threadroot/skills/refresh-context.md",
      "threadroot/skills/plan-feature.md",
      "threadroot/skills/validate-change.md",
      "threadroot/skills/update-memory.md",
      "threadroot/skills/revamp-context.md",
      "README.md",
      ".gitignore",
      "AGENTS.md",
      ".github/copilot-instructions.md",
      ".vscode/settings.json",
      ".vscode/extensions.json",
      ".threadroot/manifest.json",
      ]),
    );
    expect(paths).toContain("threadroot/skills/core/start-session.md");
    expect(paths).toContain("threadroot/skills/quality/choose-tests.md");
  });

  it("can generate only one refresh adapter target", () => {
    const config = createConfig({
      profile: "fastapi",
      projectName: "api",
      targets: ["codex", "copilot", "vscode"],
      strictness: "standard",
    });

    expect(generateFiles(config, { targetFilter: "codex", includeCanonical: false }).map((file) => file.path)).toEqual([
      "AGENTS.md",
    ]);
  });

  it("can generate enabled automation metadata", () => {
    const config = createConfig({
      profile: "nextjs",
      projectName: "demo",
      targets: ["codex", "copilot", "vscode"],
      strictness: "standard",
    });

    const files = generateFiles(config, { automationEnabled: true });
    expect(files.find((file) => file.path === ".threadroot/automation.json")?.content).toContain('"enabled": true');
    expect(files.find((file) => file.path === "threadroot/automation.md")?.content).toContain("- Enabled: yes");
  });
});
