# Changelog

All notable changes to Threadroot will be documented here.

Threadroot follows semantic versioning after the first public release. While `0.x`, minor versions may include breaking changes as the harness format settles.

## Unreleased

### Added

- `threadroot prep "<task>"` to create compact Codex-ready preflight briefs without invoking Codex.
- `threadroot codex run "<task>"` to run Preflight -> `codex exec --json` -> verification -> score reporting.
- `threadroot score latest`, `threadroot tune latest`, and `threadroot eval codex` for tokens-to-green scoring, context-waste diagnosis, evidence-backed tuning proposals, and optimizer-vs-raw packet comparison.
- Codex optimizer state under `.codex/threadroot/` for preflight briefs, lightweight index snapshots, run artifacts, scores, and tuning reports.
- MCP `context_budget`, `score_latest`, `tune_latest`, `threadroot://brief/latest`, `threadroot://score/latest`, and `threadroot://tuning/latest`.
- JSONL usage/evidence parsing for Codex input, cached input, output, reasoning tokens, command executions, file changes, MCP calls, web searches, plan updates, read files, edited files, and generated/cache leakage.
- Memory profiles for optimizer preflight and Codex runs: `--memory tiny|conservative|standard`, with `conservative` as the default local-RAM-friendly profile.

### Changed

- The new optimizer preflight scanner no longer requires `.threadroot/` and avoids writing old harness state.
- `threadroot codex run` now streams `codex exec --json` output to disk, parses metrics incrementally, stores bounded compact samples, records raw-output byte counts, and supports `--ephemeral`.
- Legacy repo map/index freshness ignores `.codex/` optimizer state so local run artifacts do not make context look stale.

## 0.3.0 - Codex/OpenAI-only rewrite

### Added

- `threadroot codex install|status|doctor` as the Codex-first setup and health surface.
- MCP `codex_status` and `threadroot://codex` for Codex CLI, runner, and MCP setup visibility.
- Codex-only loop execution through `codex exec --json --sandbox workspace-write`, with `--codex-bin` for advanced local executable overrides.
- Codex-focused tests for install receipts, global skill refresh, status output, and JSONL trace extraction.

### Changed

- Threadroot is now positioned as a Codex/OpenAI companion instead of a generic coding-agent harness.
- `threadroot loop run` now always means Codex and stores `codex` runner output in loop reports.
- Init/import/compile flows now target Codex-native `AGENTS.md` only.
- Package smoke now executes the packed CLI binary directly on POSIX and checks the executable bit.

### Removed

- Removed non-Codex coding-agent provider support, including `threadroot connect`, `threadroot providers`, MCP `providers_status`, provider receipts, non-Codex compile adapters, and custom provider loop options.
- Removed package keywords and docs language for Claude, Cursor, Copilot, Gemini, Windsurf, OpenCode, and Antigravity support.

## 0.2.1 - Closed-loop self-improvement and local routing vectors

### Added

- `threadroot improve latest` now writes candidates and applies only guarded repo-local lessons by default: routing hints, trace-derived context evals, and generated validation-skill lessons.
- MCP `improve_latest` now follows the same auto-safe default for agents, with opt-out and dry-run arguments for inspection.
- Built-in local hashing embeddings for indexed chunks. They require no API keys, make no network calls, store vectors under `.threadroot/cache/index/`, and add a local similarity rerank signal to context routing.
- Trace-derived routing hints now carry repo-local usage policy metadata for provenance, sharing, stale-evidence handling, and secret hygiene.
- GitHub connection discovery now carries first-class allow/deny and terms-aware guidance for local auth, repository visibility, private data, rate limits, and separating risky mutations from read-only inspection.

### Changed

- Loop automation now uses the same `improve latest` safe-apply path as CLI and MCP instead of a separate follow-up apply call.
- `threadroot improve apply` keeps compatibility but auto-safe mode is now on by default; use `--no-auto-safe` for reporting-only behavior.
- Embedding status and refresh commands now describe and refresh the built-in local vector signal instead of presenting embeddings as a placeholder-only surface.
- Release docs now target `0.2.1` and describe the commit, push, and npm publish flow.

### Measured

- Local release sweep continues to gate on `pnpm release:check`, package smoke, and context evals before publishing.

## 0.2.0 - Agent-first MCP and public launch polish

### Added

