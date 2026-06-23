import { describe, expect, it } from "vitest";

import { findSkills, parseSkillSearchOutput } from "../src/core/skills-find.js";

describe("skills find", () => {
  it("parses skills.sh and GitHub-backed skill results into Threadroot ingest commands", () => {
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
            "threadroot skills ingest https://www.skills.sh/vercel-labs/skills/find-skills --skill find-skills",
        }),
        expect.objectContaining({
          name: "skill-creator",
          source: "https://github.com/anthropics/skills",
          installCommand: "threadroot skills ingest https://github.com/anthropics/skills --skill skill-creator",
        }),
      ]),
    );
  });

  it("strips ANSI color codes from live skills output before building install commands", () => {
    const candidates = parseSkillSearchOutput(
      "git commit",
      [
        "\u001b[38;5;145mgithub/awesome-copilot@git-commit\u001b[0m \u001b[36m36K installs\u001b[0m",
        "\u001b[38;5;102m└ https://skills.sh/github/awesome-copilot/git-commit\u001b[0m",
      ].join("\n"),
    );

    expect(candidates[0]).toMatchObject({
      name: "git-commit",
      source: "https://www.skills.sh/github/awesome-copilot/git-commit",
      url: "https://skills.sh/github/awesome-copilot/git-commit",
      installCommand: "threadroot skills ingest https://www.skills.sh/github/awesome-copilot/git-commit --skill git-commit",
    });
  });

  it("falls back to a skills.sh search URL when live search is unavailable", async () => {
    const report = await findSkills("optimize website performance", {
      runner: async () => {
        throw new Error("offline");
      },
    });

    expect(report.status).toBe("fallback");
    expect(report.searchUrl).toContain("skills.sh");
    expect(report.candidates[0]?.installCommand).toContain("threadroot skills ingest");
  });

  it("removes ANSI color codes from the JSON diagnostic raw field", async () => {
    const report = await findSkills("git commit", {
      runner: async () => ({
        stdout: "\u001b[38;5;102m└ https://skills.sh/github/awesome-copilot/git-commit\u001b[0m",
        stderr: "",
      }),
    });

    expect(report.raw).toBe("└ https://skills.sh/github/awesome-copilot/git-commit");
  });
});
