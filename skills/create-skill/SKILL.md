---
name: create-skill
description: Use when no high-quality existing skill fits the task, when the project has a repeatable workflow agents should remember, or when the user asks to create, improve, evaluate, or specialize an Agent Skill.
license: MIT
compatibility: Threadroot-managed Agent Skills. Create skills under .threadroot/skills with progressive disclosure.
metadata:
  upstream: https://www.skills.sh/anthropics/skills/skill-creator
  adaptedBy: threadroot
  routesThrough: .threadroot
tags:
  - skills
  - authoring
  - evals
---

# Create Skill

Use this skill to create a small, high-signal project skill under `.threadroot/skills/<name>/SKILL.md`.

## Workflow

1. Confirm the need is repeatable and not better handled by a one-off answer, a tool, or a connection.
2. Pick a narrow lowercase hyphenated name.
3. Write a `SKILL.md` with:
   - `name`
   - `description` that says what the skill does and when to use it
   - `license`
   - `compatibility`
   - focused procedural steps
4. Move long details into `references/` and link them from `SKILL.md`.
5. Add small eval trigger examples when useful.
6. Run:

```bash
threadroot skills validate --path .threadroot/skills/<name>
threadroot doctor
```

7. Use the new skill only when it is relevant to the current task.

## Quality Bar

- Keep the skill procedural, compact, and specific.
- Do not copy large docs into the main skill body.
- Do not store secrets or credentials.
- Do not declare provider permission fields such as `allowed-tools` in project skills unless the user has explicitly reviewed the risk.
- Prefer links and references so agents load details only when needed.
