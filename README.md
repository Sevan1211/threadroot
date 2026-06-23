# Threadroot

Stop re-teaching every coding agent your repo.

Threadroot is a local repo intelligence runtime for coding agents. It keeps task packets, an indexed repo graph, skills, tools, connections, memory, repo maps, provider receipts, import reports, web fetch cache, policy, and provenance under one private project folder:

```text
.threadroot/
```

For `0.2.1`, `.threadroot/` is local-only and should not be committed to git. The OSS CLI works without a cloud account or API key.

## Why

AI coding setups usually sprawl across provider instruction files, MCP configs, prompts, notes, shell snippets, and stale docs. Threadroot gives agents a smaller, fresher first packet:

- `threadroot task` packets with ranked files, symbol outlines, snippets, tests, commands, skills, warnings, and token estimates
- a local repo intelligence index with deterministic lexical, symbol, graph, and built-in zero-key local vector routing, plus optional SQLite/FTS5 acceleration when `better-sqlite3` is installed
- built-in context evals for recall, precision, MRR, nDCG, token count, and irrelevant-file rate
- progressive-disclosure skills under `.threadroot/skills/`
- explicit local tools and connections with risk/confirmation metadata
- MCP tools/resources for compatible agents
- trace-driven self-improvement that applies only safe repo-local routing, eval, and validation skill lessons automatically
- non-destructive import reports for existing provider files
- known-URL web fetch with local cache and provenance
- provider status for Codex, Claude Code, Cursor, Copilot/VS Code, Gemini, Windsurf, OpenCode, and Antigravity automation/MCP surfaces

## Quick Start

In a new or existing repo:

```bash
npm exec --package=threadroot -- threadroot init
npm exec --package=threadroot -- threadroot connect codex --refresh-skill
npm exec --package=threadroot -- threadroot providers --json
npm exec --package=threadroot -- threadroot task "start this project"
```

Or after install:

```bash
threadroot init
threadroot connect codex --refresh-skill
threadroot providers --json
threadroot task "start this project"
```

Use `threadroot connect <agent>` for `codex`, `claude`, `cursor`, `vscode`, `copilot`, `gemini`, `windsurf`, `opencode`, `antigravity`, or `all`.

Default connect writes only a non-secret receipt under `.threadroot/providers/<agent>/` and prints the provider-specific setup command or instructions. `--refresh-skill` explicitly installs/updates the global Threadroot agent skill for that provider so agents learn the current `task_packet`/`repo_read` workflow. Connect does not create visible provider files such as `AGENTS.md`, `CLAUDE.md`, `.vscode/`, `.cursor/`, `.mcp.json`, or `.github/copilot-instructions.md`.

Visible provider project files are opt-in:

```bash
threadroot connect claude --project-files
```

## Core Loop

```bash
threadroot task "fix auth bug"
threadroot providers --json
threadroot trace start "fix auth bug"
threadroot run test --brief
threadroot trace finish --status passed
threadroot eval traces
threadroot improve latest
threadroot eval context
threadroot doctor
```

`task` is the canonical first command. It refreshes stale repo-map/index state, then returns a compact first-read packet so the agent does not flood the prompt or wander the repo.

```bash
threadroot task "fix flaky billing retry test" --json
```

The result includes ranked files, symbol outlines, snippets, tests, likely commands, recommended skills, relevant memory, freshness/trust/permission warnings, next reads, omitted sections, debug-ranking details when requested, and an approximate token estimate.

`threadroot eval context` runs built-in gold-context cases that apply to the current repo and skips non-applicable built-ins instead of reporting misleading scores. Use `--min-recall`, `--min-precision`, `--min-ndcg`, and `--max-average-tokens` as release gates for routing quality and token cost.

`threadroot improve latest` ranks trace-driven candidates by priority and score, writes pending candidates, and automatically applies only guarded repo-local lessons: routing hints, trace-derived context evals, and generated validation-skill lessons. Memory, new tools, connections, and higher-risk changes remain candidates until explicit policy or user approval.

For budgeted agent improvement work, use loop sessions:

```bash
threadroot loop start "Improve MCP routing quality" --agent codex --time 60m --max-iterations 6 --risk low
threadroot loop next
threadroot loop run --iterations 1 --require "pnpm typecheck" --require "pnpm test"
threadroot loop report
threadroot loop finish
```

