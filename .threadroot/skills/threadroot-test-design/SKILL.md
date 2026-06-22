---
name: threadroot-test-design
description: Use when adding or changing Threadroot tests for CLI commands, MCP tools, install flows, path security, scanner behavior, package smoke, or harness contracts.
license: MIT
compatibility: Vitest tests for the Threadroot TypeScript CLI.
tags:
  - testing
  - vitest
  - cli
  - mcp
---

# Threadroot Test Design

Use this skill when deciding how to test a Threadroot change.

## Test Shape

Prefer focused tests close to the behavior:

- CLI command smoke: `test/cli-smoke.test.ts`
- MCP tool contracts: `test/mcp-server.test.ts`, `test/mcp-check.test.ts`, `test/mcp-setup.test.ts`
- Harness schema/load/context: `test/harness-*.test.ts`
- Skills and scans: `test/skills*.test.ts`
- Tools/connections: `test/tools.test.ts`, `test/connections.test.ts`
- Packaging: `scripts/package-smoke.mjs`
- Security/path hardening: `test/hardening.test.ts`

## Workflow

1. Start with the smallest behavioral contract.
2. Add regression tests for command names, stale prompts, or security boundaries.
3. Use temp repos for filesystem behavior.
4. Use JSON command output when possible.
5. Run the focused test first, then the normal gate:

```bash
pnpm test -- test/<focused>.test.ts
threadroot run quick-check
```

## Quality Bar

- Test public behavior, not private implementation details, unless the helper is security-critical.
- Cover failure and warning paths, not just happy paths.
- For generated files, assert stable markers or essential text rather than huge snapshots.
- For MCP, test both `tools/list` and `tools/call`.
- For package behavior, test the packed tarball, not only source files.
