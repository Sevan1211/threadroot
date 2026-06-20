import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { serializeFrontmatter } from "../harness/frontmatter.js";
import { projectObjectDir } from "../harness/paths.js";

/** A bundled starter skill, written on `tr init` to seed an empty repo (spec §12). */
export type BuiltinSkill = {
  name: string;
  when: string;
  tags: string[];
  body: string;
};

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    name: "conventional-commits",
    when: "writing a git commit message",
    tags: ["git", "commits"],
    body: [
      "Write commits as `type(scope): subject` using Conventional Commits.",
      "",
      "- Types: feat, fix, docs, refactor, test, chore, perf, build, ci.",
      "- Keep the subject under ~72 chars, imperative mood, no trailing period.",
      "- Explain the why in the body; reference issues in a footer (`Refs #123`).",
      "- Mark breaking changes with `!` after the type or a `BREAKING CHANGE:` footer.",
    ].join("\n"),
  },
  {
    name: "code-review",
    when: "reviewing code or a pull request",
    tags: ["review", "quality"],
    body: [
      "Review for correctness, clarity, and risk before style.",
      "",
      "- Confirm the change does what the description claims and has tests.",
      "- Look for edge cases, error handling, and security issues (input validation, secrets).",
      "- Prefer small, focused diffs; flag unrelated changes.",
      "- Leave actionable comments; distinguish blocking from optional.",
    ].join("\n"),
  },
  {
    name: "add-test",
    when: "writing or updating tests",
    tags: ["testing"],
    body: [
      "Add tests that pin behavior, not implementation details.",
      "",
      "- Cover the happy path plus boundaries and failure modes.",
      "- Name tests by the behavior they assert.",
      "- Keep each test independent and deterministic (no shared mutable state).",
      "- Run the suite and confirm the new test fails without the change.",
    ].join("\n"),
  },
  {
    name: "write-docs",
    when: "writing or updating documentation",
    tags: ["docs"],
    body: [
      "Document the why and the how-to, not just the what.",
      "",
      "- Lead with a one-line summary and a runnable example.",
      "- Keep README and inline docs in sync with the code you changed.",
      "- Prefer short sections with concrete commands over prose.",
    ].join("\n"),
  },
  {
    name: "debug-failure",
    when: "debugging a failing test or error",
    tags: ["debugging"],
    body: [
      "Reproduce, isolate, then fix the root cause.",
      "",
      "- Reproduce the failure reliably and read the full error/stack first.",
      "- Form one hypothesis at a time; change one thing and re-run.",
      "- Add a failing test that captures the bug before fixing it.",
      "- After fixing, confirm the suite is green and note the lesson in pitfalls memory.",
    ].join("\n"),
  },
];

/** Default `memory/project.md` seed prompting the user to describe the repo. */
export const PROJECT_MEMORY_TEMPLATE = [
  "# Project",
  "",
  "<!-- Stable, rarely-changing facts about this project. Keep it short. -->",
  "",
  "- What it is:",
  "- Key technologies:",
  "- How to run it:",
].join("\n");

/** Write the built-in starter skills into the project harness. Skips existing files. */
export async function writeBuiltinSkills(repoRoot: string): Promise<string[]> {
  const dir = projectObjectDir(repoRoot, "skills");
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (const skill of BUILTIN_SKILLS) {
    const filePath = path.join(dir, `${skill.name}.md`);
    const content = serializeFrontmatter(
      { name: skill.name, when: skill.when, scope: "project", tags: skill.tags },
      skill.body,
    );
    try {
      await writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
      written.push(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }
  return written;
}
