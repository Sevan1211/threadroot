# Threadroot Skills

Curated Agent Skills that can be installed into any Threadroot harness.

```bash
threadroot install github:Sevan1211/threadroot/skills/system-design@main --kind skill
threadroot install github:Sevan1211/threadroot/skills/build-skill@main --kind skill
threadroot skills validate --path skills
threadroot skills inspect skills/system-design
```

Each skill uses the folder shape:

```text
skills/<name>/
  SKILL.md
  references/
  scripts/
  assets/
  evals/triggers.json
```

Keep `SKILL.md` compact and procedural. Put detailed checklists, examples, and
variant-specific guidance in `references/`, then link those files from `SKILL.md` so
agents can load only the relevant details for the task.

Good skills should:

- Use a precise `description` that tells the agent when to trigger the skill.
- Keep always-loaded instructions short enough to fit comfortably in context.
- Move deep guidance, examples, and checklists into linked reference files.
- Include `evals/triggers.json` with positive and negative trigger examples.
- Avoid scripts and allowed tools unless the workflow truly needs them.

Validate the curated pack before release:

```bash
threadroot skills validate --path skills
```