`threadroot providers --json` reports the current machine's provider CLI availability, default runner, MCP setup, event capture, and compression strategy. `loop run` uses provider adapters for automated iterations. Codex uses `codex exec --json --sandbox workspace-write`; Claude Code uses print mode with stream JSON, `--permission-mode auto`, hook events, and cross-machine prompt-cache flags; Cursor is MCP-first unless you pass an explicit `--agent-command`. Custom binaries can be parsed with `--agent-adapter codex|claude|custom`. Required verification commands are captured into the active trace and determine whether the iteration is `passed`, `failed`, or `partial`.

## Repo Intelligence

```bash
threadroot index
threadroot index --status --json
threadroot refresh --json
threadroot task "fix auth bug" --debug-ranking
threadroot eval context
threadroot eval context --min-recall 0.95 --min-ndcg 0.90 --max-average-tokens 3600
```

The repo map lives under `.threadroot/memory/repo-map.md` and the index lives under `.threadroot/cache/index/`. `threadroot task` refreshes stale map/index state automatically; `threadroot refresh` exists for explicit preflight, CI, hooks, and agent sessions that want to prove context freshness before routing.

Threadroot tries `better-sqlite3` when it is installed as an optional peer accelerator, then falls back to Node's `node:sqlite` on supported runtimes, then to a deterministic JSON index. When native SQLite is unavailable, `doctor` reports degraded precision instead of failing the harness.

Optional native acceleration:

```bash
npm install -g better-sqlite3
threadroot index --force
```

The shipped extractor is language-aware for TypeScript, JavaScript, Python, Go, Rust, JSON, YAML, Markdown, and broad text fallbacks. Tree-sitter grammar adapters remain a future native path.

Threadroot includes built-in local hashing embeddings for indexed chunks. They are deterministic, free, repo-local, and require no keys or network. External embedding providers remain explicit opt-in:

```bash
threadroot embeddings status
threadroot embeddings refresh
threadroot embeddings configure --provider local --model my-embedding-model
```

Threadroot does not call external embedding providers or upload code unless an explicit adapter is configured and invoked. `embeddings refresh` rebuilds the built-in local vectors.

## What Init Creates

Every initialized project starts with seven Threadroot-adapted seed skills:

```text
.threadroot/skills/threadroot/SKILL.md
.threadroot/skills/find-skills/SKILL.md
.threadroot/skills/create-skill/SKILL.md
.threadroot/skills/create-tool/SKILL.md
.threadroot/skills/create-connection/SKILL.md
.threadroot/skills/closing-loop-research/SKILL.md
.threadroot/skills/loop-automation-engineering/SKILL.md
```

Threadroot also creates local harness objects such as:

```text
.threadroot/harness.yaml
.threadroot/lock.json
.threadroot/memory/project.md
.threadroot/memory/repo-map.md
.threadroot/tools/*.yaml
.threadroot/imports/*
.threadroot/providers/*
.threadroot/cache/*
```

In a git repo, init prefers `.git/info/exclude` so `.threadroot/` stays out of commits without changing the visible project surface. Use `threadroot init --gitignore` only when you intentionally want a visible root `.gitignore` rule.

## Commands

```bash
threadroot init [--no-import] [--profile <profile>] [--gitignore]
threadroot connect [agent|all] [--check] [--status] [--undo] [--project-files] [--refresh-skill] [--json]
threadroot task "<task>" [--budget <tokens>] [--max-files <count>] [--debug-ranking] [--json]
threadroot refresh [--force] [--json]
threadroot index [--status] [--force] [--json]
threadroot eval context [--json] [--min-recall <score>] [--min-precision <score>] [--min-ndcg <score>] [--max-average-tokens <tokens>]
threadroot eval traces [--latest] [--json] [--min-recall <score>] [--min-mrr <score>] [--max-failed-tool-runs <count>]
threadroot providers [--json]
threadroot trace start|event|finish|latest [--json]
threadroot improve latest [--write-candidates] [--no-auto-apply] [--dry-run] [--json]
threadroot improve apply [--no-auto-safe] [--dry-run] [--json]
threadroot loop start|next|report|run|finish [--json]
threadroot embeddings status|configure|refresh [--json]
threadroot import [--dry-run] [--consolidate] [--json]
threadroot map --write|--check [--json]
threadroot status [--json]
threadroot doctor [--json]
threadroot mcp
threadroot mcp check [--json]
threadroot connections discover [--include-missing] [--json]
threadroot connections list|add|check [--json]
```

