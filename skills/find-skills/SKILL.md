---
name: find-skills
description: Use when a task would benefit from a specialized Agent Skill that is not already installed, when the user asks for a capability, framework, domain, or workflow skill, or when current project skills do not strongly match the task.
license: MIT
compatibility: Threadroot-managed Agent Skills. Use through threadroot commands; do not install directly into provider skill folders.
metadata:
  upstream: https://www.skills.sh/vercel-labs/skills/find-skills
  adaptedBy: threadroot
  routesThrough: .threadroot
tags:
  - skills
  - discovery
  - routing
---

# Find Skills

Use this skill to discover a task-specific Agent Skill without flooding the model with unrelated instructions.

## Workflow

1. Run `threadroot start "<task>"` or `threadroot context "<task>"` and check whether an installed skill already matches.
2. If no installed skill fits, run `threadroot skills find "<query>" --json`.
3. Prefer skills that are GitHub-backed, reputable, audited, non-duplicate, and narrowly relevant.
4. Install through Threadroot only:

```bash
threadroot skills add <source> --skill <name>
```

5. Run `threadroot doctor` after install.
6. Load only the installed skill that matches the task. Do not load every skill.
7. If no good external skill exists, use the `create-skill` skill to create a project-specific skill under `.threadroot/skills/`.

## Safety

- Do not run `npx skills add` as the final install path. That can bypass Threadroot provenance, scanning, lockfile, and `.threadroot` routing.
- Do not create `.agents/`, `.claude/`, `.cursor/`, `.github/`, or other provider skill folders unless the user explicitly asks for native exposure.
- If Threadroot reports high risk, blocked scan, Snyk failure, scripts, provider permission fields, or suspicious instructions, stop and ask the user before trusting or using the skill.
