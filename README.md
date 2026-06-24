# Threadroot

Threadroot is a Codex Context Optimizer.

It makes Codex cheaper and better by turning repo work into small, evidence-backed, verified Codex runs. The primary metric is **tokens-to-green**: how many Codex input, cached-input, output, reasoning, tool-output, and retry tokens it takes to reach a verified result.

The new high-value path is:

- **Preflight**: locally compile the smallest useful Codex brief: goal, first reads, likely tests, verification commands, and risk notes.
- **Flight Recorder**: run Codex through `codex exec --json`, capture usage/events/output, and verify the result.
- **Autotuner**: score context waste and propose routing or guidance changes from real run evidence.

Optimizer state is Codex-native and local:

```text
.codex/threadroot/
```

## Quick Start

```bash
npm exec --package=threadroot -- threadroot codex install --refresh-skill
npm exec --package=threadroot -- threadroot prep "fix the failing test" --memory tiny --json
npm exec --package=threadroot -- threadroot codex run "fix the failing test" --memory tiny --mode balanced --ephemeral --require "pnpm test"
npm exec --package=threadroot -- threadroot score latest
npm exec --package=threadroot -- threadroot tune latest
```

After `codex install`, add the printed MCP setup command to Codex if it is not already configured:

```bash
codex mcp add threadroot -- threadroot mcp
```

Then restart Codex so it sees the MCP server and refreshed Threadroot skill.

## Product Shape

Threadroot focuses on Codex/OpenAI only:

- `threadroot prep "<task>"` compiles a compact Codex-ready brief without invoking Codex.
- `threadroot codex run "<task>"` runs Preflight -> `codex exec --json` -> verification -> scoring.
- `threadroot score latest` reports tokens-to-green, context waste, verification status, retries, and recommendations.
- `threadroot tune latest` writes evidence-backed routing hints and proposes guidance changes.
- `threadroot eval codex` compares compact preflight prompts against raw task packets on repo-specific eval cases.
- `threadroot task "<task>"` remains as the legacy rich task-packet endpoint while the optimizer matures.
- `threadroot codex install|status|doctor` manages the Codex-facing setup and health checks.
- `threadroot mcp` exposes lazy MCP tools and resources to Codex.

Threadroot does not require a Threadroot API key and does not make OpenAI API calls during normal local workflows. It uses the user's existing Codex installation and auth.

## RAM And Context Control

Threadroot defaults to the `conservative` memory profile. Use `--memory tiny` when Codex or the repo is pressuring local RAM; use `--memory standard` when you want broader preflight recall. Memory profiles cap local file walking, per-file sampling, ranked files, and prompt budgets before Codex runs.

`threadroot codex run` streams `codex exec --json` output directly to `.codex/threadroot/runs/` while parsing token and file evidence incrementally. The score records the memory profile, raw Codex output bytes, whether output was streamed, and whether compact samples were truncated.

Use `--ephemeral` for automation runs where Threadroot's run trace and score are the durable artifact. This asks Codex not to persist its own session state for that run.

## Core Commands

```bash
threadroot codex install [--refresh-skill] [--check] [--status] [--undo] [--json]
threadroot codex status [--json]
threadroot codex doctor [--json]

threadroot prep "<task>" [--mode cheap|balanced|deep] [--memory tiny|conservative|standard] [--json]
threadroot codex run "<task>" [--mode cheap|balanced|deep] [--memory tiny|conservative|standard] [--ephemeral] [--require "pnpm test"] [--json]
threadroot score latest [--json]
threadroot tune latest [--json]
threadroot eval codex [--json]

threadroot init
threadroot task "<task>" [--json] [--debug-ranking] [--force-index]
threadroot refresh [--json]
threadroot index [--status] [--json]
threadroot map [--write|--check] [--json]

threadroot trace start "<task>" [--json]
threadroot trace event note --message "<note>" [--json]
threadroot trace finish --status partial [--json]
threadroot eval context [--json]
threadroot eval traces --latest [--json]
threadroot improve latest [--json]

threadroot loop start "<goal>" --max-iterations 3 [--json]
threadroot loop next [--json]
threadroot loop run --iterations 1 --require "pnpm test" [--json]
threadroot loop report [--json]
threadroot loop finish [--json]
```

## MCP Surface

Codex should call `context_budget` or `task_packet` before broad repo exploration. MCP also exposes:

- `context_budget`
- `score_latest`
- `tune_latest`
- `codex_status`
- `index_status`, `refresh_context`, `trace_context`, `eval_context`
- trace, eval, improve, and loop tools
- repo map/search/read tools
- skills, tools, connections, memory, web fetch, status, and doctor tools

Key resources:

- `threadroot://brief/latest`
- `threadroot://score/latest`
- `threadroot://tuning/latest`
- `threadroot://task/latest`
- `threadroot://index`
- `threadroot://codex`
- `threadroot://repo-map`
- `threadroot://trace/latest`
- `threadroot://loop/current`

## Codex Loops

`threadroot loop run` uses Codex only. It builds the next evidence-backed prompt, runs:

```bash
codex exec --json --sandbox workspace-write -C <repo> -
```

then captures Codex JSONL events, verification output, trace evals, improvement candidates, and a final report. Use `--codex-bin <path>` only for advanced local testing.

## Local State

Keep `.codex/threadroot/` local unless a future sync/versioning workflow explicitly says otherwise. The npm package does not ship optimizer indexes, run traces, scores, tuning reports, caches, memory, Codex install receipts, or generated local state.

Generated Codex-native files stay where Codex expects them, such as `AGENTS.md` and `.agents/skills`, only when explicitly requested.
