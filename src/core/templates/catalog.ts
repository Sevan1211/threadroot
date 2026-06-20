import type { SkillPack } from "../../types.js";

export function skillCatalogContext(packs: SkillPack[]): string {
  return `# Skill Catalog

Threadroot can use curated skill packs as deterministic starters or AI-generation guidance.

For routing, start with [skills/index.md](./index.md) or run \`threadroot skills suggest "<task>"\`.

${packs
  .map(
    (pack) => `## ${pack.name}

- ID: \`${pack.id}\`
- Applies to: ${pack.appliesTo.join(", ")}
- Purpose: ${pack.description}

${pack.skills.map((skill) => `- \`${skill.slug}\` - ${skill.title}: ${skill.purpose}`).join("\n")}
`,
  )
  .join("\n")}`;
}