- `threadroot connect <agent> --refresh-skill` to explicitly install or refresh the global Threadroot agent skill with the current `task_packet`/`repo_read` workflow.
- Trace-driven loop runtime commands: `threadroot trace`, `threadroot eval traces`, `threadroot improve latest`, and `threadroot loop start|next|report|run|finish`.
- MCP loop and trace tools including `trace_start`, `trace_event`, `trace_finish`, `trace_latest`, `eval_traces`, `improve_latest`, `loop_start`, `loop_next`, `loop_report`, `loop_run`, and `loop_finish`.
- `threadroot providers` and MCP `providers_status` for provider CLI availability, default runner status, MCP setup, event capture, compression guidance, and cross-machine setup notes.
- Provider-adapter loop execution for Codex and Claude Code JSONL streams, plus `--agent-command` and `--agent-adapter` for custom provider binaries.
- Required verification gates for automated loops via `threadroot loop run --require <command>`, with captured raw logs, compact output artifacts, trace events, compression metrics, trace-eval summaries, and final session reports.
- Portable package checks through `scripts/pack-check.mjs`.
- `threadroot refresh [--force]` and MCP `refresh_context` to refresh stale repo-map/index state through the same path used by task packets.
- `threadroot eval context` regression gates: `--min-recall`, `--min-precision`, `--min-ndcg`, and `--max-average-tokens`.
- MCP 2025-06-18 initialization, prompt support, resource templates, tool annotations, output schemas, compact tool summaries, and task-packet resource links.
- MCP resource templates for `threadroot://repo/{path}`, `threadroot://skill/{name}`, and `threadroot://memory/{type}`.
- MCP version-skew detection so `threadroot mcp check` warns when the configured server is an older global install than the local CLI.

### Changed

- Task packets now enforce a default compact budget, trimming snippets, memory, repo-map excerpts, long reasons, debug-ranking details, and lower-ranked files before flooding the model.
- Task packets now refresh stale repo-map and index state before routing, then report a compact freshness summary.
- Context evals now combine ranked files and tests by score instead of appending tests after all source files.
- CI now runs on Ubuntu, Windows, and macOS across Node 20 and 22.
- MCP `task_packet` resource links are opt-in so shape-sensitive clients receive compact text plus `structuredContent` by default.
- Codex MCP checks now verify a `task_packet` smoke call and can read current Codex MCP config through `codex mcp get threadroot --json`.
- Run briefs and loop reports now preserve raw output while emitting deterministic compact summaries with estimated token savings.
- Provider status now includes structured MCP access guidance, including the Codex `threadroot mcp check --json` smoke path and core tool checks for MCP-first clients.
- Package smoke and tests now avoid POSIX-only assumptions and use portable Node fixtures.
- Routing hints were tightened for MCP resources/prompts, init, status, package smoke, and GitHub skill-source fetch tasks.
- Routing hints now prioritize owning tests alongside command/module surfaces for MCP, repo-map, doctor, provider connect/import, tool policy, automation, adapter, docs, and eval tasks.
- `better-sqlite3` is now an optional peer accelerator instead of a default optional dependency, avoiding npm's deprecated `prebuild-install` warning during normal install.
- README, integration, security, and release-contract docs now describe the 0.2.0 agent-first flow.

### Removed

- Removed the stale `docs/` foundation-plan folder from the public repo surface.

### Measured

- Local-source context evals improved to roughly Recall@5 0.993, Precision@5 0.524, MRR 0.989, nDCG@5 0.953, with average packet size around 3,264 estimated tokens.

## 0.1.9 - Repo intelligence runtime

### Added

- `threadroot task "<task>"` as the canonical front door for indexed task packets with ranked files, symbols, snippets, tests, commands, skills, memory, warnings, index status, token estimates, and optional debug-ranking evidence.
- `threadroot index [--status] [--force]` for a local repo intelligence index. It uses SQLite/FTS5 through optional `better-sqlite3` when available, falls back to Node's native SQLite on supported runtimes, and then falls back to a deterministic JSON index.
- Language-aware symbol/import/chunk extraction for TypeScript, JavaScript, Python, Go, Rust, JSON, YAML, Markdown, and broad text fallbacks. Tree-sitter grammar adapters remain a future native path and are reported honestly as unavailable today.
- `threadroot eval context` with built-in gold-context evals and metrics for Recall@5, Precision@5, MRR, nDCG@5, irrelevant top-5 files, command hit rate, skill hit rate, and average token count.
- `threadroot run <tool> --brief` to store full command output under `.threadroot/cache/runs/` while returning compact run summaries, parsed failure locations, and suggested next reads.
- `threadroot embeddings configure|status|refresh` as an explicit, disabled-by-default embedding adapter surface. No provider calls or uploads happen automatically.
- MCP `task_packet`, `index_status`, `trace_context`, and `eval_context` tools.
- MCP resources for `threadroot://repo-map`, `threadroot://task/latest`, `threadroot://runs/latest`, `threadroot://skills`, `threadroot://memory`, `threadroot://index`, `threadroot://index/snapshot`, and `threadroot://embeddings`.

