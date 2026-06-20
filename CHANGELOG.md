# Changelog

All notable changes to Threadroot will be documented here.

Threadroot follows semantic versioning after the first public release. While `0.x`, minor versions may include breaking changes as the harness format settles.

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
