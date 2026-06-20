import type { SkillDefinition, SkillPack } from "../../types.js";
import { skillPath } from "../skill-packs.js";

function list(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function frontmatter(skill: SkillDefinition): string {
  return `---
id: ${skill.id}
category: ${skill.category}
origin: ${skill.origin ?? "curated"}
reviewed: ${skill.reviewed ?? true}
applies_to:
${skill.appliesTo.map((item) => `  - ${item}`).join("\n")}
triggers:
${skill.triggers.map((item) => `  - ${item}`).join("\n")}
source_files:
${(skill.sourceFiles ?? []).map((item) => `  - ${item}`).join("\n")}
---
`;
}

function linkToRoot(file: string): string {
  return `../../${file.replace(/^threadroot\//, "")}`;
}

export function skillFile(skill: SkillDefinition): string {
  return `${frontmatter(skill)}
# Skill: ${skill.title}

## Purpose

${skill.purpose}

## When To Use

${list(skill.triggers.map((trigger) => `Use when the task involves \`${trigger}\`.`))}

## Read First

${list(skill.readFirst.map((file) => `[${file}](${linkToRoot(file)})`))}

## Steps

${skill.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}

## Validation

${list(skill.validation)}

## Common Mistakes

${list(skill.commonMistakes)}
`;
}

export function skillsIndex(packs: SkillPack[]): string {
  const sections = packs
    .map((pack) => {
      const links = pack.skills
        .map((skill) => `- [${skill.title}](./${skill.category}/${skill.slug}.md) - ${skill.purpose}`)
        .join("\n");
      return `## ${pack.name}

${pack.description}

${links}
`;
    })
    .join("\n");

  return `# Skill Router

Do not read every skill file by default. Use this index to choose the smallest relevant skill set for the task.

Recommended flow:

1. Read [project context](../project.md), [current focus](../current-focus.md), and [handoff](../handoff.md).
2. Run \`threadroot context suggest "<task>"\` when available.
3. Run \`threadroot skills suggest "<task>"\` if you need a skill-only view.
4. Read only the suggested skill files.
5. Load deeper code context only after the skill points you toward the right area.

${sections}`;
}

export function skillsIndexJson(packs: SkillPack[]): string {
  const records = packs.flatMap((pack) =>
    pack.skills.map((skill) => ({
      ...skill,
      pack: pack.id,
      path: skillPath(skill),
    })),
  );
  return `${JSON.stringify({ version: 1, skills: records }, null, 2)}\n`;
}