### Changed

- `task` now benefits from the local index when one exists, while retaining the previous scanner/search fallback.
- `doctor` reports missing index as a hint and stale/degraded index as a context-quality warning.
- README, integration, and security docs now position Threadroot as a local repo intelligence runtime rather than only a harness folder.

### Removed

- Removed legacy public command surfaces: `bootstrap`, `setup`, `mcp setup`, `compile`, `diff`, `expose`, `start`, `working-set`, `context`, and `skills expose`.
- Removed provider skill-shim exposure from `skills add`; installed skills stay canonical under `.threadroot/skills/`.

## 0.1.8 - Local context router foundation

### Added

- `threadroot connect <agent>` as the new provider bridge for Codex, Claude, Cursor, VS Code/Copilot, Gemini, Windsurf, OpenCode, Antigravity, or all supported providers. By default it writes only a non-secret receipt under `.threadroot/providers/` and prints provider setup commands/instructions.
- `threadroot task "<task>"` for ranked files, tests, commands, recommended skills, memory, warnings, next reads, omitted sections, and token estimates.
- `threadroot skills match "<task>"` for metadata-only local skill recommendations without loading full skill bodies.
- `threadroot import` for non-destructive detection/classification of existing provider files with reports under `.threadroot/imports/`.
- `threadroot web status`, `threadroot web fetch <url>`, MCP `web_status`, and MCP `web_fetch` for known public URL fetch with local cache and provenance.
- Provider connection receipts under `.threadroot/providers/<agent>/connection.json`.
- Doctor checks for tracked `.threadroot/` files and unignored local harness state.

### Changed

- The public first-run path is now `threadroot init`, `threadroot connect <agent>`, then `threadroot task "<task>"`.
- `init` keeps `.threadroot/` local-only by default and prefers `.git/info/exclude` in git repos instead of editing root `.gitignore`.
- `.threadroot/` being ignored is now healthy for `0.1.8`; tracked `.threadroot/` files are an error.
- Init writes provider import reports under `.threadroot/imports/` instead of creating a top-level `AGENTS.md` from imported prose by default.
- Repo-map freshness is content-aware for normal text files, not just path-shape-aware.
- Low-risk connection healthcheck failures are warnings instead of hard errors, so optional local identity integrations do not break first-run trust.
- Seed Threadroot skills, README, integration docs, and security docs now teach the local-only task-packet flow.

### Compatibility

- Legacy compatibility commands were removed before public launch so the CLI surface stays small.
- Visible provider project files require explicit opt-in through `connect --project-files`.

## 0.1.7 - Stable self-use harness

### Added

- A compact repo map command, `threadroot map --write|--check`, so agents can navigate codebases through a generated `.threadroot/memory/repo-map.md` before broad file reads.
- MCP `repo_map`, `repo_search`, and `repo_read` tools for lazy, targeted codebase awareness.
- A bundled `threadroot` seed skill that explains the harness, command map, capability workflow, MCP fallback behavior, and safety boundaries to agents.
- Init now updates `.gitignore` with Threadroot local-state ignores and generates the initial repo map automatically.
- Doctor checks for missing/stale repo maps, stale global Threadroot setup, and accidental whole-directory `.threadroot` ignores.

### Changed

- Seed skills are now owned inside `src/core/init/seed-skills.ts`; the npm package no longer ships a top-level `skills/` directory.
- Session context now reports repo-map status and keeps memory excerpts compact for lower-token starts.
- The global Threadroot skill and MCP bootstrap prompt now teach agents to refresh stale repo maps.

### Removed

- Empty/stale top-level pack assets and source directories from the package surface.

## 0.1.6 - Adaptive capability harness

### Added

- Default init now seeds exactly four adaptive Threadroot skills: `find-skills`, `create-skill`, `create-tool`, and `create-connection`.
- `threadroot skills find "<query>"` to discover task-specific Agent Skills while routing installs back through Threadroot.
- `threadroot skills add <source>` support for `--skill <name>`, GitHub-backed skills.sh page URLs, and `skills:owner/repo/skill` shorthand.
- Optional Snyk Agent Scan integration for installed external skills. Threadroot runs its local static scanner every time, then attempts Snyk when `SNYK_TOKEN` is set and `snyk-agent-scan` or `uvx` is available.
- `--no-snyk` and `--require-snyk` flags for skipping advisory external scans or enforcing them in stricter pipelines.
- Lockfile, context, MCP, and doctor surfaces now preserve external scan/provenance metadata for installed skills.
- Project-local automation policy with `threadroot automation status|approve|reset`.
- MCP `skills_find` and `connections_create` tools.

