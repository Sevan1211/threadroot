import fs from "node:fs/promises";
import path from "node:path";
import { SKILLS_INDEX_PATH, toRepoPath } from "./paths.js";
import type { SkillDefinition } from "../types.js";

type SkillsIndexFile = {
  version: 1;
  skills: Array<SkillDefinition & { path: string; pack?: string }>;
};

export function projectSkillPath(slug: string): string {
  return `threadroot/skills/project/${slug}.md`;
}

export function projectSkillDefinition(slug: string, title?: string): SkillDefinition {
  const normalizedTitle = title ?? slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    id: `project.${slug}`,
    slug,
    category: "project",
    title: normalizedTitle,
    purpose: "Describe the repeated repo-specific workflow this skill should guide.",
    origin: "project",
    sourceFiles: [],
    reviewed: false,
    triggers: [slug],
    appliesTo: ["project"],
    readFirst: ["threadroot/project.md", "threadroot/architecture.md", "threadroot/commands.md"],
    steps: [
      "Replace this scaffold with the repo-specific workflow.",
      "List the files, folders, commands, and conventions the agent should use.",
      "Keep this skill focused on one repeated task.",
    ],
    validation: ["Add the exact validation commands for this workflow."],
    commonMistakes: ["Add repo-specific mistakes this skill should prevent."],
  };
}

export async function readProjectSkills(repoRoot: string): Promise<SkillDefinition[]> {
  try {
    const raw = await fs.readFile(path.join(repoRoot, SKILLS_INDEX_PATH), "utf8");
    const parsed = JSON.parse(raw) as SkillsIndexFile;
    return parsed.skills.filter((skill) => skill.category === "project");
  } catch {
    return [];
  }
}

export async function upsertProjectSkillIndex(repoRoot: string, skill: SkillDefinition): Promise<void> {
  const indexPath = toRepoPath(repoRoot, SKILLS_INDEX_PATH);
  let current: SkillsIndexFile = { version: 1, skills: [] };

  try {
    current = JSON.parse(await fs.readFile(indexPath, "utf8")) as SkillsIndexFile;
  } catch {
    // Creating a project skill before start/revamp should still produce a usable index.
  }

  const record = { ...skill, path: projectSkillPath(skill.slug) };
  current.skills = [...current.skills.filter((existing) => existing.id !== skill.id), record];
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, `${JSON.stringify(current, null, 2)}\n`);
}
