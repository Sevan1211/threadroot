---
name: threadroot
description: Use when an agent needs to understand what Threadroot is, how to use the current .threadroot harness, which commands are available, or how to get task-specific context without flooding the chat.
license: MIT
compatibility: Threadroot CLI, MCP, and .threadroot-managed agent harnesses.
metadata:
  adaptedBy: threadroot
  routesThrough: .threadroot
tags:
  - threadroot
  - context
  - commands
  - harness
---

# Threadroot

Threadroot is the local, version-controlled harness for this project. It keeps agent-facing skills, tools, connections, rules, memory, repo maps, and provenance under `.threadroot/`.

Use Threadroot to get the right context and capability for the current task without loading the entire repository or every skill into the model.

## Start Here

1. Run a focused session command:

```bash
threadroot start "<task>"
```

2. Read the doctor/status summary and any relevant skill paths.
3. If a codebase map is present, use it to choose files before broad reads.
4. Load full skill bodies only when a listed skill is relevant.
5. Prefer Threadroot tools and connections over ad hoc shell commands when they exist.

## Core Commands

```bash
threadroot bootstrap --yes --mcp
threadroot start "<task>"
threadroot context "<task>"
threadroot map --write
threadroot map --check
threadroot doctor
threadroot status
threadroot skills find "<query>"
threadroot skills add <source> --skill <name>
threadroot skills inspect .threadroot/skills/<name>
threadroot tools detect
threadroot tools create --from-command "<command>"
threadroot tools check
threadroot run <tool>
threadroot connections add <name> --provider <provider> --command <command>
threadroot connections check
threadroot automation status
threadroot automation approve
threadroot remember "<note>"
threadroot mcp setup --write
threadroot mcp check
```

## How Agents Should Use It

- Start with `threadroot start "<task>"` before broad codebase exploration.
- Use `threadroot map --write` when the repo map is missing or stale.
- Use `threadroot skills find "<query>"` when installed skills do not fit the task.
- Use `create-skill` when no good external skill exists.
- Use `create-tool` for repeatable local commands.
- Use `create-connection` for local CLI accounts such as GitHub, AWS, Azure, GCP, Snowflake, Docker, Kubernetes, Vercel, or dbt.
- Use MCP tools when available; fall back to CLI commands when MCP is unavailable.

## Boundaries

- `.threadroot/` is canonical. Provider folders are generated adapters.
- Do not create provider-specific project files unless the user asks.
- Do not store secrets in Threadroot.
- Do not execute high-risk tools, destructive cloud commands, or credential-related workflows without explicit user approval.
- Keep context compact. Load only the files, skills, and memory needed for the current task.
