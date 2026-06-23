# Security Policy

Threadroot is local-first software that can expose executable tools, local CLI connections, web-fetched context, and MCP tools to coding agents. Treat harness changes with the same care as package scripts, Make targets, shell scripts, Git hooks, and editor automation.

## Supported versions

Threadroot is pre-1.0. Security fixes will target the latest published version.

## Reporting vulnerabilities

Please report security issues privately before opening a public issue. Until a dedicated contact exists, use GitHub private vulnerability reporting for the repository if available.

## Security model

- Threadroot does not store cloud secrets.
- `.threadroot/` is local-only in `0.1.8` and should not be committed to git.
- Provider files are not created visibly by default. Explicit project-file exposure should be reviewed like any other agent instruction/config change.
- Connections wrap locally authenticated CLIs such as `gh`, `aws`, `az`, or Snowflake CLI.
- Tools are explicit YAML manifests and run locally with the user's permissions.
- High-risk and confirmation-marked tools require explicit confirmation.
- External installed tools are blocked until allow-listed.
- `threadroot web fetch` treats public pages as untrusted external context and caches provenance under `.threadroot/cache/web/`.
- `threadroot doctor` reports drift, unsafe tool trust, tracked/unignored `.threadroot` state, connection health, and MCP setup hints.

Always inspect third-party skills, tools, and connections before installing them into a trusted repo.
