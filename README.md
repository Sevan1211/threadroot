# Threadroot

Adaptive AI agent capability harness for local development.

Threadroot gives coding agents the right skills, tools, connections, and memory without flooding the context window. Durable agent state lives under one canonical project folder:

```text
.threadroot/
```

No cloud account or API key is required for the OSS CLI.

## Why

AI coding setups usually become scattered across `AGENTS.md`, `CLAUDE.md`, Cursor rules, Copilot instructions, ad hoc prompts, and random tool commands.

Threadroot treats that setup like infrastructure:

- version-controlled harness state in `.threadroot/`
- progressive-disclosure skills
- explicit, testable local tools
- local CLI connections with no stored secrets
- MCP access for agents
- scanner and lockfile provenance for third-party skills

## Quick Start

In a new or existing repo:

```bash
npm exec --package=threadroot -- threadroot bootstrap --yes --mcp
npm exec --package=threadroot -- threadroot start "start this project"
```

Or after install:

```bash
threadroot bootstrap --yes --mcp
threadroot start "start this project"
```

Bootstrap creates a local harness and one-time global agent setup when requested. Provider-native project files are not created unless you explicitly run `threadroot expose <agent>` or `threadroot skills expose`.

## Agent Bootstrap Prompt

Paste this into Codex, Claude, Cursor, Copilot, or another coding agent:

```text
You are working in this repository. Set up Threadroot as the local AI agent capability harness.

Use only real Threadroot commands. Do not invent commands.

1. Check Threadroot:
   npx --yes threadroot@latest --version

2. Bootstrap the repo:
   npx --yes threadroot@latest bootstrap --yes --mcp --task "start this project"

3. Start the session:
   npx --yes threadroot@latest start "start this project"

4. If the repo map is missing or stale, refresh it:
   npx --yes threadroot@latest map --write

5. If no installed skill fits the task, search first:
   npx --yes threadroot@latest skills find "<task-specific query>"

6. Install skills only through Threadroot:
   npx --yes threadroot@latest skills add <source> --skill <name>

7. If no good skill exists, create a project-specific skill under .threadroot/skills/.

8. For repeatable commands, use tools:
   npx --yes threadroot@latest tools detect
   npx --yes threadroot@latest tools create --from-command "<command>"

9. For local services, use connections:
   npx --yes threadroot@latest connections add <name> --provider <provider> --command <command>

When complete, tell me:
Success: Threadroot is ready. Run threadroot start "<task>" for future sessions.
```

## What Init Creates

Every initialized project starts with five Threadroot-adapted seed skills:

```text
.threadroot/skills/threadroot/SKILL.md
.threadroot/skills/find-skills/SKILL.md
.threadroot/skills/create-skill/SKILL.md
.threadroot/skills/create-tool/SKILL.md
.threadroot/skills/create-connection/SKILL.md
```

These are not a bundled skill library. They teach agents how to use Threadroot, then find or create the specific capability needed for the current task.

Threadroot also creates:

```text
.threadroot/harness.yaml
.threadroot/lock.json
.threadroot/memory/project.md
.threadroot/memory/repo-map.md
.threadroot/tools/*.yaml   # when local package scripts are detected
.gitignore                 # Threadroot-managed local/cache ignores
```

All seed skill provenance is recorded in `.threadroot/lock.json`, including upstream references where the seed was adapted from.

## Core Commands

```bash
threadroot bootstrap [--yes] [--agent <list>] [--task <task>] [--mcp] [--expose <list>] [--json]
threadroot init [--no-import] [--profile <profile>] [--expose <list>]
threadroot start "<task>" [--json]
threadroot context "<task>" [--json]
threadroot map --write|--check [--json]
threadroot status [--json]
threadroot doctor [--json]
threadroot diff
threadroot compile
```

## Skills

Threadroot stores skills under `.threadroot/skills/` and routes agents to full skill bodies only when relevant.

```bash
threadroot skills find "improve nextjs performance"
threadroot skills add vercel-labs/skills --skill find-skills
threadroot skills inspect .threadroot/skills/<name>
threadroot skills scan .threadroot/skills/<name>
threadroot skills trust <name>
threadroot skills expose <name|all> --agent <agent|universal|all>
```

`skills add` supports GitHub shorthand, GitHub URLs, skills.sh URLs, and local paths. Installs are scanned without executing bundled code and recorded in `.threadroot/lock.json`.

Threadroot detects risk signals; it does not certify third-party skills as safe.

## Tools

A tool is an executable, testable agent capability.

```bash
threadroot tools detect
threadroot tools create --from-command "pnpm test" --description "Run tests" --healthcheck "pnpm --version"
threadroot tools list
threadroot tools check
threadroot run test
```

Agent-authored tools default to `confirm:true`. High-risk tools cannot run without explicit confirmation.

## Connections

A connection wraps a locally authenticated CLI or service. Threadroot does not store secrets.

```bash
threadroot connections add gh-readonly --provider github --command gh --risk low --healthcheck "gh auth status"
threadroot connections list
threadroot connections check
```

Use official tools such as `gh`, `aws`, `az`, `gcloud`, `snow`, `dbt`, `docker`, `kubectl`, or `vercel` for authentication.

Connection-backed tools should reference a connection instead of embedding broad cloud commands directly.

## Automation Policy

Threadroot keeps project-level automation policy in `.threadroot/harness.yaml`.

```bash
threadroot automation status
threadroot automation approve
threadroot automation reset
```

Default mode is `ask`. After approval, MCP agents may create low-risk capability manifests. Hard stops still require human review: blocked scans, executable scripts in third-party skills, provider permission fields, high-risk tools or connections, destructive commands, cloud mutations, and anything involving secrets.

## MCP

Run the local MCP server:

```bash
threadroot mcp
```

Write/check setup:

```bash
threadroot mcp setup --write
threadroot mcp check
```

MCP exposes lazy access to context, repo-map/search/read, skills, tools, connections, memory, status, and doctor. Clients may need a reload/new session after MCP config changes.

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm package:smoke
pnpm pack:check
```

The npm package ships `dist/`, README/license/security docs, changelog, and integration docs. Seed skills are compiled from source templates; no top-level `skills/` or `packs/` directory is shipped.

## Security

- `.threadroot/` is the source of truth.
- Provider-native files are generated shims, not canonical state.
- Third-party skills are scanned and locked, not blindly trusted.
- Tools are explicit and allow-listed.
- Connections wrap locally authenticated CLIs and never store secrets.
- MCP uses the same authorization and confirmation paths as the CLI.
