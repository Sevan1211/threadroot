import { describe, expect, it } from "vitest";
import { selectSkills, suggestSkills } from "../src/core/skill-packs.js";

describe("skill router", () => {
  it("suggests focused skills for a UI task", () => {
    const skills = selectSkills(["nextjs", "react"]);
    const suggestions = suggestSkills("add a responsive billing settings screen", skills);

    expect(suggestions.map((skill) => skill.id)).toContain("ui.implement-screen");
    expect(suggestions.length).toBeLessThanOrEqual(5);
  });
});