## Skills

Threadroot stores skills under `.threadroot/skills/` and routes agents to full skill bodies only when relevant.

```bash
threadroot skills match "prepare a release"
threadroot skills find "improve nextjs performance"
threadroot skills ingest vercel-labs/skills --skill find-skills
threadroot skills inspect .threadroot/skills/<name>
threadroot skills scan .threadroot/skills/<name>
threadroot skills trust <name>
threadroot memory gc
```

Use local/project skills for repeated procedures. Use memory for stable facts. Use tools for executable commands.

External skills are scanned before install and recorded in `.threadroot/lock.json`. Threadroot detects risk signals; it does not certify third-party skills as safe.

## Tools And Connections

A tool is an executable, testable local capability:

```bash
threadroot tools detect
threadroot tools create --from-command "pnpm test" --description "Run tests" --healthcheck "pnpm --version"
threadroot tools list
threadroot tools check
threadroot run test --brief
```

`--brief` stores full stdout/stderr under `.threadroot/cache/runs/`, writes a paired compact `.brief.md`, and returns parsed failure locations, suggested next reads, and deterministic compression metrics. The compact view collapses repeated output and preserves file:line/error signals; the raw log remains the source of truth.

A connection wraps a locally authenticated CLI or service. Threadroot does not store secrets:

```bash
threadroot connections discover
threadroot connections add gh-readonly --provider github --command gh --risk low --healthcheck "gh auth status"
threadroot connections list
threadroot connections check
```

`connections discover` inspects PATH and proposes reviewed templates. GitHub is the first-class default because issues, PRs, checks, and workflow runs are the most common agent context source. The GitHub template carries read-oriented allow rules, mutation deny rules, and terms-aware notes for local auth, repository visibility, private data, and rate limits. Other templates for Docker, dbt, Snowflake, AWS, Azure, GCP, Kubernetes, and Vercel are available but secondary. High-risk and confirmation-marked actions require explicit human approval. MCP agents cannot self-confirm risky tools.

## Web

Threadroot has known-URL fetch, not native general web search.

```bash
threadroot web status
threadroot web fetch https://example.com/docs --max-tokens 4000
```

Fetched content is cached under `.threadroot/cache/web/` with URL, fetched time, content hash, token estimate, and a warning that public web content is untrusted external context.

For general search, use provider-native search or a configured search MCP server.

## MCP

Run the local MCP server:

```bash
threadroot mcp
```

Check Codex MCP config:

```bash
threadroot mcp check
```

MCP exposes lazy tools including `task_packet`, `index_status`, `refresh_context`, `trace_context`, `eval_context`, `eval_traces`, `providers_status`, trace tools, improvement tools, loop tools, repo map/search/read, skills, tools, connection list/discovery/check/create, memory, web status/fetch, status, and doctor. Tool responses include structured content, compact text summaries, trust annotations, and resource links where useful. MCP also exposes resources such as `threadroot://repo-map`, `threadroot://task/latest`, `threadroot://runs/latest`, `threadroot://trace/latest`, `threadroot://loop/current`, `threadroot://providers`, `threadroot://skills`, `threadroot://memory`, and `threadroot://index`, plus templates such as `threadroot://repo/{path}`, `threadroot://skill/{name}`, and `threadroot://memory/{type}`.

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm package:smoke
pnpm pack:check
pnpm release:check
```

Issues, feature requests, and bug reports are open. Pull requests are welcome, but acceptance is not guaranteed; the maintainer decides the final product direction.

The npm package ships only runtime output and public docs. It must not ship `.threadroot/`, provider folders, temp state, cache, or old generated artifacts.

## Security

- `.threadroot/` is local-only in `0.2.1`; do not commit it.
- `.threadroot/cache/index/`, `.threadroot/cache/runs/`, web cache, local memory, provider receipts, trace-derived lessons, and embeddings config are local state.
- Provider-native files are opt-in adapter outputs, not the default source.
- Third-party skills are scanned and locked, not blindly trusted.
- Tools are explicit and allow-listed.
- Connections wrap locally authenticated CLIs and never store secrets.
- Web-fetched content is untrusted external context.
- MCP uses the same authorization and confirmation paths as the CLI.
