import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runSkillsInspect, runSkillsList, runSkillsValidate } from "../src/commands/skills.js";
import { initHarness } from "../src/core/init/index.js";
import { validateSkillPath, validateSkills } from "../src/core/skills.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-skills-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await rm(repo, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(repo, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

function captureLog(): string[] {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
    lines.push(String(message ?? ""));
  });
  return lines;
}

describe("skills commands", () => {
  it("lists and validates initialized curated skills", async () => {
    await write("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest" } }));
    await initHarness(repo, { import: false, home: repo });

    const listLines = captureLog();
    await runSkillsList(repo);
    expect(listLines.join("\n")).toContain("system-design");
    expect(listLines.join("\n")).toContain("build-skill");

    vi.restoreAllMocks();
    const validateLines = captureLog();
    await runSkillsValidate(repo);
    expect(validateLines.join("\n")).toBe("Skills valid.");
  });

  it("flags weak modern skill definitions", async () => {
    await write(".threadroot/harness.yaml", "name: demo\nversion: 1\nprofile: node-cli\nadapters:\n  - agents\n");
    await write(".threadroot/skills/Bad/SKILL.md", "---\nname: Bad\ndescription: Short\n---\n");

    const report = await validateSkills(repo, { home: repo });

    expect(report.ok).toBe(false);
    expect(report.findings.map((finding) => finding.severity)).toContain("error");
    expect(report.findings.map((finding) => finding.severity)).toContain("warning");
  });

  it("flags broken reference links and invalid trigger evals", async () => {
    await write(
      "skills/broken/SKILL.md",
      [
        "---",
        "name: broken",
        "description: Use when validating broken skill references and eval fixtures.",
        "---",
        "",
        "# Broken",
        "",
        "Read [missing](references/missing.md).",
      ].join("\n"),
    );
    await write("skills/broken/references/empty.md", "");
    await write("skills/broken/evals/triggers.json", JSON.stringify({ shouldTrigger: [], shouldNotTrigger: [] }));

    const report = await validateSkillPath(path.join(repo, "skills"));

    expect(report.ok).toBe(false);
    expect(report.findings.map((finding) => finding.message).join("\n")).toContain("missing file");
    expect(report.findings.map((finding) => finding.message).join("\n")).toContain("must not be empty");
    expect(report.findings.map((finding) => finding.message).join("\n")).toContain("shouldTrigger");
  });

  it("inspects a skill path", async () => {
    const lines = captureLog();
    await runSkillsInspect(process.cwd(), "skills/system-design");
    const output = lines.join("\n");

    expect(output).toContain("system-design");
    expect(output).toContain("architecture-checklist.md");
    expect(output).toContain("triggers.json");
  });

  it("validates the repo-level curated skill pack and catalog paths", async () => {
    const skillsPath = path.join(process.cwd(), "skills");
    const report = await validateSkillPath(skillsPath);
    expect(report).toMatchObject({ ok: true, findings: [] });

    const catalog = JSON.parse(await readFile(path.join(skillsPath, "catalog.json"), "utf8")) as {
      skills: Array<{ name: string; path: string }>;
    };
    expect(catalog.skills.map((skill) => skill.name).sort()).toEqual([
      "add-test",
      "build-skill",
      "build-tool",
      "code-review",
      "conventional-commits",
      "debug-failure",
      "security-review",
      "system-design",
      "write-docs",
    ]);
    for (const skill of catalog.skills) {
      await expect(stat(path.join(process.cwd(), skill.path, "SKILL.md"))).resolves.toBeDefined();
      await expect(stat(path.join(process.cwd(), skill.path, "evals/triggers.json"))).resolves.toBeDefined();
    }
  });
});
