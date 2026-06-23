# Threadroot

Stop re-teaching every coding agent your repo.

Threadroot is a local repo intelligence runtime for coding agents. It keeps task packets, an indexed repo graph, skills, tools, connections, memory, repo maps, provider receipts, import reports, web fetch cache, policy, and provenance under one private project folder:

```text
.threadroot/
```

For `0.1.9`, `.threadroot/` is local-only and should not be committed to git. The OSS CLI works without a cloud account or API key.

## Why

AI coding setups usually sprawl across provider instruction files, MCP configs, prompts, notes, shell snippets, and stale docs. Threadroot gives agents a smaller, fresher first packet:

- `threadroot task` packets with ranked files, symbol outlines, snippets, tests, commands, skills, warnings, and token estimates
- a local repo intelligence index using SQLite/FTS5 through optional `better-sqlite3` when available, with a deterministic fallback
- built-in context evals for recall, precision, MRR, nDCG, token count, and irrelevant-file rate
- progressive-disclosure skills under `.threadroot/skills/`
- explicit local tools and connections with risk/confirmation metadata
- MCP tools/resources for compatible agents
- non-destructive import reports for existing provider files
- known-URL web fetch with local cache and provenance

## Quick Start

In a new or existing repo:

```bash
npm exec --package=threadroot -- threadroot init
npm exec --package=threadroot -- threadroot connect codex
npm exec --package=threadroot -- threadroot task "start this project"
```

Or after install:

```bash
threadroot init
threadroot connect codex
threadroot task "start this project"
```

Use `threadroot connect <agent>` for `codex`, `claude`, `cursor`, `vscode`, `copilot`, `gemini`, `windsurf`, `opencode`, `antigravity`, or `all`.

Default connect writes only a non-secret receipt under `.threadroot/providers/<agent>/` and prints the provider-specific setup command or instructions. It does not create visible provider files such as `AGENTS.md`, `CLAUDE.md`, `.vscode/`, `.cursor/`, `.mcp.json`, or `.github/copilot-instructions.md`.

Visible provider project files are opt-in:

```bash
threadroot connect claude --project-files
```

## Core Loop

```bash
threadroot task "fix auth bug"
threadroot run test --brief
threadroot eval context
threadroot doctor
```

`task` is the canonical first command. It refreshes or reads the local repo intelligence index, then returns a compact first-read packet so the agent does not flood the prompt or wander the repo.

```bash
threadroot task "fix flaky billing retry test" --json
```

The result includes ranked files, symbol outlines, snippets, tests, likely commands, recommended skills, relevant memory, freshness/trust/permission warnings, next reads, omitted sections, debug-ranking details when requested, and an approximate token estimate.

`threadroot eval context` runs built-in gold-context cases that apply to the current repo and skips non-applicable built-ins instead of reporting misleading scores.

## Repo Intelligence

```bash
threadroot index
threadroot index --status --json
threadroot task "fix auth bug" --debug-ranking
threadroot eval context
```

The index lives under `.threadroot/cache/index/`. Threadroot tries optional `better-sqlite3` first for a fast local SQLite/FTS5 backend, then falls back to Node's `node:sqlite` on supported runtimes, then to a deterministic JSON index. When native SQLite is unavailable, `doctor` reports degraded precision instead of failing the harness.

The shipped extractor is language-aware for TypeScript, JavaScript, Python, Go, Rust, JSON, YAML, Markdown, and broad text fallbacks. Tree-sitter grammar adapters remain a future native path.

Optional embeddings are explicit and disabled by default:

```bash
threadroot embeddings status
threadroot embeddings configure --provider local --model my-embedding-model
threadroot embeddings refresh
```

Threadroot does not call embedding providers or upload code unless an explicit adapter is configured and invoked.

## What Init Creates

Every initialized project starts with five Threadroot-adapted seed skills:

```text
.threadroot/skills/threadroot/SKILL.md
.threadroot/skills/find-skills/SKILL.md
.threadroot/skills/create-skill/SKILL.md
.threadroot/skills/create-tool/SKILL.md
.threadroot/skills/create-connection/SKILL.md
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
threadroot connect [agent|all] [--check] [--status] [--undo] [--project-files] [--json]
threadroot task "<task>" [--budget <tokens>] [--max-files <count>] [--debug-ranking] [--json]
threadroot index [--status] [--force] [--json]
threadroot eval context [--json]
threadroot embeddings status|configure|refresh [--json]
threadroot import [--dry-run] [--consolidate] [--json]
threadroot map --write|--check [--json]
threadroot status [--json]
threadroot doctor [--json]
threadroot mcp
threadroot mcp check [--json]
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

`--brief` stores full stdout/stderr under `.threadroot/cache/runs/` and prints a compact result with parsed failure locations and suggested next reads.

A connection wraps a locally authenticated CLI or service. Threadroot does not store secrets:

```bash
threadroot connections add gh-readonly --provider github --command gh --risk low --healthcheck "gh auth status"
threadroot connections list
threadroot connections check
```

High-risk and confirmation-marked actions require explicit human approval. MCP agents cannot self-confirm risky tools.

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

MCP exposes lazy tools including `task_packet`, `index_status`, `trace_context`, `eval_context`, repo map/search/read, skills, tools, connections, memory, web status/fetch, status, and doctor. It also exposes resources such as `threadroot://repo-map`, `threadroot://task/latest`, `threadroot://runs/latest`, `threadroot://skills`, `threadroot://memory`, and `threadroot://index`.

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

- `.threadroot/` is local-only in `0.1.9`; do not commit it.
- `.threadroot/cache/index/`, `.threadroot/cache/runs/`, web cache, local memory, provider receipts, and embeddings config are local state.
- Provider-native files are opt-in adapter outputs, not the default source.
- Third-party skills are scanned and locked, not blindly trusted.
- Tools are explicit and allow-listed.
- Connections wrap locally authenticated CLIs and never store secrets.
- Web-fetched content is untrusted external context.
- MCP uses the same authorization and confirmation paths as the CLI.
