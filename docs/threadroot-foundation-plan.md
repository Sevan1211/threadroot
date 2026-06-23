# Threadroot 0.1.8 Foundation Status

This document is the current release contract for Threadroot as a local repo intelligence runtime. Older bootstrap/setup/expose compatibility paths were removed before public launch; the product surface is now intentionally small.

## Product Wedge

Threadroot should make `threadroot task "<task>"` produce a better first working set than a coding agent would get by grepping and reading files on its own.

The user benefit is simple:

- faster onboarding in an existing repo
- fewer irrelevant files in the prompt
- lower token use through compact task packets
- better first edits from ranked files, snippets, tests, commands, skills, and memory
- local inspectability without committing `.threadroot/`

## Public Flow

```bash
threadroot init
threadroot connect <agent>
threadroot task "<task>"
```

Everything else supports that loop.

## Current Command Surface

Core:

```bash
threadroot init
threadroot connect [agent|all]
threadroot task "<task>"
threadroot index
threadroot eval context
threadroot map --write|--check
threadroot doctor
threadroot status
```

Capabilities:

```bash
threadroot skills match|find|ingest|list|inspect|scan|trust|validate
threadroot tools detect|create|list|check
threadroot run <tool> --brief
threadroot connections add|list|check
threadroot memory read|append|gc
threadroot web status|fetch
threadroot embeddings status|configure|refresh
```

MCP:

```bash
threadroot mcp
threadroot mcp check
```

Legacy experimental entrypoints were removed before public launch. The public surface is intentionally centered on `init`, `task`, `index`, `connect`, `map`, `skills`, `tools`, `memory`, `web`, `doctor`, and MCP.

## Repo Intelligence Architecture

Threadroot builds a local index under `.threadroot/cache/index/`.

Current backend order:

1. Optional `better-sqlite3` SQLite/FTS5 backend.
2. Node `node:sqlite` backend on supported runtimes.
3. Deterministic JSON degraded fallback.

The degraded fallback is a feature, not a crash path. `doctor` reports lower precision, and `task` still works.

Current extractors:

- file metadata and hashes
- language-aware symbol/import/chunk extraction for TypeScript, JavaScript, Python, Go, Rust, JSON, YAML, Markdown
- FTS/BM25-style candidate generation
- graph-ish expansion from source, tests, docs, config, prior runs, skills, and memory
- weighted ranking with penalties for stale, generated, cache, unrelated dotfiles, and low-signal files
- debug-ranking output for inspectability

Tree-sitter remains the right future parser layer, but it should be added only when the npm install story is fast and reliable across Linux, macOS, and Windows. The current release favors stable installation and good-enough extraction over fragile native parser installs.

## Task Packet Contract

`threadroot task "<task>" --json` is the canonical context API.

It returns:

- ranked files and tests
- symbol outlines
- selected snippets
- likely commands
- recommended skills without eager-loading full skill bodies
- relevant memory
- warnings and risks
- omitted candidates
- token estimate
- index status
- optional debug-ranking reasons

The packet should be compact enough for an agent to act, and explainable enough for a user to debug bad routing.

## Skills Contract

Skills live under `.threadroot/skills/<name>/SKILL.md`.

Current rules:

- skills are installed through Threadroot so they are scanned and locked
- full skill bodies are lazy-loaded only when relevant
- external skills are never certified as safe; Threadroot only reports risk signals
- provider-native skill shims are not part of the MVP

Seed skills:

- `threadroot`
- `find-skills`
- `create-skill`
- `create-tool`
- `create-connection`

## Local-First Boundary

`.threadroot/` is local-only in `0.1.8` and should not be committed.

Never commit:

- `.threadroot/cache/`
- `.threadroot/providers/`
- `.threadroot/imports/`
- `.threadroot/memory/`
- `.threadroot/lock.json`
- local tools/connections containing machine-specific paths or policy
- embeddings config or vectors
- run logs
- web cache

Generated/local:

- repo map
- index snapshots
- task packets
- run summaries
- web fetch cache

Committed later only with a deliberate cloud/team model:

- reviewed skills
- approved tool recipes
- team memory projections
- policy templates

## Release Priorities

1. `task` accuracy and speed.
2. `index` stability and graceful fallback.
3. Clean CLI surface.
4. Strong security/trust boundaries.
5. MCP parity for `task_packet`, index status, evals, resources, and follow-up reads.
6. Package hygiene: ship only `dist` and public docs.
7. Docs that teach the current flow only.

## Future Platform

Cloud belongs later, after local value is obvious.

Potential cloud scope:

- team-approved skills/tools/policies
- sync/versioning for selected harness objects
- hosted eval dashboards
- org-level trust review for external skills
- marketplace/distribution

Cloud must not become required for local indexing, task packets, or MCP.
