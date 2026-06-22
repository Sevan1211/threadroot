---
name: create-tool
description: Use when an agent needs a repeatable executable project capability, a safe wrapper around an existing command, a healthchecked local workflow, or a tool that can be called through Threadroot CLI or MCP.
license: MIT
compatibility: Threadroot tools under .threadroot/tools/*.yaml.
metadata:
  adaptedBy: threadroot
  routesThrough: .threadroot
tags:
  - tools
  - commands
  - automation
---

# Create Tool

Use this skill to create safe Threadroot tools for repeatable local commands.

## Workflow

1. Inspect existing command surfaces first:

```bash
threadroot tools detect --json
threadroot tools list --json
```

2. Prefer wrapping existing package scripts, Make targets, just recipes, or official CLIs.
3. Create the narrowest useful tool:

```bash
threadroot tools create --from-command "<command>" --description "<purpose>" --risk <low|medium|high>
```

4. Add a healthcheck when possible.
5. Use `--connection <name>` when the command depends on a local CLI account.
6. Run:

```bash
threadroot tools check
threadroot doctor
```

## Safety

- Agent-created tools should be narrow and inspectable.
- High-risk or destructive tools must require confirmation.
- Do not execute risky tools yourself. Ask the user to run `threadroot run <tool> --yes` after review.
- Do not embed secrets in tool commands.
- For cloud/account CLIs, create a connection and reference it from the tool.
