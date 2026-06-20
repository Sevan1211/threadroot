---
name: add-test
description: Use when adding, fixing, or reviewing tests for code changes, bugs, edge cases, regressions, CLI behavior, MCP tools, schemas, adapters, or generated output.
scope: project
tags:
  - testing
---

# Add Test

Write tests that pin observable behavior, not implementation trivia.

## Workflow

1. Identify the behavior, boundary, or bug being protected.
2. Find the nearest existing test style and reuse local helpers.
3. Cover the happy path and at least one meaningful failure or edge case.
4. Keep tests deterministic and independent.
5. If fixing a bug, confirm the test fails before the fix when practical.
6. Run the narrow test first, then the broader gate.
