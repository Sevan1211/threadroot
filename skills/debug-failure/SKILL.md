---
name: debug-failure
description: Use when debugging failing tests, broken builds, runtime errors, flaky behavior, bad generated output, or unexpected CLI/MCP behavior.
scope: project
tags:
  - debugging
---

# Debug Failure

Reproduce, isolate, fix the cause, then preserve the lesson.

## Workflow

1. Capture the exact command, output, environment, and recent change.
2. Reproduce the failure with the smallest command.
3. Read the full error before editing.
4. Form one hypothesis at a time and test it.
5. Add or update a regression test when the failure reveals a bug.
6. After fixing, run the narrow test and relevant full gate.
7. Record durable lessons in pitfalls memory when useful.
