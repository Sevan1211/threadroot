export function startSessionSkill(): string {
  return `# Skill: Start Session

Use this at the start of a new AI coding session.

1. Read \`threadroot/project.md\`, \`threadroot/current-focus.md\`, \`threadroot/handoff.md\`, \`threadroot/commands.md\`, and \`threadroot/architecture.md\`.
2. Check \`threadroot/pitfalls.md\` for project-specific traps.
3. Run \`threadroot doctor\` if the CLI is available.
4. If doctor reports stale generated context, ask before running \`threadroot refresh\`.
5. Summarize the current project state before planning changes.
`;
}

export function refreshContextSkill(): string {
  return `# Skill: Refresh Context

Use this when Codex, Copilot, or VS Code guidance may be stale.

1. Run \`threadroot doctor\`.
2. If generated files are stale, run the narrowest refresh command:
   - \`threadroot refresh codex\` for Codex guidance
   - \`threadroot refresh copilot\` for Copilot instructions
   - \`threadroot refresh vscode\` for VS Code settings
   - \`threadroot refresh\` for all enabled targets
3. Run \`threadroot map refresh\` after meaningful source tree or config changes.
4. Run \`threadroot refresh --memory\` after meaningful sessions to review memory bloat and archive candidates.
5. Prefer \`threadroot maintain\` when map, memory review, and generated adapters all need upkeep.
6. If Threadroot reports manual edits, show the diff and ask before overwriting.
7. After refresh, summarize which files changed and why.
`;
}

export function planFeatureSkill(): string {
  return `# Skill: Plan Feature

Use this before implementing a meaningful feature.

1. State the user goal and the smallest useful outcome.
2. Identify affected areas of the repo.
3. Read relevant project context before editing.
4. Propose validation commands from \`threadroot/commands.md\`.
5. Keep the plan focused enough to complete in one working session.
`;
}

export function validateChangeSkill(): string {
  return `# Skill: Validate Change

Use this before calling a change complete.

1. Review changed files for accidental scope creep.
2. Run the relevant validation commands from \`threadroot/commands.md\`.
3. If validation fails, fix the issue or explain the remaining blocker.
4. Update Threadroot memory only when the change creates durable project knowledge.
`;
}

export function updateMemorySkill(): string {
  return `# Skill: Update Memory

Use this at the end of meaningful sessions or after important project changes.

1. Update \`threadroot/handoff.md\` with changed files, validation status, blockers, and next action.
2. Update \`threadroot/current-focus.md\` if the active milestone changed.
3. Add durable tradeoffs to \`threadroot/decisions.md\`.
4. Add repeated mistakes or repo-specific traps to \`threadroot/pitfalls.md\`.
5. Keep memory concise. Do not paste chat transcripts.
6. Run \`threadroot refresh --memory\` to create a memory review before condensing or archiving.
7. Ask before changing memory if the update is interpretive or uncertain.
`;
}

export function revampContextSkill(): string {
  return `# Skill: Revamp Context

Use this after \`threadroot revamp\` creates or updates project memory.

1. Read \`threadroot/sources.md\` and the selected source files it references.
2. Improve \`threadroot/project.md\`, \`threadroot/architecture.md\`, and \`threadroot/commands.md\` only with supported facts.
3. Move durable lessons into \`threadroot/decisions.md\` or \`threadroot/pitfalls.md\`.
4. Keep source references intact so future agents can trace where context came from.
5. Ask before overwriting existing agent instructions.
`;
}
