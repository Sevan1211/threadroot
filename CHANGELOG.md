# Changelog

All notable changes to Threadroot will be documented here.

Threadroot follows semantic versioning after the first public release. While `0.x`, minor versions may include breaking changes as the harness format settles.

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
