---
name: threadroot-context-design
description: Use when changing Threadroot context routing, repo maps, memory, token-efficiency behavior, skill ranking, start/context output, or agent awareness of the codebase.
license: MIT
compatibility: Threadroot context, repo map, memory, start output, and MCP repo tools.
tags:
  - context
  - memory
  - repo-map
  - token-efficiency
---

# Threadroot Context Design

Use this skill when a change affects how agents know the project without loading the whole codebase.

## Principles

- `.threadroot/memory/project.md` holds stable facts.
- `.threadroot/memory/repo-map.md` is compact navigation, not a source-code dump.
- `threadroot start "<task>"` should show only high-signal summaries.
- Full skill bodies should be loaded only when relevant.
- MCP `repo_search` and `repo_read` should support targeted code reads.

## Workflow

1. Check current state:

```bash
threadroot start "<task>"
threadroot map --check
```

2. If source shape changed, refresh:

```bash
threadroot run map-refresh
```

3. When changing context logic, inspect:
   - `src/core/harness/context.ts`
   - `src/core/repo-map.ts`
   - `src/commands/session-output.ts`
   - `src/mcp/server.ts`
   - context/MCP tests

4. Validate the output shape:

```bash
threadroot context "<task>" --json
threadroot start "<task>"
pnpm test -- test/harness-surface.test.ts test/repo-map.test.ts test/mcp-server.test.ts
```

## Quality Bar

- Compact by default.
- Deterministic enough for tests.
- Links should help quick navigation.
- Avoid dumping generated, dependency, build, cache, secret, or giant files.
- If context is stale, tell agents exactly which command fixes it.
