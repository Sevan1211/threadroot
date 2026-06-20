# Changelog

All notable changes to Threadroot will be documented here.

Threadroot follows semantic versioning after the first public release. While `0.x`, minor versions may include breaking changes as the harness format settles.

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
- Durable memory, rules, skills, tools, connections, and capability packs.
- MCP server exposing context, skills, tools, connections, memory, status, and doctor tools.
- Curated starter skills and v1 capability packs.
- Tool risk, confirmation, healthcheck, and connection-aware execution.
- `threadroot doctor` for harness health, drift, trust, MCP hints, and connection checks.
- npm package release checks and packed-package smoke test.
