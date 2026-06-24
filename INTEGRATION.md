# Integration Guide

Threadroot 0.3 is Codex/OpenAI-only. Integrations should present Threadroot as a Codex Context Optimizer: compact preflight briefs, `codex exec --json` flight recording, tokens-to-green scoring, verification, and evidence-backed tuning.

## First-Run Flow

```bash
threadroot codex install --refresh-skill --json
threadroot codex status --json
threadroot prep "describe the next change" --json
threadroot codex run "describe the next change" --mode balanced --require "pnpm test" --json
threadroot score latest --json
threadroot tune latest --json
```

If Codex is missing the MCP server, show the setup command from `codex install`:

```bash
codex mcp add threadroot -- threadroot mcp
```

Tell the user to restart Codex after changing MCP config or refreshing the global skill.

## Codex Health

Use:

```bash
threadroot codex status --json
threadroot codex doctor --json
threadroot mcp check --json
```

Status is cheap and reports Codex CLI availability, default runner command, config path, MCP setup command, and required smoke tools. Doctor performs the MCP handshake and task-packet smoke check.

## Optimizer Flow

Use `threadroot prep "<task>" --json` as the default context endpoint. It does not invoke Codex. It writes `.codex/threadroot/briefs/latest.json`, `.codex/threadroot/index/latest.json`, and returns a compact prompt-ready brief with first reads, likely tests, verification commands, and token estimates.

Use `threadroot codex run "<task>" --json` when the integration should run the full local loop. It invokes the installed Codex CLI with the user's existing Codex auth, captures JSONL events and usage, runs verification commands, then writes `.codex/threadroot/runs/` and `.codex/threadroot/scores/`.

Use `threadroot score latest --json` for tokens-to-green, context precision, verification status, retry count, and recommendations.

Use `threadroot tune latest --json` to create evidence-backed routing hints and guidance proposals. Shared guidance such as `AGENTS.md` should still require explicit user approval before editing.

`threadroot task "<task>" --json` remains available as the richer legacy task-packet endpoint while the optimizer surface matures.

For MCP clients, call `context_budget` or `task_packet` before broad reads. Use `repo_search` and `repo_read` for targeted follow-up.

## Loop Automation

Use Codex-only loop commands:

```bash
threadroot loop start "<goal>" --max-iterations 3 --json
threadroot loop next --json
threadroot loop run --iterations 1 --require "pnpm test" --json
threadroot loop report --json
threadroot loop finish --json
```

`loop run` executes `codex exec --json --sandbox workspace-write`, captures Codex JSONL events, runs verification commands, evaluates traces, writes improvement candidates, and emits report paths. Use `--codex-bin <path>` only for local testing or custom Codex executable paths.

## MCP Contract

Threadroot MCP exposes compact text plus structured content. Important tools:

- `context_budget`
- `task_packet`
- `score_latest`
- `tune_latest`
- `codex_status`
- `index_status`
- `refresh_context`
- `repo_search`
- `repo_read`
- trace/eval/improve/loop tools
- skills/tools/connections/memory/web/status/doctor tools

Important resources:

- `threadroot://brief/latest`
- `threadroot://score/latest`
- `threadroot://tuning/latest`
- `threadroot://task/latest`
- `threadroot://index`
- `threadroot://codex`
- `threadroot://repo-map`
- `threadroot://trace/latest`
- `threadroot://loop/current`

## Safety

Do not store secrets in Threadroot. Normal optimizer workflows use the local Codex CLI and the user's existing Codex auth, not direct OpenAI API keys. MCP tools cannot self-confirm risky execution. `.codex/threadroot/` is local optimizer state and should not be committed unless a future portable sync story explicitly allows it.

## Packaging Checks

Release and integration checks should run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm pack:check
pnpm package:smoke
```

Package smoke must execute the packed CLI binary directly on POSIX so executable-bit regressions are caught.