### Changed

- Threadroot is now an adaptive capability harness, not a bundled skill library.
- Init records seed skill provenance and integrity in `.threadroot/lock.json`.
- Multi-skill install guidance now prefers `--skill <name>` and falls back to `--path` only for ambiguous duplicate names.
- MCP-created tools/connections are gated by project automation policy and limited to low-risk capability manifests.

### Removed

- Public bundled-capability commands and bootstrap options.

## 0.1.5 - Website integration contracts

### Added

- Machine-readable `--json` output for `bootstrap`, `start`, `status`, `context`, `doctor`, `mcp check`, and `mcp setup`.
- Connection authoring flags for `--allow` and `--deny` command fragments.
- `INTEGRATION.md` as the website/cloud contract for prompt generation, JSON CLI usage, and future auth/sync shape.

### Changed

- MCP tool calls now return structured content alongside text content.
- MCP `tools_run` no longer accepts model-supplied confirmation for risky tools; agents must ask the user to approve via the CLI.
- Connection `allow` and `deny` rules are enforced when connection-backed shell tools run.
- Release guidance now points toward npm provenance and signature verification.

## 0.1.4 - Stable npx MCP config

### Fixed

- `bootstrap --mcp` and `setup --global --mcp` now detect npm's `_npx` cache path and write a stable pinned `npx --yes threadroot@<version> mcp` Codex MCP command instead of pointing Codex at a transient npm cache file.

## 0.1.3 - Verified Codex MCP setup

### Added

- `threadroot mcp check` to verify Codex MCP config, launch the stdio server, complete a JSON-RPC initialize handshake, and assert required Threadroot tools are available.
- MCP server initialization instructions that tell agents how to use `context`, `doctor`, skills, tools, and durable memory.
- Doctor checks for configured-but-broken Codex MCP.

### Changed

- `bootstrap --mcp` and `setup --global --mcp` now write a local-aware MCP command. Package-bin symlinks and local dev runs resolve to `node /path/to/dist/index.js mcp`, with `threadroot mcp` as the fallback.
- Package smoke now verifies MCP from the packed tarball.

## 0.1.2 - One-command bootstrap and session start

### Added

- `threadroot bootstrap` as the simple first-run command for global agent setup, local-only harness initialization, health checks, and initial context.
- `threadroot start "<task>"` as the daily agent-session command for doctor, status, task context, and Threadroot command discovery.
- Package smoke coverage for the new bootstrap/start flow.

### Changed

- The generated agent bootstrap prompt now uses `threadroot bootstrap --yes` and `threadroot start "<task>"` instead of spelling out lower-level setup commands.
- README quickstart now leads with the simplified bootstrap/start flow.

## 0.1.1 - Clean setup and global agent bootstrap

### Changed

- `threadroot init` now creates a local-only `.threadroot/` harness by default.
- Missing MCP config is now a doctor hint instead of a warning for local-only projects.
- Bootstrap prompts now ask before writing project-local MCP config or provider exposure files.

### Added

- `threadroot expose` for thin project skill shims across Codex, Claude Code, Cursor, GitHub Copilot, Gemini CLI, Windsurf, Antigravity, and OpenCode.
- `threadroot setup --global` for one-time machine-level Threadroot skills across supported agents.
- Codex global setup support for `~/.agents/skills/threadroot/SKILL.md`, `~/.codex/AGENTS.md`, and optional `~/.codex/config.toml` MCP config.
- Dry-run, check, undo, force, and MCP options for global setup.

## 0.1.0 - Initial OSS alpha

### Added

- Local-first Threadroot CLI with `threadroot` and `tr` binaries.
- Repo harness initialization through `.threadroot/harness.yaml`.
- Adapter compilation for AGENTS.md, Claude, Copilot, and Cursor.
- Durable memory, rules, skills, tools, and connections.
- MCP server exposing context, skills, tools, connections, memory, status, and doctor tools.
- Curated starter skills.
- Tool risk, confirmation, healthcheck, and connection-aware execution.
- `threadroot doctor` for harness health, drift, trust, MCP hints, and connection checks.
- npm package release checks and packed-package smoke test.
