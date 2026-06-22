---
name: threadroot-cli-contracts
description: Use when changing Threadroot public CLI commands, flags, bootstrap/start/setup prompts, JSON output, README command examples, or any behavior agents are expected to call automatically.
license: MIT
compatibility: Threadroot CLI, npm package distribution, Codex, Claude, Cursor, Copilot, Gemini, Windsurf, OpenCode, Antigravity.
tags:
  - cli
  - contracts
  - prompts
  - compatibility
---

# Threadroot CLI Contracts

Use this skill when a change touches the command surface that humans or agents will call.

## Workflow

1. Start from the current harness:

```bash
threadroot start "<task>"
threadroot map --check
```

2. Identify every public surface affected:
   - `src/cli.ts`
   - command implementation under `src/commands/`
   - core implementation under `src/core/`
   - README and `INTEGRATION.md`
   - bootstrap/setup prompt text
   - tests and package smoke

3. Preserve the simple agent path:

```bash
threadroot bootstrap --yes --mcp --task "<task>"
threadroot start "<task>"
threadroot doctor
threadroot context "<task>"
```

4. If a command is renamed, removed, or replaced:
   - remove stale docs and prompt references in the same change
   - add a forbidden-contract test when the old name was agent-facing
   - keep JSON output machine-readable and backward-tolerant where possible

5. Verify:

```bash
threadroot run quick-check
threadroot run map-refresh
threadroot run doctor
```

For release-affecting command changes, ask the user before running:

```bash
threadroot run release-check --yes
```

## Quality Bar

- Do not add overlapping commands when one clear command can cover the workflow.
- Prefer one obvious front door, then advanced subcommands.
- Keep examples copy/pasteable.
- Make agent instructions deterministic: no vague "set it up" steps without commands.
- Keep `.threadroot/` canonical and provider files opt-in.
