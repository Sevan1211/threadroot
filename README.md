# Threadroot

Stop re-teaching every coding agent your repo.

Threadroot is a local context router for coding agents. It keeps task-specific working sets, skills, tools, connections, memory, repo maps, provider receipts, import reports, web fetch cache, policy, and provenance under one private project folder:

```text
.threadroot/
```

For `0.1.8`, `.threadroot/` is local-only and should not be committed to git. A future Threadroot cloud platform may become the sync/version layer for that folder. The OSS CLI works without a cloud account or API key.

## Why

AI coding setups usually scatter across `AGENTS.md`, `CLAUDE.md`, Cursor rules, Copilot instructions, MCP config files, ad hoc prompts, and one-off shell commands.

Threadroot keeps the project surface quiet and gives agents a smaller, fresher first packet:

- task-specific `working-set` results with ranked files, tests, commands, skills, warnings, and token estimates
- local-only `.threadroot/` harness state
- provider connection receipts without visible provider project files by default
- progressive-disclosure skills
- explicit local tools and connections with confirmation/risk metadata
- MCP access for compatible agents
- non-destructive import reports for existing provider files
- known-URL web fetch with local cache and provenance

## Quick Start

In a new or existing repo:

```bash
npm exec --package=threadroot -- threadroot init
npm exec --package=threadroot -- threadroot connect codex
npm exec --package=threadroot -- threadroot start "start this project"
```

Or after install:

```bash
threadroot init
threadroot connect codex
threadroot start "start this project"
```

Use `threadroot connect <agent>` for `codex`, `claude`, `cursor`, `vscode`, `copilot`, `gemini`, `windsurf`, `opencode`, `antigravity`, or `all`.

Default connect writes only a non-secret receipt under `.threadroot/providers/<agent>/` and prints the provider-specific setup command or instructions. It does not create visible provider files such as `AGENTS.md`, `CLAUDE.md`, `.vscode/`, `.cursor/`, `.mcp.json`, or `.github/copilot-instructions.md`.

Visible provider project files require explicit opt-in:

```bash
threadroot connect claude --project-files
threadroot expose codex
threadroot skills expose <name-or-all> --agent claude
```

## Core Loop

```bash
threadroot start "fix auth bug"
threadroot working-set "fix auth bug"
threadroot map --write
threadroot doctor
```

`start` gives the session overview. `working-set` gives the compact first read list so the agent does not flood the prompt or wander the repo.

Example:

```bash
threadroot working-set "fix flaky billing retry test" --json
```

The result includes ranked files, tests, likely commands, recommended skills, relevant memory, freshness/trust/permission warnings, next reads, omitted sections, and an approximate token estimate.

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
threadroot start "<task>" [--json]
threadroot working-set "<task>" [--budget <tokens>] [--max-files <count>] [--json]
threadroot context "<task>" [--json]
threadroot import [--dry-run] [--consolidate] [--json]
threadroot map --write|--check [--json]
threadroot status [--json]
threadroot doctor [--json]
```

Legacy compatibility commands such as `bootstrap`, `setup`, `mcp setup`, `compile`, and `expose` still exist, but the public 0.1.8 path is `init -> connect -> start -> working-set`.

## Skills

Threadroot stores skills under `.threadroot/skills/` and routes agents to full skill bodies only when relevant.

```bash
threadroot skills match "prepare a release"
threadroot skills find "improve nextjs performance"
threadroot skills add vercel-labs/skills --skill find-skills
threadroot skills inspect .threadroot/skills/<name>
threadroot skills scan .threadroot/skills/<name>
threadroot skills trust <name>
threadroot skills expose <name|all> --agent <agent|universal|all>
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
threadroot run test
```

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

MCP exposes lazy access to `working_set`, context, repo map/search/read, skills, tools, connections, memory, web status/fetch, status, and doctor. Clients may need a reload/new session after MCP config changes.

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

The npm package ships `dist/`, README/license/security docs, changelog, and integration docs. It must not ship `.threadroot/`, provider folders, temp state, cache, or old generated artifacts.

## Security

- `.threadroot/` is local-only in 0.1.8; do not commit it.
- Provider-native files are opt-in adapter outputs, not the default source.
- Third-party skills are scanned and locked, not blindly trusted.
- Tools are explicit and allow-listed.
- Connections wrap locally authenticated CLIs and never store secrets.
- Web-fetched content is untrusted external context.
- MCP uses the same authorization and confirmation paths as the CLI.
