import { describe, expect, it } from "vitest";
import { projectSkillDefinition, projectSkillPath } from "../src/core/project-skills.js";
import { skillFile } from "../src/core/templates.js";
import { skillsPrompt } from "../src/core/prompts/skills.js";

describe("project skills", () => {
  it("creates a project-specific skill scaffold", () => {
    const definition = projectSkillDefinition("add-billing-flow", "Add Billing Flow");
    const content = skillFile(definition);

    expect(projectSkillPath(definition.slug)).toBe("threadroot/skills/project/add-billing-flow.md");
    expect(content).toContain("origin: project");
    expect(content).toContain("# Skill: Add Billing Flow");
    expect(content).toContain("## Validation");
  });

  it("prints a project skill generation prompt", () => {
    expect(skillsPrompt()).toContain("Propose 1-3 high-value project-specific skills");
    expect(skillsPrompt()).toContain("threadroot/skills/project/");
  });
});
