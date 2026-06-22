import { describe, expect, it } from "vitest";

import { findSkills, parseSkillSearchOutput } from "../src/core/skills-find.js";

describe("skills find", () => {
  it("parses skills.sh and GitHub-backed skill results into Threadroot install commands", () => {
    const candidates = parseSkillSearchOutput(
      "find performance skills",
      [
        "Find Skills https://www.skills.sh/vercel-labs/skills/find-skills",
        "Install: npx skills add https://github.com/anthropics/skills --skill skill-creator",
      ].join("\n"),
    );

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "find-skills",
          source: "https://www.skills.sh/vercel-labs/skills/find-skills",
          installCommand:
            "threadroot skills add https://www.skills.sh/vercel-labs/skills/find-skills --skill find-skills",
        }),
        expect.objectContaining({
          name: "skill-creator",
          source: "https://github.com/anthropics/skills",
          installCommand: "threadroot skills add https://github.com/anthropics/skills --skill skill-creator",
        }),
      ]),
    );
  });

  it("falls back to a skills.sh search URL when live search is unavailable", async () => {
    const report = await findSkills("optimize website performance", {
      runner: async () => {
        throw new Error("offline");
      },
    });

    expect(report.status).toBe("fallback");
    expect(report.searchUrl).toContain("skills.sh");
    expect(report.candidates[0]?.installCommand).toContain("threadroot skills add");
  });
});
