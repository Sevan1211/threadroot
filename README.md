# Threadroot

Threadroot is a Codex Context Optimizer.

It makes Codex cheaper and better by turning repo work into small, evidence-backed, verified Codex runs. The product is optimized around **tokens-to-green**: the input, cached input, output, reasoning, tool-output, retry, and verification cost required to reach a correct result.

## What It Does

- **Preflight**: builds a compact Codex-ready brief with the goal, first reads, likely tests, verification commands, and risk notes.
- **Flight recorder**: runs `codex exec --json`, streams output to disk, captures token usage and event evidence, and verifies the result.
- **Autotuner**: scores context waste and proposes routing or `AGENTS.md` improvements from real run evidence.

Project-local Threadroot state lives only under:

```text
.codex/threadroot/
```

Threadroot does not create or require `.threadroot/`.

## Quick Start

```bash
npm install -g threadroot
threadroot init
threadroot codex install --refresh-skill
threadroot codex doctor
threadroot prep "fix the failing test" --memory tiny
threadroot codex run "fix the failing test" --memory tiny --mode balanced --ephemeral --require "pnpm test"
threadroot score latest
threadroot tune latest
```

If Codex does not already list the Threadroot MCP server, run the setup command printed by `threadroot codex install`:

```bash
codex mcp add threadroot -- threadroot mcp
```

Restart Codex after changing MCP config or refreshing the global Threadroot skill.

## Codex-Native Files

`threadroot init` creates or updates a compact root `AGENTS.md` because Codex reads `AGENTS.md` before work and the official guidance recommends keeping repo instructions small, practical, and close to the code they affect.

`threadroot codex install --refresh-skill` writes a global skill to:

```text
$HOME/.agents/skills/threadroot/SKILL.md
```

That `.agents` path is intentional: Codex documents `$HOME/.agents/skills` for global skills and `.agents/skills` for repo skills. Threadroot uses the global location so every repo can ask Codex to use the optimizer without committing a project skill.

## Commands

```bash
threadroot init [--force]
threadroot prep "<task>" [--memory tiny|conservative|standard] [--json]
threadroot codex run "<task>" [--mode cheap|balanced|deep] [--ephemeral] [--require "pnpm test"] [--json]
threadroot codex install [--refresh-skill] [--check] [--status] [--undo] [--json]
threadroot codex status [--json]
threadroot codex doctor [--json]
threadroot score latest [--json]
threadroot tune latest [--json]
threadroot eval codex [--json]
threadroot mcp
threadroot mcp check [--json]
```

`threadroot status` and `threadroot doctor` are aliases for the Codex-focused status and doctor commands.

## MCP Surface

Codex should call `context_budget` or `task_packet` before broad repo exploration. The MCP server exposes only the optimizer-focused tools:

- `task_packet`
- `context_budget`
- `repo_search`
- `repo_read`
- `score_latest`
- `trace_latest`
- `tune_latest`
- `codex_status`

Resources:

- `threadroot://brief/latest`
- `threadroot://score/latest`
- `threadroot://tuning/latest`
- `threadroot://codex`
- `threadroot://repo/{path}`

## RAM And Context Control

Threadroot defaults to the `conservative` memory profile. Use `--memory tiny` when Codex or the repo is pressuring local RAM; use `--memory standard` when you want broader preflight recall.

`threadroot codex run` streams Codex JSONL output directly to `.codex/threadroot/runs/` and stores bounded compact samples, so large tool output does not have to stay in memory or get fed back into Codex uncompressed.

Use `--ephemeral` for automation runs where Threadroot's score and trace are the durable artifact and Codex does not need to persist its own session state.
