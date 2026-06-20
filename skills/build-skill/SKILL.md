---
name: build-skill
description: Use when creating, reviewing, or improving Threadroot or Agent Skills, including SKILL.md descriptions, progressive disclosure, bundled references/scripts/assets, validation, trigger quality, and skill evals.
scope: project
tags:
  - skills
  - agent-harness
  - prompting
---

# Build Skill

Build skills as compact operating procedures, not essays. Assume the model is capable; add only context that improves repeatability, accuracy, or safety.

## Workflow

1. Capture concrete trigger examples and non-trigger examples.
2. Write a precise `description` that says what the skill does and when to use it. The description is the trigger surface.
3. Keep `SKILL.md` procedural and short. Move variant details, schemas, examples, policies, and longer guidance into `references/`.
4. Add scripts only for deterministic, fragile, or frequently repeated work. Scripts must be non-interactive and have clear errors.
5. Add assets only when the skill needs reusable output material such as templates or boilerplate.
6. Add eval prompts that compare with-skill and without-skill behavior on realistic tasks.
7. Validate frontmatter, folder naming, reference links, and token footprint before shipping.

## Quality Bar

- Prefer one strong skill per repeatable workflow over giant catch-all skills.
- Keep instructions imperative and directly actionable.
- Include failure modes and validation steps.
- Do not duplicate reference content in `SKILL.md`; link to it.
- Never hide risky tool use in a skill. Surface confirmation, trust, and environment needs clearly.

## Reference Loading

- Read `references/skill-quality.md` before authoring a new curated skill.
- Read `references/eval-prompts.md` when adding or reviewing skill tests.
