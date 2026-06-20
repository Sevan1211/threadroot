import { readConfig } from "../core/config.js";
import {
  projectSkillDefinition,
  projectSkillPath,
  readProjectSkills,
  upsertProjectSkillIndex,
} from "../core/project-skills.js";
import { getProfile } from "../core/profiles.js";
import { selectSkills, skillPath, skillPacks, suggestSkills } from "../core/skill-packs.js";
import { skillFile } from "../core/templates.js";
import { applyWrites, planWrites } from "../core/writer.js";
import type { SkillDefinition } from "../types.js";
import { printPlan, promptForPolicy } from "./shared.js";

function printSkill(skill: SkillDefinition): void {
  console.log(`${skill.id}`);
  console.log(`  ${skill.title}`);
  console.log(`  ${skill.purpose}`);
  console.log(`  ${skillPath(skill)}`);
}

async function skillsForRepo(repoRoot: string): Promise<SkillDefinition[]> {
  try {
    const config = await readConfig(repoRoot);
    const profile = getProfile(config.profile);
    return [
      ...selectSkills([config.profile, profile.framework, profile.language, config.intent]),
      ...(await readProjectSkills(repoRoot)),
    ];
  } catch {
    return skillPacks.flatMap((pack) => pack.skills);
  }
}

export async function runSkillsList(repoRoot: string): Promise<void> {
  const skills = await skillsForRepo(repoRoot);
  for (const skill of skills) {
    printSkill(skill);
  }
}

export async function runSkillsSuggest(repoRoot: string, task: string): Promise<void> {
  const skills = await skillsForRepo(repoRoot);
  const suggestions = suggestSkills(task, skills);

  if (suggestions.length === 0) {
    console.log("No specific skills matched. Start with:");
    for (const skill of skills.filter((candidate) => candidate.category === "core").slice(0, 3)) {
      printSkill(skill);
    }
    return;
  }

  console.log(`Suggested skills for: ${task}`);
  for (const skill of suggestions) {
    printSkill(skill);
  }
}

export async function runSkillsCreate(
  repoRoot: string,
  slug: string,
  options: { title?: string; dryRun?: boolean; yes?: boolean },
): Promise<void> {
  const definition = projectSkillDefinition(slug, options.title);
  const planned = await planWrites(repoRoot, [
    {
      path: projectSkillPath(slug),
      content: skillFile(definition),
      generated: false,
    },
  ]);
  printPlan(planned);

  if (options.dryRun) {
    return;
  }

  const policy = options.yes ? "overwrite" : await promptForPolicy(repoRoot, planned);
  const written = await applyWrites(repoRoot, planned, policy);
  if (written.some((file) => file.path === projectSkillPath(slug))) {
    await upsertProjectSkillIndex(repoRoot, definition);
  }
  console.log(`Created ${written.filter((file) => file.status !== "unchanged").length} project skill file(s).`);
}
