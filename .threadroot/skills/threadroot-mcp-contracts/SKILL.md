---
name: threadroot-mcp-contracts
description: Use when adding or changing Threadroot MCP tools, MCP setup/check behavior, JSON-RPC schemas, stdio server responses, tool authorization, or agent lazy-access flows.
license: MIT
compatibility: Model Context Protocol stdio servers, Codex MCP, Claude/Cursor/Copilot MCP-style clients.
tags:
  - mcp
  - tools
  - json-rpc
  - agent-access
---

# Threadroot MCP Contracts

Use this skill when MCP behavior changes. MCP is the lazy-access layer, so correctness and compact outputs matter.

## Workflow

1. Check the current MCP state:

```bash
threadroot run mcp-check
threadroot context "<task>"
```

2. For any new MCP tool, define:
   - concise name
   - task-specific description
   - JSON input schema
   - structured output shape
   - matching CLI/core safety path
   - tests for listing and calling the tool

3. Use existing core authorization. MCP must not bypass:
   - tool confirmation
   - connection allow/deny rules
   - automation approval
   - skill scan/trust boundaries
   - path containment

4. Keep outputs compact by default. Return summaries first, full bodies only when the tool is explicitly for retrieval, such as `skills_get` or `repo_read`.

5. Verify:

```bash
threadroot run mcp-check
pnpm test -- test/mcp-check.test.ts test/mcp-server.test.ts test/mcp-setup.test.ts
threadroot run doctor
```

## Design Rules

- MCP tools should mirror Threadroot concepts: context, repo map/search/read, skills, tools, connections, memory, status, doctor.
- Do not let model-provided arguments count as human confirmation for risky execution.
- Prefer structured content that clients can parse without scraping text.
- Keep setup output honest about reload/new-session requirements.
