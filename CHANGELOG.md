# Changelog

All notable changes to Threadroot will be documented here.

Threadroot follows semantic versioning after the first public release. While `0.x`, minor versions may include breaking changes as the harness format settles.

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
