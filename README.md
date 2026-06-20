# Threadroot

Threadroot is a local-first project launchpad and memory layer for agentic development.

It helps you start or revive projects with clean repo-owned context, workflows, and agent instructions that survive across Codex, Copilot, VS Code sessions, and future coding tools.

```bash
pnpm install
pnpm build
pnpm dev -- start --dry-run --profile nextjs --intent portfolio
```

## Commands

```bash
threadroot
threadroot start
threadroot init
threadroot revamp
threadroot map refresh
threadroot context suggest "add billing settings page"
threadroot prompt codex
threadroot prompt copilot
threadroot prompt maintain
threadroot prompt skills
threadroot refresh
threadroot refresh --memory
threadroot maintain
threadroot automation status
threadroot refresh codex
threadroot refresh copilot
threadroot refresh vscode
threadroot doctor
```

## Profiles

- `nextjs`
- `vite-react`
- `fastapi`
- `python-cli`
- `dbt`
- `empty`

## Project Memory

Threadroot keeps durable project memory in `threadroot/` and hidden tool metadata in `.threadroot/`. Generated adapters such as `AGENTS.md`, Copilot instructions, and VS Code settings can be refreshed from that repo-owned context.

`threadroot/automation.md` and `.threadroot/automation.json` describe natural upkeep triggers for agents: session start, task routing, structure changes, meaningful work, and session end. V1 keeps this guidance opt-in and explicit instead of installing background hooks.

## Agent Direction

Threadroot keeps deterministic generation as the default and uses prompt-based workflows for coding agents the developer already has, such as Codex, Copilot Chat, Cursor, or Claude Code.

Curated starter skill packs live in code today and generate `threadroot/skills/catalog.md`, `threadroot/skills/index.md`, and detailed skill files. Agent prompts should use those packs as grounded guidance instead of inventing project workflow from scratch.
