---
name: build-tool
description: Use when creating, reviewing, or improving Threadroot tools, especially executable commands, local CLI wrappers, healthchecks, risk levels, confirmation behavior, inputs, and connection-backed capabilities.
scope: project
tags:
  - tools
  - security
  - agent-harness
---

# Build Tool

Create tools as small, explicit, testable wrappers around commands the project already trusts.

## Workflow

1. Identify the exact command the user or repo already uses.
2. Prefer a read-only or validation command first.
3. Classify risk:
   - `low`: reads state, validates, tests, formats, or prints information.
   - `medium`: writes local files or changes non-production state.
   - `high`: deploys, deletes, migrates, publishes, spends money, changes cloud resources, or touches secrets.
4. Require `confirm: true` for high-risk tools.
5. If the command depends on a cloud/account CLI, reference a `.threadroot/connections/*.yaml` connection.
6. Declare inputs instead of accepting freeform shell fragments.
7. Add a finite `healthcheck` when possible. Do not use long-running dev servers as healthchecks.
8. Validate with `threadroot tools check` and `threadroot doctor`.

## Safety Rules

- Never put secrets, tokens, passwords, or private keys in tool manifests.
- Never hide destructive behavior behind a low-risk description.
- Keep shell commands narrow; prefer existing package scripts, Make targets, just recipes, or official CLIs.
- Use connection manifests for AWS, GitHub, Azure, Snowflake, and similar authenticated CLIs.
- If unsure, mark the tool high risk and require confirmation.
