---
name: create-connection
description: Use when an agent needs controlled access to a locally authenticated CLI such as GitHub, AWS, Azure, GCP, Snowflake, dbt, Docker, Kubernetes, Vercel, or another service.
license: MIT
compatibility: Threadroot connections under .threadroot/connections/*.yaml.
metadata:
  adaptedBy: threadroot
  routesThrough: .threadroot
tags:
  - connections
  - cli
  - cloud
  - mcp
---

# Create Connection

Use this skill to create a Threadroot connection for a local CLI. Connections describe access; they do not store secrets.

## Workflow

1. Confirm the user already authenticates through the official local CLI.
2. Identify the provider, command, profile/account label, risk, healthcheck, allow rules, and deny rules.
3. Create the connection:

```bash
threadroot connections add <name> --provider <provider> --command <command> --risk <low|medium|high> --healthcheck "<safe check>"
```

4. Add `--allow` and `--deny` fragments for connection-backed tools when practical.
5. Run:

```bash
threadroot connections check
threadroot doctor
```

6. Create tools that reference the connection instead of embedding broad cloud commands directly.

## Safety

- Never store API keys, passwords, tokens, private keys, or cloud credentials in `.threadroot`.
- High-risk cloud or production connections should require confirmation.
- Prefer read-only healthchecks such as identity/account/version commands.
- Destructive cloud mutations require explicit user approval even when project automation is enabled.
