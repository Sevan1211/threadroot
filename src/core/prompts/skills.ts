export function skillsPrompt(): string {
  return `You are helping improve this repository's Threadroot project-specific skills.

Goal:
Propose 1-3 high-value project-specific skills that would make future coding-agent sessions better in this repo.

Read first:
- threadroot/project.md
- threadroot/architecture.md
- threadroot/commands.md
- threadroot/pitfalls.md
- threadroot/skills/index.md
- .threadroot/skills-index.json

Rules:
- Do not duplicate curated skills.
- Only create project-specific skills for repeated workflows unique to this repo.
- Put project-specific skills under threadroot/skills/project/.
- Keep each skill focused on one task.
- Include frontmatter with id, category, origin, reviewed, applies_to, triggers, and source_files.
- Include Purpose, When To Use, Read First, Steps, Validation, and Common Mistakes.
- Use markdown links for files where helpful.
- Ask before writing files.
- After adding skills, update threadroot/skills/index.md and .threadroot/skills-index.json.

Good examples:
- project.add-billing-plan-card
- project.add-dbt-staging-model
- project.update-threadroot-adapter

Bad examples:
- generic React component skill
- generic testing skill
- vague "work on project" skill

Start by inspecting the repo and proposing the skill names with a one-sentence reason for each.`;
}
