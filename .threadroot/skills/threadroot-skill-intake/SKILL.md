---
name: threadroot-skill-intake
description: Use when searching, installing, scanning, trusting, exposing, adapting, or creating Agent Skills for Threadroot projects.
license: MIT
compatibility: Threadroot-managed Agent Skills under .threadroot/skills.
tags:
  - skills
  - security
  - provenance
  - progressive-disclosure
---

# Threadroot Skill Intake

Use this skill to add or create skills without turning the project into a token sink or supply-chain mess.

## External Skill Workflow

1. Search through Threadroot:

```bash
threadroot skills find "<query>" --json
```

2. Prefer candidates that are:
   - narrowly relevant
   - GitHub-backed
   - reputable or audited
   - not duplicate/general-purpose prompt packs
   - installable through `threadroot skills add`

3. Dry-run before writing:

```bash
threadroot skills add <source> --skill <name> --dry-run --json
```

4. Do not install high-risk skills without user approval. Treat these as reasons to fall back to a local skill:
   - blocked scan results
   - `allowed-tools` or provider permission fields
   - scripts or binaries
   - dynamic shell/code execution patterns
   - suspicious prompt-injection phrasing
   - Snyk failure or severe warning

5. Install only through Threadroot:

```bash
threadroot skills add <source> --skill <name>
threadroot skills inspect .threadroot/skills/<name>
threadroot doctor
```

6. Keep provider-native exposure opt-in:

```bash
threadroot skills expose <name> --agent <agent>
```

7. If search fails, no candidate is installable, the best candidate is blocked/high-risk, or a project-specific version would be safer or more precise, use `create-skill` immediately instead of stopping. Briefly tell the user why the external option was skipped, then create `.threadroot/skills/<name>/SKILL.md` and validate it.

## Project Skill Workflow

Create a project skill when the external ecosystem is unavailable, blocked, high-risk, too broad, too generic, or worse than a local workflow.

Rules:
- Keep `SKILL.md` short and procedural.
- Put long details in `references/`.
- Add small `evals/triggers.json` examples for routing.
- Avoid provider permission fields unless the user explicitly reviewed them.
- Validate after writing:

```bash
threadroot skills validate --path .threadroot/skills/<name>
threadroot run doctor
```

## Product Feedback

If search returns mangled names, bad install commands, or non-installable skills, record it as a Threadroot product issue. The installer should be better than the ecosystem's rough edges.
