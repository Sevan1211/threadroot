# Security Policy

Threadroot is local-first software that can expose indexed repo context, executable tools, local CLI connections, web-fetched context, and MCP tools/resources to coding agents. Treat harness changes with the same care as package scripts, Make targets, shell scripts, Git hooks, and editor automation.

## Supported versions

Threadroot is pre-1.0. Security fixes will target the latest published version.

## Reporting vulnerabilities

Please report security issues privately before opening a public issue. Until a dedicated contact exists, use GitHub private vulnerability reporting for the repository if available.

## Security model

- Threadroot does not store cloud secrets.
- `.threadroot/` is local-only in `0.2.0` and should not be committed to git.
- Repo indexes, run logs, web cache, provider receipts, embeddings config, local memory, and import reports under `.threadroot/` are local state.
- Provider files are not created visibly by default. Explicit project-file exposure should be reviewed like any other agent instruction/config change.
- Connections wrap locally authenticated CLIs such as `gh`, `aws`, `az`, or Snowflake CLI.
- Tools are explicit YAML manifests and run locally with the user's permissions.
- High-risk and confirmation-marked tools require explicit confirmation.
- External installed tools are blocked until allow-listed.
- `threadroot run <tool> --brief` stores full stdout/stderr locally and returns compact summaries to agents.
- `threadroot task` may surface snippets, symbols, memory, and command suggestions; inspect debug-ranking output when context selection looks wrong.
- Optional embeddings are disabled by default and should not be configured with cloud providers unless the user accepts code/content upload and cost implications.
- `threadroot web fetch` treats public pages as untrusted external context and caches provenance under `.threadroot/cache/web/`.
- `threadroot doctor` reports drift, unsafe tool trust, tracked/unignored `.threadroot` state, index degraded/stale state, connection health, and MCP connection hints.

Always inspect third-party skills, tools, and connections before installing them into a trusted repo.
